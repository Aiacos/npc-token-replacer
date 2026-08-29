/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official D&D compendium versions
 */

import { Logger, MODULE_ID } from "./lib/logger.js";
import { WildcardResolver } from "./lib/wildcard-resolver.js";
import { NameMatcher } from "./lib/name-matcher.js";
import { ProgressReporter } from "./lib/progress-reporter.js";
import { FoundryCompat } from "./lib/foundry-compat.js";
import { SourceDetector } from "./lib/source-detector.js";
import { buildCompendiumSelectorForm, preloadSelectorTemplates } from "./lib/compendium-selector.js";

/** Error with phase indicator ("import_failed", "creation_failed", "delete_failed"). */
class TokenReplacerError extends Error {
  constructor(message, phase) {
    super(message);
    this.name = "TokenReplacerError";
    this.phase = phase;
  }
}

/** Manages Actor folders for compendium imports. */
class FolderManager {
  static #importFolderCache = null;

  static get FOLDER_NAME() { return "MonsterManual"; }
  static get FOLDER_COLOR() { return "#7a1010"; }

  /** Patterns for identifying monster-related Actor folders as import parents */
  static #MONSTER_FOLDER_PATTERNS = Object.freeze([
    Object.freeze({ pattern: /monster/i, name: "monster" }),
    Object.freeze({ pattern: /creature/i, name: "creature" }),
    Object.freeze({ pattern: /npc/i, name: "npc" }),
    Object.freeze({ pattern: /bestiary/i, name: "bestiary" }),
    Object.freeze({ pattern: /enemy/i, name: "enemy" }),
    Object.freeze({ pattern: /enemies/i, name: "enemies" })
  ]);
  static get MONSTER_FOLDER_PATTERNS() {
    return FolderManager.#MONSTER_FOLDER_PATTERNS;
  }

  /** Build full folder path string like "/Parent/Child/Folder" */
  static getFolderPath(folder) {
    if (!folder) return "";
    const parts = [folder.name];
    let parent = folder.folder;
    let depth = 0;
    while (parent && depth < 10) {
      parts.unshift(parent.name);
      parent = parent.folder;
      depth++;
    }
    return `/${parts.join("/")}`;
  }

  /**
   * Get or create the Actor folder for Monster Manual imports.
   * Looks for existing monster folders, creates a subfolder if needed. Cached.
   * @returns {Promise<Folder|null>} The import folder, or null on failure
   */
  static async getOrCreateImportFolder() {
    if (FolderManager.#importFolderCache && game.folders.has(FolderManager.#importFolderCache.id)) {
      return FolderManager.#importFolderCache;
    }

    Logger.log("Scanning Actor folders for import destination...");

    // Single pass — gather all Actor folders once and reuse for all searches
    const actorFolders = game.folders.filter(f => f.type === "Actor");
    Logger.log(`Found ${actorFolders.length} Actor folders in world`);

    // Log all existing folders (debug level)
    if (actorFolders.length > 0) {
      Logger.debug("Existing Actor folders:");
      actorFolders.forEach(f => {
        Logger.debug(`  - ${FolderManager.getFolderPath(f)} (id: ${f.id})`);
      });
    }

    // Check if our folder already exists (search local array, not game.folders)
    let folder = actorFolders.find(f => f.name === FolderManager.FOLDER_NAME);

    if (folder) {
      Logger.log(`Found existing folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    }
    Logger.debug(`Folder "${FolderManager.FOLDER_NAME}" not found`);

    // Look for existing monster-related folders to use as parent
    let parentFolder = null;
    for (const { pattern } of FolderManager.MONSTER_FOLDER_PATTERNS) {
      const match = actorFolders.find(f => pattern.test(f.name) && !f.folder);
      if (match) {
        parentFolder = match;
        Logger.debug(`  Selected top-level folder: ${FolderManager.getFolderPath(parentFolder)}`);
        break;
      }
    }

    // Create the folder name based on parent
    let folderName = FolderManager.FOLDER_NAME;
    if (parentFolder) {
      folderName = `${parentFolder.name} - ${FolderManager.FOLDER_NAME}`;
      Logger.log(`Will create folder "${folderName}" inside "${parentFolder.name}"`);
    } else {
      Logger.log(`No monster folder found, will create "${folderName}" at root level`);
    }

    // Check if this combined name already exists (search local array)
    folder = actorFolders.find(f => f.name === folderName);

    if (folder) {
      Logger.log(`Found existing folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    }

    // Create the new folder
    Logger.log(`Creating new folder: "${folderName}"...`);
    try {
      folder = await Folder.create({
        name: folderName,
        type: "Actor",
        parent: parentFolder?.id || null,
        color: FolderManager.FOLDER_COLOR
      });
      Logger.log(`Created new folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    } catch (error) {
      Logger.error("Failed to create import folder", error);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorFolderCreate"));
      return null;
    }
  }

  static clearCache() {
    FolderManager.#importFolderCache = null;
    Logger.debug("FolderManager cache cleared");
  }
}

/**
 * Detects WotC compendiums, manages enabled compendiums, loads and indexes monsters.
 */
class CompendiumManager {
  static #indexCache = null;
  /** normalizedName -> Array<{entry, pack, normalizedName}> */
  static #indexMap = null;
  /** significantWord -> Array<index entry refs> for Stage 3 partial matching */
  static #wordIndex = null;
  static #enabledPacksCache = null;
  static #wotcCompendiumsCache = null;
  static #lastLoadErrors = [];
  /** packCollection -> classification returned by SourceDetector */
  static #classifications = new Map();

  /** Package-id prefixes used by the official WotC line. One signal among several. */
  static get WOTC_MODULE_PREFIXES() { return SourceDetector.OFFICIAL_PREFIXES; }

  /**
   * Optional priority refinements for packages we already know about.
   * Classification is otherwise fully dynamic, so a newly released official
   * book never needs an entry here.
   */
  static get COMPENDIUM_PRIORITIES() { return SourceDetector.KNOWN_PRIORITIES; }

  static get PRIORITY_LABELS() { return SourceDetector.PRIORITY_LABELS; }

  /** Highest priority still considered "core" content (SRD + rulebooks). */
  static get CORE_MAX_PRIORITY() { return SourceDetector.PRIORITY.CORE; }

  /** Get priority for a pack (higher = preferred). */
  static getCompendiumPriority(pack) {
    return SourceDetector.classify(pack).priority;
  }

  /**
   * Extra package ids or pack collections the GM added by hand — the escape
   * hatch for content the automatic signals cannot recognise.
   * @returns {Set<string>|null}
   */
  static #getManualSourceIds() {
    let raw;
    try {
      raw = game.settings.get(MODULE_ID, "additionalSources");
    } catch (error) {
      Logger.debug(`additionalSources setting unavailable: ${error.message}`);
      return null;
    }
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const ids = raw.split(/[\s,;]+/).map(id => id.trim()).filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
  }

  /**
   * Detect every Actor compendium carrying official D&D creatures.
   *
   * Recognition is signal-based (active system, official `dnd-` prefix, WotC
   * authorship, premium content declared for this system, manual override)
   * instead of a maintained list of module ids, so official modules released
   * after this version are still picked up. Cached.
   *
   * @returns {readonly CompendiumCollection[]}
   */
  static detectWOTCCompendiums() {
    if (CompendiumManager.#wotcCompendiumsCache) {
      return CompendiumManager.#wotcCompendiumsCache;
    }

    Logger.log("Detecting official D&D compendiums...");

    const manualIds = CompendiumManager.#getManualSourceIds();
    const classifications = new Map();

    const detected = game.packs.filter(pack => {
      if (pack.documentName !== "Actor") return false;
      const info = SourceDetector.classify(pack, manualIds);
      if (info.tier === SourceDetector.TIER.NONE) return false;
      classifications.set(pack.collection, info);
      return true;
    });

    CompendiumManager.#classifications = classifications;

    Logger.log(`Found ${detected.length} official D&D Actor compendium(s):`);
    detected.forEach(pack => {
      const info = classifications.get(pack.collection);
      const priorityLabel = CompendiumManager.PRIORITY_LABELS[info.priority] || "UNKNOWN";
      Logger.log(`  - ${pack.collection} (${pack.metadata.label}) [package: ${info.packageName}, tier: ${info.tier}, priority: ${info.priority}-${priorityLabel}]`);
    });

    CompendiumManager.#wotcCompendiumsCache = Object.freeze(detected);
    return CompendiumManager.#wotcCompendiumsCache;
  }

  /** How a detected pack was recognised: "system", "official", "premium" or "manual". */
  static getSourceTier(pack) {
    return CompendiumManager.#classifications.get(pack?.collection)?.tier
      ?? SourceDetector.classify(pack).tier;
  }

  /** True when the pack comes from first-party D&D content (system SRD or WotC module). */
  static isOfficialSource(pack) {
    const tier = CompendiumManager.getSourceTier(pack);
    return tier === SourceDetector.TIER.SYSTEM || tier === SourceDetector.TIER.OFFICIAL;
  }

  /**
   * Resolve the compendiums to read, from the `enabledCompendiums` setting:
   *   ["default"] every auto-detected OFFICIAL source (system SRD + WotC modules)
   *   ["core"]    only SRD + core rulebooks (priority 1-2)
   *   ["all"]     everything detected, including premium and manually added packs
   *   [ids...]    the listed pack collections
   * @returns {readonly CompendiumCollection[]}
   */
  static getEnabledCompendiums() {
    if (CompendiumManager.#enabledPacksCache) return CompendiumManager.#enabledPacksCache;

    const allPacks = CompendiumManager.detectWOTCCompendiums();

    let settingValue;
    try {
      settingValue = game.settings.get(MODULE_ID, "enabledCompendiums");
    } catch (e) {
      Logger.warn(`Failed to retrieve enabledCompendiums setting (${e.name}: ${e.message})`);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorSettingsRetrieve"));
      // Reading the setting failed: stay conservative rather than silently widening scope
      const result = allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= CompendiumManager.CORE_MAX_PRIORITY);
      CompendiumManager.#enabledPacksCache = Object.freeze(result);
      return CompendiumManager.#enabledPacksCache;
    }

    let enabledPackIds;
    try {
      enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
    } catch (e) {
      Logger.warn(`Failed to parse enabledCompendiums JSON (${e.name}: ${e.message})`);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorSettingsParse"));
      enabledPackIds = ["core"];
    }

    if (!enabledPackIds || !Array.isArray(enabledPackIds) || enabledPackIds.length === 0) {
      enabledPackIds = ["default"];
    }

    let result;
    if (enabledPackIds.includes("all")) {
      Logger.log("Using all detected compendiums");
      result = allPacks;
    } else if (enabledPackIds.includes("core")) {
      result = allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= CompendiumManager.CORE_MAX_PRIORITY);
      Logger.log(`Using core compendiums (SRD + rulebooks): ${result.map(p => p.metadata.label).join(", ")}`);
    } else if (enabledPackIds.includes("default")) {
      result = allPacks.filter(pack => CompendiumManager.isOfficialSource(pack));
      Logger.log(`Using every official D&D compendium: ${result.map(p => p.metadata.label).join(", ")}`);
    } else {
      const enabledSet = new Set(enabledPackIds);
      result = allPacks.filter(pack => enabledSet.has(pack.collection));
      Logger.log(`Enabled compendiums: ${result.map(p => p.metadata.label).join(", ")}`);
    }

    CompendiumManager.#enabledPacksCache = Object.freeze(result);
    return CompendiumManager.#enabledPacksCache;
  }

  /**
   * Actor types that are never scene creatures. A blocklist (rather than an
   * allowlist) keeps actor types introduced by future system versions indexed
   * instead of silently dropping them.
   */
  static #NON_CREATURE_TYPES = Object.freeze(new Set(["character", "group", "vehicle"]));

  /** True when a compendium index entry can stand in for an NPC token. */
  static isCreatureEntry(entry) {
    const type = entry?.type;
    if (!type) return true; // no type information — keep it and let name matching decide
    return !CompendiumManager.#NON_CREATURE_TYPES.has(type);
  }

  /** Load combined monster index from all enabled compendiums. Cached unless forceReload. */
  static async loadMonsterIndex(forceReload = false) {
    if (CompendiumManager.#indexCache && !forceReload) {
      return CompendiumManager.#indexCache;
    }

    CompendiumManager.#lastLoadErrors = [];

    const enabledPacks = CompendiumManager.getEnabledCompendiums();

    if (enabledPacks.length === 0) {
      Logger.log("No enabled compendiums found");
      CompendiumManager.#indexCache = Object.freeze([]);
      CompendiumManager.#indexMap = new Map();
      CompendiumManager.#wordIndex = new Map();
      return CompendiumManager.#indexCache;
    }

    Logger.log(`Loading monster index from ${enabledPacks.length} compendium(s)...`);

    const combinedIndex = [];

    const sortedPacks = [...enabledPacks].sort((a, b) =>
      CompendiumManager.getCompendiumPriority(b) - CompendiumManager.getCompendiumPriority(a)
    );

    const indexResults = await Promise.allSettled(
      sortedPacks.map(pack => pack.getIndex({ fields: ["name", "type"] }).then(() => pack))
    );

    for (let i = 0; i < indexResults.length; i++) {
      const result = indexResults[i];
      const pack = sortedPacks[i];

      if (result.status === "rejected") {
        CompendiumManager.#lastLoadErrors.push({
          packId: pack.collection,
          packLabel: pack.metadata.label,
          error: result.reason?.message || String(result.reason)
        });
        Logger.error(`Failed to load index from ${pack.collection}`, result.reason);
        ui.notifications.error(game.i18n.format("NPC_REPLACER.ErrorCompendiumLoad", { name: pack.metadata.label }));
        continue;
      }

      const priority = CompendiumManager.getCompendiumPriority(pack);
      const priorityLabel = CompendiumManager.PRIORITY_LABELS[priority] || "UNKNOWN";
      let indexed = 0;
      for (const entry of pack.index.contents) {
        if (!CompendiumManager.isCreatureEntry(entry)) continue;
        indexed++;
        const normalizedName = NameMatcher.normalizeName(entry.name);
        const significantWords = normalizedName.split(" ").filter(w => w.length >= NameMatcher.MIN_PARTIAL_LENGTH);
        combinedIndex.push({
          entry,
          pack,
          normalizedName,
          significantWords,
          priority
        });
      }
      Logger.log(`  [${priority}-${priorityLabel}] Loaded ${indexed}/${pack.index.size} creature entries from ${pack.metadata.label}`);
    }

    Logger.log(`Total: ${combinedIndex.length} entries from all compendiums`);
    Logger.log("Priority order: Adventures (4) > Expansions (3) > Core Rulebooks (2) > SRD (1)");

    const indexMap = new Map();
    const wordIndex = new Map();
    for (const item of combinedIndex) {
      const key = item.normalizedName;
      if (!indexMap.has(key)) indexMap.set(key, []);
      indexMap.get(key).push(item);

      if (item.significantWords) {
        for (const word of item.significantWords) {
          if (!wordIndex.has(word)) wordIndex.set(word, []);
          wordIndex.get(word).push(item);
        }
      }
    }

    CompendiumManager.#indexCache = Object.freeze(combinedIndex);
    CompendiumManager.#indexMap = indexMap;
    CompendiumManager.#wordIndex = wordIndex;

    return CompendiumManager.#indexCache;
  }

  static clearCache() {
    CompendiumManager.#indexCache = null;
    CompendiumManager.#indexMap = null;
    CompendiumManager.#wordIndex = null;
    CompendiumManager.#wotcCompendiumsCache = null;
    CompendiumManager.#enabledPacksCache = null;
    CompendiumManager.#lastLoadErrors = [];
    CompendiumManager.#classifications = new Map();
    Logger.debug("CompendiumManager caches cleared");
  }

  static getLastLoadErrors() {
    return [...CompendiumManager.#lastLoadErrors];
  }

  static getIndexMap() {
    return CompendiumManager.#indexMap;
  }

  static getWordIndex() {
    return CompendiumManager.#wordIndex;
  }

  static isIndexCached() {
    return CompendiumManager.#indexCache !== null;
  }

  static getCacheSize() {
    return CompendiumManager.#indexCache ? CompendiumManager.#indexCache.length : 0;
  }
}

// Wire late-bound dependency — NameMatcher needs CompendiumManager for priority lookups
NameMatcher.setCompendiumManager(CompendiumManager);

/**
 * Handles token replacement: extract properties, import actors, create new tokens.
 */
class TokenReplacer {
  static #sequentialCounter = 0;
  static #variationMode = null;
  /** Session-scoped Map: compendium UUID -> world Actor */
  static #actorLookup = null;
  static #compendiumDocCache = new Map();
  static #COMPENDIUM_DOC_CACHE_MAX = 100;

  // TODO [MEDIUM] Compatibility: compendiumSource path may change in future dnd5e/Foundry versions.
  // If this path changes, lookup produces an empty Map and every replacement re-imports actors,
  // creating duplicates. Add a fallback matching by actor name + source compendium label.
  static buildActorLookup() {
    TokenReplacer.#actorLookup = new Map();
    for (const a of game.actors) {
      const uuid = a._stats?.compendiumSource || a.flags?.core?.sourceId;
      if (uuid) TokenReplacer.#actorLookup.set(uuid, a);
    }
    Logger.debug(`Built actor lookup Map with ${TokenReplacer.#actorLookup.size} entries`);
  }

  static clearActorLookup() {
    TokenReplacer.#actorLookup = null;
    TokenReplacer.#variationMode = null;
    TokenReplacer.#compendiumDocCache.clear();
    Logger.debug("Actor lookup Map and variation mode cleared");
  }

  // TODO [MEDIUM] Compatibility: allowlist silently drops properties added in new Foundry versions.
  // Missing now: flags (module data), light, sight, detectionModes, bar1, bar2.
  // Consider inverting to a blocklist of properties to OVERRIDE from compendium instead,
  // so unknown properties are preserved by default. Trade-off: blocklist risks keeping stale data.
  /** Token properties preserved during replacement */
  static #PRESERVED_PROPERTIES = Object.freeze([
    "x", "y", "elevation", "width", "height",
    "hidden", "rotation", "disposition", "locked", "alpha"
  ]);
  static get PRESERVED_PROPERTIES() { return TokenReplacer.#PRESERVED_PROPERTIES; }

  static getSequentialCounter() {
    return TokenReplacer.#sequentialCounter;
  }

  static resetCounter() {
    TokenReplacer.#sequentialCounter = 0;
    Logger.debug("TokenReplacer sequential counter reset");
  }

  static extractTokenProperties(tokenDoc) {
    const props = {};
    for (const prop of TokenReplacer.PRESERVED_PROPERTIES) {
      props[prop] = tokenDoc[prop];
    }
    return props;
  }

  static #isNPCToken(tokenDoc) {
    return tokenDoc.actor?.type === "npc";
  }

  /** Get NPC tokens: selected if any, otherwise all scene NPCs. */
  static getNPCTokensToProcess() {
    if (!canvas.scene) {
      return { tokens: [], isSelection: false };
    }

    const selectedTokens = canvas.tokens.controlled;

    if (selectedTokens.length > 0) {
      const selectedNPCs = selectedTokens
        .map(token => token.document)
        .filter(TokenReplacer.#isNPCToken);

      if (selectedNPCs.length > 0) {
        Logger.log(`Using ${selectedNPCs.length} selected NPC token(s) out of ${selectedTokens.length} selected`);
        return { tokens: selectedNPCs, isSelection: true };
      }

      Logger.log("Selected tokens contain no NPCs");
      return { tokens: [], isSelection: true };
    }

    const npcTokens = canvas.scene.tokens.contents.filter(TokenReplacer.#isNPCToken);
    return { tokens: npcTokens, isSelection: false };
  }

  /** Convenience: get all scene NPC tokens (ignores selection). */
  static getNPCTokensFromScene() {
    if (!canvas.scene) return [];
    return canvas.scene.tokens.contents.filter(TokenReplacer.#isNPCToken);
  }

  /** Find existing world actor or import from compendium. */
  static async #getOrImportWorldActor(compendiumActor, compendiumEntry, pack) {
    let worldActor = TokenReplacer.#actorLookup?.get(compendiumActor.uuid) || null;

    // Guard against stale cached references (actor deleted between sessions)
    if (worldActor && !game.actors.has(worldActor.id)) {
      Logger.warn(`Cached actor "${worldActor.name}" (id: ${worldActor.id}) no longer exists in game.actors, will re-import`);
      TokenReplacer.#actorLookup.delete(compendiumActor.uuid);
      worldActor = null;
    }

    if (worldActor) {
      Logger.log(`Using existing imported actor "${worldActor.name}"`);
      return worldActor;
    }

    const importFolder = await FolderManager.getOrCreateImportFolder();
    if (!importFolder) {
      Logger.warn(`Import folder unavailable — actor "${compendiumActor.name}" will be imported to the root folder`);
    }
    const updateData = importFolder ? { folder: importFolder.id } : {};
    worldActor = await game.actors.importFromCompendium(pack, compendiumEntry._id, updateData);

    if (!worldActor) {
      throw new Error(`Failed to import actor "${compendiumActor.name}" from compendium`);
    }

    if (TokenReplacer.#actorLookup) {
      TokenReplacer.#actorLookup.set(compendiumActor.uuid, worldActor);
    }

    Logger.log(`Imported actor "${compendiumActor.name}" from compendium into folder "${importFolder?.name || "root"}"`);
    return worldActor;
  }

  /** Resolve wildcard texture path (e.g. "specter-*.webp") to an actual file. */
  static async #resolveWildcardTexture(prototypeToken, compendiumActor, creatureName) {
    const originalPath = prototypeToken.texture.src;
    Logger.log(`Detected wildcard pattern in token path: ${originalPath}`);

    if (!TokenReplacer.#variationMode) {
      try {
        TokenReplacer.#variationMode = game.settings.get(MODULE_ID, "tokenVariationMode");
      } catch (error) {
        Logger.warn(`Failed to read tokenVariationMode setting, using "sequential": ${error.message}`);
        TokenReplacer.#variationMode = "sequential";
      }
      Logger.log(`Token variation mode: ${TokenReplacer.#variationMode}`);
    }
    const variationMode = TokenReplacer.#variationMode;

    const currentIndex = TokenReplacer.#sequentialCounter;
    const result = await WildcardResolver.resolve(
      originalPath,
      variationMode,
      currentIndex,
      compendiumActor.img // Use actor portrait as fallback
    );

    if (variationMode === "sequential" && result.nextIndex > currentIndex) {
      TokenReplacer.#sequentialCounter = result.nextIndex;
    }

    if (result.resolvedPath === "icons/svg/mystery-man.svg") {
      Logger.warn(`No token art variants found for "${creatureName}" — using placeholder`);
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.WildcardFallback", { name: creatureName }));
    } else {
      Logger.log(`Resolved wildcard for ${creatureName}: ${result.resolvedPath}`);
    }
    prototypeToken.texture.src = result.resolvedPath;
  }

  /** Compendium token properties to adopt (visual/behavioral identity). */
  static #COMPENDIUM_TOKEN_FIELDS = Object.freeze([
    "name", "texture", "scale", "tint",
    "displayName", "displayBars",
    "lockRotation"
  ]);

  /** Merge compendium token identity with preserved properties from original. */
  static #prepareNewTokenData(prototypeToken, originalProps, worldActorId) {
    const newData = {};
    for (const prop of TokenReplacer.#COMPENDIUM_TOKEN_FIELDS) {
      if (prop in prototypeToken) newData[prop] = prototypeToken[prop];
    }
    for (const prop of TokenReplacer.PRESERVED_PROPERTIES) {
      newData[prop] = originalProps[prop];
    }
    newData.actorId = worldActorId;
    newData.actorLink = prototypeToken.actorLink ?? false;
    return newData;
  }

  /**
   * Replace a single token with its compendium version.
   * Imports actor if needed, resolves wildcards, creates new token, deletes old.
   * @throws {TokenReplacerError} with phase "import_failed", "creation_failed", or "delete_failed"
   */
  static async replaceToken(tokenDoc, compendiumEntry, pack) {
    const originalProps = TokenReplacer.extractTokenProperties(tokenDoc);
    const originalName = tokenDoc.name;

    Logger.log(`Replacing token "${originalName}" with "${compendiumEntry.name}"`);

    let compendiumActor;
    try {
      const docCacheKey = `${pack.collection}|${compendiumEntry._id}`;
      compendiumActor = TokenReplacer.#compendiumDocCache.get(docCacheKey);
      if (!compendiumActor) {
        compendiumActor = await pack.getDocument(compendiumEntry._id);
        if (TokenReplacer.#compendiumDocCache.size >= TokenReplacer.#COMPENDIUM_DOC_CACHE_MAX) {
          // Evict oldest entry (Map preserves insertion order)
          const oldest = TokenReplacer.#compendiumDocCache.keys().next().value;
          TokenReplacer.#compendiumDocCache.delete(oldest);
        }
        TokenReplacer.#compendiumDocCache.set(docCacheKey, compendiumActor);
      }
    } catch (error) {
      throw new TokenReplacerError(`Failed to load "${compendiumEntry.name}" from compendium: ${error.message}`, "import_failed");
    }

    let worldActor;
    try {
      worldActor = await TokenReplacer.#getOrImportWorldActor(compendiumActor, compendiumEntry, pack);
    } catch (error) {
      throw new TokenReplacerError(`Failed to import "${compendiumEntry.name}": ${error.message}`, "import_failed");
    }

    // Always use COMPENDIUM actor's prototypeToken — world actor may have stale token art
    const prototypeToken = compendiumActor.prototypeToken.toObject();
    Logger.log(`Using token image from compendium: ${prototypeToken.texture?.src || "default"}`);

    if (WildcardResolver.isWildcardPath(prototypeToken.texture?.src)) {
      await TokenReplacer.#resolveWildcardTexture(prototypeToken, compendiumActor, compendiumEntry.name);
    }

    const newTokenData = TokenReplacer.#prepareNewTokenData(prototypeToken, originalProps, worldActor.id);

    // Create new token first, then delete old — avoids data loss if creation fails
    let newToken;
    try {
      const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [newTokenData]);
      newToken = createdTokens[0];
      if (!newToken) {
        throw new Error("createEmbeddedDocuments returned empty result");
      }
    } catch (error) {
      throw new TokenReplacerError(`Failed to create token for "${compendiumEntry.name}": ${error.message}`, "creation_failed");
    }

    try {
      if (!canvas.scene.tokens.has(tokenDoc.id)) {
        Logger.warn(`Token "${originalName}" was already removed — skipping delete`);
      } else {
        await canvas.scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);
      }
    } catch (deleteError) {
      Logger.error(`Created new token but failed to delete old "${originalName}" — duplicate may exist`, deleteError);
      throw new TokenReplacerError(
        `delete_failed: new token created but old "${originalName}" could not be removed`,
        "delete_failed"
      );
    }

    Logger.log(`Successfully replaced "${originalName}" with "${compendiumEntry.name}"`);

    return newToken;
  }
}

/**
 * Main facade: orchestrates compendium detection, name matching, and token replacement.
 */
class NPCTokenReplacerController {
  static #isProcessing = false;

  static isProcessing() {
    return NPCTokenReplacerController.#isProcessing;
  }

  /** Check GM status, active scene, and compendium availability. */
  static validatePrerequisites() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("NPC_REPLACER.GMOnly"));
      return false;
    }

    if (!canvas.scene) {
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoScene"));
      return false;
    }

    const wotcPacks = CompendiumManager.detectWOTCCompendiums();
    if (wotcPacks.length === 0) {
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoModule"));
      return false;
    }

    return true;
  }

  /** Show 3-column preview dialog (Token | Match | Source). Returns true if user confirms. */
  static async showPreviewDialog(matchResults) {
    const matched = matchResults.filter(r => r.match !== null);
    const unmatched = matchResults.filter(r => r.match === null);
    const sorted = [...matched, ...unmatched];

    const noMatchText = escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewNoMatch"));

    const rows = [];
    for (const result of sorted) {
      if (result.match) {
        rows.push(`<tr>
          <td>${escapeHtml(result.creatureName)}</td>
          <td>${escapeHtml(result.match.entry.name)}</td>
          <td>${escapeHtml(result.match.pack.metadata.label)}</td>
        </tr>`);
      } else {
        rows.push(`<tr>
          <td>${escapeHtml(result.creatureName)}</td>
          <td class="npc-replacer-no-match">${noMatchText}</td>
          <td>&mdash;</td>
        </tr>`);
      }
    }
    const rowsHtml = rows.join("");

    const summary = escapeHtml(game.i18n.format("NPC_REPLACER.PreviewSummary", {
      matched: matched.length,
      total: matchResults.length
    }));

    const content = `
      <p>${summary}</p>
      <div class="npc-replacer-preview-table-container">
        <table class="npc-replacer-preview-table">
          <thead>
            <tr>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColToken"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColMatch"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColSource"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    let dialogTimeoutMinutes = 5;
    try {
      const value = game.settings.get(MODULE_ID, "dialogTimeout");
      if (Number.isFinite(value) && value > 0) dialogTimeoutMinutes = value;
    } catch (error) {
      Logger.debug(`dialogTimeout setting not available, using default ${dialogTimeoutMinutes}min: ${error.message}`);
    }
    const DIALOG_TIMEOUT_MS = dialogTimeoutMinutes * 60 * 1000;

    let timeoutId;
    const { answer, close } = FoundryCompat.confirmDialog({
      title: game.i18n.localize("NPC_REPLACER.PreviewTitle"),
      content,
      yesLabel: game.i18n.localize("NPC_REPLACER.ConfirmYes"),
      noLabel: game.i18n.localize("NPC_REPLACER.ConfirmNo"),
      // Nothing to replace: the confirm button stays unusable
      yesDisabled: matched.length === 0
    });

    try {
      const timeoutPromise = new Promise(resolve => {
        timeoutId = setTimeout(() => {
          ui.notifications.warn(game.i18n.localize("NPC_REPLACER.DialogTimeout"));
          close();
          resolve(false);
        }, DIALOG_TIMEOUT_MS);
      });

      return await Promise.race([answer, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Display result notifications and log replacement summary. */
  static #reportResults(replaced, notFound, importFailed, creationFailed, deleteFailed = []) {
    const totalErrors = importFailed.length + creationFailed.length;
    if (replaced > 0 && totalErrors === 0 && notFound.length === 0 && deleteFailed.length === 0) {
      ui.notifications.info(game.i18n.format("NPC_REPLACER.Complete", { count: replaced }));
    }

    if (notFound.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.NotFoundCount", { count: notFound.length }));
      Logger.log("Creatures not found in compendiums:", notFound);
    }

    if (deleteFailed.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.DeleteFailedCount", { count: deleteFailed.length }));
      Logger.log("Delete failures (duplicates may exist):", deleteFailed);
    }

    if (totalErrors > 0) {
      ui.notifications.error(game.i18n.format("NPC_REPLACER.SummaryPartialFailure", {
        replaced,
        noMatch: notFound.length,
        importFailed: importFailed.length,
        creationFailed: creationFailed.length
      }));
      if (importFailed.length > 0) Logger.log("Import failures:", importFailed);
      if (creationFailed.length > 0) Logger.log("Creation failures:", creationFailed);
    }

    Logger.log(`Replacement complete: ${replaced} replaced, ${notFound.length} not found, ${importFailed.length} import failures, ${creationFailed.length} creation failures, ${deleteFailed.length} delete failures`);
  }

  /** Main entry: validate → scan → preview → replace → report. */
  static async replaceNPCTokens() {
    if (NPCTokenReplacerController.#isProcessing) {
      Logger.log("Already processing tokens, ignoring duplicate call");
      ui.notifications.warn(game.i18n.localize("NPC_REPLACER.AlreadyProcessing"));
      return;
    }
    NPCTokenReplacerController.#isProcessing = true;

    try {
      if (!NPCTokenReplacerController.validatePrerequisites()) {
        return;
      }

      const enabledPacks = CompendiumManager.getEnabledCompendiums();
      if (enabledPacks.length === 0) {
        ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
        return;
      }

      const index = await CompendiumManager.loadMonsterIndex();

      if (index.length === 0) {
        ui.notifications.error(game.i18n.localize("NPC_REPLACER.IndexEmpty"));
        return;
      }

      const { tokens: npcTokens, isSelection } = TokenReplacer.getNPCTokensToProcess();
      if (npcTokens.length === 0) {
        const message = isSelection
          ? game.i18n.localize("NPC_REPLACER.NoSelectedNPCs")
          : game.i18n.localize("NPC_REPLACER.NoTokens");
        ui.notifications.info(message);
        return;
      }

      const sourceDesc = isSelection ? "selected" : "in scene";
      Logger.log(`Found ${npcTokens.length} NPC tokens ${sourceDesc}`);

      const scanProgress = new ProgressReporter();
      let matchResults;
      try {
        matchResults = await NPCTokenReplacerController.computeMatches(npcTokens, index, scanProgress);
      } finally {
        scanProgress.finish();
      }

      const confirmed = await NPCTokenReplacerController.showPreviewDialog(matchResults);
      if (!confirmed) {
        Logger.log("Token replacement cancelled by user");
        return;
      }

      TokenReplacer.resetCounter();
      TokenReplacer.buildActorLookup();

      const toReplace = matchResults.filter(r => r.match !== null);
      const notFoundNames = matchResults.filter(r => r.match === null).map(r => r.creatureName);

      // TODO [MEDIUM] Performance: token processing loop is fully sequential — 2N socket round-trips.
      // Split into parallel resolve phase (getDocument, import, wildcard) + batched mutation phase
      // (single deleteEmbeddedDocuments + createEmbeddedDocuments call for all tokens).
      let replaced = 0;
      const importFailed = [];
      const creationFailed = [];
      const deleteFailed = [];
      const processedIds = new Set();

      const progress = new ProgressReporter();
      progress.start(toReplace.length, game.i18n.format("NPC_REPLACER.ProgressStart", { count: toReplace.length }));

      try {
        for (const result of toReplace) {
          const { tokenDoc, creatureName } = result;

          if (processedIds.has(tokenDoc.id)) {
            Logger.log(`Skipping already processed token: ${tokenDoc.name}`);
            continue;
          }

          if (!canvas.scene.tokens.has(tokenDoc.id)) {
            Logger.log(`Token "${tokenDoc.name}" no longer exists, skipping`);
            continue;
          }

          processedIds.add(tokenDoc.id);

          try {
            await TokenReplacer.replaceToken(tokenDoc, result.match.entry, result.match.pack);
            replaced++;
          } catch (error) {
            const status = error instanceof TokenReplacerError ? error.phase : "creation_failed";
            Logger.error(`Error replacing token ${tokenDoc.name} (${status})`, error);
            if (status === "import_failed") {
              importFailed.push(creatureName);
            } else if (status === "delete_failed") {
              deleteFailed.push(creatureName);
              replaced++; // New token was created successfully despite delete failure
            } else {
              creationFailed.push(creatureName);
            }
          }

          const processed = replaced + importFailed.length + creationFailed.length + deleteFailed.length;
          progress.update(processed,
            game.i18n.format("NPC_REPLACER.ProgressUpdate", {
              current: processed,
              total: toReplace.length,
              name: escapeHtml(tokenDoc.name)
            }));
        }
      } finally {
        progress.finish();
      }

      NPCTokenReplacerController.#reportResults(replaced, notFoundNames, importFailed, creationFailed, deleteFailed);
    } finally {
      TokenReplacer.clearActorLookup();
      NPCTokenReplacerController.#isProcessing = false;
    }
  }

  static clearCache() {
    CompendiumManager.clearCache();
    FolderManager.clearCache();
    WildcardResolver.clearCache();
    TokenReplacer.clearActorLookup();
    Logger.log("All caches cleared");
  }

  /** Scan phase: match each token against the index (dry-run for preview). */
  static async computeMatches(tokens, index, progress) {
    progress.start(tokens.length, game.i18n.localize("NPC_REPLACER.PreviewScanning"));

    const results = [];
    for (let i = 0; i < tokens.length; i++) {
      const tokenDoc = tokens[i];
      const creatureName = tokenDoc.actor?.name || tokenDoc.name;
      const match = NameMatcher.findMatch(creatureName, index);
      results.push({ tokenDoc, creatureName, match });

      progress.update(i + 1, game.i18n.format("NPC_REPLACER.ProgressUpdate", {
        current: i + 1,
        total: tokens.length,
        name: escapeHtml(tokenDoc.name)
      }));

      if (i % 10 === 9) await new Promise(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /** Detect compendiums and pre-cache monster index. Called from ready hook. */
  static async initialize() {
    Logger.log("NPC Token Replacer is ready");

    // Detect available WOTC compendiums
    const wotcPacks = CompendiumManager.detectWOTCCompendiums();

    if (wotcPacks.length === 0) {
      Logger.log("No official D&D compendiums found. Install official D&D content for this module to work.");
    } else {
      Logger.log(`Found ${wotcPacks.length} official D&D compendium(s)`);

      try {
        await CompendiumManager.loadMonsterIndex();
        Logger.log("Monster index pre-cached successfully");
      } catch (error) {
        Logger.error("Failed to pre-cache monster index", error);
        ui.notifications.warn(game.i18n.localize("NPC_REPLACER.ErrorIndexLoad"));
      }
    }
  }

  /** Build the window.NPCTokenReplacer debug API object. */
  static getDebugAPI() {
    return {
      replaceNPCTokens: () => NPCTokenReplacerController.replaceNPCTokens(),
      getMonsterManualPack: () => {
        const packs = CompendiumManager.getEnabledCompendiums();
        return packs.length > 0 ? packs[0] : null;
      },
      getNPCTokensFromScene: () => TokenReplacer.getNPCTokensFromScene(),
      findInMonsterManual: (name, index) => NameMatcher.findMatch(name, index),
      getOrCreateImportFolder: () => FolderManager.getOrCreateImportFolder(),
      detectWOTCCompendiums: () => CompendiumManager.detectWOTCCompendiums(),
      getEnabledCompendiums: () => CompendiumManager.getEnabledCompendiums(),
      clearCache: () => NPCTokenReplacerController.clearCache(),
      getLastLoadErrors: () => CompendiumManager.getLastLoadErrors(),
      get debugEnabled() { return Logger.debugEnabled; },
      set debugEnabled(v) { Logger.debugEnabled = v; }
    };
  }
}

/** Register all module settings (called during init hook). */
function registerSettings() {
  game.settings.register(MODULE_ID, "tokenVariationMode", {
    name: game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      "none": game.i18n.localize("NPC_REPLACER.Settings.VariationMode.None"),
      "sequential": game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Sequential"),
      "random": game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Random")
    },
    default: "sequential"
  });

  game.settings.register(MODULE_ID, "enabledCompendiums", {
    name: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Hint"),
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify(["default"])
  });

  game.settings.register(MODULE_ID, "dialogTimeout", {
    name: game.i18n.localize("NPC_REPLACER.Settings.DialogTimeout.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.DialogTimeout.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 5
  });

  game.settings.register(MODULE_ID, "httpTimeout", {
    name: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 5
  });

  // Escape hatch: content the automatic signals cannot recognise (e.g. a future
  // official release under an unexpected package id) can be added by hand.
  game.settings.register(MODULE_ID, "additionalSources", {
    name: game.i18n.localize("NPC_REPLACER.Settings.AdditionalSources.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.AdditionalSources.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  const SelectorForm = buildCompendiumSelectorForm({
    compendiumManager: CompendiumManager,
    onSaved: () => NPCTokenReplacerController.clearCache()
  });

  if (SelectorForm) {
    game.settings.registerMenu(MODULE_ID, "compendiumSelector", {
      name: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Name"),
      label: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Label"),
      hint: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Hint"),
      icon: "fas fa-book",
      type: SelectorForm,
      restricted: true
    });
  }
}

const HTML_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
});
const HTML_ESCAPE_PATTERN = /[&<>"']/g;

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(HTML_ESCAPE_PATTERN, char => HTML_ESCAPES[char]);
}

/**
 * Add the replace button to the token controls.
 *
 * v13+ passes an object keyed by control name whose tools fire `onChange`;
 * v12 passes an array of control groups whose tools fire `onClick`. Only the
 * callback the running version actually uses is attached — supplying both makes
 * v13 run the action twice.
 */
function registerControlButton(controls) {
  const run = () => NPCTokenReplacerController.replaceNPCTokens();
  const tool = {
    name: "npcReplacer",
    title: game.i18n.localize("NPC_REPLACER.Button"),
    icon: "fas fa-sync-alt",
    button: true,
    visible: game.user.isGM
  };

  const tokenGroup = controls?.tokens;
  if (tokenGroup && typeof tokenGroup === "object" && !Array.isArray(tokenGroup)) {
    if (!tokenGroup.tools) {
      Logger.error("Token controls found but 'tools' property is missing — toolbar button not registered");
      return;
    }
    tokenGroup.tools.npcReplacer = { ...tool, order: Object.keys(tokenGroup.tools).length, onChange: run };
    return;
  }

  if (Array.isArray(controls)) {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls && Array.isArray(tokenControls.tools)) {
      tokenControls.tools.push({ ...tool, onClick: run });
    } else {
      Logger.error("Could not find token controls group — toolbar button not registered");
    }
    return;
  }

  Logger.error("Unrecognized scene controls format — toolbar button not registered. This may indicate an incompatible Foundry version.");
}

Hooks.once("init", () => {
  Logger.log(`Initializing NPC Token Replacer (Foundry generation ${FoundryCompat.generation || "unknown"})`);
  registerSettings();
  preloadSelectorTemplates();
});

Hooks.once("ready", async () => {
  try {
    await NPCTokenReplacerController.initialize();
  } catch (error) {
    Logger.error("Failed to initialize NPC Token Replacer", error);
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorInitFailed"));
  }

  window.NPCTokenReplacer = NPCTokenReplacerController.getDebugAPI();
});

Hooks.on("getSceneControlButtons", registerControlButton);

// Named exports for testing
export { FolderManager, CompendiumManager, TokenReplacer, NPCTokenReplacerController, TokenReplacerError, registerControlButton };

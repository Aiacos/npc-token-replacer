/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official D&D compendium versions
 */

import { Logger, MODULE_ID } from "./lib/logger.js";
import { WildcardResolver } from "./lib/wildcard-resolver.js";
import { NameMatcher } from "./lib/name-matcher.js";
import { ProgressReporter } from "./lib/progress-reporter.js";

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

  static #WOTC_MODULE_PREFIXES = Object.freeze(["dnd-", "dnd5e"]);
  static get WOTC_MODULE_PREFIXES() { return CompendiumManager.#WOTC_MODULE_PREFIXES; }

  /**
   * Priority levels (higher = preferred):
   * 1=SRD/Tasha's, 2=Core Rulebooks, 3=Expansions, 4=Adventures
   */
  static #COMPENDIUM_PRIORITIES = Object.freeze({
    // SRD and Tasha's - lowest priority (fallback/options)
    "dnd5e": 1,
    "dnd-tashas-cauldron": 1,

    // Core Rulebooks - base priority
    "dnd-monster-manual": 2,
    "dnd-players-handbook": 2,
    "dnd-dungeon-masters-guide": 2,

    // Expansions - medium priority
    "dnd-forge-artificer": 3,

    // Adventures - highest priority (these get priority 4 by default if not listed)
    "dnd-phandelver-below": 4,
    "dnd-tomb-annihilation": 4,
    "dnd-adventures-faerun": 4,
    "dnd-heroes-faerun": 4,
    "dnd-heroes-borderlands": 4
  });
  static get COMPENDIUM_PRIORITIES() { return CompendiumManager.#COMPENDIUM_PRIORITIES; }

  static #PRIORITY_LABELS = Object.freeze({
    1: "FALLBACK",
    2: "CORE",
    3: "EXPANSION",
    4: "ADVENTURE"
  });
  static get PRIORITY_LABELS() { return CompendiumManager.#PRIORITY_LABELS; }

  /** Get priority for a pack (higher = preferred). Unknown dnd- packs default to 4. */
  static getCompendiumPriority(pack) {
    const packageName = pack.metadata.packageName || "";

    if (packageName in CompendiumManager.COMPENDIUM_PRIORITIES) {
      return CompendiumManager.COMPENDIUM_PRIORITIES[packageName];
    }

    if (packageName.startsWith("dnd-")) {
      return 4;
    }

    return 1; // non-WOTC fallback
  }

  /** Detect all WotC Actor compendiums by package prefix. Cached. */
  static detectWOTCCompendiums() {
    if (CompendiumManager.#wotcCompendiumsCache) {
      return CompendiumManager.#wotcCompendiumsCache;
    }

    Logger.log("Detecting official D&D compendiums...");

    const wotcPacks = game.packs.filter(pack => {
      if (pack.documentName !== "Actor") return false;
      const packageName = pack.metadata.packageName || "";
      return CompendiumManager.WOTC_MODULE_PREFIXES.some(prefix => packageName.startsWith(prefix));
    });

    Logger.log(`Found ${wotcPacks.length} official D&D Actor compendiums:`);
    wotcPacks.forEach(pack => {
      const priority = CompendiumManager.getCompendiumPriority(pack);
      const priorityLabel = CompendiumManager.PRIORITY_LABELS[priority] || "UNKNOWN";
      Logger.log(`  - ${pack.collection} (${pack.metadata.label}) [package: ${pack.metadata.packageName}, priority: ${priority}-${priorityLabel}]`);
    });

    CompendiumManager.#wotcCompendiumsCache = Object.freeze(wotcPacks);
    return CompendiumManager.#wotcCompendiumsCache;
  }

  /**
   * Get enabled compendiums per settings: ["default"] (Core+Fallback), ["all"], or specific IDs.
   * @returns {CompendiumCollection[]}
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
      const result = allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= 2);
      CompendiumManager.#enabledPacksCache = Object.freeze(result);
      return CompendiumManager.#enabledPacksCache;
    }

    let enabledPackIds;
    try {
      enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
    } catch (e) {
      Logger.warn(`Failed to parse enabledCompendiums JSON (${e.name}: ${e.message})`);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorSettingsParse"));
      enabledPackIds = ["default"];
    }

    if (!enabledPackIds || !Array.isArray(enabledPackIds) || enabledPackIds.length === 0) {
      enabledPackIds = ["default"];
    }

    let result;
    if (enabledPackIds.includes("all")) {
      Logger.log("Using all available compendiums");
      result = allPacks;
    } else if (enabledPackIds.includes("default")) {
      result = allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= 2);
      Logger.log(`Using default compendiums (Core + Fallback): ${result.map(p => p.metadata.label).join(", ")}`);
    } else {
      const enabledSet = new Set(enabledPackIds);
      result = allPacks.filter(pack => enabledSet.has(pack.collection));
      Logger.log(`Enabled compendiums: ${result.map(p => p.metadata.label).join(", ")}`);
    }

    CompendiumManager.#enabledPacksCache = Object.freeze(result);
    return CompendiumManager.#enabledPacksCache;
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
      for (const entry of pack.index.contents) {
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
      Logger.log(`  [${priority}-${priorityLabel}] Loaded ${pack.index.size} entries from ${pack.metadata.label}`);
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

  /** Get NPC tokens: selected if any, otherwise all scene NPCs. */
  static getNPCTokensToProcess() {
    if (!canvas.scene) {
      return { tokens: [], isSelection: false };
    }

    const selectedTokens = canvas.tokens.controlled;

    if (selectedTokens.length > 0) {
      // Filter selected tokens to only NPCs
      const selectedNPCs = selectedTokens
        .map(token => token.document)
        .filter(tokenDoc => {
          const actor = tokenDoc.actor;
          if (!actor) return false;
          return actor.type === "npc";
        });

      if (selectedNPCs.length > 0) {
        Logger.log(`Using ${selectedNPCs.length} selected NPC token(s) out of ${selectedTokens.length} selected`);
        return { tokens: selectedNPCs, isSelection: true };
      }

      Logger.log("Selected tokens contain no NPCs");
      return { tokens: [], isSelection: true };
    }

    const allTokens = canvas.scene.tokens.contents;
    const npcTokens = allTokens.filter(tokenDoc => {
      const actor = tokenDoc.actor;
      if (!actor) return false;
      return actor.type === "npc";
    });

    return { tokens: npcTokens, isSelection: false };
  }

  /** Convenience: get all scene NPC tokens (ignores selection). */
  static getNPCTokensFromScene() {
    return TokenReplacer.getNPCTokensToProcess().tokens;
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

  /** Merge prototype token with preserved properties from original. */
  static #prepareNewTokenData(prototypeToken, originalProps, worldActorId) {
    const overrides = {};
    for (const prop of TokenReplacer.PRESERVED_PROPERTIES) {
      overrides[prop] = originalProps[prop];
    }
    return {
      ...prototypeToken,
      ...overrides,
      actorId: worldActorId,
      actorLink: prototypeToken.actorLink ?? false
    };
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

    const dialogOpts = {
      title: game.i18n.localize("NPC_REPLACER.PreviewTitle"),
      content,
      yes: null,
      no: null,
      defaultYes: false,
      close: null
    };

    // When all tokens are unmatched, disable the Replace/yes button
    if (matched.length === 0) {
      dialogOpts.render = (html) => {
        // v12 passes jQuery object, v13+ passes HTMLElement
        const el = html instanceof HTMLElement ? html : html[0] ?? html;
        el.querySelectorAll('.yes, [data-button="yes"], [data-action="yes"]')
          .forEach(btn => { btn.disabled = true; });
      };
    }

    // TODO [HIGH] Reliability: Dialog timeout does not close the dialog UI.
    // When timeout fires, the Promise.race resolves false but the Dialog window stays open.
    // Fix: capture the Dialog instance from `new Dialog(...)` and call `dialog.close()` on timeout.
    // Also wrap Promise.race in try/finally to always clearTimeout (prevents dangling timer).
    let dialogTimeoutMinutes = 5;
    try {
      const value = game.settings.get(MODULE_ID, "dialogTimeout");
      if (Number.isFinite(value) && value > 0) dialogTimeoutMinutes = value;
    } catch (error) {
      Logger.debug(`dialogTimeout setting not available, using default ${dialogTimeoutMinutes}min: ${error.message}`);
    }
    const DIALOG_TIMEOUT_MS = dialogTimeoutMinutes * 60 * 1000;
    const dialogPromise = new Promise(resolve => {
      dialogOpts.yes = () => resolve(true);
      dialogOpts.no = () => resolve(false);
      dialogOpts.close = () => resolve(false);
      Dialog.confirm(dialogOpts);
    });
    let timeoutId;
    const timeoutPromise = new Promise(resolve => {
      timeoutId = setTimeout(() => {
        ui.notifications.warn(game.i18n.localize("NPC_REPLACER.DialogTimeout"));
        resolve(false);
      }, DIALOG_TIMEOUT_MS);
    });
    const result = await Promise.race([dialogPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
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
              name: tokenDoc.name
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
        name: tokenDoc.name
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

  game.settings.registerMenu(MODULE_ID, "compendiumSelector", {
    name: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Name"),
    label: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Label"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Hint"),
    icon: "fas fa-book",
    type: CompendiumSelectorForm,
    restricted: true
  });
}

// TODO [HIGH] Compatibility: CompendiumSelectorForm uses v12 FormApplication only.
// Foundry v14 will likely remove FormApplication. Add an ApplicationV2 branch with
// feature detection (same pattern as registerControlButton's v12/v13 handling).
// Without this, users cannot configure compendiums when v14 ships.
class CompendiumSelectorForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "npc-replacer-compendium-selector",
      title: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Title"),
      template: `modules/${MODULE_ID}/templates/compendium-selector.html`,
      width: 500,
      height: "auto",
      closeOnSubmit: true
    });
  }

  getData() {
    const allPacks = CompendiumManager.detectWOTCCompendiums();

    let enabledPackIds;
    try {
      const settingValue = game.settings.get(MODULE_ID, "enabledCompendiums");
      enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
    } catch (e) {
      Logger.warn(`Error parsing enabledCompendiums in form (${e.name}: ${e.message}), displaying default selection`);
      enabledPackIds = ["default"];
    }

    let mode = "custom";
    if (!enabledPackIds || !Array.isArray(enabledPackIds) || enabledPackIds.length === 0 || enabledPackIds.includes("default")) {
      mode = "default";
    } else if (enabledPackIds.includes("all")) {
      mode = "all";
    }

    Logger.log("CompendiumSelectorForm getData:", { enabledPackIds, mode });

    const enabledSet = mode === "custom" ? new Set(enabledPackIds) : null;

    return {
      mode,
      compendiums: allPacks.map((pack, index) => {
        const priority = CompendiumManager.getCompendiumPriority(pack);
        return {
          index,
          id: pack.collection,
          name: pack.metadata.label,
          module: pack.metadata.packageName,
          priority,
          priorityLabel: CompendiumManager.PRIORITY_LABELS[priority] || "UNKNOWN",
          enabled: mode === "all" || mode === "default" || (enabledSet !== null && enabledSet.has(pack.collection)),
          isCoreFallback: priority <= 2
        };
      })
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const list = html.find('#compendium-list');
    html.find('input[name="mode"]').on('change', function(e) {
      if (e.target.value === 'custom') {
        list.removeClass('disabled');
      } else {
        list.addClass('disabled');
      }
    });
    const selectedMode = html.find('input[name="mode"]:checked').val();
    if (selectedMode && selectedMode !== 'custom') {
      list.addClass('disabled');
    }
  }

  async _updateObject(event, formData) {
    Logger.log("CompendiumSelectorForm formData:", formData);

    const mode = formData.mode;
    const allPacks = CompendiumManager.detectWOTCCompendiums();

    let enabledArray;
    if (mode === "default") {
      enabledArray = ["default"];
    } else if (mode === "all") {
      enabledArray = ["all"];
    } else {
      enabledArray = [];
      const prefix = "compendium-";
      for (const [key, value] of Object.entries(formData)) {
        if (key.startsWith(prefix) && value) {
          const index = parseInt(key.substring(prefix.length), 10);
          if (!isNaN(index) && allPacks[index]) {
            enabledArray.push(allPacks[index].collection);
          }
        }
      }
      if (enabledArray.length === 0) {
        ui.notifications.warn(game.i18n.localize("NPC_REPLACER.NoCompendium"));
        enabledArray = ["default"];
      }
    }

    const jsonValue = JSON.stringify(enabledArray);
    Logger.log("Saving enabledCompendiums:", jsonValue);

    try {
      await game.settings.set(MODULE_ID, "enabledCompendiums", jsonValue);

      NPCTokenReplacerController.clearCache();

      ui.notifications.info(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Saved"));
    } catch (e) {
      Logger.error(`Failed to save compendium settings (${e.name}: ${e.message})`);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.SaveError"));
    }
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

/** Add replace button to token controls (handles v12 array and v13+ object formats). */
function registerControlButton(controls) {
  const toolConfig = {
    name: "npcReplacer",
    title: game.i18n.localize("NPC_REPLACER.Button"),
    icon: "fas fa-sync-alt",
    button: true,
    visible: game.user.isGM,
    onClick: () => NPCTokenReplacerController.replaceNPCTokens()
    // Note: Do NOT add onChange - it causes double execution with onClick
  };

  if (controls.tokens && typeof controls.tokens === "object" && !Array.isArray(controls.tokens)) {
    if (!controls.tokens.tools) {
      Logger.error("Token controls found but 'tools' property is missing — toolbar button not registered");
      return;
    }
    controls.tokens.tools.npcReplacer = toolConfig;
  } else if (Array.isArray(controls)) {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls && Array.isArray(tokenControls.tools)) {
      tokenControls.tools.push(toolConfig);
    } else {
      Logger.error("Could not find token controls group — toolbar button not registered");
    }
  } else {
    Logger.error("Unrecognized scene controls format — toolbar button not registered. This may indicate an incompatible Foundry version.");
  }
}

Hooks.once("init", () => {
  Logger.log("Initializing NPC Token Replacer");
  registerSettings();
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

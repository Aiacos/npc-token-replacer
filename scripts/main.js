/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official D&D compendium versions
 */

import { Logger, MODULE_ID } from "./lib/logger.js";
import { WildcardResolver } from "./lib/wildcard-resolver.js";
import { NameMatcher } from "./lib/name-matcher.js";
import { ProgressReporter } from "./lib/progress-reporter.js";

/**
 * Structured error for token replacement failures with a phase indicator
 * Replaces fragile string-matching on error.message for failure classification
 */
class TokenReplacerError extends Error {
  constructor(message, phase) {
    super(message);
    this.name = "TokenReplacerError";
    this.phase = phase; // "import_failed", "creation_failed", "delete_failed"
  }
}

// Note: WOTC_MODULE_PREFIXES and COMPENDIUM_PRIORITIES are defined as
// static getters in CompendiumManager class for better encapsulation

// Note: All caches are now managed by their respective classes:
// - CompendiumManager.#indexCache (monster index)
// - CompendiumManager.#wotcCompendiumsCache (detected compendiums)
// - FolderManager.#importFolderCache (import folder)
// - NPCTokenReplacerController.#isProcessing (execution lock)
// - TokenReplacer.#sequentialCounter (variant counter)
// - WildcardResolver.#variantCache (resolved wildcard paths)

/**
 * FolderManager utility class for Actor folder handling
 * Provides methods for creating and managing the import folder for compendium actors
 * @class
 */
class FolderManager {
  /**
   * Cache for the import folder to avoid repeated lookups
   * @type {Folder|null}
   * @static
   * @private
   */
  static #importFolderCache = null;

  /**
   * Default folder name for Monster Manual imports
   * @type {string}
   * @static
   * @readonly
   */
  static get FOLDER_NAME() {
    return "MonsterManual";
  }

  /**
   * Default folder color for Monster Manual imports (dark red)
   * @type {string}
   * @static
   * @readonly
   */
  static get FOLDER_COLOR() {
    return "#7a1010";
  }

  /**
   * Patterns for identifying monster-related folders
   * Used to find appropriate parent folders for imports
   * @type {Array<{pattern: RegExp, name: string}>}
   * @static
   * @readonly
   */
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

  /**
   * Get the full path of a folder (including parent folders)
   * @param {Folder} folder - The folder to get the path for
   * @returns {string} The full path in format "/Parent/Child/Folder"
   * @static
   * @example
   * const folder = game.folders.find(f => f.name === "Goblins");
   * const path = FolderManager.getFolderPath(folder);
   * // Returns "/Monsters/Humanoids/Goblins"
   */
  static getFolderPath(folder) {
    if (!folder) return "";
    const parts = [folder.name];
    let parent = folder.folder;
    while (parent) {
      parts.unshift(parent.name);
      parent = parent.folder;
    }
    return `/${parts.join("/")}`;
  }

  /**
   * Get or create the folder for Monster Manual imports
   * Looks for existing monster folders and creates a subfolder with "MonsterManual" suffix.
   * Results are cached to avoid repeated lookups/creation.
   * @returns {Promise<Folder|null>} The folder to use for imports, or null if creation failed
   * @static
   * @example
   * const folder = await FolderManager.getOrCreateImportFolder();
   * if (folder) {
   *   console.log(`Importing to: ${FolderManager.getFolderPath(folder)}`);
   * }
   */
  static async getOrCreateImportFolder() {
    // Return cached folder if available and still exists
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

  /**
   * Clear the folder cache
   * Call this when settings change or when folder may have been deleted
   * @returns {void}
   * @static
   * @example
   * // After settings update
   * FolderManager.clearCache();
   */
  static clearCache() {
    FolderManager.#importFolderCache = null;
    Logger.debug("FolderManager cache cleared");
  }
}

/**
 * CompendiumManager utility class for managing D&D compendium detection and indexing
 * Provides methods for detecting WOTC compendiums, managing enabled compendiums,
 * loading monster indexes, and handling compendium priorities
 * @class
 */
class CompendiumManager {
  /**
   * Cache for the combined monster index from all enabled compendiums
   * @type {Array<{entry: Object, pack: CompendiumCollection}>|null}
   * @static
   * @private
   */
  static #indexCache = null;

  /**
   * Map for O(1) exact-name lookups: normalizedName -> Array<{entry, pack, normalizedName}>
   * @type {Map<string, Array>|null}
   * @static
   * @private
   */
  static #indexMap = null;

  /**
   * Cache for enabled compendium packs (avoids re-parsing JSON settings)
   * @type {CompendiumCollection[]|null}
   * @static
   * @private
   */
  static #enabledPacksCache = null;

  /**
   * Cache for detected WOTC compendiums
   * @type {CompendiumCollection[]|null}
   * @static
   * @private
   */
  static #wotcCompendiumsCache = null;

  /**
   * Errors from the most recent loadMonsterIndex() call
   * @type {Array<{packId: string, packLabel: string, error: string}>}
   * @static
   * @private
   */
  static #lastLoadErrors = [];

  /**
   * Known official WOTC module prefixes for auto-detection
   * @type {string[]}
   * @static
   * @readonly
   */
  static #WOTC_MODULE_PREFIXES = Object.freeze(["dnd-", "dnd5e"]);
  static get WOTC_MODULE_PREFIXES() {
    return CompendiumManager.#WOTC_MODULE_PREFIXES;
  }

  /**
   * Compendium priority levels (higher = preferred)
   * Priority 1: SRD and Tasha's (lowest - fallback/options)
   * Priority 2: Core Rulebooks (Monster Manual, PHB, DMG)
   * Priority 3: Expansions (Forge of Artificer, etc.)
   * Priority 4: Adventures (highest - most specific content)
   * @type {Object<string, number>}
   * @static
   * @readonly
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
  static get COMPENDIUM_PRIORITIES() {
    return CompendiumManager.#COMPENDIUM_PRIORITIES;
  }

  /**
   * Priority level labels for display
   * @type {Object<number, string>}
   * @static
   * @readonly
   */
  static #PRIORITY_LABELS = Object.freeze({
    1: "FALLBACK",
    2: "CORE",
    3: "EXPANSION",
    4: "ADVENTURE"
  });
  static get PRIORITY_LABELS() {
    return CompendiumManager.#PRIORITY_LABELS;
  }

  /**
   * Get the priority of a compendium pack
   * Higher priority = preferred when multiple matches exist
   * @param {CompendiumCollection} pack - The compendium pack
   * @returns {number} Priority level (1=SRD/Fallback, 2=Core, 3=Expansions, 4=Adventures)
   * @static
   * @example
   * const pack = game.packs.get("dnd-monster-manual.monsters");
   * const priority = CompendiumManager.getCompendiumPriority(pack);
   * // Returns: 2 (CORE)
   */
  static getCompendiumPriority(pack) {
    const packageName = pack.metadata.packageName || "";

    // Check if we have a specific priority defined
    if (packageName in CompendiumManager.COMPENDIUM_PRIORITIES) {
      return CompendiumManager.COMPENDIUM_PRIORITIES[packageName];
    }

    // Default for unknown dnd- modules: assume they are adventures (highest priority)
    if (packageName.startsWith("dnd-")) {
      return 4;
    }

    // Fallback for unknown packages (non-WOTC)
    return 1;
  }

  /**
   * Detect all available WOTC Actor compendiums
   * Searches for compendiums from packages with known WOTC prefixes (dnd-, dnd5e)
   * Results are cached to avoid repeated lookups
   * @returns {CompendiumCollection[]} Array of WOTC compendium packs with Actor documents
   * @static
   * @example
   * const wotcPacks = CompendiumManager.detectWOTCCompendiums();
   * console.log(`Found ${wotcPacks.length} official D&D compendiums`);
   */
  static detectWOTCCompendiums() {
    if (CompendiumManager.#wotcCompendiumsCache) {
      return CompendiumManager.#wotcCompendiumsCache;
    }

    Logger.log("Detecting official D&D compendiums...");

    const wotcPacks = game.packs.filter(pack => {
      // Only Actor compendiums
      if (pack.documentName !== "Actor") return false;

      // Check if package name starts with known WOTC prefixes
      const packageName = pack.metadata.packageName || "";
      const isWotc = CompendiumManager.WOTC_MODULE_PREFIXES.some(prefix => packageName.startsWith(prefix));

      return isWotc;
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
   * Get the list of enabled compendiums based on settings
   * Interprets the enabledCompendiums setting which can be:
   * - ["default"] - Only FALLBACK (priority 1) and CORE (priority 2) compendiums
   * - ["all"] - All available WOTC compendiums
   * - [pack.collection, ...] - Specific compendium IDs
   * @returns {CompendiumCollection[]} Array of enabled compendium packs
   * @static
   * @example
   * const enabledPacks = CompendiumManager.getEnabledCompendiums();
   * console.log(`Using ${enabledPacks.length} compendiums`);
   */
  static getEnabledCompendiums() {
    if (CompendiumManager.#enabledPacksCache) return CompendiumManager.#enabledPacksCache;

    const allPacks = CompendiumManager.detectWOTCCompendiums();

    // Get the setting (stored as JSON string)
    // BUG-02: Split into two try/catch blocks for distinct error messages
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

    // If no specific selection or empty, use default (Core + Fallback only)
    if (!enabledPackIds || !Array.isArray(enabledPackIds) || enabledPackIds.length === 0) {
      enabledPackIds = ["default"];
    }

    let result;

    // "all" - use all available compendiums
    if (enabledPackIds.includes("all")) {
      Logger.log("Using all available compendiums");
      result = allPacks;
    } else if (enabledPackIds.includes("default")) {
      // "default" - only FALLBACK (priority 1) and CORE (priority 2) compendiums
      result = allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= 2);
      Logger.log(`Using default compendiums (Core + Fallback): ${result.map(p => p.metadata.label).join(", ")}`);
    } else {
      // Otherwise filter by specific compendium IDs — Set for O(1) lookup
      const enabledSet = new Set(enabledPackIds);
      result = allPacks.filter(pack => enabledSet.has(pack.collection));
      Logger.log(`Enabled compendiums: ${result.map(p => p.metadata.label).join(", ")}`);
    }

    CompendiumManager.#enabledPacksCache = Object.freeze(result);
    return CompendiumManager.#enabledPacksCache;
  }

  /**
   * Load the combined monster index from all enabled compendiums
   * Fetches and combines indexes from all enabled compendiums, sorted by priority
   * Results are cached to avoid repeated loading
   * @param {boolean} [forceReload=false] - Force reload even if cached
   * @returns {Promise<Array<{entry: Object, pack: CompendiumCollection}>>} Array of {entry, pack} objects
   * @static
   * @example
   * const index = await CompendiumManager.loadMonsterIndex();
   * console.log(`Loaded ${index.length} monster entries`);
   *
   * // Force reload after settings change
   * const freshIndex = await CompendiumManager.loadMonsterIndex(true);
   */
  static async loadMonsterIndex(forceReload = false) {
    if (CompendiumManager.#indexCache && !forceReload) {
      return CompendiumManager.#indexCache;
    }

    // Reset load errors for this run
    CompendiumManager.#lastLoadErrors = [];

    const enabledPacks = CompendiumManager.getEnabledCompendiums();

    if (enabledPacks.length === 0) {
      Logger.log("No enabled compendiums found");
      CompendiumManager.#indexCache = Object.freeze([]);
      CompendiumManager.#indexMap = new Map();
      return CompendiumManager.#indexCache;
    }

    Logger.log(`Loading monster index from ${enabledPacks.length} compendium(s)...`);

    const combinedIndex = [];

    // Sort packs by priority for logging (highest first)
    const sortedPacks = [...enabledPacks].sort((a, b) =>
      CompendiumManager.getCompendiumPriority(b) - CompendiumManager.getCompendiumPriority(a)
    );

    // Load all pack indexes in parallel
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

    // Build O(1) lookup Map by normalized name
    const indexMap = new Map();
    for (const item of combinedIndex) {
      const key = item.normalizedName;
      if (!indexMap.has(key)) indexMap.set(key, []);
      indexMap.get(key).push(item);
    }

    CompendiumManager.#indexCache = Object.freeze(combinedIndex);
    CompendiumManager.#indexMap = indexMap;

    return CompendiumManager.#indexCache;
  }

  /**
   * Clear all compendium caches
   * Call this when settings change or when compendiums may have been modified
   * @returns {void}
   * @static
   * @example
   * // After settings update
   * CompendiumManager.clearCache();
   */
  static clearCache() {
    CompendiumManager.#indexCache = null;
    CompendiumManager.#indexMap = null;
    CompendiumManager.#wotcCompendiumsCache = null;
    CompendiumManager.#enabledPacksCache = null;
    CompendiumManager.#lastLoadErrors = [];
    Logger.debug("CompendiumManager caches cleared");
  }

  /**
   * Get errors from the most recent loadMonsterIndex() call
   * @returns {Array<{packId: string, packLabel: string, error: string}>} Copy of load errors
   * @static
   */
  static getLastLoadErrors() {
    return [...CompendiumManager.#lastLoadErrors];
  }

  /**
   * Get the index Map for O(1) exact-name lookups
   * @returns {Map<string, Array>|null} Map of normalizedName -> matches, or null if not loaded
   * @static
   */
  static getIndexMap() {
    return CompendiumManager.#indexMap;
  }

  /**
   * Check if the monster index is cached
   * @returns {boolean} True if index is cached
   * @static
   */
  static isIndexCached() {
    return CompendiumManager.#indexCache !== null;
  }

  /**
   * Get the cached index size for debugging
   * @returns {number} Number of cached index entries, or 0 if not cached
   * @static
   */
  static getCacheSize() {
    return CompendiumManager.#indexCache ? CompendiumManager.#indexCache.length : 0;
  }
}

// Wire late-bound dependency — NameMatcher needs CompendiumManager for priority lookups
NameMatcher.setCompendiumManager(CompendiumManager);

/**
 * TokenReplacer utility class for token replacement operations
 * Handles extracting token properties, finding matching compendium entries,
 * and replacing tokens with official compendium versions
 * @class
 */
class TokenReplacer {
  /**
   * Sequential counter for token variations
   * Used to cycle through available token variants when mode is "sequential"
   * Reset at the start of each replacement session
   * @type {number}
   * @static
   * @private
   */
  static #sequentialCounter = 0;

  /**
   * Cached variation mode setting — read once per session, cleared after
   * @type {string|null}
   * @static
   * @private
   */
  static #variationMode = null;

  /**
   * Session-scoped Map for O(1) actor lookups by compendium UUID
   * Built once per replacement session via buildActorLookup()
   * @type {Map<string, Actor>|null}
   * @static
   * @private
   */
  static #actorLookup = null;

  /**
   * Cache for compendium documents to avoid repeated getDocument() calls
   * @type {Map<string, Object>}
   * @static
   * @private
   */
  static #compendiumDocCache = new Map();

  /**
   * Build the actor lookup Map for the current session
   * @returns {void}
   * @static
   */
  static buildActorLookup() {
    TokenReplacer.#actorLookup = new Map();
    for (const a of game.actors) {
      const uuid = a._stats?.compendiumSource || a.flags?.core?.sourceId;
      if (uuid) TokenReplacer.#actorLookup.set(uuid, a);
    }
    Logger.debug(`Built actor lookup Map with ${TokenReplacer.#actorLookup.size} entries`);
  }

  /**
   * Clear the actor lookup Map to free memory after a session
   * @returns {void}
   * @static
   */
  static clearActorLookup() {
    TokenReplacer.#actorLookup = null;
    TokenReplacer.#variationMode = null;
    TokenReplacer.#compendiumDocCache.clear();
    Logger.debug("Actor lookup Map and variation mode cleared");
  }

  /**
   * Properties to preserve when replacing a token
   * These are the token properties that get transferred from old to new token
   * @type {string[]}
   * @static
   * @readonly
   */
  static #PRESERVED_PROPERTIES = Object.freeze([
    "x", "y", "elevation", "width", "height",
    "hidden", "rotation", "disposition", "locked", "alpha"
  ]);
  static get PRESERVED_PROPERTIES() {
    return TokenReplacer.#PRESERVED_PROPERTIES;
  }

  /**
   * Get the current value of the sequential counter
   * Useful for debugging and testing
   * @returns {number} Current counter value
   * @static
   */
  static getSequentialCounter() {
    return TokenReplacer.#sequentialCounter;
  }

  /**
   * Reset the sequential variant counter
   * Call this at the start of each replacement session to ensure
   * consistent variant distribution across tokens
   * @returns {void}
   * @static
   * @example
   * // At start of replacement session
   * TokenReplacer.resetCounter();
   */
  static resetCounter() {
    TokenReplacer.#sequentialCounter = 0;
    Logger.debug("TokenReplacer sequential counter reset");
  }

  /**
   * Extract token properties that need to be preserved during replacement
   * @param {TokenDocument} tokenDoc - The token document to extract properties from
   * @returns {Object} Object containing properties to preserve
   * @static
   * @example
   * const props = TokenReplacer.extractTokenProperties(tokenDoc);
   * // Returns: { x: 100, y: 200, elevation: 0, width: 1, height: 1, ... }
   */
  static extractTokenProperties(tokenDoc) {
    const props = {};
    for (const prop of TokenReplacer.PRESERVED_PROPERTIES) {
      props[prop] = tokenDoc[prop];
    }
    return props;
  }

  /**
   * Get NPC tokens to process - selected tokens if any, otherwise all scene tokens
   * Prioritizes user-selected tokens, falling back to all NPCs in the scene
   * @returns {{tokens: TokenDocument[], isSelection: boolean}} Object with tokens array and selection flag
   * @static
   * @example
   * const { tokens, isSelection } = TokenReplacer.getNPCTokensToProcess();
   * if (isSelection) {
   *   console.log(`Processing ${tokens.length} selected NPC tokens`);
   * } else {
   *   console.log(`Processing all ${tokens.length} NPC tokens in scene`);
   * }
   */
  static getNPCTokensToProcess() {
    if (!canvas.scene) {
      return { tokens: [], isSelection: false };
    }

    // Check if there are selected tokens
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

      // Selected tokens but none are NPCs — respect user intent, don't process entire scene
      Logger.log("Selected tokens contain no NPCs");
      return { tokens: [], isSelection: true };
    }

    // No selection or no NPCs in selection - use all scene tokens
    const allTokens = canvas.scene.tokens.contents;
    const npcTokens = allTokens.filter(tokenDoc => {
      const actor = tokenDoc.actor;
      if (!actor) return false;
      return actor.type === "npc";
    });

    return { tokens: npcTokens, isSelection: false };
  }

  /**
   * Get all NPC tokens from the current scene
   * Convenience method that returns just the tokens array
   * @returns {TokenDocument[]} Array of NPC token documents
   * @static
   * @example
   * const npcTokens = TokenReplacer.getNPCTokensFromScene();
   * console.log(`Found ${npcTokens.length} NPC tokens in scene`);
   */
  static getNPCTokensFromScene() {
    return TokenReplacer.getNPCTokensToProcess().tokens;
  }

  /**
   * Find or import the world actor for a compendium entry
   * Checks if actor already exists in world (by name and compendium source),
   * otherwise imports from compendium
   * @param {Actor} compendiumActor - The actor document from compendium
   * @param {Object} compendiumEntry - The compendium index entry
   * @param {CompendiumCollection} pack - The source compendium pack
   * @returns {Promise<Actor>} The world actor (existing or newly imported)
   * @throws {Error} If import fails
   * @static
   * @private
   */
  static async #getOrImportWorldActor(compendiumActor, compendiumEntry, pack) {
    // O(1) lookup via session-scoped Map (built by buildActorLookup before processing loop)
    let worldActor = TokenReplacer.#actorLookup?.get(compendiumActor.uuid) || null;

    // BUG-01: Guard against stale cached references (actor deleted between sessions)
    if (worldActor && !game.actors.has(worldActor.id)) {
      Logger.warn(`Cached actor "${worldActor.name}" (id: ${worldActor.id}) no longer exists in game.actors, will re-import`);
      TokenReplacer.#actorLookup.delete(compendiumActor.uuid);
      worldActor = null;
    }

    if (worldActor) {
      Logger.log(`Using existing imported actor "${worldActor.name}"`);
      return worldActor;
    }

    // Get or create the import folder
    const importFolder = await FolderManager.getOrCreateImportFolder();

    // Import the actor from compendium using the standard Foundry API
    // Pass the folder ID in the updateData parameter
    if (!importFolder) {
      Logger.warn(`Import folder unavailable — actor "${compendiumActor.name}" will be imported to the root folder`);
    }
    const updateData = importFolder ? { folder: importFolder.id } : {};
    worldActor = await game.actors.importFromCompendium(pack, compendiumEntry._id, updateData);

    if (!worldActor) {
      throw new Error(`Failed to import actor "${compendiumActor.name}" from compendium`);
    }

    // Register newly imported actor in session lookup for future O(1) hits
    if (TokenReplacer.#actorLookup) {
      TokenReplacer.#actorLookup.set(compendiumActor.uuid, worldActor);
    }

    Logger.log(`Imported actor "${compendiumActor.name}" from compendium into folder "${importFolder?.name || "root"}"`);
    return worldActor;
  }

  /**
   * Resolve wildcard token texture path to an actual file
   * Handles Monster Manual 2024 wildcard patterns like "specter-*.webp"
   * @param {Object} prototypeToken - The prototype token object to modify
   * @param {Actor} compendiumActor - The compendium actor for fallback portrait
   * @param {string} creatureName - Name of creature for logging
   * @returns {Promise<void>} Modifies prototypeToken.texture.src in place
   * @static
   * @private
   */
  static async #resolveWildcardTexture(prototypeToken, compendiumActor, creatureName) {
    const originalPath = prototypeToken.texture.src;
    Logger.log(`Detected wildcard pattern in token path: ${originalPath}`);

    // Use cached variation mode (read once per session)
    if (!TokenReplacer.#variationMode) {
      TokenReplacer.#variationMode = game.settings.get(MODULE_ID, "tokenVariationMode");
      Logger.log(`Token variation mode: ${TokenReplacer.#variationMode}`);
    }
    const variationMode = TokenReplacer.#variationMode;

    // Use WildcardResolver to find and select variant
    const currentIndex = TokenReplacer.#sequentialCounter;
    const result = await WildcardResolver.resolve(
      originalPath,
      variationMode,
      currentIndex,
      compendiumActor.img // Use actor portrait as fallback
    );

    // Update the sequential counter if in sequential mode
    if (variationMode === "sequential" && result.nextIndex > currentIndex) {
      TokenReplacer.#sequentialCounter = result.nextIndex;
    }

    Logger.log(`Resolved wildcard for ${creatureName}: ${result.resolvedPath}`);
    prototypeToken.texture.src = result.resolvedPath;
  }

  /**
   * Prepare new token data by merging prototype token with preserved properties
   * @param {Object} prototypeToken - The prototype token from compendium actor
   * @param {Object} originalProps - Properties extracted from original token
   * @param {string} worldActorId - ID of the world actor to link
   * @returns {Object} Complete token data ready for creation
   * @static
   * @private
   */
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
   * Replace a single token with its Monster Manual/compendium version
   * Imports the actor if needed, resolves wildcard token paths, and creates new token
   * @param {TokenDocument} tokenDoc - The token document to replace
   * @param {Object} compendiumEntry - The matching compendium index entry
   * @param {CompendiumCollection} pack - The compendium pack containing the entry
   * @returns {Promise<TokenDocument>} The newly created token document
   * @throws {Error} If actor import or token creation fails
   * @static
   * @example
   * const match = NameMatcher.findMatch("Goblin", monsterIndex);
   * if (match) {
   *   const newToken = await TokenReplacer.replaceToken(tokenDoc, match.entry, match.pack);
   *   console.log(`Replaced with ${newToken.name}`);
   * }
   */
  static async replaceToken(tokenDoc, compendiumEntry, pack) {
    // Save original properties
    const originalProps = TokenReplacer.extractTokenProperties(tokenDoc);
    const originalName = tokenDoc.name;

    Logger.log(`Replacing token "${originalName}" with "${compendiumEntry.name}"`);

    // Get the full actor document from the compendium
    let compendiumActor;
    try {
      const docCacheKey = `${pack.collection}|${compendiumEntry._id}`;
      compendiumActor = TokenReplacer.#compendiumDocCache.get(docCacheKey);
      if (!compendiumActor) {
        compendiumActor = await pack.getDocument(compendiumEntry._id);
        TokenReplacer.#compendiumDocCache.set(docCacheKey, compendiumActor);
      }
    } catch (error) {
      throw new TokenReplacerError(`Failed to load "${compendiumEntry.name}" from compendium: ${error.message}`, "import_failed");
    }

    // Get or import the world actor
    let worldActor;
    try {
      worldActor = await TokenReplacer.#getOrImportWorldActor(compendiumActor, compendiumEntry, pack);
    } catch (error) {
      throw new TokenReplacerError(`Failed to import "${compendiumEntry.name}": ${error.message}`, "import_failed");
    }

    // IMPORTANT: Always use the COMPENDIUM actor's prototypeToken to get the correct Monster Manual 2024 token image
    // The world actor might have been imported from a different source (old SRD) with different token art
    const prototypeToken = compendiumActor.prototypeToken.toObject();
    Logger.log(`Using token image from compendium: ${prototypeToken.texture?.src || "default"}`);

    // Handle wildcard patterns in token texture paths
    if (WildcardResolver.isWildcardPath(prototypeToken.texture?.src)) {
      await TokenReplacer.#resolveWildcardTexture(prototypeToken, compendiumActor, compendiumEntry.name);
    }

    // Prepare new token data, merging prototype with original properties
    const newTokenData = TokenReplacer.#prepareNewTokenData(prototypeToken, originalProps, worldActor.id);

    // Create new token first, then delete old one — avoids data loss if creation fails
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

    // Safe to delete now — new token exists
    try {
      // Verify token still exists (another GM may have deleted it)
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
 * NPCTokenReplacerController - Main facade class for orchestrating NPC token replacement
 * Coordinates all module operations: compendium detection, name matching, and token replacement
 * Provides a unified API for the module and prevents concurrent execution
 * @class
 */
class NPCTokenReplacerController {
  /**
   * Lock flag to prevent concurrent execution of replacement operations
   * Only one replacement session can run at a time
   * @type {boolean}
   * @static
   * @private
   */
  static #isProcessing = false;

  /**
   * Check if a replacement operation is currently in progress
   * @returns {boolean} True if processing is active
   * @static
   * @example
   * if (NPCTokenReplacerController.isProcessing()) {
   *   console.log("Please wait, replacement in progress...");
   * }
   */
  static isProcessing() {
    return NPCTokenReplacerController.#isProcessing;
  }

  /**
   * Validate all prerequisites before running the replacement
   * Checks: user is GM, scene is active, WOTC compendiums are available
   * @returns {boolean} Whether all prerequisites are met
   * @static
   * @example
   * if (!NPCTokenReplacerController.validatePrerequisites()) {
   *   return; // User has been notified of the issue
   * }
   */
  static validatePrerequisites() {
    // Check if user is GM
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("NPC_REPLACER.GMOnly"));
      return false;
    }

    // Check if there's an active scene
    if (!canvas.scene) {
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoScene"));
      return false;
    }

    // Check if any WOTC modules with Actor compendiums are active
    const wotcPacks = CompendiumManager.detectWOTCCompendiums();
    if (wotcPacks.length === 0) {
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoModule"));
      return false;
    }

    return true;
  }

  // Removed: showConfirmationDialog — replaced by showPreviewDialog

  /**
   * Show a preview dialog with token-to-creature match mapping
   * Replaces the old confirmation dialog with a rich 3-column table showing
   * Token Name | Will Match As | Source Compendium for each token.
   * Matched tokens appear first, unmatched tokens last.
   * @param {Array<{tokenDoc: Object, creatureName: string, match: Object|null}>} matchResults - Pre-computed match results from computeMatches
   * @returns {Promise<boolean>} Whether user confirmed to proceed
   * @static
   */
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
        // v12: .yes or [data-button="yes"], v13 ApplicationV2: [data-action="yes"]
        const el = html instanceof jQuery ? html : $(html);
        el.find('.yes, [data-button="yes"], [data-action="yes"]').prop("disabled", true);
      };
    }

    const DIALOG_TIMEOUT_MS = 300000; // 5 minutes
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

  // Removed: #processToken — replacement logic inlined in replaceNPCTokens using pre-computed matches

  /**
   * Report the results of a replacement session
   * Displays appropriate notifications and logs details
   * @param {number} replaced - Count of successfully replaced tokens
   * @param {string[]} notFound - Names of tokens not found in compendiums
   * @param {string[]} importFailed - Names of tokens that failed during import
   * @param {string[]} creationFailed - Names of tokens that failed during creation
   * @param {string[]} deleteFailed - Names of tokens where old token could not be removed (duplicate may exist)
   * @returns {void}
   * @static
   * @private
   */
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

  /**
   * Main function to replace NPC tokens (selected or all in scene)
   * Orchestrates the entire replacement workflow:
   * 1. Validates prerequisites (GM, scene, compendiums)
   * 2. Gets tokens to process (selected or all NPCs)
   * 3. Shows confirmation dialog
   * 4. Processes each token
   * 5. Reports results
   *
   * @returns {Promise<void>}
   * @static
   * @example
   * // Triggered by button click or console
   * await NPCTokenReplacerController.replaceNPCTokens();
   *
   * // From debug API
   * NPCTokenReplacer.replaceNPCTokens();
   */
  static async replaceNPCTokens() {
    // Prevent double execution — acquire lock immediately to avoid TOCTOU race
    if (NPCTokenReplacerController.#isProcessing) {
      Logger.log("Already processing tokens, ignoring duplicate call");
      return;
    }
    NPCTokenReplacerController.#isProcessing = true;

    try {
      // Validate prerequisites
      if (!NPCTokenReplacerController.validatePrerequisites()) {
        return;
      }

      // Check if any compendiums are available
      const enabledPacks = CompendiumManager.getEnabledCompendiums();
      if (enabledPacks.length === 0) {
        ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
        return;
      }

      // Load the combined monster index from all enabled compendiums
      const index = await CompendiumManager.loadMonsterIndex();

      if (index.length === 0) {
        ui.notifications.error(game.i18n.localize("NPC_REPLACER.IndexEmpty"));
        return;
      }

      // Get NPC tokens to process (selected if any, otherwise all scene NPCs)
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

      // Pre-compute matches (scan phase with progress)
      const scanProgress = new ProgressReporter();
      let matchResults;
      try {
        matchResults = await NPCTokenReplacerController.computeMatches(npcTokens, index, scanProgress);
      } finally {
        scanProgress.finish();
      }

      // Show preview dialog with match results
      const confirmed = await NPCTokenReplacerController.showPreviewDialog(matchResults);
      if (!confirmed) {
        Logger.log("Token replacement cancelled by user");
        return;
      }

      // Reset sequential counter and build actor lookup for this session
      TokenReplacer.resetCounter();
      TokenReplacer.buildActorLookup();

      // Filter to only matched tokens for replacement
      const toReplace = matchResults.filter(r => r.match !== null);
      const notFoundNames = matchResults.filter(r => r.match === null).map(r => r.creatureName);

      // TODO [MEDIUM] Performance: token processing loop is fully sequential — 2N socket round-trips.
      // Split into parallel resolve phase (getDocument, import, wildcard) + batched mutation phase
      // (single deleteEmbeddedDocuments + createEmbeddedDocuments call for all tokens).
      // Track results
      let replaced = 0;
      const importFailed = [];
      const creationFailed = [];
      const deleteFailed = [];
      const processedIds = new Set();

      // Start progress bar for replacement phase
      const progress = new ProgressReporter();
      progress.start(toReplace.length, game.i18n.format("NPC_REPLACER.ProgressStart", { count: toReplace.length }));

      try {
        // Replace each matched token using pre-computed match data
        for (const result of toReplace) {
          const { tokenDoc, creatureName } = result;

          // Skip if already processed (handles duplicate entries)
          if (processedIds.has(tokenDoc.id)) {
            Logger.log(`Skipping already processed token: ${tokenDoc.name}`);
            continue;
          }

          // Check if token still exists in scene (may have been deleted during preview)
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

      // Report results
      NPCTokenReplacerController.#reportResults(replaced, notFoundNames, importFailed, creationFailed, deleteFailed);
    } finally {
      // Always release the lock and clean up session state
      NPCTokenReplacerController.#isProcessing = false;
      TokenReplacer.clearActorLookup();
    }
  }

  /**
   * Clear all module caches
   * Clears caches from all manager classes and legacy module-level caches
   * Call this when settings change or to force fresh data
   * @returns {void}
   * @static
   * @example
   * // After settings update
   * NPCTokenReplacerController.clearCache();
   */
  static clearCache() {
    // Clear all class-based caches
    CompendiumManager.clearCache();
    FolderManager.clearCache();
    WildcardResolver.clearCache();
    TokenReplacer.clearActorLookup();
    Logger.log("All caches cleared");
  }

  /**
   * Pre-compute matches for all tokens against the monster index
   * Separates "find matches" from "replace tokens" so a preview dialog
   * can be shown between the two steps (dry-run preview).
   * @param {Object[]} tokens - Array of token documents to match
   * @param {Object[]} index - The combined monster index
   * @param {ProgressReporter} progress - Progress reporter instance
   * @returns {Array<{tokenDoc: Object, creatureName: string, match: Object|null}>} Match results
   * @static
   */
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

  /**
   * Initialize the module during ready hook
   * Detects available compendiums and pre-caches the monster index
   * @returns {Promise<void>}
   * @static
   * @example
   * Hooks.once("ready", async () => {
   *   await NPCTokenReplacerController.initialize();
   * });
   */
  static async initialize() {
    Logger.log("NPC Token Replacer is ready");

    // Detect available WOTC compendiums
    const wotcPacks = CompendiumManager.detectWOTCCompendiums();

    if (wotcPacks.length === 0) {
      Logger.log("Warning: No official D&D compendiums found. Install official D&D content for this module to work.");
    } else {
      Logger.log(`Found ${wotcPacks.length} official D&D compendium(s)`);

      // Pre-cache the monster index (async, non-blocking)
      try {
        await CompendiumManager.loadMonsterIndex();
        Logger.log("Monster index pre-cached successfully");
      } catch (error) {
        Logger.error("Failed to pre-cache monster index", error);
        ui.notifications.warn(game.i18n.localize("NPC_REPLACER.ErrorIndexLoad"));
      }
    }
  }

  /**
   * Get debug API object for window.NPCTokenReplacer
   * Returns an object with all public API methods
   * @returns {Object} API object with module methods
   * @static
   * @example
   * window.NPCTokenReplacer = NPCTokenReplacerController.getDebugAPI();
   */
  static getDebugAPI() {
    return {
      replaceNPCTokens: () => NPCTokenReplacerController.replaceNPCTokens(),
      getMonsterManualPack: () => {
        // Legacy method - returns first enabled compendium pack
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

/**
 * Register module settings
 * Registers all world settings for the module during the init phase.
 * Must be called before game.ready since settings need to be available early.
 * @returns {void}
 */
function registerSettings() {
  // Token variation mode setting
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

  // Enabled compendiums setting (stored as JSON string for reliability)
  game.settings.register(MODULE_ID, "enabledCompendiums", {
    name: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Hint"),
    scope: "world",
    config: false, // We'll use a custom form for this
    type: String,
    default: JSON.stringify(["default"])
  });

  // HTTP timeout setting for wildcard HEAD requests
  game.settings.register(MODULE_ID, "httpTimeout", {
    name: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 5
  });

  // Register the settings menu for compendium selection
  game.settings.registerMenu(MODULE_ID, "compendiumSelector", {
    name: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Name"),
    label: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Label"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Hint"),
    icon: "fas fa-book",
    type: CompendiumSelectorForm,
    restricted: true
  });
}

/**
 * Custom FormApplication for selecting which compendiums to use for token replacement
 * Extends Foundry's FormApplication to provide a settings menu UI
 * Allows users to select between default (Core + Fallback), all, or custom compendium selection
 * @class
 * @extends FormApplication
 */
class CompendiumSelectorForm extends FormApplication {
  /**
   * Get the default options for the form application
   * Configures the form ID, title, template, dimensions, and behavior
   * @returns {Object} Default options merged with parent class defaults
   * @static
   * @override
   */
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

  /**
   * Prepare data for the form template
   * Retrieves all available WOTC compendiums and current selection state
   * @returns {Object} Data object containing mode and compendiums array for template rendering
   * @property {string} mode - Current selection mode: 'default', 'all', or 'custom'
   * @property {Array<Object>} compendiums - Array of compendium objects with selection state
   * @override
   */
  getData() {
    const allPacks = CompendiumManager.detectWOTCCompendiums();

    // Parse the JSON setting
    let enabledPackIds;
    try {
      const settingValue = game.settings.get(MODULE_ID, "enabledCompendiums");
      enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
    } catch (e) {
      Logger.warn(`Error parsing enabledCompendiums in form (${e.name}: ${e.message}), displaying default selection`);
      enabledPackIds = ["default"];
    }

    // Determine current mode
    let mode = "custom";
    if (!enabledPackIds || !Array.isArray(enabledPackIds) || enabledPackIds.length === 0 || enabledPackIds.includes("default")) {
      mode = "default";
    } else if (enabledPackIds.includes("all")) {
      mode = "all";
    }

    Logger.log("CompendiumSelectorForm getData:", { enabledPackIds, mode });

    // Build Set for O(1) lookup in custom mode
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

  /**
   * Activate event listeners for the form
   * Handles mode radio changes to enable/disable the compendium list
   * @param {jQuery} html - The rendered HTML content
   * @override
   */
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
    // Set initial state based on currently selected radio
    const selectedMode = html.find('input[name="mode"]:checked').val();
    if (selectedMode && selectedMode !== 'custom') {
      list.addClass('disabled');
    }
  }

  /**
   * Process form submission and save the compendium selection
   * Converts form data to the appropriate setting format and clears caches
   * @param {Event} event - The form submission event
   * @param {Object} formData - The form data object containing mode and compendium selections
   * @returns {Promise<void>}
   * @override
   * @async
   */
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
      // Collect all checked compendiums using index — extract number via substring not replace+parseInt
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

    // Save as JSON string
    const jsonValue = JSON.stringify(enabledArray);
    Logger.log("Saving enabledCompendiums:", jsonValue);

    try {
      await game.settings.set(MODULE_ID, "enabledCompendiums", jsonValue);

      // Clear all caches to reload with new settings
      NPCTokenReplacerController.clearCache();

      ui.notifications.info(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Saved"));
    } catch (e) {
      Logger.error(`Failed to save compendium settings (${e.name}: ${e.message})`);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.SaveError"));
    }
  }
}

/**
 * Escape HTML special characters to prevent XSS
 * Utility function used in confirmation dialogs to safely display token names
 * @param {string} str - The string to escape
 * @returns {string} Escaped string safe for HTML insertion
 * @example
 * escapeHtml('<script>alert("XSS")</script>');
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
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
 * Register the control button in the token controls
 * Handles both Foundry v12 (array structure) and v13+ (object structure) control formats
 * @param {Object|Array} controls - The scene controls object/array from Foundry
 * @returns {void}
 */
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

  // Foundry v13+ uses object structure
  if (controls.tokens && typeof controls.tokens === "object" && !Array.isArray(controls.tokens)) {
    if (!controls.tokens.tools) {
      Logger.error("Token controls found but 'tools' property is missing — toolbar button not registered");
      return;
    }
    controls.tokens.tools.npcReplacer = toolConfig;
  } else if (Array.isArray(controls)) {
    // Foundry v12 and earlier uses array structure
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

/**
 * Module initialization hook (init phase)
 * Settings must be registered during init, before game.ready
 * Note: OOP classes are available but Foundry APIs (game.packs, etc.) are not yet ready
 */
Hooks.once("init", () => {
  Logger.log("Initializing NPC Token Replacer");
  registerSettings();
});

/**
 * Module ready hook (ready phase)
 * Initialize OOP class instances and wire dependencies
 * All Foundry APIs are now available (game.packs, game.actors, etc.)
 *
 * Initialization flow:
 * 1. NPCTokenReplacerController.initialize() - detects compendiums, pre-caches monster index
 * 2. window.NPCTokenReplacer - exposes debug API using OOP class methods
 *
 * Classes initialized:
 * - CompendiumManager: Detects WOTC compendiums and manages the monster index
 * - TokenReplacer: Handles token replacement operations
 * - NameMatcher: Provides name matching logic
 * - FolderManager: Manages import folders
 * - WildcardResolver: Resolves wildcard token paths
 * - NPCTokenReplacerController: Main facade coordinating all operations
 */
Hooks.once("ready", async () => {
  try {
    await NPCTokenReplacerController.initialize();
  } catch (error) {
    Logger.error("Failed to initialize NPC Token Replacer", error);
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorInitFailed"));
  }

  /**
   * Global debug API for console access
   * Exposes OOP class methods through the NPCTokenReplacerController facade
   *
   * Available methods:
   * - NPCTokenReplacer.replaceNPCTokens() - Run token replacement
   * - NPCTokenReplacer.detectWOTCCompendiums() - List detected compendiums
   * - NPCTokenReplacer.getEnabledCompendiums() - List enabled compendiums
   * - NPCTokenReplacer.clearCache() - Force index reload
   * - NPCTokenReplacer.getNPCTokensFromScene() - Get NPC tokens in current scene
   * - NPCTokenReplacer.findInMonsterManual(name, index) - Find creature in index
   * - NPCTokenReplacer.getOrCreateImportFolder() - Get/create import folder
   * - NPCTokenReplacer.getMonsterManualPack() - Get first enabled compendium (legacy)
   */
  window.NPCTokenReplacer = NPCTokenReplacerController.getDebugAPI();
});

/**
 * Register control button hook
 */
Hooks.on("getSceneControlButtons", registerControlButton);

// Named exports for testing — classes remain in main.js due to Foundry global dependencies
export { FolderManager, CompendiumManager, TokenReplacer, NPCTokenReplacerController, TokenReplacerError, registerControlButton };

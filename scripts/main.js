/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official D&D compendium versions
 */

/**
 * The unique identifier for this module
 * Used for settings registration, hook identification, and logging
 * @type {string}
 * @constant
 */
const MODULE_ID = "npc-token-replacer";

// Configuration constants that can be adjusted for different environments
/**
 * Default timeout for HTTP requests in milliseconds
 * Increase this value for slow network connections
 * @type {number}
 */
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

// Note: WOTC_MODULE_PREFIXES and COMPENDIUM_PRIORITIES are defined as
// static getters in CompendiumManager class for better encapsulation

// Note: All caches are now managed by their respective classes:
// - CompendiumManager.#indexCache (monster index)
// - CompendiumManager.#wotcCompendiumsCache (detected compendiums)
// - FolderManager.#importFolderCache (import folder)
// - NPCTokenReplacerController.#isProcessing (execution lock)
// - TokenReplacer.#sequentialCounter (variant counter)

/**
 * Logger utility class for consistent logging with module prefix
 * Provides centralized logging functionality with automatic module ID prefixing
 * @class
 */
class Logger {
  /**
   * The module ID used as prefix for all log messages
   * @type {string}
   * @static
   * @readonly
   */
  static get MODULE_PREFIX() {
    return MODULE_ID;
  }

  /**
   * Log an informational message with the module prefix
   * @param {string} message - The message to log
   * @param {any} [data=null] - Optional data to log alongside the message
   * @returns {void}
   * @static
   * @example
   * Logger.log("Module initialized");
   * Logger.log("Found creatures", { count: 5, names: ["Goblin", "Orc"] });
   */
  static log(message, data = null) {
    if (data !== null && data !== undefined) {
      console.log(`${Logger.MODULE_PREFIX} | ${message}`, data);
    } else {
      console.log(`${Logger.MODULE_PREFIX} | ${message}`);
    }
  }

  /**
   * Log an error message with the module prefix
   * @param {string} message - The error message describing what went wrong
   * @param {Error|any} [error=null] - The error object or additional error context
   * @returns {void}
   * @static
   * @example
   * Logger.error("Failed to load compendium", new Error("Network timeout"));
   * Logger.error("Invalid token data", { tokenId: "abc123", reason: "missing actor" });
   */
  static error(message, error = null) {
    if (error !== null && error !== undefined) {
      console.error(`${Logger.MODULE_PREFIX} | ${message}`, error);
    } else {
      console.error(`${Logger.MODULE_PREFIX} | ${message}`);
    }
  }

  /**
   * Log a warning message with the module prefix
   * @param {string} message - The warning message
   * @param {any} [data=null] - Optional data to log alongside the warning
   * @returns {void}
   * @static
   * @example
   * Logger.warn("Deprecated function called", { function: "getMonsterManualPack" });
   */
  static warn(message, data = null) {
    if (data !== null && data !== undefined) {
      console.warn(`${Logger.MODULE_PREFIX} | ${message}`, data);
    } else {
      console.warn(`${Logger.MODULE_PREFIX} | ${message}`);
    }
  }

  /**
   * Log a debug message with the module prefix (only in development)
   * @param {string} message - The debug message
   * @param {any} [data=null] - Optional data to log alongside the debug message
   * @returns {void}
   * @static
   * @example
   * Logger.debug("Processing token", { name: "Goblin", id: "token123" });
   */
  static debug(message, data = null) {
    // Debug messages could be conditionally enabled via a setting
    if (data !== null && data !== undefined) {
      console.debug(`${Logger.MODULE_PREFIX} | ${message}`, data);
    } else {
      console.debug(`${Logger.MODULE_PREFIX} | ${message}`);
    }
  }
}

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
  static get MONSTER_FOLDER_PATTERNS() {
    return [
      { pattern: /monster/i, name: "monster" },
      { pattern: /creature/i, name: "creature" },
      { pattern: /npc/i, name: "npc" },
      { pattern: /bestiary/i, name: "bestiary" },
      { pattern: /enemy/i, name: "enemy" },
      { pattern: /enemies/i, name: "enemies" }
    ];
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
    const parts = [folder.name];
    let parent = folder.folder;
    while (parent) {
      parts.unshift(parent.name);
      parent = parent.folder;
    }
    return "/" + parts.join("/");
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

    // Get all Actor folders for logging
    const actorFolders = game.folders.filter(f => f.type === "Actor");
    Logger.log(`Found ${actorFolders.length} Actor folders in world`);

    // Log all existing folders
    if (actorFolders.length > 0) {
      Logger.log("Existing Actor folders:");
      actorFolders.forEach(f => {
        const path = FolderManager.getFolderPath(f);
        Logger.log(`  - ${path} (id: ${f.id})`);
      });
    }

    // Check if our folder already exists
    Logger.log(`Searching for existing "${FolderManager.FOLDER_NAME}" folder...`);
    let folder = game.folders.find(f =>
      f.type === "Actor" &&
      f.name === FolderManager.FOLDER_NAME
    );

    if (folder) {
      Logger.log(`Found existing folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    }
    Logger.log(`Folder "${FolderManager.FOLDER_NAME}" not found`);

    // Look for existing monster-related folders to use as parent
    Logger.log("Searching for monster-related parent folder...");
    let parentFolder = null;
    for (const { pattern, name } of FolderManager.MONSTER_FOLDER_PATTERNS) {
      Logger.log(`  Checking pattern: "${name}"...`);
      const matchingFolders = game.folders.filter(f =>
        f.type === "Actor" &&
        pattern.test(f.name)
      );

      if (matchingFolders.length > 0) {
        Logger.log(`    Found ${matchingFolders.length} matching folder(s):`);
        matchingFolders.forEach(f => {
          Logger.log(`      - ${FolderManager.getFolderPath(f)}${f.folder ? "" : " (top-level)"}`);
        });

        // Prefer top-level folders
        parentFolder = matchingFolders.find(f => !f.folder);
        if (parentFolder) {
          Logger.log(`  Selected top-level folder: ${FolderManager.getFolderPath(parentFolder)}`);
          break;
        }
      } else {
        Logger.log(`    No folders matching "${name}"`);
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

    // Check if this combined name already exists
    Logger.log(`Checking if "${folderName}" already exists...`);
    folder = game.folders.find(f =>
      f.type === "Actor" &&
      f.name === folderName
    );

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
 * WildcardResolver utility class for resolving wildcard token texture paths
 * Handles the Monster Manual 2024 wildcard patterns like "specter-*.webp"
 * Provides variant discovery and selection based on user preferences
 * @class
 */
class WildcardResolver {
  /**
   * Cache for resolved variant paths to avoid repeated HEAD requests
   * Maps original wildcard paths to arrays of resolved paths
   * @type {Map<string, string[]>}
   * @static
   * @private
   */
  static #variantCache = new Map();

  /**
   * Default timeout for HEAD requests in milliseconds
   * Uses module-level DEFAULT_HTTP_TIMEOUT_MS constant which can be adjusted
   * for slow network connections
   * @type {number}
   * @static
   * @readonly
   */
  static get DEFAULT_TIMEOUT() {
    return DEFAULT_HTTP_TIMEOUT_MS;
  }

  /**
   * Common file extensions for token images
   * @type {string[]}
   * @static
   * @readonly
   */
  static get IMAGE_EXTENSIONS() {
    return [".webp", ".png", ".jpg"];
  }

  /**
   * Common variant suffixes to probe for wildcard resolution
   * Includes numbered (1-5, 01-05) and lettered (a-e) variants
   * @type {string[]}
   * @static
   * @readonly
   */
  static get VARIANT_SUFFIXES() {
    return ["1", "2", "3", "4", "5", "01", "02", "03", "04", "05", "a", "b", "c", "d", "e", ""];
  }

  /**
   * Perform a fetch with timeout support
   * @param {string} url - The URL to fetch
   * @param {Object} [options={}] - Fetch options
   * @param {number} [timeout=3000] - Timeout in milliseconds
   * @returns {Promise<Response>} The fetch response
   * @throws {Error} If the request times out or fails
   * @static
   * @example
   * const response = await WildcardResolver.fetchWithTimeout('/path/to/file.webp', { method: 'HEAD' }, 5000);
   */
  static async fetchWithTimeout(url, options = {}, timeout = WildcardResolver.DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if a path contains a wildcard pattern
   * @param {string} path - The path to check
   * @returns {boolean} True if the path contains a wildcard
   * @static
   * @example
   * WildcardResolver.isWildcardPath('tokens/specter-*.webp'); // returns true
   * WildcardResolver.isWildcardPath('tokens/specter-1.webp'); // returns false
   */
  static isWildcardPath(path) {
    return path && typeof path === "string" && path.includes("*");
  }

  /**
   * Resolve all available variants for a wildcard path
   * Probes the server for existing files matching the pattern
   * Results are cached to avoid repeated requests
   * @param {string} wildcardPath - The path with wildcard (e.g., "tokens/specter-*.webp")
   * @returns {Promise<string[]>} Array of resolved paths that exist on the server
   * @static
   * @example
   * const variants = await WildcardResolver.resolveWildcardVariants('tokens/specter-*.webp');
   * // Returns: ['tokens/specter-1.webp', 'tokens/specter-2.webp', ...]
   */
  static async resolveWildcardVariants(wildcardPath) {
    // Return cached results if available
    if (WildcardResolver.#variantCache.has(wildcardPath)) {
      const cached = WildcardResolver.#variantCache.get(wildcardPath);
      Logger.debug(`Using cached variants for ${wildcardPath}: ${cached.length} found`);
      return cached;
    }

    const availableVariants = [];

    try {
      // Extract the directory and pattern
      const lastSlash = wildcardPath.lastIndexOf("/");
      const directory = wildcardPath.substring(0, lastSlash);
      const filePattern = wildcardPath.substring(lastSlash + 1);
      const baseName = filePattern
        .replace("*", "")
        .replace(".webp", "")
        .replace(".png", "")
        .replace(".jpg", "");

      // Try common numbered and lettered variants
      for (const variant of WildcardResolver.VARIANT_SUFFIXES) {
        for (const ext of WildcardResolver.IMAGE_EXTENSIONS) {
          const testPath = `${directory}/${baseName}${variant}${ext}`;
          try {
            const response = await WildcardResolver.fetchWithTimeout(
              testPath,
              { method: "HEAD" },
              WildcardResolver.DEFAULT_TIMEOUT
            );
            if (response.ok) {
              availableVariants.push(testPath);
            }
          } catch {
            // File doesn't exist or request failed, try next
          }
        }
      }

      Logger.debug(`Found ${availableVariants.length} variants for ${wildcardPath}`);
    } catch (e) {
      Logger.error("Error resolving wildcard variants", e);
    }

    // Cache the results
    WildcardResolver.#variantCache.set(wildcardPath, availableVariants);
    return availableVariants;
  }

  /**
   * Select a variant based on the specified mode
   * @param {string[]} variants - Array of available variant paths
   * @param {string} mode - Selection mode: 'none', 'sequential', or 'random'
   * @param {number} [sequentialIndex=0] - Current index for sequential mode
   * @returns {{path: string|null, nextIndex: number}} Selected path and next sequential index
   * @static
   * @example
   * const variants = ['token-1.webp', 'token-2.webp', 'token-3.webp'];
   *
   * // None mode - always first
   * WildcardResolver.selectVariant(variants, 'none'); // {path: 'token-1.webp', nextIndex: 0}
   *
   * // Sequential mode
   * WildcardResolver.selectVariant(variants, 'sequential', 0); // {path: 'token-1.webp', nextIndex: 1}
   * WildcardResolver.selectVariant(variants, 'sequential', 1); // {path: 'token-2.webp', nextIndex: 2}
   *
   * // Random mode
   * WildcardResolver.selectVariant(variants, 'random'); // {path: <random>, nextIndex: 0}
   */
  static selectVariant(variants, mode, sequentialIndex = 0) {
    if (!variants || variants.length === 0) {
      return { path: null, nextIndex: sequentialIndex };
    }

    switch (mode) {
      case "none":
        // Always use the first variant
        Logger.debug(`Using first variant (none mode): ${variants[0]}`);
        return { path: variants[0], nextIndex: 0 };

      case "random":
        // Pick a random variant
        const randomIndex = Math.floor(Math.random() * variants.length);
        Logger.debug(`Using random variant (${randomIndex + 1}/${variants.length}): ${variants[randomIndex]}`);
        return { path: variants[randomIndex], nextIndex: 0 };

      case "sequential":
      default:
        // Use variants in sequence
        const seqIndex = sequentialIndex % variants.length;
        Logger.debug(`Using sequential variant (${seqIndex + 1}/${variants.length}): ${variants[seqIndex]}`);
        return { path: variants[seqIndex], nextIndex: sequentialIndex + 1 };
    }
  }

  /**
   * Resolve a wildcard path to a specific file path
   * Combines variant resolution and selection based on settings
   * @param {string} wildcardPath - The path with wildcard pattern
   * @param {string} mode - Selection mode: 'none', 'sequential', or 'random'
   * @param {number} [sequentialIndex=0] - Current index for sequential mode
   * @param {string|null} [fallbackPath=null] - Fallback path if no variants found
   * @returns {Promise<{resolvedPath: string, nextIndex: number}>} Resolved path and next index
   * @static
   * @example
   * const result = await WildcardResolver.resolve(
   *   'tokens/specter-*.webp',
   *   'sequential',
   *   0,
   *   'portraits/specter.webp'
   * );
   * // Returns: {resolvedPath: 'tokens/specter-1.webp', nextIndex: 1}
   */
  static async resolve(wildcardPath, mode, sequentialIndex = 0, fallbackPath = null) {
    // Find available variants
    const variants = await WildcardResolver.resolveWildcardVariants(wildcardPath);

    Logger.log(`Found ${variants.length} token variants`);

    if (variants.length > 0) {
      const selection = WildcardResolver.selectVariant(variants, mode, sequentialIndex);
      return {
        resolvedPath: selection.path,
        nextIndex: selection.nextIndex
      };
    }

    // No variants found, use fallback
    if (fallbackPath && !WildcardResolver.isWildcardPath(fallbackPath)) {
      Logger.log(`Using fallback path: ${fallbackPath}`);
      return {
        resolvedPath: fallbackPath,
        nextIndex: sequentialIndex
      };
    }

    // Last resort: use mystery man token
    Logger.log(`Using default mystery-man token as last resort`);
    return {
      resolvedPath: "icons/svg/mystery-man.svg",
      nextIndex: sequentialIndex
    };
  }

  /**
   * Clear the variant cache
   * Call this when settings change or to force re-probing of paths
   * @returns {void}
   * @static
   * @example
   * // After settings update or manual cache clear
   * WildcardResolver.clearCache();
   */
  static clearCache() {
    WildcardResolver.#variantCache.clear();
    Logger.debug("WildcardResolver cache cleared");
  }

  /**
   * Get the current cache size for debugging
   * @returns {number} Number of cached wildcard paths
   * @static
   */
  static getCacheSize() {
    return WildcardResolver.#variantCache.size;
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
   * Cache for detected WOTC compendiums
   * @type {CompendiumCollection[]|null}
   * @static
   * @private
   */
  static #wotcCompendiumsCache = null;

  /**
   * Known official WOTC module prefixes for auto-detection
   * @type {string[]}
   * @static
   * @readonly
   */
  static get WOTC_MODULE_PREFIXES() {
    return ["dnd-", "dnd5e"];
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
  static get COMPENDIUM_PRIORITIES() {
    return {
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
      "dnd-heroes-borderlands": 4,
    };
  }

  /**
   * Priority level labels for display
   * @type {Object<number, string>}
   * @static
   * @readonly
   */
  static get PRIORITY_LABELS() {
    return {
      1: "FALLBACK",
      2: "CORE",
      3: "EXPANSION",
      4: "ADVENTURE"
    };
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

    CompendiumManager.#wotcCompendiumsCache = wotcPacks;
    return wotcPacks;
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
    const allPacks = CompendiumManager.detectWOTCCompendiums();

    // Get the setting (stored as JSON string)
    let enabledPackIds;
    try {
      const settingValue = game.settings.get(MODULE_ID, "enabledCompendiums");
      enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
    } catch (e) {
      // Preserve full error context for debugging - could be JSON parse error or settings retrieval error
      Logger.warn(`Error parsing enabledCompendiums setting (${e.name}: ${e.message}), falling back to default`, {
        error: e,
        errorType: e.name,
        errorMessage: e.message,
        stack: e.stack
      });
      enabledPackIds = ["default"];
    }

    // If no specific selection or empty, use default (Core + Fallback only)
    if (!enabledPackIds || !Array.isArray(enabledPackIds) || enabledPackIds.length === 0) {
      enabledPackIds = ["default"];
    }

    // "all" - use all available compendiums
    if (enabledPackIds.includes("all")) {
      Logger.log("Using all available compendiums");
      return allPacks;
    }

    // "default" - only FALLBACK (priority 1) and CORE (priority 2) compendiums
    if (enabledPackIds.includes("default")) {
      const filtered = allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= 2);
      Logger.log(`Using default compendiums (Core + Fallback): ${filtered.map(p => p.metadata.label).join(", ")}`);
      return filtered;
    }

    // Otherwise filter by specific compendium IDs
    const filtered = allPacks.filter(pack => enabledPackIds.includes(pack.collection));
    Logger.log(`Enabled compendiums: ${filtered.map(p => p.metadata.label).join(", ")}`);
    return filtered;
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

    const enabledPacks = CompendiumManager.getEnabledCompendiums();

    if (enabledPacks.length === 0) {
      Logger.log("No enabled compendiums found");
      return [];
    }

    Logger.log(`Loading monster index from ${enabledPacks.length} compendium(s)...`);

    const combinedIndex = [];

    // Sort packs by priority for logging (highest first)
    const sortedPacks = [...enabledPacks].sort((a, b) =>
      CompendiumManager.getCompendiumPriority(b) - CompendiumManager.getCompendiumPriority(a)
    );

    for (const pack of sortedPacks) {
      try {
        await pack.getIndex({ fields: ["name", "type"] });
        const priority = CompendiumManager.getCompendiumPriority(pack);
        const priorityLabel = CompendiumManager.PRIORITY_LABELS[priority] || "UNKNOWN";
        const packEntries = pack.index.contents.map(entry => ({
          entry: entry,
          pack: pack
        }));
        combinedIndex.push(...packEntries);
        Logger.log(`  [${priority}-${priorityLabel}] Loaded ${pack.index.size} entries from ${pack.metadata.label}`);
      } catch (error) {
        Logger.error(`Failed to load index from ${pack.collection}`, error);
      }
    }

    Logger.log(`Total: ${combinedIndex.length} entries from all compendiums`);
    Logger.log("Priority order: Adventures (4) > Expansions (3) > Core Rulebooks (2) > SRD (1)");
    CompendiumManager.#indexCache = combinedIndex;

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
    CompendiumManager.#wotcCompendiumsCache = null;
    Logger.debug("CompendiumManager caches cleared");
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

/**
 * NameMatcher utility class for creature name normalization and matching
 * Provides static methods for matching token names to compendium entries
 * @class
 */
class NameMatcher {
  /**
   * Minimum character length for partial matching to avoid false positives
   * @type {number}
   * @static
   * @readonly
   */
  static get MIN_PARTIAL_LENGTH() {
    return 4;
  }

  /**
   * Regular expression patterns for common creature name prefixes to strip
   * Prefixes like "young", "adult", "ancient", "elder", "greater", "lesser"
   * @type {RegExp}
   * @static
   * @readonly
   */
  static get PREFIX_PATTERN() {
    return /^(young|adult|ancient|elder|greater|lesser)\s+/i;
  }

  /**
   * Regular expression patterns for common creature name suffixes to strip
   * Suffixes like "warrior", "guard", "scout", "champion", "leader", "chief", "captain", "shaman", "berserker"
   * @type {RegExp}
   * @static
   * @readonly
   */
  static get SUFFIX_PATTERN() {
    return /\s+(warrior|guard|scout|champion|leader|chief|captain|shaman|berserker)$/i;
  }

  /**
   * Normalize a creature name for matching
   * Converts to lowercase, trims whitespace, removes special characters,
   * and normalizes internal whitespace
   * @param {string} name - The creature name to normalize
   * @returns {string} Normalized name suitable for comparison
   * @static
   * @example
   * NameMatcher.normalizeName('Goblin Warrior'); // returns 'goblin warrior'
   * NameMatcher.normalizeName('  Dire Wolf  ');  // returns 'dire wolf'
   * NameMatcher.normalizeName("Mind Flayer's Minion"); // returns 'mind flayers minion'
   */
  static normalizeName(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "") // Remove special characters
      .replace(/\s+/g, " ");   // Normalize whitespace
  }

  /**
   * Select the best match from a list of matches based on compendium priority
   * When multiple compendiums contain the same creature, this selects the one
   * from the highest priority compendium (adventures > expansions > core > SRD)
   * @param {Array<{entry: Object, pack: CompendiumCollection}>} matches - Array of match objects
   * @returns {{entry: Object, pack: CompendiumCollection}|null} The best match or null if empty
   * @static
   * @example
   * const matches = [
   *   { entry: goblinSRD, pack: srdPack },
   *   { entry: goblinMM, pack: monsterManualPack }
   * ];
   * const best = NameMatcher.selectBestMatch(matches);
   * // Returns the Monster Manual version (higher priority)
   */
  static selectBestMatch(matches) {
    if (!matches || matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Log all matches before sorting for debugging
    Logger.log(`  Found ${matches.length} matches across compendiums:`);
    matches.forEach(m => {
      const pkgName = m.pack.metadata.packageName || "unknown";
      const priority = CompendiumManager.getCompendiumPriority(m.pack);
      Logger.log(`    - ${m.entry.name} from "${m.pack.metadata.label}" (package: ${pkgName}, priority: ${priority})`);
    });

    // Sort by priority (highest first) and return the best
    matches.sort((a, b) => CompendiumManager.getCompendiumPriority(b.pack) - CompendiumManager.getCompendiumPriority(a.pack));

    const best = matches[0];
    Logger.log(`  Selected: ${best.pack.metadata.label} (priority ${CompendiumManager.getCompendiumPriority(best.pack)})`);

    return best;
  }

  /**
   * Find a creature in the combined compendium index
   * Uses a multi-stage matching strategy:
   * 1. Exact match (after normalization)
   * 2. Variant match (strips common prefixes/suffixes)
   * 3. Partial match (word-level matching for longer names)
   *
   * Prioritizes matches from adventures/expansions > Monster Manual > SRD
   * @param {string} creatureName - The creature name to search for
   * @param {Array<{entry: Object, pack: CompendiumCollection}>} index - Array of index entries from loadMonsterIndex()
   * @returns {{entry: Object, pack: CompendiumCollection}|null} Object with entry and pack, or null if not found
   * @static
   * @example
   * const match = NameMatcher.findMatch('Goblin', monsterIndex);
   * if (match) {
   *   console.log(`Found: ${match.entry.name} in ${match.pack.metadata.label}`);
   * }
   */
  static findMatch(creatureName, index) {
    const normalizedSearch = NameMatcher.normalizeName(creatureName);

    if (!normalizedSearch) {
      Logger.log(`Empty creature name provided`);
      return null;
    }

    // Stage 1: Exact match - find ALL exact matches and select best by priority
    let matches = index.filter(item => NameMatcher.normalizeName(item.entry.name) === normalizedSearch);
    if (matches.length > 0) {
      const match = NameMatcher.selectBestMatch(matches);
      Logger.log(`Exact match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${CompendiumManager.getCompendiumPriority(match.pack)})`);
      return match;
    }

    // Stage 2: Variant transforms - try without common suffixes/prefixes
    // Only check variants that differ from original
    const variantTransforms = [
      name => name.replace(NameMatcher.PREFIX_PATTERN, ""),
      name => name.replace(NameMatcher.SUFFIX_PATTERN, ""),
      name => name.replace(NameMatcher.PREFIX_PATTERN, "").replace(NameMatcher.SUFFIX_PATTERN, ""),
    ];

    for (const transform of variantTransforms) {
      const variant = transform(normalizedSearch);
      // Only check if variant is different from original
      if (variant !== normalizedSearch && variant.length > 0) {
        matches = index.filter(item => NameMatcher.normalizeName(item.entry.name) === variant);
        if (matches.length > 0) {
          const match = NameMatcher.selectBestMatch(matches);
          Logger.log(`Variant match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${CompendiumManager.getCompendiumPriority(match.pack)})`);
          return match;
        }
      }
    }

    // Stage 3: Partial match - word-level matching for longer names
    // Only for names with MIN_PARTIAL_LENGTH+ characters to avoid false positives
    // Requires word boundary matching to prevent "Rat" matching "Pirate"
    if (normalizedSearch.length >= NameMatcher.MIN_PARTIAL_LENGTH) {
      matches = index.filter(item => {
        const entryName = NameMatcher.normalizeName(item.entry.name);
        if (entryName.length < NameMatcher.MIN_PARTIAL_LENGTH) return false;

        // Check if one name starts with the other (word boundary)
        const searchWords = normalizedSearch.split(" ");
        const entryWords = entryName.split(" ");

        // Check if the main creature type matches (usually first or last word)
        return searchWords.some(sw => entryWords.includes(sw) && sw.length >= NameMatcher.MIN_PARTIAL_LENGTH) ||
               entryWords.some(ew => searchWords.includes(ew) && ew.length >= NameMatcher.MIN_PARTIAL_LENGTH);
      });

      if (matches.length > 0) {
        const match = NameMatcher.selectBestMatch(matches);
        Logger.log(`Partial match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${CompendiumManager.getCompendiumPriority(match.pack)})`);
        return match;
      }
    }

    Logger.log(`No match found for: "${creatureName}"`);
    return null;
  }
}

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
   * Properties to preserve when replacing a token
   * These are the token properties that get transferred from old to new token
   * @type {string[]}
   * @static
   * @readonly
   */
  static get PRESERVED_PROPERTIES() {
    return [
      "x", "y", "elevation", "width", "height",
      "hidden", "rotation", "disposition", "locked", "alpha"
    ];
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
   * Increment and get the next sequential counter value
   * Used internally for sequential variant selection
   * @returns {number} The counter value before incrementing
   * @static
   * @private
   */
  static #getNextSequentialIndex() {
    return TokenReplacer.#sequentialCounter++;
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
    return {
      x: tokenDoc.x,
      y: tokenDoc.y,
      elevation: tokenDoc.elevation,
      width: tokenDoc.width,
      height: tokenDoc.height,
      hidden: tokenDoc.hidden,
      rotation: tokenDoc.rotation,
      disposition: tokenDoc.disposition,
      locked: tokenDoc.locked,
      alpha: tokenDoc.alpha
    };
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

      // Selected tokens but none are NPCs - fall through to scene tokens
      Logger.log("Selected tokens contain no NPCs, using all scene NPCs");
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
    // Check if we already have this actor imported (by name and source)
    // This avoids creating duplicate actors in the world
    let worldActor = game.actors.find(a => {
      if (a.name !== compendiumActor.name) return false;

      // Check _stats.compendiumSource first (v12+ preferred method, avoids deprecation warning)
      const compendiumSource = a._stats?.compendiumSource;
      if (compendiumSource === compendiumActor.uuid) return true;

      // Fallback: check flags.core.sourceId for older imports (may trigger deprecation warning in v12+)
      // Only check if _stats.compendiumSource is not set
      if (!compendiumSource) {
        try {
          const sourceId = a.flags?.core?.sourceId;
          if (sourceId === compendiumActor.uuid) {
            Logger.debug(`Found actor via legacy flags.core.sourceId: ${a.name}`);
            return true;
          }
        } catch (e) {
          // Log error for debugging but continue checking other actors
          Logger.debug(`Error accessing flags.core.sourceId for actor "${a.name}": ${e.message}`);
        }
      }

      return false;
    });

    if (worldActor) {
      Logger.log(`Using existing imported actor "${worldActor.name}"`);
      return worldActor;
    }

    // Get or create the import folder
    const importFolder = await FolderManager.getOrCreateImportFolder();

    // Import the actor from compendium using the standard Foundry API
    // Pass the folder ID in the updateData parameter
    const updateData = importFolder ? { folder: importFolder.id } : {};
    worldActor = await game.actors.importFromCompendium(pack, compendiumEntry._id, updateData);

    if (!worldActor) {
      throw new Error(`Failed to import actor "${compendiumActor.name}" from compendium`);
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

    // Get the variation mode setting
    const variationMode = game.settings.get(MODULE_ID, "tokenVariationMode");
    Logger.log(`Token variation mode: ${variationMode}`);

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
    return {
      ...prototypeToken,
      x: originalProps.x,
      y: originalProps.y,
      elevation: originalProps.elevation,
      width: originalProps.width,
      height: originalProps.height,
      hidden: originalProps.hidden,
      rotation: originalProps.rotation,
      disposition: originalProps.disposition,
      locked: originalProps.locked,
      alpha: originalProps.alpha,
      actorId: worldActorId,
      actorLink: false
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
    const compendiumActor = await pack.getDocument(compendiumEntry._id);

    // Get or import the world actor
    const worldActor = await TokenReplacer.#getOrImportWorldActor(compendiumActor, compendiumEntry, pack);

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

    // Delete the old token
    await canvas.scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);

    // Create the new token
    const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [newTokenData]);
    const newToken = createdTokens[0];

    if (!newToken) {
      throw new Error(`Failed to create new token for "${compendiumEntry.name}"`);
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

  /**
   * Show a confirmation dialog before replacing tokens
   * Displays a scrollable list of tokens that will be replaced
   * @param {TokenDocument[]} tokens - The tokens to replace
   * @returns {Promise<boolean>} Whether user confirmed to proceed
   * @static
   * @example
   * const confirmed = await NPCTokenReplacerController.showConfirmationDialog(npcTokens);
   * if (!confirmed) {
   *   Logger.log("Replacement cancelled by user");
   *   return;
   * }
   */
  static async showConfirmationDialog(tokens) {
    const tokenList = tokens
      .map(t => `<li>${escapeHtml(t.actor?.name || t.name)}</li>`)
      .join("");

    const content = `
      <p>${game.i18n.format("NPC_REPLACER.ConfirmContent", { count: tokens.length })}</p>
      <ul style="max-height: 200px; overflow-y: auto; margin: 10px 0;">
        ${tokenList}
      </ul>
      <p><strong>${game.i18n.localize("NPC_REPLACER.ConfirmProceed")}</strong></p>
    `;

    return Dialog.confirm({
      title: game.i18n.localize("NPC_REPLACER.ConfirmTitle"),
      content: content,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
  }

  /**
   * Process a single token for replacement
   * Finds matching compendium entry and replaces the token if found
   * @param {TokenDocument} tokenDoc - The token document to process
   * @param {Array<{entry: Object, pack: CompendiumCollection}>} index - The monster index
   * @param {Set<string>} processedIds - Set of already processed token IDs
   * @returns {Promise<{status: 'replaced'|'not_found'|'error'|'skipped', name: string}>} Processing result
   * @static
   * @private
   */
  static async #processToken(tokenDoc, index, processedIds) {
    const creatureName = tokenDoc.actor?.name || tokenDoc.name;

    // Skip if already processed (handles duplicate entries)
    if (processedIds.has(tokenDoc.id)) {
      Logger.log(`Skipping already processed token: ${tokenDoc.name}`);
      return { status: "skipped", name: creatureName };
    }

    // Check if token still exists in scene BEFORE processing
    if (!canvas.scene.tokens.has(tokenDoc.id)) {
      Logger.log(`Token "${tokenDoc.name}" no longer exists, skipping`);
      return { status: "skipped", name: creatureName };
    }

    processedIds.add(tokenDoc.id);

    try {
      const match = NameMatcher.findMatch(creatureName, index);

      if (match) {
        // match is {entry, pack} - pass the entry and its source pack
        await TokenReplacer.replaceToken(tokenDoc, match.entry, match.pack);
        return { status: "replaced", name: creatureName };
      } else {
        return { status: "not_found", name: creatureName };
      }
    } catch (error) {
      Logger.error(`Error replacing token ${tokenDoc.name}`, error);
      return { status: "error", name: creatureName };
    }
  }

  /**
   * Report the results of a replacement session
   * Displays appropriate notifications and logs details
   * @param {number} replaced - Count of successfully replaced tokens
   * @param {string[]} notFound - Names of tokens not found in compendiums
   * @param {string[]} errors - Names of tokens that had errors during replacement
   * @returns {void}
   * @static
   * @private
   */
  static #reportResults(replaced, notFound, errors) {
    // Report results
    if (replaced > 0) {
      ui.notifications.info(game.i18n.format("NPC_REPLACER.Complete", { count: replaced }));
    }

    if (notFound.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.NotFoundCount", { count: notFound.length }));
      Logger.log("Creatures not found in Monster Manual:", notFound);
    }

    if (errors.length > 0) {
      ui.notifications.error(game.i18n.format("NPC_REPLACER.ErrorCount", { count: errors.length }));
      Logger.log("Errors occurred with tokens:", errors);
    }

    Logger.log(`Replacement complete: ${replaced} replaced, ${notFound.length} not found, ${errors.length} errors`);
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
    // Prevent double execution
    if (NPCTokenReplacerController.#isProcessing) {
      Logger.log("Already processing tokens, ignoring duplicate call");
      return;
    }

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
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
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

    // Show confirmation dialog
    const confirmed = await NPCTokenReplacerController.showConfirmationDialog(npcTokens);
    if (!confirmed) {
      Logger.log("Token replacement cancelled by user");
      return;
    }

    // Set processing lock AFTER confirmation (so user can cancel and retry)
    NPCTokenReplacerController.#isProcessing = true;

    // Reset sequential counter for this replacement session
    TokenReplacer.resetCounter();

    // Track results
    let replaced = 0;
    const notFound = [];
    const errors = [];
    const processedIds = new Set(); // Track processed token IDs to avoid duplicates

    // Show progress notification
    ui.notifications.info(game.i18n.format("NPC_REPLACER.Processing", { count: npcTokens.length }));

    try {
      // Process each token
      for (const tokenDoc of npcTokens) {
        const result = await NPCTokenReplacerController.#processToken(tokenDoc, index, processedIds);

        switch (result.status) {
          case "replaced":
            replaced++;
            break;
          case "not_found":
            notFound.push(result.name);
            break;
          case "error":
            errors.push(result.name);
            break;
          // 'skipped' - no action needed
        }
      }

      // Report results
      NPCTokenReplacerController.#reportResults(replaced, notFound, errors);
    } finally {
      // Always release the lock
      NPCTokenReplacerController.#isProcessing = false;
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
    Logger.log("All caches cleared");
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
      clearCache: () => NPCTokenReplacerController.clearCache()
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
      // Log error for debugging but use default - settings form should still display correctly
      Logger.debug(`Error parsing enabledCompendiums in form (${e.name}): ${e.message}`);
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

    return {
      mode: mode,
      compendiums: allPacks.map((pack, index) => {
        const priority = CompendiumManager.getCompendiumPriority(pack);
        return {
          index: index,
          id: pack.collection,
          name: pack.metadata.label,
          module: pack.metadata.packageName,
          priority: priority,
          priorityLabel: CompendiumManager.PRIORITY_LABELS[priority] || "UNKNOWN",
          enabled: mode === "all" || mode === "default" || enabledPackIds.includes(pack.collection),
          isCoreFallback: priority <= 2
        };
      })
    };
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
      // Collect all checked compendiums using index
      enabledArray = [];
      for (const [key, value] of Object.entries(formData)) {
        if (key.startsWith("compendium-") && value) {
          const index = parseInt(key.replace("compendium-", ""));
          if (!isNaN(index) && allPacks[index]) {
            enabledArray.push(allPacks[index].collection);
          }
        }
      }
    }

    // Save as JSON string
    const jsonValue = JSON.stringify(enabledArray);
    Logger.log("Saving enabledCompendiums:", jsonValue);
    await game.settings.set(MODULE_ID, "enabledCompendiums", jsonValue);

    // Clear all caches to reload with new settings
    // Uses NPCTokenReplacerController.clearCache() which handles all manager caches and legacy caches
    NPCTokenReplacerController.clearCache();

    ui.notifications.info(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Saved"));
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
function escapeHtml(str) {
  if (!str) return "";
  const htmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
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
    controls.tokens.tools.npcReplacer = toolConfig;
  } else if (Array.isArray(controls)) {
    // Foundry v12 and earlier uses array structure
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls && Array.isArray(tokenControls.tools)) {
      tokenControls.tools.push(toolConfig);
    }
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
Hooks.once("ready", () => {
  // Initialize the module using the controller's OOP initialize method
  // This detects available compendiums and pre-caches the monster index
  NPCTokenReplacerController.initialize();
});

/**
 * Register control button hook
 */
Hooks.on("getSceneControlButtons", registerControlButton);

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
 *
 * @global
 */
window.NPCTokenReplacer = NPCTokenReplacerController.getDebugAPI();

import { Logger, MODULE_ID } from "./logger.js";

/**
 * Default timeout for HTTP requests in milliseconds
 * Increase this value for slow network connections
 * @type {number}
 */
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

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
    try {
      const value = game.settings.get(MODULE_ID, "httpTimeout") * 1000;
      if (Number.isFinite(value) && value > 0) return value;
      Logger.warn(`Invalid httpTimeout setting value, using default ${DEFAULT_HTTP_TIMEOUT_MS}ms`);
      return DEFAULT_HTTP_TIMEOUT_MS;
    } catch (error) {
      Logger.debug(`httpTimeout setting not available: ${error.message}`);
      return DEFAULT_HTTP_TIMEOUT_MS;
    }
  }

  /**
   * Common file extensions for token images
   * @type {string[]}
   * @static
   * @readonly
   */
  static #IMAGE_EXTENSIONS = Object.freeze([".webp", ".png", ".jpg"]);
  static get IMAGE_EXTENSIONS() {
    return WildcardResolver.#IMAGE_EXTENSIONS;
  }

  /**
   * Common variant suffixes to probe for wildcard resolution
   * Includes numbered (1-5, 01-05) and lettered (a-e) variants
   * @type {string[]}
   * @static
   * @readonly
   */
  static #VARIANT_SUFFIXES = Object.freeze(["1", "2", "3", "4", "5", "01", "02", "03", "04", "05", "a", "b", "c", "d", "e"]);
  static get VARIANT_SUFFIXES() {
    return WildcardResolver.#VARIANT_SUFFIXES;
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
    // Reject absolute URLs with external protocols — only allow relative paths
    if (typeof url === "string" && /^(?:https?|file|data|ftp):/i.test(url)) {
      throw new Error(`Refusing to fetch external URL: ${url}`);
    }
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
      // Preserve the original extension to avoid cross-extension contamination
      const extMatch = filePattern.match(/\.(webp|png|jpe?g)$/i);
      const knownExt = extMatch ? extMatch[0] : null;
      const extsToProbe = knownExt ? [knownExt] : WildcardResolver.IMAGE_EXTENSIONS;

      const baseName = filePattern
        .replace("*", "")
        .replace(/\.(webp|png|jpe?g)$/i, "");

      // Build candidate list and probe all in parallel
      const candidates = [];
      for (const variant of WildcardResolver.VARIANT_SUFFIXES) {
        for (const ext of extsToProbe) {
          candidates.push(`${directory}/${baseName}${variant}${ext}`);
        }
      }

      const results = await Promise.allSettled(
        candidates.map(path =>
          WildcardResolver.fetchWithTimeout(path, { method: "HEAD" }, WildcardResolver.DEFAULT_TIMEOUT)
            .then(response => response.ok ? path : null)
        )
      );

      let networkErrors = 0;
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          availableVariants.push(result.value);
        } else if (result.status === "rejected") {
          networkErrors++;
        }
      }

      if (networkErrors > 0 && availableVariants.length === 0) {
        Logger.warn(`All ${networkErrors} wildcard probe requests failed for ${wildcardPath} — possible network or server configuration issue`);
      }

      Logger.debug(`Found ${availableVariants.length} variants for ${wildcardPath}`);
    } catch (e) {
      Logger.error("Error resolving wildcard variants", e);
      // Do NOT cache failed results — allow retry on subsequent calls
      return availableVariants;
    }

    // Cache only successful resolution results
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
    Logger.warn(`No wildcard variants found for "${wildcardPath}" — using placeholder token art`);
    ui.notifications.warn(game.i18n.localize("NPC_REPLACER.WarnWildcardFallback"));
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

export { WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS };

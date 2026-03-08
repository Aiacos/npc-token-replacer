import { Logger, MODULE_ID } from "./logger.js";

const DEFAULT_HTTP_TIMEOUT_MS = 5000;

/**
 * Resolves Monster Manual 2024 wildcard token paths (e.g. "specter-*.webp")
 * to actual files via HEAD probing, with variant selection modes.
 */
class WildcardResolver {
  static #variantCache = new Map();
  static #VARIANT_CACHE_MAX = 200;

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

  static #IMAGE_EXTENSIONS = Object.freeze([".webp", ".png", ".jpg"]);
  static get IMAGE_EXTENSIONS() { return WildcardResolver.#IMAGE_EXTENSIONS; }

  // TODO [LOW] Maintainability: VARIANT_SUFFIXES is a hardcoded probe list.
  // If WotC adds more variant patterns (e.g. 06-10, f-j), this silently misses them.
  // Consider a Foundry FilePicker.browse() approach if the API becomes available.
  static #VARIANT_SUFFIXES = Object.freeze(["1", "2", "3", "4", "5", "01", "02", "03", "04", "05", "a", "b", "c", "d", "e"]);
  static get VARIANT_SUFFIXES() { return WildcardResolver.#VARIANT_SUFFIXES; }

  /** Fetch with timeout and SSRF protection (rejects absolute URLs and path traversal). */
  static async fetchWithTimeout(url, options = {}, timeout = WildcardResolver.DEFAULT_TIMEOUT) {
    if (typeof url === "string") {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith("//")) {
        throw new Error(`Refusing to fetch external URL: ${url}`);
      }
      if (/(?:^|\/)\.\.(?:\/|$)/.test(url)) {
        throw new Error(`Refusing to fetch path with traversal segments: ${url}`);
      }
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

  static isWildcardPath(path) {
    return path && typeof path === "string" && path.includes("*");
  }

  /** Probe server for files matching wildcard pattern. Cached on success. */
  static async resolveWildcardVariants(wildcardPath) {
    if (WildcardResolver.#variantCache.has(wildcardPath)) {
      const cached = WildcardResolver.#variantCache.get(wildcardPath);
      Logger.debug(`Using cached variants for ${wildcardPath}: ${cached.length} found`);
      return cached;
    }

    const availableVariants = [];

    try {
      const lastSlash = wildcardPath.lastIndexOf("/");
      const directory = wildcardPath.substring(0, lastSlash);
      const filePattern = wildcardPath.substring(lastSlash + 1);
      const extMatch = filePattern.match(/\.(webp|png|jpe?g)$/i);
      const knownExt = extMatch ? extMatch[0] : null;
      const extsToProbe = knownExt ? [knownExt] : WildcardResolver.IMAGE_EXTENSIONS;

      const baseName = filePattern
        .replace("*", "")
        .replace(/\.(webp|png|jpe?g)$/i, "");

      const candidates = [];
      for (const variant of WildcardResolver.VARIANT_SUFFIXES) {
        for (const ext of extsToProbe) {
          candidates.push(`${directory}/${baseName}${variant}${ext}`);
        }
      }

      const timeout = WildcardResolver.DEFAULT_TIMEOUT;
      const results = await Promise.allSettled(
        candidates.map(path =>
          WildcardResolver.fetchWithTimeout(path, { method: "HEAD" }, timeout)
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
        Logger.warn(`All ${networkErrors} wildcard probe requests failed for ${wildcardPath} — skipping cache to allow retry`);
        return availableVariants;
      }

      Logger.debug(`Found ${availableVariants.length} variants for ${wildcardPath}`);
    } catch (e) {
      Logger.error("Error resolving wildcard variants", e);
      return availableVariants;
    }

    // Cache both populated and empty (404) results — network-error case already returned above
    if (WildcardResolver.#variantCache.size >= WildcardResolver.#VARIANT_CACHE_MAX) {
      const oldest = WildcardResolver.#variantCache.keys().next().value;
      WildcardResolver.#variantCache.delete(oldest);
    }
    WildcardResolver.#variantCache.set(wildcardPath, availableVariants);
    return availableVariants;
  }

  /** Pick a variant by mode: "none" (first), "sequential" (round-robin), "random". */
  static selectVariant(variants, mode, sequentialIndex = 0) {
    if (!variants || variants.length === 0) {
      return { path: null, nextIndex: sequentialIndex };
    }

    switch (mode) {
      case "none":
        Logger.debug(`Using first variant (none mode): ${variants[0]}`);
        return { path: variants[0], nextIndex: 0 };

      case "random": {
        const randomIndex = Math.floor(Math.random() * variants.length);
        Logger.debug(`Using random variant (${randomIndex + 1}/${variants.length}): ${variants[randomIndex]}`);
        return { path: variants[randomIndex], nextIndex: 0 };
      }

      case "sequential":
      default: {
        const seqIndex = sequentialIndex % variants.length;
        Logger.debug(`Using sequential variant (${seqIndex + 1}/${variants.length}): ${variants[seqIndex]}`);
        return { path: variants[seqIndex], nextIndex: sequentialIndex + 1 };
      }
    }
  }

  /** Resolve wildcard to a specific path: probe → select → fallback chain. */
  static async resolve(wildcardPath, mode, sequentialIndex = 0, fallbackPath = null) {
    const variants = await WildcardResolver.resolveWildcardVariants(wildcardPath);

    Logger.log(`Found ${variants.length} token variants`);

    if (variants.length > 0) {
      const selection = WildcardResolver.selectVariant(variants, mode, sequentialIndex);
      return {
        resolvedPath: selection.path,
        nextIndex: selection.nextIndex
      };
    }

    if (fallbackPath && !WildcardResolver.isWildcardPath(fallbackPath)) {
      Logger.log(`Using fallback path: ${fallbackPath}`);
      return {
        resolvedPath: fallbackPath,
        nextIndex: sequentialIndex
      };
    }

    // Last resort: use mystery man token (caller surfaces this to user via notification)
    Logger.warn(`No wildcard variants found for "${wildcardPath}" — using placeholder token art`);
    return {
      resolvedPath: "icons/svg/mystery-man.svg",
      nextIndex: sequentialIndex
    };
  }

  static clearCache() {
    WildcardResolver.#variantCache.clear();
    Logger.debug("WildcardResolver cache cleared");
  }

  static getCacheSize() {
    return WildcardResolver.#variantCache.size;
  }
}

export { WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS };

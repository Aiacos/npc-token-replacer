import { Logger } from "./logger.js";

// Late-bound dependency on CompendiumManager
// Set by main.js after both classes are loaded
let _CompendiumManager = null;

/**
 * NameMatcher utility class for creature name normalization and matching
 * Provides static methods for matching token names to compendium entries
 * @class
 */
class NameMatcher {
  /**
   * Set the CompendiumManager dependency for priority lookups.
   * Called from main.js after CompendiumManager is defined.
   * @param {object} cm - CompendiumManager class with getCompendiumPriority() and getIndexMap()
   */
  static setCompendiumManager(cm) {
    _CompendiumManager = cm;
  }

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
  static #PREFIX_PATTERN = /^(young|adult|ancient|elder|greater|lesser)\s+/i;
  static get PREFIX_PATTERN() {
    return NameMatcher.#PREFIX_PATTERN;
  }

  /**
   * Regular expression patterns for common creature name suffixes to strip
   * Suffixes like "warrior", "guard", "scout", "champion", "leader", "chief", "captain", "shaman", "berserker"
   * @type {RegExp}
   * @static
   * @readonly
   */
  static #SUFFIX_PATTERN = /\s+(warrior|guard|scout|champion|leader|chief|captain|shaman|berserker)$/i;
  static get SUFFIX_PATTERN() {
    return NameMatcher.#SUFFIX_PATTERN;
  }

  /**
   * Variant transforms for Stage 2 name matching
   * Strips common prefixes, suffixes, or both
   * @type {Array<function(string): string>}
   * @static
   * @readonly
   */
  static #VARIANT_TRANSFORMS = Object.freeze([
    name => name.replace(NameMatcher.#PREFIX_PATTERN, ""),
    name => name.replace(NameMatcher.#SUFFIX_PATTERN, ""),
    name => name.replace(NameMatcher.#PREFIX_PATTERN, "").replace(NameMatcher.#SUFFIX_PATTERN, "")
  ]);
  static get VARIANT_TRANSFORMS() {
    return NameMatcher.#VARIANT_TRANSFORMS;
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
      .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove non-letter/non-number chars (Unicode-safe)
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

    // Helper to get priority (use pre-computed field when available)
    const getPriority = m => m.priority ?? _CompendiumManager?.getCompendiumPriority(m.pack) ?? 1;

    // Log all matches for debugging (verbose — gated to avoid template literal cost in hot path)
    if (Logger.debugEnabled) {
      Logger.debug(`  Found ${matches.length} matches across compendiums:`);
      matches.forEach(m => {
        const pkgName = m.pack.metadata.packageName || "unknown";
        Logger.debug(`    - ${m.entry.name} from "${m.pack.metadata.label}" (package: ${pkgName}, priority: ${getPriority(m)})`);
      });
    }

    // O(n) max-scan — no mutation of input array
    // Tie-break by pack collection name for deterministic results
    const best = matches.reduce((a, b) => {
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pb !== pa) return pb > pa ? b : a;
      return a.pack.collection < b.pack.collection ? a : b;
    });
    Logger.debug(`  Selected: ${best.pack.metadata.label} (priority ${getPriority(best)})`);

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
      Logger.log("Empty creature name provided");
      return null;
    }

    // Stage 1: Exact match via O(1) Map lookup
    const indexMap = _CompendiumManager?.getIndexMap() ?? null;
    let matches = indexMap ? (indexMap.get(normalizedSearch) || []) :
      index.filter(item => (item.normalizedName || NameMatcher.normalizeName(item.entry.name)) === normalizedSearch);
    if (matches.length > 0) {
      const match = NameMatcher.selectBestMatch(matches);
      Logger.log(`Exact match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${match.priority ?? _CompendiumManager?.getCompendiumPriority(match.pack) ?? 1})`);
      return match;
    }

    // Stage 2: Variant transforms - try without common suffixes/prefixes
    for (const transform of NameMatcher.VARIANT_TRANSFORMS) {
      const variant = transform(normalizedSearch);
      // Only check if variant is different from original
      if (variant !== normalizedSearch && variant.length > 0) {
        matches = indexMap ? (indexMap.get(variant) || []) :
          index.filter(item => (item.normalizedName || NameMatcher.normalizeName(item.entry.name)) === variant);
        if (matches.length > 0) {
          const match = NameMatcher.selectBestMatch(matches);
          Logger.log(`Variant match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${match.priority ?? _CompendiumManager?.getCompendiumPriority(match.pack) ?? 1})`);
          return match;
        }
      }
    }

    // Stage 3: Partial match - require majority of significant words to overlap
    if (normalizedSearch.length >= NameMatcher.MIN_PARTIAL_LENGTH) {
      const searchWords = normalizedSearch.split(" ");
      const significantSearchWords = searchWords.filter(w => w.length >= NameMatcher.MIN_PARTIAL_LENGTH);

      if (significantSearchWords.length > 0) {
        const threshold = Math.max(1, Math.ceil(significantSearchWords.length * 2 / 3));
        // Build search word Set once — avoids per-entry Set allocation
        const searchWordSet = new Set(significantSearchWords);

        matches = index.filter(item => {
          // Use pre-computed significantWords from index build time
          const sigWords = item.significantWords;
          if (!sigWords || sigWords.length === 0) return false;

          let matchingCount = 0;
          for (const w of sigWords) {
            if (searchWordSet.has(w)) matchingCount++;
          }
          // Bidirectional check: search words must meet threshold AND
          // matched words must cover at least half of entry's significant words
          return matchingCount >= threshold
            && matchingCount / sigWords.length >= 0.5;
        });
      } else {
        matches = [];
      }

      if (matches.length > 0) {
        const match = NameMatcher.selectBestMatch(matches);
        Logger.log(`Partial match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${match.priority ?? _CompendiumManager?.getCompendiumPriority(match.pack) ?? 1})`);
        return match;
      }
    }

    Logger.log(`No match found for: "${creatureName}"`);
    return null;
  }
}

export { NameMatcher };

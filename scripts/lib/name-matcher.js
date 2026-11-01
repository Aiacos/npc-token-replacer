import { Logger } from "./logger.js";
import { SourceDetector } from "./source-detector.js";
import { normalizeName } from "./names.js";
import { LegacyNames } from "./legacy-names.js";

// Late-bound dependency — set by main.js after CompendiumManager is defined
let _CompendiumManager = null;

/** Creature name normalization and multi-stage matching against compendium entries. */
class NameMatcher {
  /** Set the CompendiumManager dependency for priority lookups. */
  static setCompendiumManager(cm) {
    _CompendiumManager = cm;
  }

  static get MIN_PARTIAL_LENGTH() { return 4; }

  /** Short words that never tell two creatures apart. */
  static #FILLER_WORDS = new Set(["a", "an", "and", "of", "the", "in", "on"]);

  /**
   * Words too short to count as significant (e.g. "rat", "hen", "elk") but
   * that still distinguish creatures. Numbering ("Goblin 2") and filler
   * words are excluded so they keep matching freely.
   */
  static #distinctiveShortWords(words) {
    return words.filter(w => w.length < NameMatcher.MIN_PARTIAL_LENGTH
      && !/^\p{N}+$/u.test(w)
      && !NameMatcher.#FILLER_WORDS.has(w));
  }

  /** Creature name prefixes to strip (young, adult, ancient, etc.) */
  static #PREFIX_PATTERN = /^(young|adult|ancient|elder|greater|lesser)\s+/;
  static get PREFIX_PATTERN() { return NameMatcher.#PREFIX_PATTERN; }

  /** Creature name suffixes to strip (warrior, guard, scout, etc.) */
  static #SUFFIX_PATTERN = /\s+(warrior|guard|scout|champion|leader|chief|captain|shaman|berserker)$/;
  static get SUFFIX_PATTERN() { return NameMatcher.#SUFFIX_PATTERN; }

  /** Stage 2 transforms: strip prefix, suffix, or both. */
  static #VARIANT_TRANSFORMS = Object.freeze([
    name => name.replace(NameMatcher.#PREFIX_PATTERN, ""),
    name => name.replace(NameMatcher.#SUFFIX_PATTERN, ""),
    name => name.replace(NameMatcher.#PREFIX_PATTERN, "").replace(NameMatcher.#SUFFIX_PATTERN, "")
  ]);
  static get VARIANT_TRANSFORMS() { return NameMatcher.#VARIANT_TRANSFORMS; }

  /** Lowercase, strip special chars, normalize whitespace (Unicode-safe). */
  static normalizeName(name) {
    return normalizeName(name);
  }

  /** Pick highest-priority match. Tie-breaks by pack collection name for determinism. */
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

    // O(n) max-scan — no mutation of input array.
    // Ties: the bestiary first, then pack collection name for determinism.
    const rank = m => SourceDetector.bestiaryRank(m.pack.metadata?.packageName);
    const best = matches.reduce((a, b) => {
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pb !== pa) return pb > pa ? b : a;
      if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a : b;
      return a.pack.collection < b.pack.collection ? a : b;
    });
    Logger.debug(`  Selected: ${best.pack.metadata.label} (priority ${getPriority(best)})`);

    return best;
  }

  /**
   * Find creature in index: exact match → variant transforms → partial word matching.
   * Prioritizes adventures/expansions > Monster Manual > SRD.
   */
  static findMatch(creatureName, index) {
    // A verified 2014 -> 2024 rename is searched under its current name
    const normalizedSearch = LegacyNames.canonical(NameMatcher.normalizeName(creatureName));

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
    // Uses reverse word index (word -> entries[]) when available for O(candidates) instead of O(index)
    if (normalizedSearch.length >= NameMatcher.MIN_PARTIAL_LENGTH) {
      const searchWords = normalizedSearch.split(" ");
      const significantSearchWords = searchWords.filter(w => w.length >= NameMatcher.MIN_PARTIAL_LENGTH);

      if (significantSearchWords.length > 0) {
        const threshold = Math.max(1, Math.ceil(significantSearchWords.length * 2 / 3));
        // For single-word searches, require the entry to also be a single significant word
        // to avoid "Shadow" matching "Shadow Demon", "Shadow Dragon", etc.
        const requireExactWordCount = significantSearchWords.length === 1;
        // Build search word Set once — avoids per-entry Set allocation
        const searchWordSet = new Set(significantSearchWords);
        // Short words drop out of the significant set, so "Giant Hen" and
        // "Giant Rat" would both reduce to ["giant"]. They must agree exactly.
        const allSearchWords = new Set(searchWords);
        const searchShortWords = NameMatcher.#distinctiveShortWords(searchWords);

        // Use reverse word index to narrow candidates when available
        const wordIndex = _CompendiumManager?.getWordIndex() ?? null;
        let candidates;
        if (wordIndex) {
          // Collect unique candidate entries from word index
          const seen = new Set();
          candidates = [];
          for (const word of significantSearchWords) {
            const entries = wordIndex.get(word);
            if (!entries) continue;
            for (const item of entries) {
              // Use entry._id + pack.collection as unique key
              const key = `${item.pack.collection}|${item.entry._id}`;
              if (!seen.has(key)) {
                seen.add(key);
                candidates.push(item);
              }
            }
          }
        } else {
          candidates = index;
        }

        matches = candidates.filter(item => {
          // Use pre-computed significantWords from index build time
          const sigWords = item.significantWords;
          if (!sigWords || sigWords.length === 0) return false;

          let matchingCount = 0;
          for (const w of sigWords) {
            if (searchWordSet.has(w)) matchingCount++;
          }
          // Bidirectional check: search words must meet threshold AND
          // matched words must cover at least half of entry's significant words
          if (requireExactWordCount && sigWords.length > 1) return false;
          const entryWords = (item.normalizedName || NameMatcher.normalizeName(item.entry.name)).split(" ");
          const entryWordSet = new Set(entryWords);
          if (searchShortWords.some(w => !entryWordSet.has(w))) return false;
          if (NameMatcher.#distinctiveShortWords(entryWords).some(w => !allSearchWords.has(w))) return false;
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

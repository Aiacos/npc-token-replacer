import { Logger, MODULE_ID } from "./logger.js";
import { NameMatcher } from "./name-matcher.js";
import { SourceDetector } from "./source-detector.js";
import { escapeHtml } from "./html.js";

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

  /** Get priority for a pack (higher = preferred). Uses the detection cache. */
  static getCompendiumPriority(pack) {
    return CompendiumManager.#classifications.get(pack?.collection)?.priority
      ?? SourceDetector.classify(pack).priority;
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
   * Detect every Actor compendium that can supply D&D creatures.
   *
   * Two layers: the authoritative whitelist of Wizards of the Coast packages
   * (trusted by default), plus forward-looking signals — WotC authorship,
   * premium content declaring this system, or a package id the GM added by
   * hand — which are detected and listed but only used when the GM opts in.
   * That way a book released after this version is never silently ignored,
   * and a third-party module is never silently trusted. Cached.
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

    const beyondWhitelist = detected.filter(pack => classifications.get(pack.collection).tier === SourceDetector.TIER.PUBLISHER);
    const verified = detected.filter(pack => classifications.get(pack.collection).tier === SourceDetector.TIER.VERIFIED);
    if (verified.length > 0) {
      Logger.log(`${verified.length} official book(s) recognised without the known list (WotC author + premium for this system): ` +
        verified.map(pack => pack.metadata.packageName).join(", "));
    }
    if (beyondWhitelist.length > 0) {
      Logger.warn(
        `${beyondWhitelist.length} package(s) look like official D&D content but are not in the known list: ` +
        `${beyondWhitelist.map(pack => pack.metadata.packageName).join(", ")}. ` +
        "Switch the compendium mode to \"Everything Detected\" to use them."
      );
    }

    Logger.log(`Found ${detected.length} D&D Actor compendium(s):`);
    detected.forEach(pack => {
      const info = classifications.get(pack.collection);
      const priorityLabel = SourceDetector.PRIORITY_LABELS[info.priority] || "UNKNOWN";
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

  /** Human-readable book name for a detected pack (known label, else the module title). */
  static getSourceLabel(pack) {
    return CompendiumManager.#classifications.get(pack?.collection)?.label
      ?? SourceDetector.classify(pack).label;
  }

  /**
   * The conservative "core" set (also the fallback for an unreadable setting):
   * official SRD and rulebooks only. Priority alone is not enough, because
   * opt-in tiers without Adventure/Scene packs also classify as CORE.
   */
  static #isCoreSource(pack) {
    return CompendiumManager.getCompendiumPriority(pack) <= SourceDetector.PRIORITY.CORE
      && CompendiumManager.isOfficialSource(pack);
  }

  /** True for first-party D&D content: system SRD, whitelisted or verified WotC book. */
  static isOfficialSource(pack) {
    return CompendiumManager.#classifications.get(pack?.collection)?.official
      ?? SourceDetector.classify(pack).official;
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
      const result = allPacks.filter(pack => CompendiumManager.#isCoreSource(pack));
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
      result = allPacks.filter(pack => CompendiumManager.#isCoreSource(pack));
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
        ui.notifications.error(game.i18n.format("NPC_REPLACER.ErrorCompendiumLoad", { name: escapeHtml(pack.metadata.label) }));
        continue;
      }

      const priority = CompendiumManager.getCompendiumPriority(pack);
      const priorityLabel = SourceDetector.PRIORITY_LABELS[priority] || "UNKNOWN";
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
    Logger.log(`Priority order: ${Object.entries(SourceDetector.PRIORITY_LABELS).sort(([a], [b]) => b - a).map(([p, label]) => `${label} (${p})`).join(" > ")}`);

    const indexMap = new Map();
    const wordIndex = new Map();
    for (const item of combinedIndex) {
      const key = item.normalizedName;
      if (!indexMap.has(key)) indexMap.set(key, []);
      indexMap.get(key).push(item);

      for (const word of item.significantWords) {
        if (!wordIndex.has(word)) wordIndex.set(word, []);
        wordIndex.get(word).push(item);
      }
    }

    const index = Object.freeze(combinedIndex);

    // A pack that failed to index is retried on the next run instead of being
    // missing until reload: serve this partial index once, but do not cache it.
    CompendiumManager.#indexCache = CompendiumManager.#lastLoadErrors.length > 0 ? null : index;
    CompendiumManager.#indexMap = indexMap;
    CompendiumManager.#wordIndex = wordIndex;
    return index;
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

export { CompendiumManager };

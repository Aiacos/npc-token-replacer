import { Logger } from "./logger.js";

/**
 * Priority levels used to pick a winner when several compendiums ship the same
 * creature. Higher wins.
 */
const PRIORITY = Object.freeze({
  FALLBACK: 1,
  CORE: 2,
  EXPANSION: 3,
  ADVENTURE: 4
});

const PRIORITY_LABELS = Object.freeze({
  1: "FALLBACK",
  2: "CORE",
  3: "EXPANSION",
  4: "ADVENTURE"
});

/** How a package was recognised as a source of official creatures. */
const TIER = Object.freeze({
  SYSTEM: "system",
  OFFICIAL: "official",
  PREMIUM: "premium",
  MANUAL: "manual",
  NONE: "none"
});

/**
 * Package-id prefixes used by the official WotC line on the Foundry package
 * registry. Kept as a *signal*, not as the mechanism: a new official book is
 * recognised even when it does not follow the convention.
 */
const OFFICIAL_PREFIXES = Object.freeze(["dnd-", "dnd5e"]);

/** Publisher names that identify first-party D&D content. */
const OFFICIAL_AUTHOR_PATTERN = /wizards of the coast|foundry gaming/i;

/**
 * Optional refinements for packages whose classification would otherwise be
 * guessed. Anything absent here is classified dynamically, so shipping a new
 * official book does NOT require touching this table.
 */
const KNOWN_PRIORITIES = Object.freeze({
  "dnd5e": PRIORITY.FALLBACK,
  "dnd-tashas-cauldron": PRIORITY.FALLBACK,

  "dnd-monster-manual": PRIORITY.CORE,
  "dnd-players-handbook": PRIORITY.CORE,
  "dnd-dungeon-masters-guide": PRIORITY.CORE,

  "dnd-forge-artificer": PRIORITY.EXPANSION,

  "dnd-phandelver-below": PRIORITY.ADVENTURE,
  "dnd-tomb-annihilation": PRIORITY.ADVENTURE,
  "dnd-adventures-faerun": PRIORITY.ADVENTURE,
  "dnd-heroes-faerun": PRIORITY.ADVENTURE,
  "dnd-heroes-borderlands": PRIORITY.ADVENTURE
});

/**
 * Recognises which installed packages carry official D&D creatures, and how
 * authoritative each one is, without relying on a maintained list of module ids.
 *
 * Signals, in order of confidence:
 *   1. the package IS the active game system  -> SRD baseline
 *   2. the package id uses the official prefix (`dnd-`)
 *   3. the package is authored by Wizards of the Coast / Foundry Gaming
 *   4. the package is premium (`protected`) content built for the active system
 *   5. the GM listed the package id manually in the module settings
 */
class SourceDetector {
  static get PRIORITY() { return PRIORITY; }
  static get PRIORITY_LABELS() { return PRIORITY_LABELS; }
  static get TIER() { return TIER; }
  static get OFFICIAL_PREFIXES() { return OFFICIAL_PREFIXES; }
  static get KNOWN_PRIORITIES() { return KNOWN_PRIORITIES; }

  /** Active system id, defaulting to dnd5e when the game object is unavailable. */
  static get #systemId() {
    return globalThis.game?.system?.id ?? "dnd5e";
  }

  static #getModule(packageName) {
    try {
      return globalThis.game?.modules?.get?.(packageName) ?? null;
    } catch (error) {
      Logger.debug(`Module lookup failed for "${packageName}": ${error.message}`);
      return null;
    }
  }

  static #hasOfficialPrefix(packageName) {
    return OFFICIAL_PREFIXES.some(prefix => packageName.startsWith(prefix));
  }

  static #hasOfficialAuthor(module) {
    const authors = module?.authors;
    if (!authors) return false;
    const names = Array.from(authors, author => (typeof author === "string" ? author : author?.name) ?? "");
    return names.some(name => OFFICIAL_AUTHOR_PATTERN.test(name));
  }

  /** True when a premium (paid) package declares support for the active system. */
  static #isPremiumForSystem(module) {
    if (!module?.protected) return false;
    const systems = module?.relationships?.systems;
    if (!systems) return false;
    return Array.from(systems, entry => (typeof entry === "string" ? entry : entry?.id) ?? "")
      .includes(SourceDetector.#systemId);
  }

  /** Document types shipped by a module's compendiums (e.g. "Actor", "Adventure"). */
  static #packTypes(module) {
    const packs = module?.packs;
    if (!packs) return new Set();
    return new Set(Array.from(packs, pack => pack?.type ?? pack?.documentName).filter(Boolean));
  }

  /**
   * Classify the package that owns a compendium.
   * @param {object} pack A CompendiumCollection
   * @param {Set<string>} [manualIds] Package ids or pack collections force-enabled by the GM
   * @returns {{tier: string, priority: number, packageName: string, official: boolean}}
   */
  static classify(pack, manualIds = null) {
    const packageName = pack?.metadata?.packageName ?? "";
    const packageType = pack?.metadata?.packageType ?? "";
    const collection = pack?.collection ?? "";

    const isSystem = packageType === "system"
      || (packageType === "" && packageName === SourceDetector.#systemId);

    const module = SourceDetector.#getModule(packageName);
    let tier = TIER.NONE;

    if (isSystem) tier = TIER.SYSTEM;
    else if (SourceDetector.#hasOfficialPrefix(packageName) || SourceDetector.#hasOfficialAuthor(module)) tier = TIER.OFFICIAL;
    else if (SourceDetector.#isPremiumForSystem(module)) tier = TIER.PREMIUM;
    else if (manualIds && (manualIds.has(packageName) || manualIds.has(collection))) tier = TIER.MANUAL;

    return {
      packageName,
      tier,
      official: tier === TIER.SYSTEM || tier === TIER.OFFICIAL,
      priority: SourceDetector.#resolvePriority(packageName, isSystem, module, tier)
    };
  }

  static #resolvePriority(packageName, isSystem, module, tier) {
    if (packageName in KNOWN_PRIORITIES) return KNOWN_PRIORITIES[packageName];
    if (isSystem) return PRIORITY.FALLBACK;

    // Dynamic classification from what the module actually ships: adventure
    // modules carry an Adventure pack, setting books carry Scenes, rulebooks
    // carry neither. This is what makes new releases classify themselves.
    if (module) {
      const types = SourceDetector.#packTypes(module);
      if (types.has("Adventure")) return PRIORITY.ADVENTURE;
      if (types.has("Scene")) return PRIORITY.EXPANSION;
      if (tier !== TIER.NONE) return PRIORITY.CORE;
      return PRIORITY.FALLBACK;
    }

    // No manifest data available (unknown package, or a test double): fall back
    // to the historical assumption that an unlisted `dnd-` package is adventure
    // content, which should win over the generic rulebook entry.
    if (SourceDetector.#hasOfficialPrefix(packageName)) return PRIORITY.ADVENTURE;
    return PRIORITY.FALLBACK;
  }
}

export { SourceDetector, PRIORITY, PRIORITY_LABELS, TIER, OFFICIAL_PREFIXES };

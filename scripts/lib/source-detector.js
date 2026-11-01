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

/**
 * How a package was recognised as a source of creatures.
 *
 * SYSTEM and OFFICIAL are trusted by default. PUBLISHER, PREMIUM and MANUAL are
 * detected and listed, but only used when the GM opts into them — they are the
 * forward-looking signals that catch content this version has never heard of.
 */
const TIER = Object.freeze({
  SYSTEM: "system",
  OFFICIAL: "official",
  // WotC authorship + protected premium package for the active system: a book
  // released after this version, trusted without a module update
  VERIFIED: "verified",
  PUBLISHER: "publisher",
  PREMIUM: "premium",
  MANUAL: "manual",
  NONE: "none"
});

/**
 * The official Wizards of the Coast packages published on Foundry VTT.
 *
 * Authoritative list from https://foundryvtt.com/creators/wizards-of-the-coast/
 * (14 packages: 1 free system + 13 premium modules, checked 2026-10-31).
 *
 * Package-id prefix matching is deliberately NOT used: `dnd-` and `ddb-` are
 * also used by third-party importers, homebrew and community adventures, which
 * caused false positives before 1.6.0. Content published after this list was
 * written is caught by the PUBLISHER and PREMIUM signals instead.
 */
const OFFICIAL_WOTC_PACKAGES = Object.freeze([
  "dnd5e",                         // D&D 5e system SRD (free)
  "dnd-monster-manual",            // Monster Manual (2024)
  "dnd-players-handbook",          // Player's Handbook (2024)
  "dnd-dungeon-masters-guide",     // Dungeon Master's Guide (2024)
  "dnd-forge-artificer",           // Eberron: Forge of the Artificer
  "dnd-tashas-cauldron",           // Tasha's Cauldron of Everything
  "dnd-phandelver-below",          // Phandelver and Below: The Shattered Obelisk
  "dnd-tomb-annihilation",         // Tomb of Annihilation
  "dnd-adventures-faerun",         // Forgotten Realms: Adventures in Faerûn
  "dnd-heroes-faerun",             // Forgotten Realms: Heroes of Faerûn
  "dnd-heroes-borderlands",        // Heroes of the Borderlands
  "dnd-ravenloft-horrors-within",  // Ravenloft: The Horrors Within
  "dnd-arcana-unleashed",          // Arcana Unleashed
  "dnd-deadfall"                   // Arcana Unleashed: Deadfall
]);

/** Human-readable book names, shown in the compendium picker and logs. */
const KNOWN_MODULE_LABELS = Object.freeze({
  "dnd5e": "D&D 5e SRD Monsters",
  "dnd-tashas-cauldron": "Tasha's Cauldron of Everything",
  "dnd-monster-manual": "Monster Manual (2024)",
  "dnd-players-handbook": "Player's Handbook (2024)",
  "dnd-dungeon-masters-guide": "Dungeon Master's Guide (2024)",
  "dnd-forge-artificer": "Eberron: Forge of the Artificer",
  "dnd-phandelver-below": "Phandelver and Below: The Shattered Obelisk",
  "dnd-tomb-annihilation": "Tomb of Annihilation",
  "dnd-adventures-faerun": "Forgotten Realms: Adventures in Faerûn",
  "dnd-heroes-faerun": "Forgotten Realms: Heroes of Faerûn",
  "dnd-heroes-borderlands": "Heroes of the Borderlands",
  "dnd-ravenloft-horrors-within": "Ravenloft: The Horrors Within",
  "dnd-arcana-unleashed": "Arcana Unleashed",
  "dnd-deadfall": "Arcana Unleashed: Deadfall"
});

/** Publisher names that identify first-party D&D content. */
const OFFICIAL_AUTHOR_PATTERN = /wizards of the coast|foundry gaming/i;

/**
 * Priorities for the official packages. Anything outside this table is
 * classified dynamically from what its module actually ships, so a book
 * released after this version still lands in a sensible tier.
 */
const KNOWN_PRIORITIES = Object.freeze({
  "dnd5e": PRIORITY.FALLBACK,
  "dnd-tashas-cauldron": PRIORITY.FALLBACK,

  "dnd-monster-manual": PRIORITY.CORE,
  "dnd-players-handbook": PRIORITY.CORE,
  "dnd-dungeon-masters-guide": PRIORITY.CORE,

  "dnd-forge-artificer": PRIORITY.EXPANSION,
  // Supplement: creatures plus a one-session introductory adventure
  "dnd-arcana-unleashed": PRIORITY.EXPANSION,

  "dnd-phandelver-below": PRIORITY.ADVENTURE,
  "dnd-tomb-annihilation": PRIORITY.ADVENTURE,
  "dnd-adventures-faerun": PRIORITY.ADVENTURE,
  "dnd-heroes-faerun": PRIORITY.ADVENTURE,
  "dnd-heroes-borderlands": PRIORITY.ADVENTURE,
  // Ships 17 adventures alongside its Domains of Dread creatures
  "dnd-ravenloft-horrors-within": PRIORITY.ADVENTURE,
  "dnd-deadfall": PRIORITY.ADVENTURE
});

/**
 * Recognises which installed packages carry D&D creatures, and how
 * authoritative each one is.
 *
 * Two layers, on purpose:
 *
 *   1. **Whitelist** — the 14 packages Wizards of the Coast publishes on
 *      Foundry. Exact, no false positives, trusted by default.
 *   2. **Signals** — WotC authorship, or premium content declaring the active
 *      system. These catch books released after this version was written, and
 *      are surfaced to the GM rather than trusted silently.
 */
class SourceDetector {
  static get PRIORITY() { return PRIORITY; }
  static get PRIORITY_LABELS() { return PRIORITY_LABELS; }
  static get TIER() { return TIER; }
  static get OFFICIAL_WOTC_PACKAGES() { return OFFICIAL_WOTC_PACKAGES; }
  static get KNOWN_MODULE_LABELS() { return KNOWN_MODULE_LABELS; }
  static get KNOWN_PRIORITIES() { return KNOWN_PRIORITIES; }

  /**
   * Tie-break between books of the same priority: the bestiary carries the
   * authoritative stat blocks. The DMG and PHB also ship creature actors, some
   * of them item-less stubs (the DMG "Animated Broom"), and alphabetical order
   * would otherwise let "dnd-dungeon-masters-guide" win every tie.
   * @param {string} packageName
   * @returns {number} lower is preferred
   */
  static bestiaryRank(packageName) {
    return packageName === "dnd-monster-manual" ? 0 : 1;
  }

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
   * @returns {{packageName: string, tier: string, official: boolean, priority: number, label: string}}
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
    else if (OFFICIAL_WOTC_PACKAGES.includes(packageName)) tier = TIER.OFFICIAL;
    else if (SourceDetector.#hasOfficialAuthor(module)) {
      // Authorship alone can be typed into any manifest; a protected package is
      // distributed through Foundry's premium system, which a homebrew module is not
      tier = SourceDetector.#isPremiumForSystem(module) ? TIER.VERIFIED : TIER.PUBLISHER;
    } else if (SourceDetector.#isPremiumForSystem(module)) tier = TIER.PREMIUM;
    else if (manualIds && (manualIds.has(packageName) || manualIds.has(collection))) tier = TIER.MANUAL;

    return {
      packageName,
      tier,
      official: tier === TIER.SYSTEM || tier === TIER.OFFICIAL || tier === TIER.VERIFIED,
      priority: SourceDetector.#resolvePriority(packageName, isSystem, module, tier),
      label: KNOWN_MODULE_LABELS[packageName] ?? module?.title ?? packageName
    };
  }

  static #resolvePriority(packageName, isSystem, module, tier) {
    if (packageName in KNOWN_PRIORITIES) return KNOWN_PRIORITIES[packageName];
    if (isSystem) return PRIORITY.FALLBACK;

    // Outside the whitelist, classify from what the module actually ships:
    // adventure modules carry an Adventure pack, setting books carry Scenes,
    // rulebooks carry neither. This is what lets new releases classify
    // themselves without a code change.
    if (module && tier !== TIER.NONE) {
      const types = SourceDetector.#packTypes(module);
      if (types.has("Adventure")) return PRIORITY.ADVENTURE;
      if (types.has("Scene")) return PRIORITY.EXPANSION;
      return PRIORITY.CORE;
    }

    // No signal and no manifest data: never grant an implicit priority.
    return PRIORITY.FALLBACK;
  }
}

export {
  SourceDetector,
  PRIORITY,
  PRIORITY_LABELS,
  TIER,
  OFFICIAL_WOTC_PACKAGES,
  KNOWN_MODULE_LABELS
};

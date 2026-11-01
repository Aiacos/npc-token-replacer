import { normalizeName } from "./names.js";

/**
 * Creatures D&D Beyond Importer still names as in 2014 books or adventures,
 * that the 2024 Monster Manual reprinted under a different name. Only verified
 * equivalents belong here — each pair is the same creature, so overwriting the
 * old actor with the new stat block loses nothing:
 *
 * - "Broom of Animated Attack" (Curse of Strahd): stat block identical to
 *   Candlekeep Mysteries' "Animated Broom", which 5eTools records as
 *   reprintedAs "Animated Broom|XMM".
 * - "Swarm of Insects (Beetles|Centipedes|Spiders|Wasps)": D&D Beyond's names
 *   for the 2014 Monster Manual variants of "Swarm of Insects", reprintedAs
 *   "Swarm of Insects|XMM" (the 2024 entry covers them with its climb/fly choice).
 *
 * Deliberately absent: "Night Hag (Coven Variant)" — the coven variant adds
 * shared spellcasting, so it is not an equivalent of the plain Night Hag.
 */
const RENAMES = Object.freeze({
  "Broom of Animated Attack": "Animated Broom",
  "Swarm of Insects (Beetles)": "Swarm of Insects",
  "Swarm of Insects (Centipedes)": "Swarm of Insects",
  "Swarm of Insects (Spiders)": "Swarm of Insects",
  "Swarm of Insects (Wasps)": "Swarm of Insects"
});

/** normalized legacy name -> normalized 2024 name */
const CANONICAL = new Map(Object.entries(RENAMES)
  .map(([legacy, current]) => [normalizeName(legacy), normalizeName(current)]));

class LegacyNames {
  /**
   * The 2024 name for a normalized creature name, or the name itself.
   * @param {string} normalizedName output of normalizeName (lib/names.js)
   * @returns {string}
   */
  static canonical(normalizedName) {
    return CANONICAL.get(normalizedName) ?? normalizedName;
  }
}

export { LegacyNames, RENAMES };

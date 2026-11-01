import { describe, it, expect, beforeEach, vi } from "vitest";
import { NameMatcher } from "../scripts/lib/name-matcher.js";
import { ActorImporter } from "../scripts/lib/actor-importer.js";
import { CompendiumManager } from "../scripts/lib/compendium-manager.js";
import { LegacyNames } from "../scripts/lib/legacy-names.js";
import { NPCTokenReplacerController } from "../scripts/main.js";

/**
 * D&D Beyond Importer keeps 2014 / adventure names for creatures the 2024
 * Monster Manual reprinted under another name. Verified pairs only (5eTools
 * reprintedAs and identical stat blocks; see lib/legacy-names.js).
 */

const entry = (name, packageName = "dnd-monster-manual") => {
  const normalizedName = NameMatcher.normalizeName(name);
  return {
    entry: { name, _id: name.replace(/\W/g, "") },
    pack: { collection: `${packageName}.actors`, metadata: { packageName, label: packageName } },
    normalizedName,
    significantWords: normalizedName.split(" ").filter(w => w.length >= NameMatcher.MIN_PARTIAL_LENGTH),
    priority: 2
  };
};

const ddbActor = (id, name) => ({
  id, name, type: "npc", folder: null, ownership: {}, sort: 0,
  flags: { ddbimporter: { id: 1 } }, _stats: { compendiumSource: "Compendium.world.ddb-x-ddb-monsters.Actor.a" },
  update: vi.fn()
});

beforeEach(() => {
  vi.restoreAllMocks();
  CompendiumManager.clearCache();
  ActorImporter.clear();
  NameMatcher.setCompendiumManager({ getCompendiumPriority: () => 2, getIndexMap: () => null, getWordIndex: () => null });
  game.settings.get = vi.fn((ns, key) => (key === "overwriteImportedActors" ? true : undefined));
});

describe("LegacyNames", () => {
  it("maps the verified renames to their 2024 Monster Manual names", () => {
    expect(LegacyNames.canonical(NameMatcher.normalizeName("Broom of Animated Attack"))).toBe("animated broom");
    for (const kind of ["Beetles", "Centipedes", "Spiders", "Wasps"]) {
      expect(LegacyNames.canonical(NameMatcher.normalizeName(`Swarm of Insects (${kind})`))).toBe("swarm of insects");
    }
  });

  // Not a rename: the coven variant has extra shared spellcasting
  it("leaves names that are not equivalent renames untouched", () => {
    const coven = NameMatcher.normalizeName("Night Hag (Coven Variant)");
    expect(LegacyNames.canonical(coven)).toBe(coven);
  });
});

describe("Matching and overwriting legacy-named creatures", () => {
  it("matches a legacy token name to the 2024 entry exactly", () => {
    const index = [entry("Animated Broom"), entry("Broom")];
    expect(NameMatcher.findMatch("Broom of Animated Attack", index)?.entry.name).toBe("Animated Broom");
  });

  it("finds the D&D Beyond actor with the legacy name as the overwrite target", () => {
    const broom = ddbActor("ddb-broom", "Broom of Animated Attack");
    game.actors[Symbol.iterator] = function* () { yield broom; };
    game.actors.has = vi.fn(() => true);
    ActorImporter.buildActorLookup();

    const mm = entry("Animated Broom");
    expect(ActorImporter.findOverwriteTarget(mm.entry, mm.pack)).toBe(broom);
  });

  it("plans legacy-named actors in the world-wide pass", () => {
    const swarm = ddbActor("ddb-swarm", "Swarm of Insects (Spiders)");
    const coven = ddbActor("ddb-hag", "Night Hag (Coven Variant)");
    game.actors[Symbol.iterator] = function* () { yield swarm; yield coven; };
    game.actors.has = vi.fn(() => true);
    ActorImporter.buildActorLookup();
    const swarmEntry = entry("Swarm of Insects");
    const hagEntry = entry("Night Hag");
    vi.spyOn(CompendiumManager, "getIndexMap").mockReturnValue(new Map([
      ["swarm of insects", [swarmEntry]], ["night hag", [hagEntry]]
    ]));
    vi.spyOn(CompendiumManager, "getLastLoadErrors").mockReturnValue([]);

    const plan = NPCTokenReplacerController.planActorOverwrites();

    expect(plan.find(p => p.actor === swarm).match).toBe(swarmEntry);
    expect(plan.find(p => p.actor === coven).match).toBeNull();
  });
});

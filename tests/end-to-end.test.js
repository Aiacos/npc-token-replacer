import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenReplacer, NPCTokenReplacerController } from "../scripts/main.js";
import { CompendiumManager } from "../scripts/lib/compendium-manager.js";
import { FolderManager } from "../scripts/lib/folder-manager.js";
import { NameMatcher } from "../scripts/lib/name-matcher.js";
import { WildcardResolver } from "../scripts/lib/wildcard-resolver.js";
import { SourceDetector } from "../scripts/lib/source-detector.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

/**
 * Whole-flow tests with Foundry v14 / D&D Beyond Importer data shapes and no
 * stubbed internals: real index build, real matching, real replaceToken.
 */

const MM_UUID = id => `Compendium.dnd-monster-manual.actors.Actor.${id}`;

function scene(id, goblinIds) {
  const s = { id, name: id };
  const tokens = goblinIds.map(tid => ({
    id: tid, name: "Goblin", parent: s, uuid: `Scene.${id}.Token.${tid}`,
    actorId: "ddb-goblin", actorLink: false, flags: {},
    x: 100, y: 100, elevation: 0, width: 1, height: 1, hidden: false, rotation: 0, disposition: -1, locked: false, alpha: 1,
    actor: { name: "Goblin", type: "npc" }
  }));
  s.tokens = { contents: tokens, has: vi.fn(tid => tokens.some(t => t.id === tid)) };
  s.createEmbeddedDocuments = vi.fn(async (type, data) => data.map((d, i) => ({ id: `${id}-new-${i}`, ...d })));
  s.deleteEmbeddedDocuments = vi.fn(async () => []);
  return s;
}

function mmPack(entries) {
  return {
    collection: "dnd-monster-manual.actors",
    metadata: { packageName: "dnd-monster-manual", packageType: "module", label: "Monster Manual" },
    documentName: "Actor",
    getIndex: vi.fn().mockResolvedValue(),
    index: { contents: entries, size: entries.length },
    getDocument: vi.fn(async id => ({
      id, uuid: MM_UUID(id), name: entries.find(e => e._id === id).name,
      prototypeToken: { toObject: () => ({ name: "Goblin", texture: { src: "tokens/goblin.webp" }, actorLink: false, sight: { enabled: true } }) }
    }))
  };
}

// D&D Beyond Importer's world compendium: never an official source
const ddbWorldPack = {
  collection: "world.ddb-base-world-ddb-monsters",
  metadata: { packageName: "base-world", packageType: "world", label: "DDB Monsters" },
  documentName: "Actor",
  getIndex: vi.fn().mockResolvedValue(),
  index: { contents: [{ name: "Goblin", _id: "abc", type: "npc" }], size: 1 }
};

let settings;
beforeEach(() => {
  vi.restoreAllMocks();
  CompendiumManager.clearCache();
  FolderManager.clearCache();
  WildcardResolver.clearCache();
  TokenReplacer.clearActorLookup();
  game.user.isGM = true;
  game.system = { id: "dnd5e" };
  game.i18n.localize = vi.fn(key => key);
  game.i18n.format = vi.fn((key, data) => `${key} ${JSON.stringify(data)}`);
  ui.notifications.info = vi.fn();
  ui.notifications.warn = vi.fn();
  ui.notifications.error = vi.fn();
  settings = { enabledCompendiums: '["default"]', overwriteImportedActors: true, tokenVariationMode: "none" };
  game.settings.get = vi.fn((ns, key) => settings[key]);
  game.modules.get = vi.fn(() => undefined);
  game.combats = { contents: [] };
  game.folders.filter = vi.fn(pred => [].filter(pred));
  game.folders.has = vi.fn(() => false);
  canvas.tokens = { controlled: [] };
});

describe("End to end — two scenes, one D&D Beyond goblin", () => {
  it("overwrites the DDB actor once and replaces every token on its own scene", async () => {
    const goblin = {
      id: "ddb-goblin", name: "Goblin", type: "npc", folder: { id: "cos" }, ownership: { default: 0 }, sort: 7,
      flags: { ddbimporter: { id: 16907 } },
      _stats: { compendiumSource: "Compendium.world.ddb-base-world-ddb-monsters.Actor.abc" },
      update: vi.fn(async function (data) { return Object.assign(this, data); })
    };
    game.actors[Symbol.iterator] = function* () { yield goblin; };
    game.actors.has = vi.fn(id => id === "ddb-goblin");
    game.actors.fromCompendium = vi.fn(doc => ({ name: doc.name, type: "npc", items: [], flags: {} }));
    game.actors.importFromCompendium = vi.fn();
    const pack = mmPack([{ name: "Goblin", _id: "goblin", type: "npc" }]);
    game.packs.filter = vi.fn(pred => [pack, ddbWorldPack].filter(pred));
    const cave = scene("cave", ["t1", "t2"]);
    const castle = scene("castle", ["t1"]);
    game.scenes = { contents: [cave, castle] };
    vi.spyOn(NPCTokenReplacerController, "showPreviewDialog").mockResolvedValue(true);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(goblin.update).toHaveBeenCalledTimes(1);
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
    for (const s of [cave, castle]) {
      for (const [, [data]] of s.createEmbeddedDocuments.mock.calls) {
        expect(data.actorId).toBe("ddb-goblin");
        expect(data.actorLink).toBe(false);
        expect(data).not.toHaveProperty("sight");
        expect(data.flags["npc-token-replacer"].replaced).toBe(true);
      }
    }
    expect(cave.createEmbeddedDocuments).toHaveBeenCalledTimes(2);
    expect(castle.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(cave.deleteEmbeddedDocuments.mock.calls.map(([, ids]) => ids[0])).toEqual(["t1", "t2"]);
    expect(castle.deleteEmbeddedDocuments.mock.calls.map(([, ids]) => ids[0])).toEqual(["t1"]);
    expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining('NPC_REPLACER.Complete {"count":3}'));
  });

  it("never treats D&D Beyond's world compendium as an official source", () => {
    expect(SourceDetector.classify(ddbWorldPack).official).toBe(false);
  });
});

describe("The replacement lock", () => {
  it("refuses a second run while the first is waiting on the preview, then releases", async () => {
    const pack = mmPack([{ name: "Goblin", _id: "goblin", type: "npc" }]);
    game.packs.filter = vi.fn(pred => [pack].filter(pred));
    game.actors[Symbol.iterator] = function* () {};
    game.scenes = { contents: [scene("cave", ["t1"])] };
    let answer;
    vi.spyOn(NPCTokenReplacerController, "showPreviewDialog").mockImplementation(() => new Promise(r => { answer = r; }));

    const first = NPCTokenReplacerController.replaceNPCTokens();
    await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
    await NPCTokenReplacerController.replaceNPCTokens();
    expect(ui.notifications.warn).toHaveBeenCalledWith("NPC_REPLACER.AlreadyProcessing");

    answer(false);
    await first;
    ui.notifications.warn.mockClear();
    NPCTokenReplacerController.showPreviewDialog.mockResolvedValue(false);
    await NPCTokenReplacerController.replaceNPCTokens();
    expect(ui.notifications.warn).not.toHaveBeenCalledWith("NPC_REPLACER.AlreadyProcessing");
  });
});

describe("Name matching on the index the module really builds", () => {
  it("uses the real index map and word index", async () => {
    const pack = mmPack([
      { name: "Goblin", _id: "g", type: "npc" },
      { name: "Stone Golem Construct", _id: "s", type: "npc" },
      { name: "Giant Rat", _id: "r", type: "npc" }
    ]);
    game.packs.filter = vi.fn(pred => [pack].filter(pred));
    const index = await CompendiumManager.loadMonsterIndex(true);

    expect(CompendiumManager.getIndexMap()).toBeInstanceOf(Map);
    expect(NameMatcher.findMatch("Goblin Warrior", index)?.entry.name).toBe("Goblin");
    expect(NameMatcher.findMatch("Ancient Stone Golem", index)?.entry.name).toBe("Stone Golem Construct");
    expect(NameMatcher.findMatch("Giant Hen", index)).toBeNull();
  });

  // Player's Handbook ships character-type actors: they must never stand in for an NPC
  it("indexes only creature entries", async () => {
    const pack = mmPack([
      { name: "Knight", _id: "pc", type: "character" },
      { name: "Knight", _id: "npc", type: "npc" },
      { name: "Party", _id: "grp", type: "group" }
    ]);
    game.packs.filter = vi.fn(pred => [pack].filter(pred));
    const index = await CompendiumManager.loadMonsterIndex(true);

    expect(index.map(i => i.entry._id)).toEqual(["npc"]);
  });
});

describe("Translations", () => {
  // Tier keys are built at runtime (NPC_REPLACER.Tier.<tier>), so the validator cannot see them
  it("has a label for every source tier", () => {
    const en = JSON.parse(readFileSync(resolve(process.cwd(), "lang/en.json"), "utf8"));
    for (const tier of Object.values(SourceDetector.TIER)) {
      expect(en.NPC_REPLACER.Tier, `Tier.${tier}`).toHaveProperty(tier);
    }
  });
});

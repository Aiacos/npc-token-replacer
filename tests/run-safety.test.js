import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenReplacer, NPCTokenReplacerController, CompendiumManager } from "../scripts/main.js";

/**
 * Safety of a world-wide run: tokens the module already replaced and tokens in
 * an encounter are left alone unless the GM selects them; a selection also
 * scopes the D&D Beyond actor pass; caches are never wiped mid-run; players do
 * not index compendiums; unexpected failures reach the GM.
 */

function makeScene(id, specs) {
  const scene = { id, name: id };
  const tokens = specs.map(({ tid, name, actorId = `a-${tid}`, flags = {} }) => ({
    id: tid, name, parent: scene, uuid: `Scene.${id}.Token.${tid}`, actorId, flags,
    actor: actorId ? { id: actorId, name, type: "npc" } : null
  }));
  scene.tokens = { contents: tokens, has: vi.fn(tid => tokens.some(t => t.id === tid)) };
  return scene;
}

let pack;

let settings;
beforeEach(() => {
  vi.restoreAllMocks();
  CompendiumManager.clearCache();
  TokenReplacer.clearActorLookup();
  game.user.isGM = true;
  game.i18n.localize = vi.fn(key => key);
  game.i18n.format = vi.fn((key, data) => `${key} ${JSON.stringify(data)}`);
  ui.notifications.info = vi.fn();
  ui.notifications.warn = vi.fn();
  ui.notifications.error = vi.fn();
  // Rebuilt per test: restoreAllMocks would wipe a module-level vi.fn implementation
  pack = {
    collection: "dnd-monster-manual.actors",
    metadata: { packageName: "dnd-monster-manual", packageType: "module", label: "MM" },
    documentName: "Actor",
    getIndex: vi.fn().mockResolvedValue(),
    index: { contents: [{ name: "Goblin", _id: "g" }, { name: "Wolf", _id: "w" }], size: 2 }
  };
  settings = { enabledCompendiums: '["default"]', overwriteImportedActors: true };
  game.settings.get = vi.fn((ns, key) => settings[key]);
  game.packs.filter = vi.fn(pred => [pack].filter(pred));
  game.actors[Symbol.iterator] = function* () {};
  game.combats = { contents: [] };
  canvas.tokens = { controlled: [] };
});

describe("Which tokens a world-wide run touches", () => {
  it("skips tokens the module already replaced, unless they are selected", () => {
    const scene = makeScene("cave", [
      { tid: "fresh", name: "Goblin" },
      { tid: "done", name: "Goblin", flags: { "npc-token-replacer": { replaced: true } } }
    ]);
    game.scenes = { contents: [scene] };

    expect(TokenReplacer.getNPCTokensToProcess().tokens.map(t => t.id)).toEqual(["fresh"]);

    canvas.tokens.controlled = scene.tokens.contents.map(document => ({ document }));
    expect(TokenReplacer.getNPCTokensToProcess().tokens.map(t => t.id)).toEqual(["fresh", "done"]);
  });

  // Deleting a token removes its combatant: never break a running encounter silently
  it("skips tokens that are in an encounter, unless they are selected", () => {
    const scene = makeScene("cave", [{ tid: "fighting", name: "Goblin" }, { tid: "idle", name: "Goblin" }]);
    game.scenes = { contents: [scene] };
    game.combats = { contents: [{ combatants: { contents: [{ tokenId: "fighting", sceneId: "cave" }] } }] };

    expect(TokenReplacer.getNPCTokensToProcess().tokens.map(t => t.id)).toEqual(["idle"]);
  });

  it("reports how many tokens were skipped and why", () => {
    const scene = makeScene("cave", [
      { tid: "done", name: "Goblin", flags: { "npc-token-replacer": { replaced: true } } },
      { tid: "fighting", name: "Goblin" }
    ]);
    game.scenes = { contents: [scene] };
    game.combats = { contents: [{ combatants: { contents: [{ tokenId: "fighting", sceneId: "cave" }] } }] };

    expect(TokenReplacer.getNPCTokensToProcess().skipped).toEqual({ replaced: 1, inCombat: 1 });
  });

  it("ignores tokens without an actor before touching .actor", () => {
    const scene = makeScene("cave", [{ tid: "orphan", name: "Ghost", actorId: null }]);
    game.scenes = { contents: [scene] };

    expect(TokenReplacer.getNPCTokensToProcess().tokens).toEqual([]);
  });

  it("marks every token it creates so the next run leaves it alone", async () => {
    const compendiumActor = {
      uuid: "Compendium.dnd-monster-manual.actors.Actor.g", name: "Goblin",
      prototypeToken: { toObject: () => ({ name: "Goblin", texture: { src: "goblin.webp" } }) }
    };
    const p = { ...pack, getDocument: vi.fn().mockResolvedValue(compendiumActor) };
    const scene = makeScene("cave", [{ tid: "t1", name: "Goblin" }]);
    scene.createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: "new" }]);
    scene.deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
    game.actors.importFromCompendium = vi.fn().mockResolvedValue({ id: "imported" });
    game.folders.filter = vi.fn(() => []);
    game.folders.has = vi.fn(() => false);
    globalThis.Folder.create = vi.fn().mockResolvedValue({ id: "f" });
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(scene.tokens.contents[0], { name: "Goblin", _id: "g" }, p);

    const data = scene.createEmbeddedDocuments.mock.calls[0][1][0];
    expect(data.flags["npc-token-replacer"]).toEqual({ replaced: true, sourceUuid: compendiumActor.uuid });
  });
});

describe("A selection scopes the D&D Beyond actor pass too", () => {
  it("plans only the DDB actors behind the selected tokens", async () => {
    const ddb = (id, name) => ({
      id, name, type: "npc", folder: null, ownership: {}, sort: 0, flags: { ddbimporter: { id: 1 } }, _stats: {},
      update: vi.fn()
    });
    const wolf = ddb("ddb-wolf", "Wolf");
    const goblin = ddb("ddb-goblin", "Goblin");
    game.actors[Symbol.iterator] = function* () { yield wolf; yield goblin; };
    game.actors.has = vi.fn(() => true);
    const scene = makeScene("cave", [{ tid: "t1", name: "Wolf", actorId: "ddb-wolf" }]);
    game.scenes = { contents: [scene] };
    canvas.tokens.controlled = [{ document: scene.tokens.contents[0] }];
    const preview = vi.spyOn(NPCTokenReplacerController, "showPreviewDialog").mockResolvedValue(false);

    await NPCTokenReplacerController.replaceNPCTokens();

    const [, plan] = preview.mock.calls[0];
    expect(plan.map(p => p.actor.id)).toEqual(["ddb-wolf"]);
  });
});

describe("Run lifecycle", () => {
  // A setting saved while the non-modal preview is open must not wipe the
  // run's actor lookup, or every token would be imported again
  it("defers clearCache() until the running replacement finishes", async () => {
    const scene = makeScene("cave", [{ tid: "t1", name: "Goblin" }]);
    game.scenes = { contents: [scene] };
    const clearLookup = vi.spyOn(TokenReplacer, "clearActorLookup");
    vi.spyOn(NPCTokenReplacerController, "showPreviewDialog").mockImplementation(async () => {
      NPCTokenReplacerController.clearCache();
      expect(clearLookup).not.toHaveBeenCalled();
      return false;
    });

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(clearLookup).toHaveBeenCalled();
  });

  it("tells the GM when the run fails unexpectedly, and releases the lock", async () => {
    game.scenes = { contents: [] };
    vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockImplementation(() => { throw new Error("boom"); });

    await expect(NPCTokenReplacerController.replaceNPCTokens()).resolves.toBeUndefined();
    expect(ui.notifications.error).toHaveBeenCalledWith("NPC_REPLACER.ErrorUnexpected");

    TokenReplacer.getNPCTokensToProcess.mockReturnValue({ tokens: [], isSelection: false, skipped: { replaced: 0, inCombat: 0 } });
    await NPCTokenReplacerController.replaceNPCTokens();
    expect(ui.notifications.warn).not.toHaveBeenCalledWith("NPC_REPLACER.AlreadyProcessing");
  });

  it("does not index compendiums on players' clients", async () => {
    game.user.isGM = false;
    const load = vi.spyOn(CompendiumManager, "loadMonsterIndex");

    await NPCTokenReplacerController.initialize();

    expect(load).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenReplacer, NPCTokenReplacerController } from "../scripts/main.js";
import { FoundryCompat } from "../scripts/lib/foundry-compat.js";

/**
 * Actors already imported by D&D Beyond Importer are overwritten in place with
 * the official compendium data instead of being duplicated into a new folder.
 */

const COMPENDIUM_UUID = "Compendium.dnd-monster-manual.actors.Actor.goblin";

function ddbActor(overrides = {}) {
  return {
    id: "ddb-goblin",
    name: "Goblin",
    type: "npc",
    folder: { id: "ddb-folder" },
    ownership: { default: 0, gm1: 3 },
    sort: 4200,
    flags: { ddbimporter: { id: 16907 } },
    _stats: {},
    update: vi.fn(function (data) { return Promise.resolve(Object.assign(this, data)); }),
    ...overrides
  };
}

function setWorldActors(actors) {
  game.actors[Symbol.iterator] = function* () { yield* actors; };
  game.actors.has = vi.fn(id => actors.some(a => a.id === id));
}

function setOverwriteSetting(value) {
  game.settings.get = vi.fn((ns, key) => {
    if (key === "overwriteImportedActors") return value;
    if (key === "tokenVariationMode") return "none";
    return undefined;
  });
}

const compendiumActor = {
  id: "goblin",
  uuid: COMPENDIUM_UUID,
  name: "Goblin",
  prototypeToken: {
    toObject: () => ({ name: "Goblin", texture: { src: "tokens/goblin.webp" }, sight: {}, bar1: {}, bar2: {} })
  }
};

const pack = {
  collection: "dnd-monster-manual.actors",
  metadata: { packageName: "dnd-monster-manual", label: "Monster Manual" },
  documentName: "Actor",
  getDocument: vi.fn()
};

const entry = { name: "Goblin", _id: "goblin" };

const tokenDoc = () => ({
  id: "token-1", name: "Goblin", x: 0, y: 0, elevation: 0, width: 1, height: 1,
  hidden: false, rotation: 0, disposition: -1, locked: false, alpha: 1,
  actor: { name: "Goblin", type: "npc" }
});

describe("TokenReplacer — overwrite D&D Beyond imports in place", () => {

  beforeEach(() => {
    vi.restoreAllMocks();
    TokenReplacer.clearActorLookup();
    pack.getDocument = vi.fn().mockResolvedValue(compendiumActor);
    // fromCompendium returns fresh compendium data, deliberately without folder/ownership
    game.actors.fromCompendium = vi.fn(() => ({
      name: "Goblin", type: "npc", system: { official: true }, items: [{ name: "Scimitar" }],
      flags: {}, _stats: { compendiumSource: COMPENDIUM_UUID }
    }));
    game.actors.importFromCompendium = vi.fn().mockResolvedValue({ id: "imported", name: "Goblin" });
    globalThis.Folder.create = vi.fn().mockResolvedValue({ id: "module-folder", name: "MonsterManual" });
    game.folders.filter = vi.fn(() => []);
    game.folders.has = vi.fn(() => false);
    canvas.scene.createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: "new-token" }]);
    canvas.scene.deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
    canvas.scene.tokens = canvas.scene.tokens || {};
    canvas.scene.tokens.has = vi.fn(() => true);
    setOverwriteSetting(true);
  });

  it("replaces the DDB actor's data in place, keeping its folder, ownership and sort", async () => {
    const ddb = ddbActor();
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(ddb.update).toHaveBeenCalledTimes(1);
    const [data, options] = ddb.update.mock.calls[0];
    expect(options).toEqual({ diff: false, recursive: false });
    expect(data).toMatchObject({
      name: "Goblin",
      system: { official: true },
      items: [{ name: "Scimitar" }],
      folder: "ddb-folder",
      ownership: { default: 0, gm1: 3 },
      sort: 4200
    });
    expect(data).not.toHaveProperty("_id");
    expect(data.flags["npc-token-replacer"].sourceUuid).toBe(COMPENDIUM_UUID);
  });

  // DDB Importer brings monsters into the world with
  // game.actors.importFromCompendium(<its own DDB compendium>), so real DDB
  // actors carry a compendiumSource. That must not hide them from the overwrite.
  it("overwrites a DDB actor that was imported from DDB's own compendium", async () => {
    const ddb = ddbActor({ _stats: { compendiumSource: "Compendium.world.ddb-mondo-ddb-monsters.Actor.abc123" } });
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(ddb.update).toHaveBeenCalledTimes(1);
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
  });

  it("does not import a duplicate or create the module's import folder", async () => {
    setWorldActors([ddbActor()]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
    expect(Folder.create).not.toHaveBeenCalled();
    expect(canvas.scene.createEmbeddedDocuments.mock.calls[0][1][0].actorId).toBe("ddb-goblin");
  });

  it("overwrites each DDB actor once, then reuses it for later tokens", async () => {
    const ddb = ddbActor();
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);
    await TokenReplacer.replaceToken({ ...tokenDoc(), id: "token-2" }, entry, pack);

    expect(ddb.update).toHaveBeenCalledTimes(1);
  });

  it("recognises an actor it overwrote in an earlier session and reuses it", async () => {
    const previously = ddbActor({ flags: { "npc-token-replacer": { sourceUuid: COMPENDIUM_UUID } } });
    setWorldActors([previously]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(previously.update).not.toHaveBeenCalled();
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
  });

  it("never touches a same-named world actor that DDB Importer did not create", async () => {
    const homebrew = ddbActor({ id: "homebrew", flags: {} });
    setWorldActors([homebrew]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(homebrew.update).not.toHaveBeenCalled();
    expect(game.actors.importFromCompendium).toHaveBeenCalledTimes(1);
  });

  it("prefers an actor already imported from the same compendium entry", async () => {
    const imported = { id: "imported", name: "Goblin", type: "npc", _stats: { compendiumSource: COMPENDIUM_UUID }, flags: {} };
    const ddb = ddbActor();
    setWorldActors([imported, ddb]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(ddb.update).not.toHaveBeenCalled();
    expect(canvas.scene.createEmbeddedDocuments.mock.calls[0][1][0].actorId).toBe("imported");
  });

  // The lookup is built before the (non-modal) preview so it can list overwrites;
  // an actor deleted while the dialog was open must not be updated.
  it("falls back to importing when the DDB actor was deleted during the preview", async () => {
    const ddb = ddbActor();
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();
    game.actors.has = vi.fn(() => false);

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(ddb.update).not.toHaveBeenCalled();
    expect(game.actors.importFromCompendium).toHaveBeenCalledTimes(1);
  });

  it("imports as before when the GM turned the setting off", async () => {
    setOverwriteSetting(false);
    const ddb = ddbActor();
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    expect(ddb.update).not.toHaveBeenCalled();
    expect(game.actors.importFromCompendium).toHaveBeenCalledTimes(1);
  });

  // Constitution I.3: an unreadable setting falls back to the non-destructive option
  it("does not overwrite when the setting cannot be read", async () => {
    game.settings.get = vi.fn(() => { throw new Error("not registered"); });
    const ddb = ddbActor();
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();

    expect(TokenReplacer.findOverwriteTarget(entry, pack)).toBeNull();
  });
});

describe("Preview — overwrites are listed before anything changes", () => {

  beforeEach(() => {
    vi.restoreAllMocks();
    TokenReplacer.clearActorLookup();
    setOverwriteSetting(true);
    game.i18n.localize = vi.fn(key => key);
    game.i18n.format = vi.fn((key, data) => `${key} ${JSON.stringify(data)}`);
  });

  it("computeMatches marks matches that will overwrite a DDB actor", async () => {
    setWorldActors([ddbActor()]);
    TokenReplacer.buildActorLookup();
    const index = [{ entry, pack, normalizedName: "goblin", significantWords: ["goblin"], priority: 2 }];
    const progress = { start: vi.fn(), update: vi.fn() };

    const [result] = await NPCTokenReplacerController.computeMatches([tokenDoc()], index, progress);

    expect(result.overwrite?.id).toBe("ddb-goblin");
  });

  it("the preview dialog warns about every actor it will overwrite", async () => {
    const confirm = vi.spyOn(FoundryCompat, "confirmDialog").mockReturnValue({
      answer: Promise.resolve(false), close: vi.fn()
    });
    const results = [{
      tokenDoc: tokenDoc(), creatureName: "Goblin",
      match: { entry, pack }, overwrite: ddbActor()
    }];

    await NPCTokenReplacerController.showPreviewDialog(results);

    const { content } = confirm.mock.calls[0][0];
    expect(content).toContain("NPC_REPLACER.PreviewOverwriteSummary");
    expect(content).toContain("NPC_REPLACER.PreviewOverwrites");
  });
});

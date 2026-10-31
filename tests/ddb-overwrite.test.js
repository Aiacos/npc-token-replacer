import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenReplacer, NPCTokenReplacerController, CompendiumManager } from "../scripts/main.js";
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
    CompendiumManager.clearCache();
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

  it("keeps other modules' flags but drops the D&D Beyond ones when overwriting", async () => {
    const ddb = ddbActor({ flags: { ddbimporter: { id: 1 }, monsterMunch: { x: 1 }, core: { sheetClass: "dnd5e.NPCActorSheet" }, "token-attacher": { a: 1 } } });
    setWorldActors([ddb]);
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(tokenDoc(), entry, pack);

    const { flags } = ddb.update.mock.calls[0][0];
    expect(flags).not.toHaveProperty("ddbimporter");
    expect(flags).not.toHaveProperty("monsterMunch");
    expect(flags.core).toEqual({ sheetClass: "dnd5e.NPCActorSheet" });
    expect(flags["token-attacher"]).toEqual({ a: 1 });
    expect(flags["npc-token-replacer"].sourceUuid).toBe(COMPENDIUM_UUID);
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
    // findMatch prefers a cached index map over the fixture index
    CompendiumManager.clearCache();
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

describe("One button — every D&D Beyond actor in the world", () => {
  const indexedPack = (entries) => ({
    collection: "dnd-monster-manual.actors",
    metadata: { packageName: "dnd-monster-manual", packageType: "module", label: "Monster Manual" },
    documentName: "Actor",
    getIndex: vi.fn().mockResolvedValue(),
    index: { contents: entries, size: entries.length },
    getDocument: vi.fn(id => Promise.resolve({ ...compendiumActor, id, uuid: `Compendium.dnd-monster-manual.actors.Actor.${id}` }))
  });

  let mmPack;
  let confirmSpy;

  beforeEach(async () => {
    vi.restoreAllMocks();
    CompendiumManager.clearCache();
    TokenReplacer.clearActorLookup();
    setOverwriteSetting(true);
    game.settings.get = vi.fn((ns, key) => ({
      overwriteImportedActors: true, enabledCompendiums: '["default"]', tokenVariationMode: "none"
    })[key]);
    game.user.isGM = true;
    game.i18n.localize = vi.fn(key => key);
    game.i18n.format = vi.fn((key, data) => `${key} ${JSON.stringify(data)}`);
    ui.notifications.info = vi.fn();
    ui.notifications.warn = vi.fn();
    ui.notifications.error = vi.fn();
    game.actors.fromCompendium = vi.fn(doc => ({ name: doc.name, type: "npc", flags: {}, items: [] }));
    game.actors.importFromCompendium = vi.fn();
    mmPack = indexedPack([{ name: "Goblin", _id: "goblin" }, { name: "Owlbear", _id: "owlbear" }]);
    game.packs.filter = vi.fn(pred => [mmPack].filter(pred));
    vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({ tokens: [], isSelection: false });
    confirmSpy = vi.spyOn(NPCTokenReplacerController, "showPreviewDialog").mockResolvedValue(true);
  });

  it("overwrites DDB actors that are not on the scene, even with an empty scene", async () => {
    const owlbear = ddbActor({ id: "ddb-owlbear", name: "Owlbear", _stats: { compendiumSource: "Compendium.world.ddb-monsters.Actor.o" } });
    setWorldActors([owlbear]);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(owlbear.update).toHaveBeenCalledTimes(1);
    expect(owlbear.update.mock.calls[0][0].flags["npc-token-replacer"].sourceUuid)
      .toBe("Compendium.dnd-monster-manual.actors.Actor.owlbear");
  });

  it("matches by exact name only — a variant is left unchanged", async () => {
    const warrior = ddbActor({ id: "ddb-gw", name: "Goblin Warrior" });
    setWorldActors([warrior]);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(warrior.update).not.toHaveBeenCalled();
  });

  it("previews actor overwrites and unmatched actors before changing anything", async () => {
    const owlbear = ddbActor({ id: "ddb-owlbear", name: "Owlbear" });
    const homebrew = ddbActor({ id: "ddb-x", name: "Ddb Only Horror" });
    setWorldActors([owlbear, homebrew]);
    confirmSpy.mockResolvedValue(false);

    await NPCTokenReplacerController.replaceNPCTokens();

    const [, plan] = confirmSpy.mock.calls[0];
    expect(plan.map(p => [p.actor.id, p.match?.entry.name ?? null]))
      .toEqual([["ddb-owlbear", "Owlbear"], ["ddb-x", null]]);
    expect(owlbear.update).not.toHaveBeenCalled(); // cancelled
  });

  it("overwrites an actor once even when scene tokens also use it", async () => {
    const goblin = ddbActor();
    setWorldActors([goblin]);
    TokenReplacer.getNPCTokensToProcess.mockReturnValue({ tokens: [tokenDoc()], isSelection: false });
    canvas.scene.createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: "new" }]);
    canvas.scene.deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
    canvas.scene.tokens = { has: vi.fn(() => true) };

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(goblin.update).toHaveBeenCalledTimes(1);
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
    expect(canvas.scene.createEmbeddedDocuments.mock.calls[0][1][0].actorId).toBe("ddb-goblin");
  });

  it("reports how many actors were overwritten", async () => {
    setWorldActors([ddbActor({ id: "ddb-owlbear", name: "Owlbear" })]);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("NPC_REPLACER.ActorsOverwritten"));
  });

  it("keeps going and reports when one actor cannot be overwritten", async () => {
    const broken = ddbActor({ id: "ddb-goblin" });
    broken.update = vi.fn().mockRejectedValue(new Error("permission"));
    const owlbear = ddbActor({ id: "ddb-owlbear", name: "Owlbear" });
    setWorldActors([broken, owlbear]);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(owlbear.update).toHaveBeenCalledTimes(1);
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("NPC_REPLACER.ActorsOverwriteFailed"));
  });

  // An overwrite tags the actor as official for good, so matching it against an
  // index that is missing a pack could lock in a lower-priority version
  it("skips the actor pass, and says so, when a compendium failed to load", async () => {
    const owlbear = ddbActor({ id: "ddb-owlbear", name: "Owlbear" });
    setWorldActors([owlbear]);
    const broken = indexedPack([]);
    broken.collection = "dnd-phandelver-below.actors";
    broken.metadata = { packageName: "dnd-phandelver-below", packageType: "module", label: "Phandelver" };
    broken.getIndex = vi.fn().mockRejectedValue(new Error("timeout"));
    game.packs.filter = vi.fn(pred => [mmPack, broken].filter(pred));

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(owlbear.update).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalledWith("NPC_REPLACER.ActorsSkippedLoadError");
  });

  it("with the setting off, the button only handles scene tokens as before", async () => {
    game.settings.get = vi.fn((ns, key) => ({ overwriteImportedActors: false, enabledCompendiums: '["default"]' })[key]);
    const owlbear = ddbActor({ id: "ddb-owlbear", name: "Owlbear" });
    setWorldActors([owlbear]);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(owlbear.update).not.toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalledWith("NPC_REPLACER.NoTokens");
  });
});

describe("Preview — D&D Beyond actors section", () => {
  it("lists overwrites and unmatched actors, and enables confirm with no tokens", async () => {
    vi.restoreAllMocks();
    game.i18n.localize = vi.fn(key => key);
    game.i18n.format = vi.fn((key, data) => `${key} ${JSON.stringify(data)}`);
    const confirm = vi.spyOn(FoundryCompat, "confirmDialog").mockReturnValue({ answer: Promise.resolve(false), close: vi.fn() });
    const plan = [
      { actor: ddbActor({ id: "a", name: "Owlbear" }), match: { entry: { name: "Owlbear" }, pack } },
      { actor: ddbActor({ id: "b", name: "Ddb <Only>" }), match: null }
    ];

    await NPCTokenReplacerController.showPreviewDialog([], plan);

    const { content, yesDisabled } = confirm.mock.calls[0][0];
    expect(content).toContain("NPC_REPLACER.PreviewActorsTitle");
    expect(content).toContain("NPC_REPLACER.PreviewActorUnchanged");
    expect(content).toContain("Ddb &lt;Only&gt;");
    // Format output is HTML-escaped before it reaches the dialog
    expect(content).toContain("NPC_REPLACER.PreviewOverwriteSummary {&quot;count&quot;:1}");
    expect(yesDisabled).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PreviewDialog } from "../scripts/lib/preview-dialog.js";
import { ActorImporter } from "../scripts/lib/actor-importer.js";
import { NPCTokenReplacerController, TokenReplacer } from "../scripts/main.js";
import { CompendiumManager } from "../scripts/lib/compendium-manager.js";
import { FolderManager } from "../scripts/lib/folder-manager.js";
import { TokenReplacerError } from "../scripts/lib/errors.js";
import { WildcardResolver } from "../scripts/lib/wildcard-resolver.js";
import { ProgressReporter } from "../scripts/lib/progress-reporter.js";

/**
 * Cross-cutting Error Handling Tests
 *
 * Tests for BUG-01 (stale actor guard), BUG-03 (cache propagation),
 * ERR-01 (ui.notifications.error pairing with Logger.error),
 * ERR-02 (failure classification), and ERR-03 (load error tracking).
 */

// ─── Test Group 1: BUG-03 — Cache propagation ───────────────────────────────

describe("BUG-03 — NPCTokenReplacerController.clearCache propagation", () => {

  it("calls WildcardResolver.clearCache()", () => {
    const spy = vi.spyOn(WildcardResolver, "clearCache");
    NPCTokenReplacerController.clearCache();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("calls CompendiumManager.clearCache()", () => {
    const spy = vi.spyOn(CompendiumManager, "clearCache");
    NPCTokenReplacerController.clearCache();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("calls FolderManager.clearCache()", () => {
    const spy = vi.spyOn(FolderManager, "clearCache");
    NPCTokenReplacerController.clearCache();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("calls TokenReplacer.clearActorLookup()", () => {
    const spy = vi.spyOn(TokenReplacer, "clearActorLookup");
    NPCTokenReplacerController.clearCache();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

});

// ─── Test Group 2: BUG-01 — Actor lookup stale reference guard ──────────────

describe("BUG-01 — ActorImporter.buildActorLookup", () => {
  const UUID = "Compendium.dnd5e.monsters.Actor.goblin";
  let pack;
  let scene;

  beforeEach(() => {
    vi.restoreAllMocks();
    TokenReplacer.clearActorLookup();
    FolderManager.clearCache();
    game.settings.get = vi.fn(() => undefined);
    pack = {
      collection: "dnd5e.monsters", metadata: { packageName: "dnd5e", label: "SRD" },
      getDocument: vi.fn().mockResolvedValue({
        uuid: UUID, name: "Goblin",
        prototypeToken: { toObject: () => ({ name: "Goblin", texture: { src: "goblin.webp" } }) }
      })
    };
    scene = {
      id: "s", tokens: { has: () => true },
      createEmbeddedDocuments: vi.fn(async (t, data) => data),
      deleteEmbeddedDocuments: vi.fn(async () => [])
    };
    game.actors.importFromCompendium = vi.fn().mockResolvedValue({ id: "imported" });
    game.folders.filter = vi.fn(() => []);
    game.folders.has = vi.fn(() => false);
    globalThis.Folder.create = vi.fn().mockResolvedValue({ id: "f" });
  });

  const run = async actors => {
    game.actors[Symbol.iterator] = function* () { yield* actors; };
    game.actors.has = vi.fn(id => actors.some(a => a.id === id));
    ActorImporter.buildActorLookup();
    await TokenReplacer.replaceToken({ id: "t", name: "Goblin", parent: scene }, { name: "Goblin", _id: "goblin" }, pack);
    return scene.createEmbeddedDocuments.mock.calls[0][1][0].actorId;
  };

  it("reuses an actor imported from the same entry (compendiumSource)", async () => {
    expect(await run([{ id: "actor-1", name: "Goblin", _stats: { compendiumSource: UUID }, flags: {} }])).toBe("actor-1");
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
  });

  it("reuses an actor recorded with the legacy flags.core.sourceId", async () => {
    expect(await run([{ id: "actor-2", name: "Goblin", _stats: {}, flags: { core: { sourceId: UUID } } }])).toBe("actor-2");
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
  });

  it("imports when the only same-named actor has no compendium source", async () => {
    expect(await run([{ id: "homebrew", name: "Goblin", _stats: {}, flags: {} }])).toBe("imported");
    expect(game.actors.importFromCompendium).toHaveBeenCalledTimes(1);
  });
});

// ─── Test Group 3: ERR-01 — loadMonsterIndex notification ───────────────────

describe("ERR-01 — CompendiumManager.loadMonsterIndex error notification", () => {

  const createMockPack = (packageName, label, docName = "Actor") => ({
    documentName: docName,
    metadata: { packageName, label },
    collection: `${packageName}.monsters`,
    getIndex: vi.fn(),
    index: { contents: [], size: 0 }
  });

  let mockPacks;

  beforeEach(() => {
    CompendiumManager.clearCache();
    mockPacks = [];
    game.packs.filter = vi.fn(predicate => mockPacks.filter(predicate));
    game.settings.get = vi.fn().mockReturnValue('["all"]');
  });

  it("calls ui.notifications.error when pack.getIndex() throws", async () => {
    const failingPack = createMockPack("dnd-monster-manual", "Monster Manual");
    failingPack.getIndex = vi.fn().mockRejectedValue(new Error("Network error"));
    mockPacks = [failingPack];

    await CompendiumManager.loadMonsterIndex(true);

    expect(ui.notifications.error).toHaveBeenCalled();
    // Verify the notification includes the pack label via game.i18n.format
    expect(game.i18n.format).toHaveBeenCalledWith(
      "NPC_REPLACER.ErrorCompendiumLoad",
      { name: "Monster Manual" }
    );
  });

  it("escapes the pack label in the load-error notification", async () => {
    const failingPack = createMockPack("dnd-monster-manual", "Monster <b>Manual</b>");
    failingPack.getIndex = vi.fn().mockRejectedValue(new Error("x"));
    mockPacks = [failingPack];

    await CompendiumManager.loadMonsterIndex(true);

    expect(game.i18n.format).toHaveBeenCalledWith("NPC_REPLACER.ErrorCompendiumLoad", { name: "Monster &lt;b&gt;Manual&lt;/b&gt;" });
  });

  it("continues loading other packs when one fails", async () => {
    const failingPack = createMockPack("dnd-phandelver-below", "Phandelver");
    failingPack.getIndex = vi.fn().mockRejectedValue(new Error("Corrupt index"));

    const workingPack = createMockPack("dnd-monster-manual", "Monster Manual");
    workingPack.getIndex = vi.fn().mockResolvedValue();
    workingPack.index = {
      contents: [{ name: "Goblin", _id: "gob1" }],
      size: 1
    };

    mockPacks = [failingPack, workingPack];

    const result = await CompendiumManager.loadMonsterIndex(true);

    // Should still have entries from the working pack
    expect(result.length).toBe(1);
    expect(result[0].entry.name).toBe("Goblin");
    // Should have notified about the failing pack
    expect(ui.notifications.error).toHaveBeenCalledTimes(1);
  });

});

describe("ERR-01 — a partially loaded index is not cached", () => {
  beforeEach(() => {
    CompendiumManager.clearCache();
    game.settings.get = vi.fn().mockReturnValue('["all"]');
  });

  // A transient failure during the ready-hook pre-cache must not leave every
  // later run matching against a reduced index until the page is reloaded.
  it("retries the failed pack on the next load instead of reusing the partial index", async () => {
    const pack = (name, entries) => ({
      documentName: "Actor",
      metadata: { packageName: name, label: name },
      collection: `${name}.monsters`,
      getIndex: vi.fn().mockResolvedValue(),
      index: { contents: entries, size: entries.length }
    });
    const flaky = pack("dnd-phandelver-below", [{ name: "Nothic", _id: "n1" }]);
    flaky.getIndex = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue();
    const stable = pack("dnd-monster-manual", [{ name: "Goblin", _id: "g1" }]);
    game.packs.filter = vi.fn(pred => [flaky, stable].filter(pred));

    const first = await CompendiumManager.loadMonsterIndex(true);
    expect(first).toHaveLength(1);

    const second = await CompendiumManager.loadMonsterIndex();
    expect(second).toHaveLength(2);
  });
});

// ─── Test Group 4: ERR-01 — FolderManager notification ─────────────────────

describe("ERR-01 — FolderManager.getOrCreateImportFolder error notification", () => {

  beforeEach(() => {
    FolderManager.clearCache();
    // Mock game.folders as empty (no existing folders)
    game.folders.filter = vi.fn(() => []);
    game.folders.has = vi.fn(() => false);
  });

  it("calls ui.notifications.error when Folder.create throws", async () => {
    // Folder.create should throw
    Folder.create = vi.fn().mockRejectedValue(new Error("Permission denied"));

    const result = await FolderManager.getOrCreateImportFolder();

    expect(result).toBeNull();
    expect(ui.notifications.error).toHaveBeenCalled();
    expect(game.i18n.localize).toHaveBeenCalledWith("NPC_REPLACER.ErrorFolderCreate");
  });

  it("returns null when Folder.create fails", async () => {
    Folder.create = vi.fn().mockRejectedValue(new Error("DB error"));

    const result = await FolderManager.getOrCreateImportFolder();

    expect(result).toBeNull();
  });

});

// ─── Test Group 5: ERR-03 — Per-compendium load error tracking ──────────────

describe("ERR-03 — Per-compendium load error tracking", () => {

  beforeEach(() => {
    CompendiumManager.clearCache();
    ui.notifications.error = vi.fn();
    game.i18n.format = vi.fn((key, data) => `${key}: ${JSON.stringify(data)}`);
  });

  it("getLastLoadErrors returns empty array when no errors occurred", () => {
    expect(CompendiumManager.getLastLoadErrors()).toEqual([]);
  });

  it("records per-pack errors during loadMonsterIndex", async () => {
    // Use a whitelisted WotC packageName so detectWOTCCompendiums accepts it;
    // the pack still simulates a failing getIndex() to trigger error tracking.
    const failingPack = {
      collection: "dnd-monster-manual.monsters",
      metadata: { packageName: "dnd-monster-manual", label: "Broken Pack" },
      documentName: "Actor",
      getIndex: vi.fn().mockRejectedValue(new Error("Network timeout"))
    };

    game.packs.filter = vi.fn(pred => [failingPack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');

    await CompendiumManager.loadMonsterIndex(true);

    const errors = CompendiumManager.getLastLoadErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].packId).toBe("dnd-monster-manual.monsters");
    expect(errors[0].packLabel).toBe("Broken Pack");
    expect(errors[0].error).toBe("Network timeout");
  });

  it("resets errors on each loadMonsterIndex call", async () => {
    // First call with failure — use whitelisted package so detection picks it up.
    const failingPack = {
      collection: "dnd-monster-manual.monsters",
      metadata: { packageName: "dnd-monster-manual", label: "Broken Pack" },
      documentName: "Actor",
      getIndex: vi.fn().mockRejectedValue(new Error("fail"))
    };
    game.packs.filter = vi.fn(pred => [failingPack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');

    await CompendiumManager.loadMonsterIndex(true);
    expect(CompendiumManager.getLastLoadErrors()).toHaveLength(1);

    // Second call with success (no packs)
    CompendiumManager.clearCache();
    game.packs.filter = vi.fn(() => []);
    await CompendiumManager.loadMonsterIndex(true);
    expect(CompendiumManager.getLastLoadErrors()).toEqual([]);
  });

  it("clearCache resets lastLoadErrors", async () => {
    const failingPack = {
      collection: "dnd-monster-manual.monsters",
      metadata: { packageName: "dnd-monster-manual", label: "Broken Pack" },
      documentName: "Actor",
      getIndex: vi.fn().mockRejectedValue(new Error("fail"))
    };
    game.packs.filter = vi.fn(pred => [failingPack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');

    await CompendiumManager.loadMonsterIndex(true);
    expect(CompendiumManager.getLastLoadErrors()).toHaveLength(1);

    CompendiumManager.clearCache();
    expect(CompendiumManager.getLastLoadErrors()).toEqual([]);
  });

  it("getDebugAPI exposes getLastLoadErrors", () => {
    const api = NPCTokenReplacerController.getDebugAPI();
    expect(typeof api.getLastLoadErrors).toBe("function");
  });

  it("getLastLoadErrors returns a copy, not the original array", () => {
    const errors1 = CompendiumManager.getLastLoadErrors();
    const errors2 = CompendiumManager.getLastLoadErrors();
    expect(errors1).not.toBe(errors2);  // Different array references
    expect(errors1).toEqual(errors2);   // Same content
  });

});

// ─── Test Group 6: ERR-02 — Failure classification end-to-end ───────────────

describe("ERR-02 — Failure classification via replaceNPCTokens", () => {

  // Helper to create a minimal mock token
  const createMockToken = (id, name) => ({
    id,
    name,
    actor: { name, type: "npc" }
  });

  // Helper to set up a mock pack and index for one creature
  const setupMockIndex = (creatureName) => {
    const mockPack = {
      collection: "dnd5e.monsters",
      metadata: { packageName: "dnd5e", label: "Monsters" },
      documentName: "Actor",
      getIndex: vi.fn().mockResolvedValue(),
      index: {
        contents: [{ name: creatureName, _id: "entry-1" }],
        size: 1
      }
    };
    return mockPack;
  };

  beforeEach(() => {
    // Reset all caches
    CompendiumManager.clearCache();
    TokenReplacer.clearActorLookup();

    // Reset notification mocks
    ui.notifications.info = vi.fn();
    ui.notifications.warn = vi.fn();
    ui.notifications.error = vi.fn();
    game.i18n.format = vi.fn((key, data) => `${key}: ${JSON.stringify(data)}`);
    game.i18n.localize = vi.fn((key) => key);

    // Mock game.user as GM
    game.user.isGM = true;

    // Mock empty game.actors iterator
    game.actors[Symbol.iterator] = function* () {};

    // Ensure canvas.scene exists with tokens.has
    canvas.scene = canvas.scene || {};
    canvas.scene.tokens = canvas.scene.tokens || {};
    canvas.scene.tokens.has = vi.fn(() => true);
  });

  it("classifies import error and shows SummaryPartialFailure notification", async () => {
    const mockPack = setupMockIndex("Goblin");

    // Mock CompendiumManager to return enabled packs and index
    game.packs.filter = vi.fn(pred => [mockPack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');

    // Pre-load index so replaceNPCTokens finds it
    await CompendiumManager.loadMonsterIndex(true);

    // Mock CompendiumManager.detectWOTCCompendiums (needed by validatePrerequisites)
    const detectSpy = vi.spyOn(CompendiumManager, "detectWOTCCompendiums").mockReturnValue([mockPack]);

    // Mock TokenReplacer.getNPCTokensToProcess to return one token
    const mockToken = createMockToken("token-1", "Goblin");
    const getNPCSpy = vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({
      tokens: [mockToken],
      isSelection: false
    });

    // Mock showPreviewDialog to auto-confirm
    const dialogSpy = vi.spyOn(PreviewDialog, "confirm").mockResolvedValue(true);

    // Mock TokenReplacer.replaceToken to throw an import error
    const replaceSpy = vi.spyOn(TokenReplacer, "replaceToken")
      .mockRejectedValue(new TokenReplacerError("Failed to import actor from compendium", "import_failed"));

    // Run the full flow
    await NPCTokenReplacerController.replaceNPCTokens();

    // Verify SummaryPartialFailure was shown via ui.notifications.error
    expect(ui.notifications.error).toHaveBeenCalled();
    const errorCalls = ui.notifications.error.mock.calls;
    const summaryCall = errorCalls.find(call =>
      typeof call[0] === "string" && call[0].includes("SummaryPartialFailure")
    );
    expect(summaryCall).toBeTruthy();

    // Verify game.i18n.format was called with SummaryPartialFailure key and import failure count
    expect(game.i18n.format).toHaveBeenCalledWith(
      "NPC_REPLACER.SummaryPartialFailure",
      expect.objectContaining({
        importFailed: 1,
        creationFailed: 0
      })
    );

    // Cleanup spies
    detectSpy.mockRestore();
    getNPCSpy.mockRestore();
    dialogSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it("classifies creation error and shows SummaryPartialFailure notification", async () => {
    const mockPack = setupMockIndex("Dragon");

    game.packs.filter = vi.fn(pred => [mockPack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');

    await CompendiumManager.loadMonsterIndex(true);

    const detectSpy = vi.spyOn(CompendiumManager, "detectWOTCCompendiums").mockReturnValue([mockPack]);

    const mockToken = createMockToken("token-2", "Dragon");
    const getNPCSpy = vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({
      tokens: [mockToken],
      isSelection: false
    });

    const dialogSpy = vi.spyOn(PreviewDialog, "confirm").mockResolvedValue(true);

    // Mock TokenReplacer.replaceToken to throw a creation error (no "import" keyword)
    const replaceSpy = vi.spyOn(TokenReplacer, "replaceToken")
      .mockRejectedValue(new TokenReplacerError("Failed to create new token for Dragon", "creation_failed"));

    await NPCTokenReplacerController.replaceNPCTokens();

    // Verify classified as creation_failed
    expect(game.i18n.format).toHaveBeenCalledWith(
      "NPC_REPLACER.SummaryPartialFailure",
      expect.objectContaining({
        importFailed: 0,
        creationFailed: 1
      })
    );

    detectSpy.mockRestore();
    getNPCSpy.mockRestore();
    dialogSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it("classifies mixed import and creation failures correctly", async () => {
    const mockPack = setupMockIndex("Goblin");
    // Add a second creature to index
    mockPack.index.contents.push({ name: "Skeleton", _id: "entry-2" });
    mockPack.index.size = 2;

    game.packs.filter = vi.fn(pred => [mockPack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');

    await CompendiumManager.loadMonsterIndex(true);

    const detectSpy = vi.spyOn(CompendiumManager, "detectWOTCCompendiums").mockReturnValue([mockPack]);

    const token1 = createMockToken("token-3", "Goblin");
    const token2 = createMockToken("token-4", "Skeleton");
    const getNPCSpy = vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({
      tokens: [token1, token2],
      isSelection: false
    });

    const dialogSpy = vi.spyOn(PreviewDialog, "confirm").mockResolvedValue(true);

    // First token: import error; Second token: creation error
    const replaceSpy = vi.spyOn(TokenReplacer, "replaceToken")
      .mockRejectedValueOnce(new TokenReplacerError("Failed to import actor", "import_failed"))
      .mockRejectedValueOnce(new TokenReplacerError("Failed to create new token", "creation_failed"));

    await NPCTokenReplacerController.replaceNPCTokens();

    // Verify both types of failures are counted
    expect(game.i18n.format).toHaveBeenCalledWith(
      "NPC_REPLACER.SummaryPartialFailure",
      expect.objectContaining({
        importFailed: 1,
        creationFailed: 1
      })
    );

    detectSpy.mockRestore();
    getNPCSpy.mockRestore();
    dialogSpy.mockRestore();
    replaceSpy.mockRestore();
  });

});

describe("replaceNPCTokens loop bookkeeping", () => {
  const goblinPack = () => ({
    collection: "dnd5e.monsters",
    metadata: { packageName: "dnd5e", label: "Monsters" },
    documentName: "Actor",
    getIndex: vi.fn().mockResolvedValue(),
    index: { contents: [{ name: "Goblin", _id: "entry-1" }], size: 1 }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    CompendiumManager.clearCache();
    TokenReplacer.clearActorLookup();
    ui.notifications.info = vi.fn();
    ui.notifications.warn = vi.fn();
    ui.notifications.error = vi.fn();
    game.i18n.format = vi.fn((key, data) => `${key}: ${JSON.stringify(data)}`);
    game.i18n.localize = vi.fn(key => key);
    game.user.isGM = true;
    game.actors[Symbol.iterator] = function* () {};
    canvas.scene = canvas.scene || {};
    canvas.scene.tokens = canvas.scene.tokens || {};
    canvas.scene.tokens.has = vi.fn(() => true);

    const pack = goblinPack();
    game.packs.filter = vi.fn(pred => [pack].filter(pred));
    game.settings.get = vi.fn().mockReturnValue('["all"]');
    await CompendiumManager.loadMonsterIndex(true);
    vi.spyOn(CompendiumManager, "detectWOTCCompendiums").mockReturnValue([pack]);
    vi.spyOn(PreviewDialog, "confirm").mockResolvedValue(true);
  });

  const runWith = async (tokens) => {
    vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({ tokens, isSelection: false });
    await NPCTokenReplacerController.replaceNPCTokens();
  };

  // A delete failure still counts as replaced (the new token exists), so it
  // must not be counted a second time in the progress total.
  it("never reports more processed tokens than were queued", async () => {
    const update = vi.spyOn(ProgressReporter.prototype, "update");
    vi.spyOn(TokenReplacer, "replaceToken")
      .mockRejectedValue(new TokenReplacerError("old token stuck", "delete_failed"));

    await runWith([
      { id: "t1", name: "Goblin", actor: { name: "Goblin", type: "npc" } },
      { id: "t2", name: "Goblin", actor: { name: "Goblin", type: "npc" } }
    ]);

    // update() also reports the matching phase, so assert the bound, not a sequence
    const counts = update.mock.calls.map(([processed]) => processed);
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
  });

  it("checks token existence on the token's own scene, not the viewed one", async () => {
    canvas.scene.tokens.has = vi.fn(() => false); // GM switched to another scene
    const ownScene = { tokens: { has: vi.fn(() => true) } };
    const replace = vi.spyOn(TokenReplacer, "replaceToken").mockResolvedValue({ id: "new" });

    await runWith([{ id: "t1", name: "Goblin", actor: { name: "Goblin", type: "npc" }, parent: ownScene }]);

    expect(replace).toHaveBeenCalledTimes(1);
  });
});


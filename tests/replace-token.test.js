import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenReplacer, TokenReplacerError } from "../scripts/main.js";

/**
 * TokenReplacer.replaceToken Unit Tests
 *
 * Tests token replacement lifecycle: compendium document loading,
 * actor import/reuse, token creation, and old token deletion.
 * Validates error classification (import_failed, creation_failed, delete_failed)
 * and property preservation.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockTokenDoc(overrides = {}) {
  return {
    id: "token-old-1",
    name: "Goblin",
    x: 400,
    y: 300,
    elevation: 5,
    width: 1,
    height: 1,
    hidden: false,
    rotation: 90,
    disposition: 1,
    locked: true,
    alpha: 0.8,
    actor: { name: "Goblin", type: "npc" },
    ...overrides
  };
}

function createMockCompendiumActor(name = "Goblin") {
  return {
    id: "comp-actor-1",
    uuid: "Compendium.dnd5e.monsters.Item.goblin-uuid",
    name,
    img: "icons/goblin-portrait.webp",
    prototypeToken: {
      toObject: () => ({
        name,
        texture: { src: `tokens/${name.toLowerCase()}.webp` },
        sight: {},
        bar1: {},
        bar2: {}
      })
    }
  };
}

function createMockPack() {
  return {
    collection: "dnd5e.monsters",
    metadata: { packageName: "dnd5e", label: "Monsters" },
    documentName: "Actor",
    getDocument: vi.fn()
  };
}

function createMockWorldActor(name = "Goblin") {
  return {
    id: "world-actor-1",
    name,
    _stats: { compendiumSource: "Compendium.dnd5e.monsters.Item.goblin-uuid" },
    flags: {}
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TokenReplacer.replaceToken", () => {

  let mockPack;
  let mockCompendiumActor;
  let mockWorldActor;
  let mockTokenDoc;
  const compendiumEntry = { name: "Goblin", _id: "entry-1" };
  let createdToken;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Reset caches
    TokenReplacer.clearActorLookup();
    TokenReplacer.resetCounter();

    mockPack = createMockPack();
    mockCompendiumActor = createMockCompendiumActor();
    mockWorldActor = createMockWorldActor();
    mockTokenDoc = createMockTokenDoc();
    createdToken = { id: "token-new-1", name: "Goblin" };

    // Mock pack.getDocument to return compendium actor
    mockPack.getDocument = vi.fn().mockResolvedValue(mockCompendiumActor);

    // Mock game.actors with importFromCompendium and iteration
    game.actors.importFromCompendium = vi.fn().mockResolvedValue(mockWorldActor);
    game.actors.has = vi.fn(() => false);
    game.actors[Symbol.iterator] = function* () {};

    // Mock game.folders for FolderManager
    game.folders.filter = vi.fn(() => []);
    game.folders.has = vi.fn(() => false);

    // Mock Folder.create for getOrCreateImportFolder
    globalThis.Folder.create = vi.fn().mockResolvedValue({ id: "folder-1", name: "MonsterManual" });

    // Mock canvas.scene for token creation/deletion
    canvas.scene.createEmbeddedDocuments = vi.fn().mockResolvedValue([createdToken]);
    canvas.scene.deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
    canvas.scene.tokens = canvas.scene.tokens || {};
    canvas.scene.tokens.has = vi.fn(() => true);

    // Mock game.settings for wildcard resolver variation mode
    game.settings.get = vi.fn().mockReturnValue("random");
  });

  // ─── Successful replacement ───────────────────────────────────────────────

  it("creates new token and deletes old one on success", async () => {
    await TokenReplacer.replaceToken(mockTokenDoc, compendiumEntry, mockPack);

    expect(canvas.scene.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith("Token", [expect.any(Object)]);
    expect(canvas.scene.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(canvas.scene.deleteEmbeddedDocuments).toHaveBeenCalledWith("Token", [mockTokenDoc.id]);
  });

  // ─── Creation failure ─────────────────────────────────────────────────────

  it("throws TokenReplacerError with phase 'creation_failed' when createEmbeddedDocuments throws", async () => {
    canvas.scene.createEmbeddedDocuments = vi.fn().mockRejectedValue(new Error("Canvas error"));

    try {
      await TokenReplacer.replaceToken(mockTokenDoc, compendiumEntry, mockPack);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenReplacerError);
      expect(error.phase).toBe("creation_failed");
    }

    // Original token should NOT be deleted
    expect(canvas.scene.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  // ─── Delete failure ───────────────────────────────────────────────────────

  it("throws TokenReplacerError with phase 'delete_failed' when deleteEmbeddedDocuments throws after successful creation", async () => {
    canvas.scene.deleteEmbeddedDocuments = vi.fn().mockRejectedValue(new Error("Delete error"));

    try {
      await TokenReplacer.replaceToken(mockTokenDoc, compendiumEntry, mockPack);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenReplacerError);
      expect(error.phase).toBe("delete_failed");
    }

    // New token WAS created before delete failed
    expect(canvas.scene.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  // ─── Preserves token properties ───────────────────────────────────────────

  it("preserves x, y, elevation, and other properties in createEmbeddedDocuments call", async () => {
    await TokenReplacer.replaceToken(mockTokenDoc, compendiumEntry, mockPack);

    const createCall = canvas.scene.createEmbeddedDocuments.mock.calls[0];
    const tokenData = createCall[1][0]; // First argument is "Token", second is array of token data

    expect(tokenData.x).toBe(400);
    expect(tokenData.y).toBe(300);
    expect(tokenData.elevation).toBe(5);
    expect(tokenData.width).toBe(1);
    expect(tokenData.height).toBe(1);
    expect(tokenData.hidden).toBe(false);
    expect(tokenData.rotation).toBe(90);
    expect(tokenData.disposition).toBe(1);
    expect(tokenData.locked).toBe(true);
    expect(tokenData.alpha).toBe(0.8);
  });

  // ─── Reuses imported actor ────────────────────────────────────────────────

  it("reuses existing world actor instead of importing again", async () => {
    // Build actor lookup with existing world actor mapped to compendium UUID
    const existingActor = createMockWorldActor();
    game.actors.has = vi.fn(() => true);
    game.actors[Symbol.iterator] = function* () {
      yield existingActor;
    };

    // Build the lookup so replaceToken finds the existing actor
    TokenReplacer.buildActorLookup();

    // Mock the lookup to return actor for this UUID
    // The actor lookup is keyed by compendium UUID
    // We need to ensure the compendium actor's uuid matches
    existingActor._stats = { compendiumSource: mockCompendiumActor.uuid };

    // Rebuild after setting correct source
    TokenReplacer.clearActorLookup();
    TokenReplacer.buildActorLookup();

    await TokenReplacer.replaceToken(mockTokenDoc, compendiumEntry, mockPack);

    // Should NOT have called importFromCompendium since actor already exists
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
    // Should still create the new token
    expect(canvas.scene.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

});

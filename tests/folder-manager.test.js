import { describe, it, expect, beforeEach, vi } from "vitest";
import { FolderManager } from "../scripts/main.js";

/**
 * FolderManager.getFolderPath Unit Tests
 *
 * Tests path generation from mock folder objects with various nesting levels.
 * FolderManager uses a simple traversal of folder.folder parent references.
 */

describe("FolderManager.getFolderPath", () => {

  it("returns empty string for null input", () => {
    expect(FolderManager.getFolderPath(null)).toBe("");
  });

  it("returns '/FolderName' for a root folder (no parent)", () => {
    const folder = { name: "Monsters", folder: null };
    expect(FolderManager.getFolderPath(folder)).toBe("/Monsters");
  });

  it("returns '/Parent/Child' for nested folders", () => {
    const folder = {
      name: "Goblins",
      folder: { name: "Monsters", folder: null }
    };
    expect(FolderManager.getFolderPath(folder)).toBe("/Monsters/Goblins");
  });

  it("returns '/A/B/C' for deeply nested folders", () => {
    const folder = {
      name: "C",
      folder: {
        name: "B",
        folder: {
          name: "A",
          folder: null
        }
      }
    };
    expect(FolderManager.getFolderPath(folder)).toBe("/A/B/C");
  });

});

describe("FolderManager.getOrCreateImportFolder", () => {

  beforeEach(() => {
    FolderManager.clearCache();
    game.folders.has = vi.fn(() => false);
    globalThis.Folder.create = vi.fn(data => Promise.resolve({ id: "new-folder", ...data }));
  });

  // Folder documents store their parent in the `folder` field; `parent` is not
  // part of the schema and is silently dropped, landing the folder at the root.
  it("nests the new folder under a matching monster folder via the `folder` field", async () => {
    const monsters = { id: "monsters-id", name: "Monsters", type: "Actor", folder: null };
    game.folders.filter = vi.fn(pred => [monsters].filter(pred));

    await FolderManager.getOrCreateImportFolder();

    const data = Folder.create.mock.calls[0][0];
    expect(data.folder).toBe("monsters-id");
    expect(data).not.toHaveProperty("parent");
  });

  it("creates the folder at the root when no monster folder exists", async () => {
    game.folders.filter = vi.fn(pred => [].filter(pred));

    await FolderManager.getOrCreateImportFolder();

    expect(Folder.create.mock.calls[0][0].folder).toBeNull();
  });
});

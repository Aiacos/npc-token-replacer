import { describe, it, expect } from "vitest";
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

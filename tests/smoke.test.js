/**
 * Test Infrastructure Smoke Test
 *
 * Validates that the test infrastructure is correctly configured:
 * - foundry-test-utils provides expected Foundry globals
 * - Project-specific mocks extend the globals as needed
 * - Vitest globals (describe, it, expect, vi) are available
 */

describe("Test Infrastructure Smoke Test", () => {

  describe("foundry-test-utils globals", () => {

    it("provides game global", () => {
      expect(game).toBeDefined();
      expect(game.settings).toBeDefined();
      expect(game.i18n).toBeDefined();
    });

    it("provides ui global", () => {
      expect(ui).toBeDefined();
      expect(ui.notifications).toBeDefined();
    });

    it("provides Hooks global", () => {
      expect(Hooks).toBeDefined();
      expect(typeof Hooks.on).toBe("function");
    });

  });

  describe("project-specific mocks", () => {

    it("provides game.packs", () => {
      expect(game.packs).toBeDefined();
      expect(typeof game.packs.filter).toBe("function");
      expect(typeof game.packs.get).toBe("function");
    });

    it("provides FilePicker", () => {
      expect(FilePicker).toBeDefined();
      expect(typeof FilePicker.browse).toBe("function");
    });

  });

  describe("Vitest globals", () => {

    it("are available without explicit imports", () => {
      expect(typeof describe).toBe("function");
      expect(typeof it).toBe("function");
      expect(typeof expect).toBe("function");
      expect(vi).toBeDefined();
      expect(typeof vi.fn).toBe("function");
    });

  });

});

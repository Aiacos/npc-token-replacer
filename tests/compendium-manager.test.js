import { describe, it, expect, beforeEach, vi } from "vitest";
import { CompendiumManager } from "../scripts/main.js";

/**
 * CompendiumManager Unit Tests
 *
 * Tests compendium detection, priority resolution, enabled-compendium filtering,
 * and cache behavior. CompendiumManager remains in scripts/main.js (not extracted
 * to scripts/lib/) because it depends on Foundry globals (game.packs, game.settings).
 *
 * CRITICAL mock pattern: game.packs.filter uses callback-execution
 * (predicate => mockPacks.filter(predicate)) to validate actual filtering logic.
 */

const createMockPack = (packageName, label, docName = "Actor") => ({
  documentName: docName,
  metadata: { packageName, label },
  collection: `${packageName}.monsters`
});

let mockPacks = [];

beforeEach(() => {
  CompendiumManager.clearCache();
  // CRITICAL: must execute the predicate, not return static data
  game.packs.filter = vi.fn(predicate => mockPacks.filter(predicate));
  game.settings.get = vi.fn();
  mockPacks = [];
});

// ─── Test Group 1: getCompendiumPriority ──────────────────────────────────────

describe("CompendiumManager", () => {

  describe("getCompendiumPriority", () => {

    it("returns priority 1 for known SRD package (dnd5e)", () => {
      const pack = createMockPack("dnd5e", "SRD Monsters");
      expect(CompendiumManager.getCompendiumPriority(pack)).toBe(1);
    });

    it("returns priority 2 for known Core package (dnd-monster-manual)", () => {
      const pack = createMockPack("dnd-monster-manual", "Monster Manual");
      expect(CompendiumManager.getCompendiumPriority(pack)).toBe(2);
    });

    it("returns priority 3 for known Expansion package (dnd-forge-artificer)", () => {
      const pack = createMockPack("dnd-forge-artificer", "Forge of Artificer");
      expect(CompendiumManager.getCompendiumPriority(pack)).toBe(3);
    });

    it("returns priority 4 for known Adventure package (dnd-phandelver-below)", () => {
      const pack = createMockPack("dnd-phandelver-below", "Phandelver Below");
      expect(CompendiumManager.getCompendiumPriority(pack)).toBe(4);
    });

    it("defaults to priority 1 for unknown dnd- prefix packages (not in whitelist)", () => {
      // Since 1.6.0, only the 11 official WotC packages are recognised; anything
      // else (including dnd-* homebrew or legacy books not on Foundry) falls
      // back to priority 1.
      const pack = createMockPack("dnd-unknown-adventure", "Unknown Adventure");
      expect(CompendiumManager.getCompendiumPriority(pack)).toBe(1);
    });

    it("defaults to priority 1 for non-dnd packages", () => {
      const pack = createMockPack("homebrew-pack", "Homebrew Monsters");
      expect(CompendiumManager.getCompendiumPriority(pack)).toBe(1);
    });

  });

  // ─── Test Group 2: detectWOTCCompendiums ──────────────────────────────────

  describe("detectWOTCCompendiums", () => {

    it("includes Actor compendiums from the whitelist (dnd-monster-manual)", () => {
      mockPacks = [createMockPack("dnd-monster-manual", "Monster Manual")];
      const result = CompendiumManager.detectWOTCCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].metadata.label).toBe("Monster Manual");
    });

    it("includes Actor compendiums from the whitelist (dnd5e)", () => {
      mockPacks = [createMockPack("dnd5e", "SRD Monsters")];
      const result = CompendiumManager.detectWOTCCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].metadata.label).toBe("SRD Monsters");
    });

    it("excludes non-Actor compendiums even when the package is whitelisted", () => {
      mockPacks = [
        createMockPack("dnd-monster-manual", "Monster Manual"),
        createMockPack("dnd-monster-manual", "MM Items", "Item")
      ];
      const result = CompendiumManager.detectWOTCCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].metadata.label).toBe("Monster Manual");
    });

    it("excludes non-WotC compendiums", () => {
      mockPacks = [
        createMockPack("dnd-monster-manual", "Monster Manual"),
        createMockPack("homebrew-monsters", "Homebrew")
      ];
      const result = CompendiumManager.detectWOTCCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].metadata.label).toBe("Monster Manual");
    });

    it("excludes legacy non-WotC dnd- packages (e.g. VGM, MToF, Fizban, Strahd)", () => {
      // These books exist on D&D Beyond / legacy sources but are NOT published
      // by WotC on Foundry VTT, so they must be rejected by the whitelist.
      mockPacks = [
        createMockPack("dnd-monster-manual", "Monster Manual"),
        createMockPack("dnd-volos-guide-to-monsters", "Volo's Guide"),
        createMockPack("dnd-mordenkainens-tome-of-foes", "MToF"),
        createMockPack("dnd-fizbans-treasury-of-dragons", "Fizban"),
        createMockPack("dnd-curse-of-strahd-revamped", "Strahd"),
        createMockPack("ddb-monster-manual", "DDB-Importer MM")
      ];
      const result = CompendiumManager.detectWOTCCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0].metadata.label).toBe("Monster Manual");
    });

    it("returns cached results on second call", () => {
      mockPacks = [createMockPack("dnd-monster-manual", "Monster Manual")];
      CompendiumManager.detectWOTCCompendiums();
      CompendiumManager.detectWOTCCompendiums();
      // game.packs.filter should only be called once (cache hit on second)
      expect(game.packs.filter).toHaveBeenCalledTimes(1);
    });

    it("correctly filters mixed collection of packs", () => {
      mockPacks = [
        createMockPack("dnd-monster-manual", "Monster Manual"),
        createMockPack("dnd5e", "SRD Monsters"),
        createMockPack("dnd-phandelver-below", "Phandelver"),
        createMockPack("dnd-forge-artificer", "Forge Items", "Item"),
        createMockPack("homebrew-monsters", "Homebrew"),
        createMockPack("other-module", "Other", "JournalEntry")
      ];
      const result = CompendiumManager.detectWOTCCompendiums();
      // Only Actor packs whose packageName is in OFFICIAL_WOTC_PACKAGES
      expect(result).toHaveLength(3);
      const labels = result.map(p => p.metadata.label);
      expect(labels).toContain("Monster Manual");
      expect(labels).toContain("SRD Monsters");
      expect(labels).toContain("Phandelver");
    });

  });

  // ─── Test Group 3: getEnabledCompendiums ──────────────────────────────────

  describe("getEnabledCompendiums", () => {

    const corePack = createMockPack("dnd-monster-manual", "Monster Manual");       // priority 2
    const adventurePack = createMockPack("dnd-phandelver-below", "Phandelver");    // priority 4
    const srdPack = createMockPack("dnd5e", "SRD Monsters");                       // priority 1

    beforeEach(() => {
      CompendiumManager.clearCache();
      mockPacks = [corePack, adventurePack, srdPack];
      game.packs.filter = vi.fn(pred => mockPacks.filter(pred));
    });

    it('"default" mode includes only priority 1-2 (SRD + Core)', () => {
      game.settings.get = vi.fn().mockReturnValue('["default"]');
      const result = CompendiumManager.getEnabledCompendiums();
      expect(result).toContain(corePack);
      expect(result).toContain(srdPack);
      expect(result).not.toContain(adventurePack);
    });

    it('"all" mode includes every detected compendium', () => {
      game.settings.get = vi.fn().mockReturnValue('["all"]');
      const result = CompendiumManager.getEnabledCompendiums();
      expect(result).toHaveLength(3);
      expect(result).toContain(corePack);
      expect(result).toContain(adventurePack);
      expect(result).toContain(srdPack);
    });

    it("specific pack IDs filter to selected packs only", () => {
      game.settings.get = vi.fn().mockReturnValue('["dnd-phandelver-below.monsters"]');
      const result = CompendiumManager.getEnabledCompendiums();
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(adventurePack);
    });

    it("settings retrieval error falls back to default packs with notification", () => {
      game.settings.get = vi.fn(() => { throw new Error("Settings unavailable"); });
      const result = CompendiumManager.getEnabledCompendiums();
      // Should fall back to priority <= 2 packs
      expect(result).toContain(corePack);
      expect(result).toContain(srdPack);
      expect(result).not.toContain(adventurePack);
      // Should notify the user
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it("corrupt JSON string triggers parse error with notification", () => {
      game.settings.get = vi.fn().mockReturnValue("{broken json");
      const result = CompendiumManager.getEnabledCompendiums();
      // Should fall back to default (["default"] -> priority <= 2)
      expect(result).toContain(corePack);
      expect(result).toContain(srdPack);
      expect(result).not.toContain(adventurePack);
      // Should notify about parse error
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it("undefined setting falls back to default behavior", () => {
      game.settings.get = vi.fn().mockReturnValue(undefined);
      const result = CompendiumManager.getEnabledCompendiums();
      expect(result).toContain(corePack);
      expect(result).toContain(srdPack);
      expect(result).not.toContain(adventurePack);
    });

    it("empty array setting falls back to default behavior", () => {
      game.settings.get = vi.fn().mockReturnValue("[]");
      const result = CompendiumManager.getEnabledCompendiums();
      expect(result).toContain(corePack);
      expect(result).toContain(srdPack);
      expect(result).not.toContain(adventurePack);
    });

    it("multiple specific pack IDs filter correctly", () => {
      game.settings.get = vi.fn().mockReturnValue(
        '["dnd-monster-manual.monsters", "dnd-phandelver-below.monsters"]'
      );
      const result = CompendiumManager.getEnabledCompendiums();
      expect(result).toHaveLength(2);
      expect(result).toContain(corePack);
      expect(result).toContain(adventurePack);
      expect(result).not.toContain(srdPack);
    });

  });

  // ─── Test Group 4: clearCache ─────────────────────────────────────────────

  describe("clearCache", () => {

    it("after clearCache, detectWOTCCompendiums re-reads game.packs", () => {
      // First call: one pack
      mockPacks = [createMockPack("dnd-monster-manual", "Monster Manual")];
      const first = CompendiumManager.detectWOTCCompendiums();
      expect(first).toHaveLength(1);

      // Clear cache and change mock data
      CompendiumManager.clearCache();
      mockPacks = [
        createMockPack("dnd-monster-manual", "Monster Manual"),
        createMockPack("dnd5e", "SRD Monsters")
      ];

      // Second call should see new data
      const second = CompendiumManager.detectWOTCCompendiums();
      expect(second).toHaveLength(2);
    });

    it("after clearCache, getEnabledCompendiums re-reads settings", () => {
      // First call: "all" mode
      mockPacks = [
        createMockPack("dnd-monster-manual", "Monster Manual"),
        createMockPack("dnd-phandelver-below", "Phandelver")
      ];
      game.settings.get = vi.fn().mockReturnValue('["all"]');
      const first = CompendiumManager.getEnabledCompendiums();
      expect(first).toHaveLength(2);

      // Clear cache and change to default mode
      CompendiumManager.clearCache();
      game.settings.get = vi.fn().mockReturnValue('["default"]');
      const second = CompendiumManager.getEnabledCompendiums();
      // Default only includes priority <= 2 (Monster Manual = 2, but not Phandelver = 4)
      expect(second).toHaveLength(1);
      expect(second[0].metadata.label).toBe("Monster Manual");
    });

  });

  // ─── Test Group 5: Static getters and cache utility methods ───────────────

  describe("static getters", () => {

    it("OFFICIAL_WOTC_PACKAGES returns the 11 official WotC packages", () => {
      expect(CompendiumManager.OFFICIAL_WOTC_PACKAGES).toEqual([
        "dnd5e",
        "dnd-monster-manual",
        "dnd-players-handbook",
        "dnd-dungeon-masters-guide",
        "dnd-forge-artificer",
        "dnd-tashas-cauldron",
        "dnd-phandelver-below",
        "dnd-tomb-annihilation",
        "dnd-adventures-faerun",
        "dnd-heroes-faerun",
        "dnd-heroes-borderlands"
      ]);
    });

    it("WOTC_MODULE_PREFIXES (deprecated) still returns legacy prefixes for backward compat", () => {
      expect(CompendiumManager.WOTC_MODULE_PREFIXES).toEqual(["dnd-", "dnd5e"]);
    });

    it("COMPENDIUM_PRIORITIES includes all 11 official WotC packages", () => {
      const priorities = CompendiumManager.COMPENDIUM_PRIORITIES;
      expect(priorities["dnd5e"]).toBe(1);
      expect(priorities["dnd-tashas-cauldron"]).toBe(1);
      expect(priorities["dnd-monster-manual"]).toBe(2);
      expect(priorities["dnd-players-handbook"]).toBe(2);
      expect(priorities["dnd-dungeon-masters-guide"]).toBe(2);
      expect(priorities["dnd-forge-artificer"]).toBe(3);
      expect(priorities["dnd-phandelver-below"]).toBe(4);
      expect(priorities["dnd-tomb-annihilation"]).toBe(4);
      expect(priorities["dnd-adventures-faerun"]).toBe(4);
      expect(priorities["dnd-heroes-faerun"]).toBe(4);
      expect(priorities["dnd-heroes-borderlands"]).toBe(4);
    });

    it("COMPENDIUM_PRIORITIES does not include non-WotC legacy packages", () => {
      const priorities = CompendiumManager.COMPENDIUM_PRIORITIES;
      expect(priorities["dnd-volos-guide-to-monsters"]).toBeUndefined();
      expect(priorities["dnd-mordenkainens-tome-of-foes"]).toBeUndefined();
      expect(priorities["dnd-fizbans-treasury-of-dragons"]).toBeUndefined();
      expect(priorities["dnd-curse-of-strahd-revamped"]).toBeUndefined();
      expect(priorities["dnd-icewind-dale"]).toBeUndefined();
      expect(priorities["dnd-monsters-of-the-multiverse"]).toBeUndefined();
    });

    it("PRIORITY_LABELS maps priority numbers to labels", () => {
      const labels = CompendiumManager.PRIORITY_LABELS;
      expect(labels[1]).toBe("FALLBACK");
      expect(labels[2]).toBe("CORE");
      expect(labels[3]).toBe("EXPANSION");
      expect(labels[4]).toBe("ADVENTURE");
    });

    it("isIndexCached returns false when no index loaded", () => {
      expect(CompendiumManager.isIndexCached()).toBe(false);
    });

    it("getCacheSize returns 0 when no index loaded", () => {
      expect(CompendiumManager.getCacheSize()).toBe(0);
    });

    it("getIndexMap returns null when no index loaded", () => {
      expect(CompendiumManager.getIndexMap()).toBeNull();
    });

  });

});

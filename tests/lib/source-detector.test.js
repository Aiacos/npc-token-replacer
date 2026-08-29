import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SourceDetector, PRIORITY, TIER } from "../../scripts/lib/source-detector.js";

/**
 * SourceDetector Unit Tests
 *
 * The detector must recognise official D&D content from package *signals*
 * rather than a maintained list, so these tests cover packages that are not in
 * the known-priority table at all.
 */

const pack = (packageName, { packageType = "", collection } = {}) => ({
  documentName: "Actor",
  metadata: { packageName, packageType, label: packageName },
  collection: collection ?? `${packageName}.monsters`
});

let modules;

beforeEach(() => {
  modules = new Map();
  globalThis.game.modules = { get: id => modules.get(id) ?? null };
  globalThis.game.system = { id: "dnd5e" };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SourceDetector.classify", () => {

  describe("tier recognition", () => {

    it("treats the active game system as the SRD baseline", () => {
      const result = SourceDetector.classify(pack("dnd5e", { packageType: "system" }));
      expect(result.tier).toBe(TIER.SYSTEM);
      expect(result.official).toBe(true);
      expect(result.priority).toBe(PRIORITY.FALLBACK);
    });

    it("recognises the official dnd- package prefix", () => {
      const result = SourceDetector.classify(pack("dnd-monster-manual"));
      expect(result.tier).toBe(TIER.OFFICIAL);
      expect(result.official).toBe(true);
    });

    it("recognises a WotC-authored module that does NOT use the prefix", () => {
      modules.set("greyhawk-gazetteer", {
        authors: [{ name: "Wizards of the Coast" }],
        packs: [{ type: "Actor" }]
      });
      const result = SourceDetector.classify(pack("greyhawk-gazetteer"));
      expect(result.tier).toBe(TIER.OFFICIAL);
      expect(result.official).toBe(true);
    });

    it("recognises premium content built for the active system as a non-official tier", () => {
      modules.set("third-party-bestiary", {
        protected: true,
        relationships: { systems: [{ id: "dnd5e" }] },
        packs: [{ type: "Actor" }]
      });
      const result = SourceDetector.classify(pack("third-party-bestiary"));
      expect(result.tier).toBe(TIER.PREMIUM);
      expect(result.official).toBe(false);
    });

    it("ignores premium content built for a different system", () => {
      modules.set("pf2e-premium", {
        protected: true,
        relationships: { systems: [{ id: "pf2e" }] },
        packs: [{ type: "Actor" }]
      });
      expect(SourceDetector.classify(pack("pf2e-premium")).tier).toBe(TIER.NONE);
    });

    it("accepts a package the GM added by hand", () => {
      const manual = new Set(["homebrew-monsters"]);
      expect(SourceDetector.classify(pack("homebrew-monsters"), manual).tier).toBe(TIER.MANUAL);
    });

    it("rejects unrelated community packages", () => {
      expect(SourceDetector.classify(pack("homebrew-monsters")).tier).toBe(TIER.NONE);
    });

  });

  describe("dynamic priority classification", () => {

    it("classifies a module shipping an Adventure pack as adventure content", () => {
      modules.set("dnd-brand-new-adventure", {
        packs: [{ type: "Actor" }, { type: "Adventure" }, { type: "Scene" }]
      });
      expect(SourceDetector.classify(pack("dnd-brand-new-adventure")).priority).toBe(PRIORITY.ADVENTURE);
    });

    it("classifies a module shipping Scenes but no Adventure as an expansion", () => {
      modules.set("dnd-brand-new-setting", {
        packs: [{ type: "Actor" }, { type: "Scene" }]
      });
      expect(SourceDetector.classify(pack("dnd-brand-new-setting")).priority).toBe(PRIORITY.EXPANSION);
    });

    it("classifies an official module with neither as a core rulebook", () => {
      modules.set("dnd-brand-new-rulebook", {
        packs: [{ type: "Actor" }, { type: "Item" }, { type: "JournalEntry" }]
      });
      expect(SourceDetector.classify(pack("dnd-brand-new-rulebook")).priority).toBe(PRIORITY.CORE);
    });

    it("keeps the known-priority table authoritative over the dynamic guess", () => {
      // Monster Manual ships Scenes in some releases; it must still rank as CORE
      modules.set("dnd-monster-manual", { packs: [{ type: "Actor" }, { type: "Scene" }] });
      expect(SourceDetector.classify(pack("dnd-monster-manual")).priority).toBe(PRIORITY.CORE);
    });

    it("falls back to adventure priority for an unknown dnd- package with no manifest data", () => {
      expect(SourceDetector.classify(pack("dnd-unknown")).priority).toBe(PRIORITY.ADVENTURE);
    });

    it("never crashes when the module registry is unavailable", () => {
      globalThis.game.modules = undefined;
      expect(() => SourceDetector.classify(pack("dnd-monster-manual"))).not.toThrow();
    });

  });

});

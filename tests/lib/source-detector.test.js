import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SourceDetector, PRIORITY, TIER } from "../../scripts/lib/source-detector.js";

/**
 * SourceDetector Unit Tests
 *
 * Detection has two deliberate layers: an exact whitelist of the Wizards of the
 * Coast packages (trusted by default) and forward-looking signals that surface
 * content released after this version without trusting it silently. These tests
 * pin both, and pin that package-id prefixes are NOT a signal.
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

  describe("trusted tiers", () => {

    it("treats the active game system as the SRD baseline", () => {
      const result = SourceDetector.classify(pack("dnd5e", { packageType: "system" }));
      expect(result.tier).toBe(TIER.SYSTEM);
      expect(result.official).toBe(true);
      expect(result.priority).toBe(PRIORITY.FALLBACK);
    });

    it("trusts every whitelisted Wizards of the Coast package", () => {
      for (const packageName of SourceDetector.OFFICIAL_WOTC_PACKAGES) {
        const result = SourceDetector.classify(pack(packageName));
        expect(result.official, `${packageName} should be official`).toBe(true);
      }
    });

    it("exposes a human-readable book name for whitelisted packages", () => {
      expect(SourceDetector.classify(pack("dnd-monster-manual")).label).toBe("Monster Manual (2024)");
    });

  });

  describe("package-id prefixes are not a signal", () => {

    it("does NOT trust an unknown dnd- package", () => {
      const result = SourceDetector.classify(pack("dnd-homebrew-adventure"));
      expect(result.tier).toBe(TIER.NONE);
      expect(result.official).toBe(false);
    });

    it("does NOT trust a ddb- importer package", () => {
      expect(SourceDetector.classify(pack("ddb-importer")).tier).toBe(TIER.NONE);
    });

    it("grants no implicit priority to an unrecognised package", () => {
      expect(SourceDetector.classify(pack("dnd-homebrew-adventure")).priority).toBe(PRIORITY.FALLBACK);
    });

  });

  describe("forward-looking signals", () => {

    it("flags a WotC-authored package outside the whitelist as PUBLISHER, not official", () => {
      modules.set("dnd-brand-new-book", {
        authors: [{ name: "Wizards of the Coast" }],
        packs: [{ type: "Actor" }]
      });
      const result = SourceDetector.classify(pack("dnd-brand-new-book"));
      expect(result.tier).toBe(TIER.PUBLISHER);
      // Detected and surfaced to the GM, but not trusted without opting in
      expect(result.official).toBe(false);
    });

    it("flags premium content built for the active system as PREMIUM", () => {
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

    it("accepts a manual override given as a pack collection id", () => {
      const manual = new Set(["homebrew-monsters.beasts"]);
      const result = SourceDetector.classify(pack("homebrew-monsters", { collection: "homebrew-monsters.beasts" }), manual);
      expect(result.tier).toBe(TIER.MANUAL);
    });

  });

  describe("dynamic priority for packages outside the whitelist", () => {

    const publisherModule = packs => ({ authors: [{ name: "Wizards of the Coast" }], packs });

    it("classifies a module shipping an Adventure pack as adventure content", () => {
      modules.set("dnd-new-adventure", publisherModule([{ type: "Actor" }, { type: "Adventure" }, { type: "Scene" }]));
      expect(SourceDetector.classify(pack("dnd-new-adventure")).priority).toBe(PRIORITY.ADVENTURE);
    });

    it("classifies a module shipping Scenes but no Adventure as an expansion", () => {
      modules.set("dnd-new-setting", publisherModule([{ type: "Actor" }, { type: "Scene" }]));
      expect(SourceDetector.classify(pack("dnd-new-setting")).priority).toBe(PRIORITY.EXPANSION);
    });

    it("classifies a module with neither as a rulebook", () => {
      modules.set("dnd-new-rulebook", publisherModule([{ type: "Actor" }, { type: "Item" }]));
      expect(SourceDetector.classify(pack("dnd-new-rulebook")).priority).toBe(PRIORITY.CORE);
    });

    it("keeps the whitelist priorities authoritative over the dynamic guess", () => {
      // Monster Manual ships Scenes in some releases; it must still rank as CORE
      modules.set("dnd-monster-manual", { packs: [{ type: "Actor" }, { type: "Scene" }] });
      expect(SourceDetector.classify(pack("dnd-monster-manual")).priority).toBe(PRIORITY.CORE);
    });

  });

  it("never crashes when the module registry is unavailable", () => {
    globalThis.game.modules = undefined;
    expect(() => SourceDetector.classify(pack("dnd-monster-manual"))).not.toThrow();
  });

});

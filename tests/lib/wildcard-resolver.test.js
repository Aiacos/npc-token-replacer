import { describe, it, expect, beforeEach, vi } from "vitest";
import { WildcardResolver } from "../../scripts/lib/wildcard-resolver.js";

beforeEach(() => {
  WildcardResolver.clearCache();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test group 1: isWildcardPath
// ---------------------------------------------------------------------------
describe("isWildcardPath", () => {
  it("returns true for paths containing *", () => {
    expect(WildcardResolver.isWildcardPath("tokens/specter-*.webp")).toBe(true);
  });

  it("returns false for normal paths", () => {
    expect(WildcardResolver.isWildcardPath("tokens/specter-1.webp")).toBe(false);
  });

  it("returns falsy for null, undefined, empty string", () => {
    // Short-circuit evaluation: `path && ...` returns the falsy value itself (null/undefined/"")
    expect(WildcardResolver.isWildcardPath(null)).toBeFalsy();
    expect(WildcardResolver.isWildcardPath(undefined)).toBeFalsy();
    expect(WildcardResolver.isWildcardPath("")).toBeFalsy();
  });

  it("returns false for non-string input", () => {
    expect(WildcardResolver.isWildcardPath(123)).toBe(false);
    expect(WildcardResolver.isWildcardPath({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test group 2: selectVariant
// ---------------------------------------------------------------------------
describe("selectVariant", () => {
  const variants = ["a.webp", "b.webp", "c.webp"];

  it("none mode always returns first variant", () => {
    const r = WildcardResolver.selectVariant(variants, "none");
    expect(r.path).toBe("a.webp");
    expect(r.nextIndex).toBe(0);
  });

  it("sequential mode cycles through variants", () => {
    expect(WildcardResolver.selectVariant(variants, "sequential", 0).path).toBe("a.webp");
    expect(WildcardResolver.selectVariant(variants, "sequential", 1).path).toBe("b.webp");
    expect(WildcardResolver.selectVariant(variants, "sequential", 2).path).toBe("c.webp");
  });

  it("sequential mode wraps around", () => {
    expect(WildcardResolver.selectVariant(variants, "sequential", 3).path).toBe("a.webp");
  });

  it("sequential mode increments nextIndex", () => {
    expect(WildcardResolver.selectVariant(variants, "sequential", 0).nextIndex).toBe(1);
    expect(WildcardResolver.selectVariant(variants, "sequential", 5).nextIndex).toBe(6);
  });

  it("random mode with mocked Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const r = WildcardResolver.selectVariant(variants, "random");
    expect(r.path).toBe("b.webp"); // Math.floor(0.5 * 3) = 1
    expect(r.nextIndex).toBe(0);
  });

  it("empty/null variants returns null path", () => {
    expect(WildcardResolver.selectVariant([], "none").path).toBeNull();
    expect(WildcardResolver.selectVariant(null, "sequential").path).toBeNull();
    expect(WildcardResolver.selectVariant(null, "sequential", 5).nextIndex).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Test group 3: resolveWildcardVariants
// ---------------------------------------------------------------------------
describe("resolveWildcardVariants", () => {
  it("discovers available variants via HEAD requests", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("specter-1.webp") || url.includes("specter-2.webp")) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const variants = await WildcardResolver.resolveWildcardVariants("tokens/specter-*.webp");
    expect(variants).toContain("tokens/specter-1.webp");
    expect(variants).toContain("tokens/specter-2.webp");
    expect(variants).toHaveLength(2);
  });

  it("caches results: second call does not call fetch again", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("specter-1.webp")) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    // First call -- fetches
    const first = await WildcardResolver.resolveWildcardVariants("tokens/specter-*.webp");
    expect(first).toHaveLength(1);
    const fetchCallCount = global.fetch.mock.calls.length;

    // Second call -- should use cache
    const second = await WildcardResolver.resolveWildcardVariants("tokens/specter-*.webp");
    expect(second).toHaveLength(1);
    // fetch should NOT have been called again
    expect(global.fetch.mock.calls.length).toBe(fetchCallCount);
  });

  it("cache cleared via clearCache: fetch called again after clear", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("specter-1.webp")) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    // First resolution
    await WildcardResolver.resolveWildcardVariants("tokens/specter-*.webp");
    const firstCallCount = global.fetch.mock.calls.length;

    // Clear cache
    WildcardResolver.clearCache();
    expect(WildcardResolver.getCacheSize()).toBe(0);

    // Second resolution -- should call fetch again
    await WildcardResolver.resolveWildcardVariants("tokens/specter-*.webp");
    expect(global.fetch.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it("handles all failed requests gracefully: returns empty array", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

    const variants = await WildcardResolver.resolveWildcardVariants("tokens/missing-*.webp");
    expect(variants).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test group 4: resolve
// ---------------------------------------------------------------------------
describe("resolve", () => {
  it("returns resolved path when variants exist", async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes("specter-1.webp")) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await WildcardResolver.resolve("tokens/specter-*.webp", "none", 0, null);
    expect(result.resolvedPath).toBe("tokens/specter-1.webp");
  });

  it("falls back to fallbackPath when no variants found", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

    const result = await WildcardResolver.resolve(
      "tokens/missing-*.webp",
      "none",
      0,
      "portraits/specter.webp"
    );
    expect(result.resolvedPath).toBe("portraits/specter.webp");
  });

  it("falls back to mystery-man when no variants and no valid fallback", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

    const result = await WildcardResolver.resolve("tokens/missing-*.webp", "none", 0, null);
    expect(result.resolvedPath).toBe("icons/svg/mystery-man.svg");
  });
});

// ---------------------------------------------------------------------------
// Test group 5: DEFAULT_TIMEOUT with httpTimeout setting
// ---------------------------------------------------------------------------
describe("DEFAULT_TIMEOUT with httpTimeout setting", () => {
  let originalGet;

  beforeEach(() => {
    // Save original game.settings.get so we can mock per-test
    originalGet = globalThis.game.settings.get;
  });

  afterEach(() => {
    // Restore original
    globalThis.game.settings.get = originalGet;
  });

  it("reads from game.settings.get and multiplies by 1000", () => {
    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (moduleId === "npc-token-replacer" && key === "httpTimeout") return 10;
      return originalGet(moduleId, key);
    });

    expect(WildcardResolver.DEFAULT_TIMEOUT).toBe(10000);
    expect(globalThis.game.settings.get).toHaveBeenCalledWith("npc-token-replacer", "httpTimeout");
  });

  it("returns default value (5s) when setting returns default", () => {
    globalThis.game.settings.get = vi.fn((moduleId, key) => {
      if (moduleId === "npc-token-replacer" && key === "httpTimeout") return 5;
      return originalGet(moduleId, key);
    });

    expect(WildcardResolver.DEFAULT_TIMEOUT).toBe(5000);
  });

  it("falls back to 5000 when game.settings.get throws", () => {
    globalThis.game.settings.get = vi.fn(() => {
      throw new Error("Settings not registered yet");
    });

    expect(WildcardResolver.DEFAULT_TIMEOUT).toBe(5000);
  });
});

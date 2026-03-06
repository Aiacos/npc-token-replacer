# Phase 3: Unit Tests - Research

**Researched:** 2026-03-01
**Domain:** Unit testing of JavaScript classes with Vitest (mocking, coverage, static classes with private fields)
**Confidence:** HIGH

## Summary

Phase 3 writes unit tests for three classes: NameMatcher (pure logic extracted to `scripts/lib/`), WildcardResolver (extracted to `scripts/lib/`, uses `fetch`), and CompendiumManager (remains in `scripts/main.js`, heavily uses Foundry globals). The test infrastructure from Phase 1 and the ES module extraction from Phase 2 are fully in place: Vitest 3.2.4 with jsdom, foundry-test-utils, v8 coverage, 16 passing tests, and all classes exportable for direct import.

Research verified every mocking pattern needed through actual probe tests against the codebase (not hypothetical):

1. **NameMatcher** tests require zero mocking for `normalizeName()` and the matching stages. For `selectBestMatch()` and `findMatch()`, the `setCompendiumManager()` dependency injection setter from Phase 2 enables full control -- tests can inject a mock CompendiumManager or leave it null to test graceful degradation. The index data structure is simple arrays of `{entry, pack, normalizedName, significantWords, priority}` objects, easily constructed inline.

2. **WildcardResolver** tests need `fetch` mocked via `vi.stubGlobal('fetch', vi.fn(...))` or direct assignment to `global.fetch`. The project's `unstubGlobals: true` config auto-restores globals between tests, so fetch mocks are automatically cleaned up. `Math.random` for the random variant mode can be controlled via `vi.spyOn(Math, 'random').mockReturnValue(...)`. The cache (`clearCache()`) must be cleared in `beforeEach` to prevent cross-test pollution.

3. **CompendiumManager** tests need `game.packs.filter` mocked with a callback-based implementation (`vi.fn(predicate => mockPacks.filter(predicate))`) and `game.settings.get` mocked via `vi.fn()`. Both patterns were verified working. The key insight is that `game.packs.filter` must behave like a real `filter` (accepting and executing a predicate), not just return a static array, because CompendiumManager's `detectWOTCCompendiums()` passes a filtering function to it. `CompendiumManager.clearCache()` must be called in `beforeEach` to clear four private caches (`#indexCache`, `#indexMap`, `#wotcCompendiumsCache`, `#enabledPacksCache`).

**Primary recommendation:** Write three test files (`tests/lib/name-matcher.test.js`, `tests/lib/wildcard-resolver.test.js`, `tests/compendium-manager.test.js`) following the verified mocking patterns. Each file uses `beforeEach` to clear relevant caches and mock resets. Run `npm run test:coverage` to establish a measurable baseline. No new dependencies are needed.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-03 | Unit tests for NameMatcher (normalizeName, findMatch exact/variant/partial stages, selectBestMatch) | NameMatcher is fully extracted to `scripts/lib/name-matcher.js` with zero Foundry dependencies at import time. `normalizeName()` is a pure function testable directly. `findMatch()` accepts an index array as parameter, so tests construct mock index data inline. `selectBestMatch()` tests inject a mock CompendiumManager via `setCompendiumManager()` or test without it (graceful degradation verified). All matching patterns (PREFIX_PATTERN, SUFFIX_PATTERN, MIN_PARTIAL_LENGTH, VARIANT_TRANSFORMS) are exposed via public getters for assertion. |
| TEST-04 | Unit tests for WildcardResolver (isWildcardPath, selectVariant modes, resolveWildcardVariants with mocked fetch) | WildcardResolver is extracted to `scripts/lib/wildcard-resolver.js`. `isWildcardPath()` is a pure string check. `selectVariant()` is a pure function for none/sequential/random modes -- Math.random mockable via `vi.spyOn(Math, 'random')`. `resolveWildcardVariants()` uses global `fetch` which is mockable via `global.fetch = vi.fn(...)` with auto-restore from `unstubGlobals: true`. Cache behavior testable via `clearCache()` and `getCacheSize()`. All verified working via probe tests. |
| TEST-05 | Unit tests for CompendiumManager (priority resolution, detectWOTCCompendiums filtering, getEnabledCompendiums with valid/corrupt settings) | CompendiumManager imported from `scripts/main.js`. `getCompendiumPriority()` is a pure lookup needing only a mock `{metadata: {packageName: string}}` object -- verified working. `detectWOTCCompendiums()` needs `game.packs.filter` mocked with callback execution pattern -- verified working. `getEnabledCompendiums()` needs `game.settings.get` mocked -- tested with valid JSON strings (`'["default"]'`, `'["all"]'`, specific pack IDs) and corrupt values (throws Error, returns undefined). `clearCache()` clears all 4 private caches. All patterns verified via probe tests. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.2.4 | Test runner (existing from Phase 1) | Already installed and configured; native ESM, jsdom environment, `vi` mocking utilities |
| @rayners/foundry-test-utils | 1.2.2 | Foundry global mocks (existing from Phase 1) | Provides game, ui, Hooks stubs needed for CompendiumManager tests |
| @vitest/coverage-v8 | 3.2.4 | Coverage reporting (existing from Phase 1) | Generates baseline coverage report for Phase 3 success criteria |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jsdom | 27.4.0 | DOM environment (existing from Phase 1) | Provides `fetch`, `AbortController`, `setTimeout` globals needed by WildcardResolver |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `global.fetch = vi.fn()` | `vi.stubGlobal('fetch', vi.fn())` | Both work identically with `unstubGlobals: true`; direct assignment is simpler for inline mocking |
| `vi.spyOn(Math, 'random')` | Inject random function as parameter | Would change WildcardResolver's public API; spy is cleaner |
| Inline mock data objects | Shared fixture factory functions | Phase 3 has only ~15-20 tests per file; inline is clearer and avoids premature abstraction |

**Installation:**
```bash
# No new packages needed -- Phase 1 stack is sufficient
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
  setup/
    foundry-mocks.js     # Already exists (Phase 1)
    cache-clearing.js     # Already exists (Phase 1) -- reference template
  lib/
    import-validation.test.js   # Already exists (Phase 2)
    name-matcher.test.js        # NEW: NameMatcher unit tests
    wildcard-resolver.test.js   # NEW: WildcardResolver unit tests
  compendium-manager.test.js    # NEW: CompendiumManager unit tests (not in lib/ -- imports from main.js)
```

**Note:** CompendiumManager test goes in `tests/` root (not `tests/lib/`) because CompendiumManager is imported from `scripts/main.js`, not from `scripts/lib/`. This mirrors the source structure per Phase 1 locked decisions.

### Pattern 1: NameMatcher Test with Dependency Injection
**What:** Test NameMatcher methods by injecting a mock CompendiumManager
**When to use:** For `selectBestMatch()` and `findMatch()` tests that need priority resolution
**Example:**
```javascript
// Source: verified via probe test 2026-03-01
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NameMatcher } from "../../scripts/lib/name-matcher.js";

// Mock CompendiumManager for priority lookups
const mockCompendiumManager = {
  getCompendiumPriority: vi.fn(pack => {
    const priorities = { "dnd-monster-manual": 2, "dnd5e": 1, "dnd-phandelver-below": 4 };
    return priorities[pack.metadata.packageName] ?? 1;
  }),
  getIndexMap: vi.fn(() => null) // null forces array-scan path in findMatch
};

beforeEach(() => {
  // Reset CompendiumManager mock to known state
  NameMatcher.setCompendiumManager(mockCompendiumManager);
  mockCompendiumManager.getCompendiumPriority.mockClear();
  mockCompendiumManager.getIndexMap.mockClear();
});

describe("selectBestMatch", () => {
  it("selects higher priority pack when duplicates exist", () => {
    const matches = [
      { entry: { name: "Goblin" }, pack: { metadata: { packageName: "dnd5e", label: "SRD" }, collection: "dnd5e.monsters" } },
      { entry: { name: "Goblin" }, pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" } }
    ];
    const best = NameMatcher.selectBestMatch(matches);
    expect(best.pack.metadata.label).toBe("MM"); // priority 2 > priority 1
  });
});
```

### Pattern 2: WildcardResolver Test with Mocked Fetch
**What:** Test `resolveWildcardVariants()` by mocking global `fetch`
**When to use:** For any test that exercises HTTP probing logic
**Example:**
```javascript
// Source: verified via probe test 2026-03-01
import { describe, it, expect, beforeEach, vi } from "vitest";
import { WildcardResolver } from "../../scripts/lib/wildcard-resolver.js";

beforeEach(() => {
  WildcardResolver.clearCache();
  vi.restoreAllMocks();
});

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
});
```

### Pattern 3: CompendiumManager Test with game.packs Callback Mock
**What:** Mock `game.packs.filter` with callback execution to test filtering logic
**When to use:** For `detectWOTCCompendiums()` and all methods that chain through it
**Example:**
```javascript
// Source: verified via probe test 2026-03-01
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CompendiumManager } from "../scripts/main.js";

const createMockPack = (packageName, label, docName = "Actor") => ({
  documentName: docName,
  metadata: { packageName, label },
  collection: `${packageName}.monsters`
});

beforeEach(() => {
  CompendiumManager.clearCache();
  // game.packs.filter MUST execute the predicate, not just return static data
  game.packs.filter = vi.fn(predicate => mockPacks.filter(predicate));
  game.settings.get = vi.fn();
});

let mockPacks = [];

describe("detectWOTCCompendiums", () => {
  it("includes only Actor compendiums with dnd- or dnd5e prefix", () => {
    mockPacks = [
      createMockPack("dnd-monster-manual", "Monster Manual"),
      createMockPack("dnd-monster-manual", "MM Items", "Item"),
      createMockPack("homebrew-monsters", "Homebrew")
    ];
    const result = CompendiumManager.detectWOTCCompendiums();
    expect(result).toHaveLength(1);
    expect(result[0].metadata.label).toBe("Monster Manual");
  });
});
```

### Pattern 4: NameMatcher findMatch with IndexMap (O(1) path)
**What:** Test findMatch using the CompendiumManager indexMap for O(1) lookups
**When to use:** For exact match and variant match tests that should exercise the Map path
**Example:**
```javascript
// Source: derived from source code analysis of findMatch() lines 164-166
describe("findMatch with indexMap", () => {
  it("uses indexMap for O(1) exact match when available", () => {
    const matchEntry = {
      entry: { name: "Goblin" },
      pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
      normalizedName: "goblin",
      significantWords: ["goblin"],
      priority: 2
    };

    const indexMap = new Map([["goblin", [matchEntry]]]);
    mockCompendiumManager.getIndexMap.mockReturnValue(indexMap);

    const result = NameMatcher.findMatch("Goblin", []);
    expect(result.entry.name).toBe("Goblin");
  });
});
```

### Anti-Patterns to Avoid
- **Static `game.packs.filter` mock returning fixed array:** CompendiumManager passes a predicate function to `game.packs.filter()`. If the mock ignores the predicate and returns a fixed array, tests will pass even if the filtering logic is wrong. Always use `vi.fn(predicate => array.filter(predicate))`.
- **Forgetting `CompendiumManager.clearCache()` in beforeEach:** CompendiumManager has FOUR private caches (`#indexCache`, `#indexMap`, `#wotcCompendiumsCache`, `#enabledPacksCache`). Without clearing, a test that calls `detectWOTCCompendiums()` caches the result and subsequent tests in the same file see stale data.
- **Not resetting NameMatcher's CompendiumManager between tests:** If one test sets a mock CompendiumManager via `setCompendiumManager()` and another test expects null behavior, the second test inherits the first test's mock. Reset in `beforeEach`.
- **Testing WildcardResolver without clearing cache:** The variant cache persists across tests. A test that resolves `tokens/specter-*.webp` caches the result; a subsequent test for the same path gets cached results, not the new mock's response.
- **Suppressing Logger output in tests:** While console output can be noisy, do NOT mock Logger -- it serves as documentation of code behavior in test output. If needed, redirect only in CI via Vitest's `--silent` flag.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fetch mocking | Custom fetch interceptor | `global.fetch = vi.fn()` with `unstubGlobals: true` | Auto-cleanup, standard Vitest pattern, verified working |
| Math.random control | Custom deterministic RNG | `vi.spyOn(Math, 'random').mockReturnValue(N)` | One-liner, auto-cleanup with `vi.restoreAllMocks()` |
| CompendiumManager dependency in NameMatcher | Full CompendiumManager instance | Simple mock object with `getCompendiumPriority` and `getIndexMap` methods | Only 2 methods used; mock is 4 lines |
| Coverage threshold enforcement | Custom coverage assertion scripts | Vitest coverage config `thresholds` (when ready) | Built-in; Phase 3 establishes baseline only |
| Test data factory | Complex mock builder pattern | Inline object literals | Only ~5 mock pack shapes needed; factory is premature abstraction |

**Key insight:** Every class under test has been designed for testability -- static methods, `clearCache()` APIs, dependency injection setter. The test code can be simple because the production code already accommodates testing.

## Common Pitfalls

### Pitfall 1: Stale Cache Across Tests
**What goes wrong:** Test B gets different results than expected because Test A's cached data persists
**Why it happens:** CompendiumManager and WildcardResolver use private static caches that survive between tests
**How to avoid:** Call `CompendiumManager.clearCache()` and `WildcardResolver.clearCache()` in every `beforeEach` block
**Warning signs:** Tests pass individually but fail when run together, or test order changes results

### Pitfall 2: game.packs.filter Ignoring Predicate
**What goes wrong:** CompendiumManager.detectWOTCCompendiums() appears to work but includes non-Actor or non-WotC packs
**Why it happens:** Mock returns static array without executing the predicate function
**How to avoid:** Use `game.packs.filter = vi.fn(predicate => mockPacks.filter(predicate))` -- this delegates to real Array.filter with the predicate
**Warning signs:** Tests pass but don't actually validate the filtering logic

### Pitfall 3: NameMatcher findMatch Array-Scan Fallback
**What goes wrong:** Tests only cover the `indexMap` path (O(1) lookup) or only the array-scan path (O(n) filter), missing the other
**Why it happens:** `findMatch()` has two code paths at line 165-166: when `indexMap` is not null it uses Map lookup, otherwise falls back to array filter
**How to avoid:** Write tests for both: (a) `getIndexMap` returns a Map, and (b) `getIndexMap` returns null. Both paths should produce the same match result
**Warning signs:** Coverage report shows uncovered branches at line 165-166

### Pitfall 4: WildcardResolver fetch Mock Not Handling All Candidate URLs
**What goes wrong:** `resolveWildcardVariants()` makes 15 fetch calls (5 numeric, 5 zero-padded, 5 lettered variants) for a single extension. A mock that only handles expected URLs may leave other calls unresolved
**Why it happens:** The implementation probes all `VARIANT_SUFFIXES` (15 values) for each extension
**How to avoid:** Mock fetch to return `{ok: false}` by default and `{ok: true}` for specific URLs. Verify the mock handles all 15 candidates
**Warning signs:** Unresolved promises, test timeouts, or unexpected variant counts

### Pitfall 5: NameMatcher Variant Transforms Not Triggered
**What goes wrong:** Tests for Stage 2 (variant matching) don't actually exercise the transform because the input name has no prefix/suffix to strip
**Why it happens:** VARIANT_TRANSFORMS only modify names that match PREFIX_PATTERN (`/^(young|adult|ancient|elder|greater|lesser)\s+/i`) or SUFFIX_PATTERN (`/\s+(warrior|guard|scout|champion|leader|chief|captain|shaman|berserker)$/i`)
**How to avoid:** Use test names like "Young Dragon" (has prefix "Young"), "Goblin Warrior" (has suffix "Warrior"), or "Elder Goblin Berserker" (has both). Verify the transform produces a different string than the original
**Warning signs:** Stage 2 code covered but only because the `variant !== normalizedSearch` check exits early (transform produced no change)

### Pitfall 6: CompendiumManager getEnabledCompendiums Caching Interference
**What goes wrong:** `getEnabledCompendiums()` returns stale results from a previous test because `#enabledPacksCache` was not cleared
**Why it happens:** `getEnabledCompendiums()` has its own cache (`#enabledPacksCache`) separate from the detection cache (`#wotcCompendiumsCache`). `clearCache()` clears all four, but if you only manually reset the detection mock and forget `clearCache()`, the enabled-packs cache still holds old data
**How to avoid:** Always use `CompendiumManager.clearCache()` in `beforeEach` -- it clears all four caches in one call
**Warning signs:** `game.settings.get` mock is never called because the method returns early from cache

### Pitfall 7: Coverage Percentage Misinterpretation
**What goes wrong:** Coverage report shows lower-than-expected percentages for scripts/lib/ files
**Why it happens:** Coverage includes code that runs at import time (class definitions, static field initializers) which gets counted even without explicit tests. But the `scripts/main.js` file has 0% coverage and pulls down the "All files" total
**How to avoid:** Focus on per-file coverage for the three tested classes, not the overall total. The success criteria says "measurable baseline percentage for the tested classes" -- this means checking individual file coverage, not the aggregate
**Warning signs:** Overall coverage is low (17%) but individual lib/ files may reach 80%+ after unit tests

## Code Examples

Verified patterns from probe tests run against actual codebase (2026-03-01):

### NameMatcher: normalizeName Test Cases
```javascript
// Source: tested against scripts/lib/name-matcher.js lines 84-91
describe("normalizeName", () => {
  it("converts to lowercase and trims whitespace", () => {
    expect(NameMatcher.normalizeName("Goblin Warrior")).toBe("goblin warrior");
    expect(NameMatcher.normalizeName("  Dire Wolf  ")).toBe("dire wolf");
  });

  it("removes special characters (Unicode-safe)", () => {
    expect(NameMatcher.normalizeName("Mind Flayer's Minion")).toBe("mind flayers minion");
    expect(NameMatcher.normalizeName("Half-Dragon")).toBe("halfdragon");
  });

  it("normalizes internal whitespace", () => {
    expect(NameMatcher.normalizeName("Death   Knight")).toBe("death knight");
  });

  it("handles null, undefined, and empty string", () => {
    expect(NameMatcher.normalizeName(null)).toBe("");
    expect(NameMatcher.normalizeName(undefined)).toBe("");
    expect(NameMatcher.normalizeName("")).toBe("");
  });
});
```

### NameMatcher: selectBestMatch Priority Resolution
```javascript
// Source: tested against scripts/lib/name-matcher.js lines 108-135
describe("selectBestMatch", () => {
  it("returns null for null/empty input", () => {
    expect(NameMatcher.selectBestMatch(null)).toBeNull();
    expect(NameMatcher.selectBestMatch([])).toBeNull();
  });

  it("returns the single match directly", () => {
    const match = { entry: { name: "Goblin" }, pack: { metadata: { label: "MM" } } };
    expect(NameMatcher.selectBestMatch([match])).toBe(match);
  });

  it("selects match from highest priority compendium", () => {
    const srd = { entry: { name: "Goblin" }, pack: { metadata: { packageName: "dnd5e", label: "SRD" }, collection: "dnd5e.monsters" } };
    const mm = { entry: { name: "Goblin" }, pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" } };

    // Inject mock CompendiumManager
    NameMatcher.setCompendiumManager({
      getCompendiumPriority: (pack) => ({ "dnd5e": 1, "dnd-monster-manual": 2 }[pack.metadata.packageName] ?? 1),
      getIndexMap: () => null
    });

    expect(NameMatcher.selectBestMatch([srd, mm]).pack.metadata.label).toBe("MM");
  });

  it("uses pre-computed priority field when available", () => {
    const a = { entry: { name: "X" }, pack: { collection: "a" }, priority: 3 };
    const b = { entry: { name: "X" }, pack: { collection: "b" }, priority: 1 };
    NameMatcher.setCompendiumManager(null); // No CM -- relies on .priority field
    expect(NameMatcher.selectBestMatch([a, b])).toBe(a);
  });

  it("breaks tie by collection name (alphabetical)", () => {
    const a = { entry: { name: "X" }, pack: { collection: "aaa", metadata: { packageName: "dnd-x" } } };
    const b = { entry: { name: "X" }, pack: { collection: "bbb", metadata: { packageName: "dnd-y" } } };
    // Both get priority 4 (unknown dnd- prefix)
    NameMatcher.setCompendiumManager({
      getCompendiumPriority: () => 4,
      getIndexMap: () => null
    });
    expect(NameMatcher.selectBestMatch([a, b])).toBe(a); // "aaa" < "bbb"
  });
});
```

### WildcardResolver: selectVariant All Modes
```javascript
// Source: tested against scripts/lib/wildcard-resolver.js lines 195-218
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
    // Wraps around
    expect(WildcardResolver.selectVariant(variants, "sequential", 3).path).toBe("a.webp");
  });

  it("sequential mode increments nextIndex", () => {
    expect(WildcardResolver.selectVariant(variants, "sequential", 0).nextIndex).toBe(1);
    expect(WildcardResolver.selectVariant(variants, "sequential", 5).nextIndex).toBe(6);
  });

  it("random mode returns a valid variant (deterministic with mock)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const r = WildcardResolver.selectVariant(variants, "random");
    expect(r.path).toBe("b.webp"); // Math.floor(0.5 * 3) = 1
    expect(r.nextIndex).toBe(0);
    vi.restoreAllMocks();
  });

  it("returns null path for empty variants", () => {
    expect(WildcardResolver.selectVariant([], "none").path).toBeNull();
    expect(WildcardResolver.selectVariant(null, "sequential").path).toBeNull();
  });
});
```

### CompendiumManager: getEnabledCompendiums Settings Variants
```javascript
// Source: tested against scripts/main.js lines 377-417
describe("getEnabledCompendiums", () => {
  const corePack = createMockPack("dnd-monster-manual", "Monster Manual");
  const adventurePack = createMockPack("dnd-phandelver-below", "Phandelver");
  const srdPack = createMockPack("dnd5e", "SRD Monsters");

  beforeEach(() => {
    CompendiumManager.clearCache();
    mockPacks = [corePack, adventurePack, srdPack];
    game.packs.filter = vi.fn(pred => mockPacks.filter(pred));
  });

  it('"default" includes only priority 1-2 (SRD + Core)', () => {
    game.settings.get = vi.fn().mockReturnValue('["default"]');
    const result = CompendiumManager.getEnabledCompendiums();
    expect(result).toContain(corePack);
    expect(result).toContain(srdPack);
    expect(result).not.toContain(adventurePack);
  });

  it('"all" includes every detected compendium', () => {
    game.settings.get = vi.fn().mockReturnValue('["all"]');
    const result = CompendiumManager.getEnabledCompendiums();
    expect(result).toHaveLength(3);
  });

  it("specific pack IDs filter to selected packs only", () => {
    game.settings.get = vi.fn().mockReturnValue('["dnd-phandelver-below.monsters"]');
    const result = CompendiumManager.getEnabledCompendiums();
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(adventurePack);
  });

  it("corrupt JSON falls back to default", () => {
    game.settings.get = vi.fn(() => { throw new Error("Invalid JSON"); });
    const result = CompendiumManager.getEnabledCompendiums();
    // Should fall back to default behavior (priority <= 2)
    expect(result).toContain(srdPack);
    expect(result).not.toContain(adventurePack);
  });

  it("undefined setting falls back to default", () => {
    game.settings.get = vi.fn().mockReturnValue(undefined);
    const result = CompendiumManager.getEnabledCompendiums();
    expect(result).toContain(corePack);
  });
});
```

### Cache-Clearing beforeEach Pattern (Concrete for Phase 3)
```javascript
// Pattern for each test file -- copy and adapt
import { beforeEach, vi } from "vitest";

// NameMatcher test file:
beforeEach(() => {
  NameMatcher.setCompendiumManager(mockCompendiumManager);
  mockCompendiumManager.getCompendiumPriority.mockClear();
  mockCompendiumManager.getIndexMap.mockClear();
});

// WildcardResolver test file:
beforeEach(() => {
  WildcardResolver.clearCache();
  vi.restoreAllMocks(); // restores fetch, Math.random
});

// CompendiumManager test file:
beforeEach(() => {
  CompendiumManager.clearCache();
  game.packs.filter = vi.fn(pred => mockPacks.filter(pred));
  game.settings.get = vi.fn();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual fetch mock with beforeEach/afterEach cleanup | `vi.stubGlobal` with `unstubGlobals: true` auto-cleanup | Vitest 1.x+ | No risk of forgetting cleanup; globals restored automatically |
| `jest.spyOn(global, 'fetch')` | `vi.spyOn` or direct `global.fetch = vi.fn()` | Vitest (from start) | Same API shape as Jest; Vitest's `vi` namespace replaces `jest` |
| Istanbul coverage for ESM | V8 coverage via `@vitest/coverage-v8` | Vitest 3.2.0+ | AST-based remapping gives Istanbul accuracy; native ESM with private fields |

**Deprecated/outdated:**
- `vi.mock('node-fetch')`: Not needed -- jsdom environment provides native `fetch` global. Module mocking is unnecessary.
- `unstubGlobals: false` with manual cleanup: The project already has `unstubGlobals: true` -- do not change this. It auto-restores globals between tests.

## Open Questions

1. **Should NameMatcher findMatch Stage 3 (partial matching) be extensively tested?**
   - What we know: Stage 3 uses word-level matching with a 2/3 threshold and bidirectional coverage check. It's the most complex matching logic.
   - What's unclear: How many edge cases are worth testing (single significant word, all words matching, exactly at threshold, etc.)
   - Recommendation: Include at least 4 tests for Stage 3: (a) match above threshold, (b) no match below threshold, (c) exact threshold boundary, (d) short name below MIN_PARTIAL_LENGTH skips Stage 3. This covers the main code paths without over-testing.

2. **Should CompendiumManager.loadMonsterIndex() be unit-tested in Phase 3?**
   - What we know: `loadMonsterIndex()` is async and calls `pack.getIndex()` on each enabled pack, which requires mocking the compendium pack's `getIndex` method and `index.contents` iterator. TEST-05 doesn't explicitly mention it.
   - What's unclear: Whether the complexity of mocking `pack.getIndex()` and `pack.index.contents` is worth it for Phase 3.
   - Recommendation: Skip `loadMonsterIndex()` for Phase 3. The success criteria focus on priority resolution, detection filtering, and settings parsing. If loadMonsterIndex tests are needed, they fit better in a Phase 4 integration test or as part of ITEST-01 (v2).

3. **What is a reasonable coverage baseline target for the three tested classes?**
   - What we know: Current coverage before Phase 3 unit tests: logger.js 74.75%, name-matcher.js 55.39%, wildcard-resolver.js 53.61% (from import-time code execution). After Phase 3, the tested classes should see significant improvement.
   - What's unclear: Exact percentages -- depends on how many branches are practically testable.
   - Recommendation: Do not set a threshold. The success criteria says "measurable baseline percentage" -- just run coverage and document the numbers. Expected: NameMatcher 80%+, WildcardResolver 75%+, CompendiumManager 50%+ (limited because `loadMonsterIndex` is skipped).

## Sources

### Primary (HIGH confidence)
- Probe test: NameMatcher dependency injection pattern verified on 2026-03-01 (inline mock CompendiumManager with `setCompendiumManager()`)
- Probe test: WildcardResolver `global.fetch` mocking verified on 2026-03-01 (mock returns ok/404 per URL, cache works)
- Probe test: CompendiumManager `game.packs.filter` callback pattern verified on 2026-03-01 (predicate execution confirmed)
- Probe test: CompendiumManager `game.settings.get` mocking verified on 2026-03-01 (valid JSON, corrupt settings, undefined)
- Probe test: `vi.spyOn(Math, 'random')` verified on 2026-03-01 for deterministic random variant selection
- Source code analysis: `scripts/lib/name-matcher.js` (229 lines), `scripts/lib/wildcard-resolver.js` (294 lines), `scripts/main.js` CompendiumManager class (lines 198-538)
- [Vitest Mocking Globals docs](https://vitest.dev/guide/mocking/globals) -- `vi.stubGlobal` usage, `unstubGlobals` config behavior

### Secondary (MEDIUM confidence)
- [Vitest Vi API docs](https://vitest.dev/api/vi.html) -- `vi.fn()`, `vi.spyOn()`, `vi.restoreAllMocks()`
- Phase 1 Research: `unstubGlobals: true` already configured in vitest.config.js

### Tertiary (LOW confidence)
- None -- all findings verified via actual test execution against the codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; all from Phase 1 infrastructure, verified working
- Architecture: HIGH - Every mocking pattern verified via probe tests against actual codebase
- Pitfalls: HIGH - Each pitfall identified through actual testing or direct source code analysis; cache behavior confirmed via probe tests

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days -- stable testing patterns; no time-sensitive dependencies)

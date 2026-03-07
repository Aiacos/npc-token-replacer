import { describe, it, expect, beforeEach, vi } from "vitest";
import { NameMatcher } from "../../scripts/lib/name-matcher.js";

// Mock CompendiumManager for priority lookups and indexMap access
const mockCompendiumManager = {
  getCompendiumPriority: vi.fn((pack) => {
    const priorities = { "dnd-monster-manual": 2, "dnd5e": 1, "dnd-phandelver-below": 4 };
    return priorities[pack.metadata.packageName] ?? 1;
  }),
  getIndexMap: vi.fn(() => null)
};

beforeEach(() => {
  NameMatcher.setCompendiumManager(mockCompendiumManager);
  mockCompendiumManager.getCompendiumPriority.mockClear();
  mockCompendiumManager.getIndexMap.mockClear();
  // Restore default implementation after mockClear
  mockCompendiumManager.getCompendiumPriority.mockImplementation((pack) => {
    const priorities = { "dnd-monster-manual": 2, "dnd5e": 1, "dnd-phandelver-below": 4 };
    return priorities[pack.metadata.packageName] ?? 1;
  });
  mockCompendiumManager.getIndexMap.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// Test group 1: normalizeName
// ---------------------------------------------------------------------------
describe("normalizeName", () => {
  it("converts to lowercase and trims whitespace", () => {
    expect(NameMatcher.normalizeName("Goblin Warrior")).toBe("goblin warrior");
    expect(NameMatcher.normalizeName("  Dire Wolf  ")).toBe("dire wolf");
  });

  it("removes special characters (Unicode-safe)", () => {
    expect(NameMatcher.normalizeName("Mind Flayer's Minion")).toBe("mind flayers minion");
    expect(NameMatcher.normalizeName("Half-Dragon")).toBe("half dragon");
  });

  it("normalizes internal whitespace", () => {
    expect(NameMatcher.normalizeName("Death   Knight")).toBe("death knight");
  });

  it("handles null, undefined, and empty string", () => {
    expect(NameMatcher.normalizeName(null)).toBe("");
    expect(NameMatcher.normalizeName(undefined)).toBe("");
    expect(NameMatcher.normalizeName("")).toBe("");
  });

  it("handles numeric input by returning empty string (falsy coercion)", () => {
    // normalizeName checks `if (!name)` first -- numbers are truthy so they
    // reach .toLowerCase() which throws. This documents the actual behavior:
    // non-string truthy input is not supported. In practice only strings are passed.
    expect(NameMatcher.normalizeName(0)).toBe(""); // 0 is falsy -> ""
    expect(NameMatcher.normalizeName(false)).toBe(""); // false is falsy -> ""
  });
});

// ---------------------------------------------------------------------------
// Test group 2: selectBestMatch
// ---------------------------------------------------------------------------
describe("selectBestMatch", () => {
  it("returns null for null and empty array input", () => {
    expect(NameMatcher.selectBestMatch(null)).toBeNull();
    expect(NameMatcher.selectBestMatch([])).toBeNull();
  });

  it("returns single match directly when only one match exists", () => {
    const match = { entry: { name: "Goblin" }, pack: { metadata: { label: "MM" } } };
    expect(NameMatcher.selectBestMatch([match])).toBe(match);
  });

  it("selects match from highest priority compendium", () => {
    const srd = {
      entry: { name: "Goblin" },
      pack: { metadata: { packageName: "dnd5e", label: "SRD" }, collection: "dnd5e.monsters" }
    };
    const mm = {
      entry: { name: "Goblin" },
      pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" }
    };

    const result = NameMatcher.selectBestMatch([srd, mm]);
    expect(result.pack.metadata.label).toBe("MM"); // priority 2 > priority 1
  });

  it("uses pre-computed priority field when available", () => {
    const a = { entry: { name: "X" }, pack: { collection: "a", metadata: { label: "Pack A" } }, priority: 3 };
    const b = { entry: { name: "X" }, pack: { collection: "b", metadata: { label: "Pack B" } }, priority: 1 };
    NameMatcher.setCompendiumManager(null); // No CM -- relies on .priority field
    expect(NameMatcher.selectBestMatch([a, b])).toBe(a);
  });

  it("breaks tie by collection name (alphabetical)", () => {
    const a = {
      entry: { name: "X" },
      pack: { collection: "aaa", metadata: { packageName: "dnd-x" } }
    };
    const b = {
      entry: { name: "X" },
      pack: { collection: "bbb", metadata: { packageName: "dnd-y" } }
    };
    // Both get same priority from mock (1 for unknown packageName)
    mockCompendiumManager.getCompendiumPriority.mockReturnValue(4);
    expect(NameMatcher.selectBestMatch([a, b])).toBe(a); // "aaa" < "bbb"
  });
});

// ---------------------------------------------------------------------------
// Test group 3: findMatch -- Stage 1 Exact Match
// ---------------------------------------------------------------------------
describe("findMatch - Stage 1 Exact Match", () => {
  it("exact match found via array-scan path (indexMap is null)", () => {
    mockCompendiumManager.getIndexMap.mockReturnValue(null);

    const index = [
      {
        entry: { name: "Goblin" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "goblin",
        significantWords: ["goblin"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Goblin", index);
    expect(result).not.toBeNull();
    expect(result.entry.name).toBe("Goblin");
  });

  it("exact match found via indexMap (O(1)) path", () => {
    const matchEntry = {
      entry: { name: "Goblin" },
      pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
      normalizedName: "goblin",
      significantWords: ["goblin"],
      priority: 2
    };

    const indexMap = new Map([["goblin", [matchEntry]]]);
    mockCompendiumManager.getIndexMap.mockReturnValue(indexMap);

    // Pass empty array -- should NOT be scanned when indexMap is available
    const result = NameMatcher.findMatch("Goblin", []);
    expect(result).not.toBeNull();
    expect(result.entry.name).toBe("Goblin");
  });

  it("no match returns null", () => {
    mockCompendiumManager.getIndexMap.mockReturnValue(null);

    const index = [
      {
        entry: { name: "Dragon" },
        pack: { metadata: { packageName: "dnd5e", label: "SRD" }, collection: "dnd5e.monsters" },
        normalizedName: "dragon",
        significantWords: ["dragon"],
        priority: 1
      }
    ];

    const result = NameMatcher.findMatch("Beholder", index);
    expect(result).toBeNull();
  });

  it("empty/null creature name returns null", () => {
    expect(NameMatcher.findMatch("", [])).toBeNull();
    expect(NameMatcher.findMatch(null, [])).toBeNull();
    expect(NameMatcher.findMatch(undefined, [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test group 4: findMatch -- Stage 2 Variant Match
// ---------------------------------------------------------------------------
describe("findMatch - Stage 2 Variant Match", () => {
  // Force array-scan path for all variant tests
  beforeEach(() => {
    mockCompendiumManager.getIndexMap.mockReturnValue(null);
  });

  it("prefix stripping: 'Young Dragon' matches index entry 'dragon'", () => {
    const index = [
      {
        entry: { name: "Dragon" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "dragon",
        significantWords: ["dragon"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Young Dragon", index);
    expect(result).not.toBeNull();
    expect(result.entry.name).toBe("Dragon");
  });

  it("suffix stripping: 'Goblin Warrior' matches index entry 'goblin'", () => {
    const index = [
      {
        entry: { name: "Goblin" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "goblin",
        significantWords: ["goblin"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Goblin Warrior", index);
    expect(result).not.toBeNull();
    expect(result.entry.name).toBe("Goblin");
  });

  it("both prefix+suffix stripping: 'Elder Goblin Berserker' matches 'goblin'", () => {
    const index = [
      {
        entry: { name: "Goblin" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "goblin",
        significantWords: ["goblin"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Elder Goblin Berserker", index);
    expect(result).not.toBeNull();
    expect(result.entry.name).toBe("Goblin");
  });
});

// ---------------------------------------------------------------------------
// Test group 5: findMatch -- Stage 3 Partial Match
// ---------------------------------------------------------------------------
describe("findMatch - Stage 3 Partial Match", () => {
  beforeEach(() => {
    mockCompendiumManager.getIndexMap.mockReturnValue(null);
  });

  it("match above 2/3 threshold: 2 of 3 significant words match", () => {
    // Search: "ancient stone golem" -> significant words: ["ancient", "stone", "golem"]
    // Threshold: ceil(3 * 2/3) = 2
    // Index entry has significantWords: ["stone", "golem", "construct"]
    // Matching: "stone" + "golem" = 2 >= threshold(2), 2/3 >= 0.5 bidirectional
    const index = [
      {
        entry: { name: "Stone Golem Construct" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "stone golem construct",
        significantWords: ["stone", "golem", "construct"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Ancient Stone Golem", index);
    expect(result).not.toBeNull();
    expect(result.entry.name).toBe("Stone Golem Construct");
  });

  it("no match below threshold: only 1 of 3 significant words matches", () => {
    // Search: "ancient stone golem" -> significant words: ["ancient", "stone", "golem"]
    // Threshold: ceil(3 * 2/3) = 2
    // Index entry has significantWords: ["stone", "dragon", "wyrm"]
    // Matching: "stone" = 1 < threshold(2) -> no match
    const index = [
      {
        entry: { name: "Stone Dragon Wyrm" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "stone dragon wyrm",
        significantWords: ["stone", "dragon", "wyrm"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Ancient Stone Golem", index);
    expect(result).toBeNull();
  });

  it("short name below MIN_PARTIAL_LENGTH skips Stage 3", () => {
    // "Rat" is 3 chars < MIN_PARTIAL_LENGTH (4), so Stage 3 is skipped entirely
    const index = [
      {
        entry: { name: "Giant Rat" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "giant rat",
        significantWords: ["giant"],
        priority: 2
      }
    ];

    const result = NameMatcher.findMatch("Rat", index);
    expect(result).toBeNull();
  });

  it("bidirectional coverage check: entry significant words must be at least 50% covered", () => {
    // Search: "fire giant" -> significant words: ["fire", "giant"]
    // Threshold: ceil(2 * 2/3) = 2 -> both must match
    // Index entry significantWords: ["fire", "giant", "elder", "champion"]
    // Matching: "fire" + "giant" = 2 >= threshold(2), BUT 2/4 = 0.5 >= 0.5 -> passes bidirectional
    const indexPass = [
      {
        entry: { name: "Fire Giant Elder Champion" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "fire giant elder champion",
        significantWords: ["fire", "giant", "elder", "champion"],
        priority: 2
      }
    ];
    const resultPass = NameMatcher.findMatch("Fire Giant", indexPass);
    expect(resultPass).not.toBeNull();

    // Now test failing bidirectional: entry has 5 significant words, only 2 match -> 2/5 = 0.4 < 0.5
    const indexFail = [
      {
        entry: { name: "Fire Giant Stone Earth Mountain" },
        pack: { metadata: { packageName: "dnd-monster-manual", label: "MM" }, collection: "dnd-monster-manual.monsters" },
        normalizedName: "fire giant stone earth mountain",
        significantWords: ["fire", "giant", "stone", "earth", "mountain"],
        priority: 2
      }
    ];
    const resultFail = NameMatcher.findMatch("Fire Giant", indexFail);
    expect(resultFail).toBeNull();
  });
});

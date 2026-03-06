import { describe, it, expect, beforeEach, vi } from "vitest";
import { NPCTokenReplacerController } from "../scripts/main.js";
import { NameMatcher } from "../scripts/lib/name-matcher.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const mockTokens = [
  { id: "t1", name: "Goblin", actor: { name: "Goblin" } },
  { id: "t2", name: "Token_Orc", actor: { name: "Orc" } },
  { id: "t3", name: "Unknown Beast", actor: null }
];

const mockIndex = [
  { name: "Goblin", pack: "dnd5e.monsters" },
  { name: "Orc", pack: "dnd5e.monsters" }
];

const mockMatchGoblin = { entry: { name: "Goblin" }, pack: { metadata: { id: "dnd5e.monsters" } } };
const mockMatchOrc = { entry: { name: "Orc" }, pack: { metadata: { id: "dnd5e.monsters" } } };

function createMockProgress() {
  return {
    start: vi.fn(),
    update: vi.fn(),
    finish: vi.fn()
  };
}

// ---------------------------------------------------------------------------
// Tests for computeMatches
// ---------------------------------------------------------------------------
describe("NPCTokenReplacerController.computeMatches", () => {
  let findMatchSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    findMatchSpy = vi.spyOn(NameMatcher, "findMatch").mockImplementation((name) => {
      if (name === "Goblin") return mockMatchGoblin;
      if (name === "Orc") return mockMatchOrc;
      return null;
    });
  });

  it("returns array with {tokenDoc, creatureName, match} for each token", () => {
    const progress = createMockProgress();
    const results = NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ tokenDoc: mockTokens[0], creatureName: "Goblin", match: mockMatchGoblin });
    expect(results[1]).toEqual({ tokenDoc: mockTokens[1], creatureName: "Orc", match: mockMatchOrc });
    expect(results[2]).toEqual({ tokenDoc: mockTokens[2], creatureName: "Unknown Beast", match: null });
  });

  it("calls NameMatcher.findMatch once per token (no double-matching)", () => {
    const progress = createMockProgress();
    NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(findMatchSpy).toHaveBeenCalledTimes(3);
    expect(findMatchSpy).toHaveBeenCalledWith("Goblin", mockIndex);
    expect(findMatchSpy).toHaveBeenCalledWith("Orc", mockIndex);
    expect(findMatchSpy).toHaveBeenCalledWith("Unknown Beast", mockIndex);
  });

  it("matched tokens have match={entry, pack}, unmatched have match=null", () => {
    const progress = createMockProgress();
    const results = NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(results[0].match).toBe(mockMatchGoblin);
    expect(results[2].match).toBeNull();
  });

  it("calls progress.start, progress.update per token, and progress.finish", () => {
    const progress = createMockProgress();
    NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(progress.start).toHaveBeenCalledTimes(1);
    expect(progress.start).toHaveBeenCalledWith(3, expect.any(String));
    expect(progress.update).toHaveBeenCalledTimes(3);
    expect(progress.finish).toHaveBeenCalledTimes(1);
  });

  it("creatureName uses tokenDoc.actor.name when available, falls back to tokenDoc.name", () => {
    const progress = createMockProgress();
    const results = NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    // Token t1: actor.name = "Goblin"
    expect(results[0].creatureName).toBe("Goblin");
    // Token t2: actor.name = "Orc" (not token.name "Token_Orc")
    expect(results[1].creatureName).toBe("Orc");
    // Token t3: actor is null, falls back to token.name
    expect(results[2].creatureName).toBe("Unknown Beast");
  });
});

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

// ---------------------------------------------------------------------------
// Mock data for showPreviewDialog
// ---------------------------------------------------------------------------
const mockPackLabel = { metadata: { id: "dnd5e.monsters", label: "Monster Manual" } };
const mockPackLabel2 = { metadata: { id: "dnd-adventures.monsters", label: "Adventure Compendium" } };

function createMatchResults({ matched = true, unmatched = true, htmlChars = false } = {}) {
  const results = [];
  if (matched) {
    results.push({
      tokenDoc: { id: "t1", name: "Goblin" },
      creatureName: htmlChars ? '<script>Goblin</script>' : "Goblin",
      match: { entry: { name: htmlChars ? '<b>Goblin</b>' : "Goblin" }, pack: mockPackLabel }
    });
    results.push({
      tokenDoc: { id: "t2", name: "Orc" },
      creatureName: "Orc",
      match: { entry: { name: "Orc" }, pack: mockPackLabel2 }
    });
  }
  if (unmatched) {
    results.push({
      tokenDoc: { id: "t3", name: "Unknown Beast" },
      creatureName: htmlChars ? '<img src=x>Beast' : "Unknown Beast",
      match: null
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests for showPreviewDialog
// ---------------------------------------------------------------------------
describe("NPCTokenReplacerController.showPreviewDialog", () => {
  let capturedOptions;

  beforeEach(() => {
    vi.restoreAllMocks();
    capturedOptions = null;
    // Mock Dialog.confirm to capture options and trigger yes callback
    globalThis.Dialog.confirm = vi.fn((opts) => {
      capturedOptions = opts;
      if (opts.yes) opts.yes();
    });
  });

  it("renders a table with Token Name, Will Match As, Source Compendium columns", async () => {
    await NPCTokenReplacerController.showPreviewDialog(createMatchResults());

    expect(capturedOptions).toBeDefined();
    const content = capturedOptions.content;
    // Mock i18n.localize returns the key, so check for the localization keys
    expect(content).toContain("NPC_REPLACER.PreviewColToken");
    expect(content).toContain("NPC_REPLACER.PreviewColMatch");
    expect(content).toContain("NPC_REPLACER.PreviewColSource");
    // Verify it's a table with three th headers
    const thMatches = content.match(/<th>/g);
    expect(thMatches).not.toBeNull();
    expect(thMatches.length).toBe(3);
  });

  it("matched tokens appear before unmatched tokens in the table", async () => {
    // Create results with unmatched FIRST in the array to verify sorting
    const results = [
      { tokenDoc: { id: "t3" }, creatureName: "Unknown Beast", match: null },
      { tokenDoc: { id: "t1" }, creatureName: "Goblin", match: { entry: { name: "Goblin" }, pack: mockPackLabel } }
    ];

    await NPCTokenReplacerController.showPreviewDialog(results);
    const content = capturedOptions.content;

    // Goblin (matched) should appear before Unknown Beast (unmatched)
    const goblinPos = content.indexOf("Goblin");
    const unknownPos = content.indexOf("Unknown Beast");
    expect(goblinPos).toBeLessThan(unknownPos);
  });

  it("unmatched tokens show 'No match found' text and em-dash for source", async () => {
    await NPCTokenReplacerController.showPreviewDialog(createMatchResults());

    const content = capturedOptions.content;
    // Mock i18n.localize returns the key
    expect(content).toContain("NPC_REPLACER.PreviewNoMatch");
    expect(content).toContain("&mdash;");
  });

  it("HTML-escapes all token names and creature names", async () => {
    await NPCTokenReplacerController.showPreviewDialog(createMatchResults({ htmlChars: true }));

    const content = capturedOptions.content;
    // Raw HTML should NOT appear
    expect(content).not.toContain("<script>");
    expect(content).not.toContain("<b>");
    expect(content).not.toContain("<img");
    // Escaped versions should appear
    expect(content).toContain("&lt;script&gt;");
    expect(content).toContain("&lt;b&gt;");
    expect(content).toContain("&lt;img");
  });

  it("summary line shows matched/total counts via i18n.format", async () => {
    const formatSpy = vi.spyOn(game.i18n, "format");
    const results = createMatchResults(); // 2 matched, 1 unmatched
    await NPCTokenReplacerController.showPreviewDialog(results);

    // Verify i18n.format was called with correct key and counts
    expect(formatSpy).toHaveBeenCalledWith("NPC_REPLACER.PreviewSummary", {
      matched: 2,
      total: 3
    });
  });

  it("disables the Replace button when all tokens are unmatched", async () => {
    const allUnmatched = createMatchResults({ matched: false, unmatched: true });

    await NPCTokenReplacerController.showPreviewDialog(allUnmatched);

    // When all unmatched, a render callback should be provided
    expect(capturedOptions.render).toBeDefined();

    // Simulate the render callback with a mock jQuery html object
    const mockButton = { prop: vi.fn() };
    const mockHtml = {
      find: vi.fn(() => mockButton)
    };
    capturedOptions.render(mockHtml);

    expect(mockHtml.find).toHaveBeenCalledWith(expect.stringContaining("yes"));
    expect(mockButton.prop).toHaveBeenCalledWith("disabled", true);
  });

  it("does NOT provide render callback when some tokens are matched", async () => {
    const someMatched = createMatchResults({ matched: true, unmatched: true });
    await NPCTokenReplacerController.showPreviewDialog(someMatched);

    // render should be undefined when there are matches
    expect(capturedOptions.render).toBeUndefined();
  });

  it("resolves true on yes callback", async () => {
    globalThis.Dialog.confirm = vi.fn((opts) => {
      capturedOptions = opts;
      opts.yes();
    });

    const result = await NPCTokenReplacerController.showPreviewDialog(createMatchResults());
    expect(result).toBe(true);
  });

  it("resolves false on no callback", async () => {
    globalThis.Dialog.confirm = vi.fn((opts) => {
      capturedOptions = opts;
      opts.no();
    });

    const result = await NPCTokenReplacerController.showPreviewDialog(createMatchResults());
    expect(result).toBe(false);
  });

  it("resolves false on close callback", async () => {
    globalThis.Dialog.confirm = vi.fn((opts) => {
      capturedOptions = opts;
      opts.close();
    });

    const result = await NPCTokenReplacerController.showPreviewDialog(createMatchResults());
    expect(result).toBe(false);
  });
});

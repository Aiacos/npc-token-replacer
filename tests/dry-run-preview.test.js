import { describe, it, expect, beforeEach, vi } from "vitest";
import { NPCTokenReplacerController, CompendiumManager, TokenReplacer } from "../scripts/main.js";
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

  it("returns array with {tokenDoc, creatureName, match} for each token", async () => {
    const progress = createMockProgress();
    const results = await NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ tokenDoc: mockTokens[0], creatureName: "Goblin", match: mockMatchGoblin });
    expect(results[1]).toEqual({ tokenDoc: mockTokens[1], creatureName: "Orc", match: mockMatchOrc });
    expect(results[2]).toEqual({ tokenDoc: mockTokens[2], creatureName: "Unknown Beast", match: null });
  });

  it("calls NameMatcher.findMatch once per token (no double-matching)", async () => {
    const progress = createMockProgress();
    await NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(findMatchSpy).toHaveBeenCalledTimes(3);
    expect(findMatchSpy).toHaveBeenCalledWith("Goblin", mockIndex);
    expect(findMatchSpy).toHaveBeenCalledWith("Orc", mockIndex);
    expect(findMatchSpy).toHaveBeenCalledWith("Unknown Beast", mockIndex);
  });

  it("matched tokens have match={entry, pack}, unmatched have match=null", async () => {
    const progress = createMockProgress();
    const results = await NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(results[0].match).toBe(mockMatchGoblin);
    expect(results[2].match).toBeNull();
  });

  it("calls progress.start, progress.update per token, and progress.finish", async () => {
    const progress = createMockProgress();
    await NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

    expect(progress.start).toHaveBeenCalledTimes(1);
    expect(progress.start).toHaveBeenCalledWith(3, expect.any(String));
    expect(progress.update).toHaveBeenCalledTimes(3);
    // progress.finish() is now called by the caller (replaceNPCTokens try/finally), not computeMatches
    expect(progress.finish).toHaveBeenCalledTimes(0);
  });

  it("creatureName uses tokenDoc.actor.name when available, falls back to tokenDoc.name", async () => {
    const progress = createMockProgress();
    const results = await NPCTokenReplacerController.computeMatches(mockTokens, mockIndex, progress);

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
    // Mock Dialog constructor — capture opts and auto-trigger yes button callback
    const OrigDialog = globalThis.Dialog;
    globalThis.Dialog = function (opts) {
      capturedOptions = opts;
      this.render = vi.fn(() => {
        // Auto-trigger yes callback by default
        if (opts.buttons?.yes?.callback) opts.buttons.yes.callback();
      });
      this.close = vi.fn();
    };
    globalThis.Dialog.confirm = OrigDialog?.confirm;
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

    // Simulate the render callback — vanilla DOM (no jQuery)
    const container = document.createElement("div");
    const yesBtn = document.createElement("button");
    yesBtn.classList.add("yes");
    container.appendChild(yesBtn);
    const dataBtn = document.createElement("button");
    dataBtn.setAttribute("data-button", "yes");
    container.appendChild(dataBtn);

    capturedOptions.render(container);

    expect(yesBtn.disabled).toBe(true);
    expect(dataBtn.disabled).toBe(true);
  });

  it("does NOT provide render callback when some tokens are matched", async () => {
    const someMatched = createMatchResults({ matched: true, unmatched: true });
    await NPCTokenReplacerController.showPreviewDialog(someMatched);

    // render should be undefined when there are matches
    expect(capturedOptions.render).toBeUndefined();
  });

  it("resolves true on yes callback", async () => {
    globalThis.Dialog = function (opts) {
      capturedOptions = opts;
      this.render = vi.fn(() => { opts.buttons.yes.callback(); });
      this.close = vi.fn();
    };

    const result = await NPCTokenReplacerController.showPreviewDialog(createMatchResults());
    expect(result).toBe(true);
  });

  it("resolves false on no callback", async () => {
    globalThis.Dialog = function (opts) {
      capturedOptions = opts;
      this.render = vi.fn(() => { opts.buttons.no.callback(); });
      this.close = vi.fn();
    };

    const result = await NPCTokenReplacerController.showPreviewDialog(createMatchResults());
    expect(result).toBe(false);
  });

  it("resolves false on close callback", async () => {
    globalThis.Dialog = function (opts) {
      capturedOptions = opts;
      this.render = vi.fn(() => { opts.close(); });
      this.close = vi.fn();
    };

    const result = await NPCTokenReplacerController.showPreviewDialog(createMatchResults());
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests for replaceNPCTokens integration (Task 2)
// ---------------------------------------------------------------------------
describe("replaceNPCTokens integration with preview flow", () => {
  const mockPack = {
    collection: "dnd5e.monsters",
    metadata: { packageName: "dnd5e", label: "Monsters" },
    documentName: "Actor",
    getIndex: vi.fn().mockResolvedValue(),
    index: {
      contents: [
        { name: "Goblin", _id: "entry-1" },
        { name: "Orc", _id: "entry-2" }
      ],
      size: 2
    }
  };

  const mockToken1 = { id: "t1", name: "Goblin", actor: { name: "Goblin", type: "npc" } };
  const mockToken2 = { id: "t2", name: "Orc", actor: { name: "Orc", type: "npc" } };
  const mockToken3 = { id: "t3", name: "Unknown", actor: { name: "Unknown", type: "npc" } };

  let computeMatchesSpy;
  let showPreviewSpy;
  let replaceTokenSpy;
  let findMatchSpy;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Reset caches
    CompendiumManager.clearCache();
    TokenReplacer.clearActorLookup();

    // Mock i18n
    game.i18n.format = vi.fn((key, data) => `${key}: ${JSON.stringify(data)}`);
    game.i18n.localize = vi.fn((key) => key);

    // Mock prerequisites
    game.user.isGM = true;
    canvas.scene = canvas.scene || {};
    canvas.scene.tokens = canvas.scene.tokens || {};
    canvas.scene.tokens.has = vi.fn(() => true);
    game.actors[Symbol.iterator] = function* () {};

    // Mock compendium detection + index
    vi.spyOn(CompendiumManager, "detectWOTCCompendiums").mockReturnValue([mockPack]);
    vi.spyOn(CompendiumManager, "getEnabledCompendiums").mockReturnValue([mockPack]);
    vi.spyOn(CompendiumManager, "loadMonsterIndex").mockResolvedValue([
      { entry: { name: "Goblin" }, pack: mockPack },
      { entry: { name: "Orc" }, pack: mockPack }
    ]);

    // Mock getNPCTokensToProcess
    vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({
      tokens: [mockToken1, mockToken2, mockToken3],
      isSelection: false
    });

    // Spy on computeMatches (let it run, we just want to verify order)
    findMatchSpy = vi.spyOn(NameMatcher, "findMatch").mockImplementation((name) => {
      if (name === "Goblin") return { entry: { name: "Goblin" }, pack: mockPack };
      if (name === "Orc") return { entry: { name: "Orc" }, pack: mockPack };
      return null;
    });

    // Mock showPreviewDialog to auto-confirm
    showPreviewSpy = vi.spyOn(NPCTokenReplacerController, "showPreviewDialog").mockResolvedValue(true);

    // Mock replaceToken to succeed
    replaceTokenSpy = vi.spyOn(TokenReplacer, "replaceToken").mockResolvedValue();
    vi.spyOn(TokenReplacer, "resetCounter").mockImplementation(() => {});
    vi.spyOn(TokenReplacer, "buildActorLookup").mockImplementation(() => {});
  });

  it("calls computeMatches before showPreviewDialog", async () => {
    const callOrder = [];
    computeMatchesSpy = vi.spyOn(NPCTokenReplacerController, "computeMatches")
      .mockImplementation((...args) => {
        callOrder.push("computeMatches");
        // Call original
        computeMatchesSpy.mockRestore();
        return NPCTokenReplacerController.computeMatches(...args);
      });
    showPreviewSpy.mockImplementation((matchResults) => {
      callOrder.push("showPreviewDialog");
      return Promise.resolve(true);
    });

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(callOrder).toEqual(["computeMatches", "showPreviewDialog"]);
  });

  it("does not call replaceToken when preview is cancelled", async () => {
    showPreviewSpy.mockResolvedValue(false);

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(replaceTokenSpy).not.toHaveBeenCalled();
  });

  it("calls replaceToken with pre-computed match.entry and match.pack", async () => {
    await NPCTokenReplacerController.replaceNPCTokens();

    // Should be called for the 2 matched tokens (not the unmatched one)
    expect(replaceTokenSpy).toHaveBeenCalledTimes(2);
    expect(replaceTokenSpy).toHaveBeenCalledWith(
      mockToken1,
      { name: "Goblin" },
      mockPack
    );
    expect(replaceTokenSpy).toHaveBeenCalledWith(
      mockToken2,
      { name: "Orc" },
      mockPack
    );
  });

  it("does NOT call NameMatcher.findMatch during replacement phase (no double-matching)", async () => {
    await NPCTokenReplacerController.replaceNPCTokens();

    // findMatch should only be called during computeMatches (3 tokens = 3 calls)
    // NOT again during replacement
    expect(findMatchSpy).toHaveBeenCalledTimes(3);
  });

  it("deduplicates tokens with same ID in matchResults", async () => {
    // Return duplicate token IDs from getNPCTokensToProcess
    vi.spyOn(TokenReplacer, "getNPCTokensToProcess").mockReturnValue({
      tokens: [mockToken1, mockToken1], // same token twice
      isSelection: false
    });

    await NPCTokenReplacerController.replaceNPCTokens();

    // replaceToken should only be called once despite duplicate
    expect(replaceTokenSpy).toHaveBeenCalledTimes(1);
  });

  it("skips tokens deleted during preview (canvas.scene.tokens.has returns false)", async () => {
    // First token no longer exists after preview
    canvas.scene.tokens.has = vi.fn((id) => id !== "t1");

    await NPCTokenReplacerController.replaceNPCTokens();

    // Only Orc should be replaced (Goblin was "deleted")
    expect(replaceTokenSpy).toHaveBeenCalledTimes(1);
    expect(replaceTokenSpy).toHaveBeenCalledWith(
      mockToken2,
      { name: "Orc" },
      mockPack
    );
  });

  it("reports correct counts including unmatched from preview", async () => {
    ui.notifications.info = vi.fn();
    ui.notifications.warn = vi.fn();

    await NPCTokenReplacerController.replaceNPCTokens();

    // 2 replaced, 1 not found (Unknown)
    // info is NOT called when there are unmatched tokens (notFound.length > 0)
    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalled();
    expect(game.i18n.format).toHaveBeenCalledWith(
      "NPC_REPLACER.NotFoundCount",
      { count: 1 }
    );
  });
});

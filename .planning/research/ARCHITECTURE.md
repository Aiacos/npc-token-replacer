# Architecture Research

**Domain:** Foundry VTT module testing and reliability infrastructure
**Researched:** 2026-02-28
**Confidence:** MEDIUM

---

## Standard Architecture

### System Overview

The architecture adds a test layer alongside the existing single-file module without changing the module's runtime structure.

```
npc-token-replacer/
├── scripts/
│   └── main.js                    # Existing module (unchanged at runtime)
│
├── tests/                         # New: test infrastructure
│   ├── setup/
│   │   └── foundry-mocks.js       # globalThis mocks for Foundry globals
│   ├── unit/
│   │   ├── NameMatcher.test.js    # Pure logic — no Foundry deps
│   │   ├── WildcardResolver.test.js
│   │   ├── CompendiumManager.test.js
│   │   ├── TokenReplacer.test.js
│   │   └── Controller.test.js
│   └── integration/               # Optional: Quench in-game tests
│       └── quench-batches.js
│
├── vitest.config.js               # New: test runner config
└── package.json                   # Updated: add vitest dev dep
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `tests/setup/foundry-mocks.js` | Establishes `globalThis.game`, `globalThis.canvas`, `globalThis.ui`, `globalThis.Hooks` before each test suite | Vitest setupFiles |
| `tests/unit/*.test.js` | Unit tests for each class; imports class directly from main.js (or extracted) | Foundry mocks via setup file |
| `tests/integration/quench-batches.js` | Optional: registers Quench batches for in-game testing against real Foundry | Live Foundry instance |
| `vitest.config.js` | Wires jsdom environment, setupFiles, test glob pattern | Vitest CLI |
| `scripts/main.js` | Module logic — unchanged for tests | Imported by test files |

---

## The Core Problem: Foundry as an Implicit Dependency

Every class in `scripts/main.js` directly accesses Foundry globals (`game`, `canvas`, `ui`, `Hooks`). These are not injected — they are accessed as module-level globals. This is standard Foundry practice, but it makes isolated testing impossible without mocking.

**The two valid approaches, and why this module needs both:**

| Approach | Good For | Bad For | Recommended For |
|----------|----------|---------|-----------------|
| **Unit tests + globalThis mocks** | Fast, no Foundry needed, runs in CI | Can't test true Foundry API behavior | Logic in NameMatcher, WildcardResolver, CompendiumManager |
| **Quench in-game tests** | Tests against real Foundry APIs, catches API-breaking changes | Requires running Foundry, slow, hard in CI | Integration smoke tests, v12/v13 compat |

**Decision:** Start with unit tests using mocks (highest ROI, can run in CI). Add Quench as optional stretch goal. Do not attempt full E2E with Cypress — too heavyweight for a single-file module.

---

## Recommended Architecture

### Test Runner: Vitest (not Jest)

Use **Vitest** over Jest because:
- Native ESM support without transpilation — critical since `scripts/main.js` uses native ES modules with `#private` fields
- No transform config needed for plain ES2022 JavaScript
- jsdom environment available via `npm install -D jsdom`
- `vi.stubGlobal()` for injecting Foundry globals cleanly
- Jest-compatible API means familiar syntax (describe/it/expect)

**Configuration:**

```javascript
// vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup/foundry-mocks.js"],
    include: ["tests/unit/**/*.test.js"],
    unstubGlobals: true,   // reset vi.stubGlobal() after each test file
  },
});
```

### Mocking Architecture for Foundry Globals

The central challenge: `scripts/main.js` accesses `game`, `canvas`, `ui`, `Hooks` as global variables set by the Foundry runtime. In tests, these must be injected into `globalThis` before the module under test is executed.

**Approach:** A single `tests/setup/foundry-mocks.js` file, loaded via Vitest `setupFiles`, establishes minimal mock implementations of every Foundry global the module uses.

```javascript
// tests/setup/foundry-mocks.js
import { vi } from "vitest";

// --- game global ---
globalThis.game = {
  user: { isGM: true, id: "testUserId" },
  i18n: {
    localize: (key) => key,          // returns key — predictable in tests
    format: (key, data) => `${key}:${JSON.stringify(data)}`,
  },
  settings: {
    get: vi.fn((moduleId, key) => null),
    set: vi.fn(),
    register: vi.fn(),
  },
  packs: {                           // Map-like CompendiumCollection
    get: vi.fn((id) => null),
    filter: vi.fn((fn) => []),
    forEach: vi.fn(),
    contents: [],
  },
  folders: {
    find: vi.fn(() => null),
    filter: vi.fn(() => []),
  },
  modules: {
    get: vi.fn(() => null),
  },
};

// --- canvas global ---
globalThis.canvas = {
  scene: {
    tokens: {
      has: vi.fn(() => true),
      filter: vi.fn(() => []),
      get: vi.fn(() => null),
    },
    deleteEmbeddedDocuments: vi.fn(async () => []),
    createEmbeddedDocuments: vi.fn(async () => []),
  },
};

// --- ui global ---
globalThis.ui = {
  notifications: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    notify: vi.fn(),
  },
};

// --- Hooks global ---
globalThis.Hooks = {
  on: vi.fn(),
  once: vi.fn(),
  call: vi.fn(),
  callAll: vi.fn(),
};

// --- Dialog global ---
globalThis.Dialog = {
  confirm: vi.fn(async () => true),
};
```

**Key pattern:** Tests that need different behavior per-case override individual mock functions with `vi.fn().mockResolvedValue(...)` inside the test. The `unstubGlobals: true` config restores state between test files.

### Testing Static Methods with Private Fields

The module uses `static #field` ES6 private fields extensively. The challenge: private fields cannot be accessed externally, but tests need to verify state changes.

**Three patterns, ranked by preference:**

**Pattern 1 (Preferred): Test via public API only.** Private fields are implementation details. If a method sets `#indexCache`, test that subsequent calls return cached results by observing behavior, not inspecting `#indexCache` directly.

```javascript
// Good: Test observable behavior
it("returns cached index on second call", async () => {
  const first = await CompendiumManager.loadMonsterIndex();
  const packGetCallCount = game.packs.get.mock.calls.length;
  const second = await CompendiumManager.loadMonsterIndex();
  // If cached, no additional pack.get calls should occur
  expect(game.packs.get.mock.calls.length).toBe(packGetCallCount);
  expect(second).toBe(first);  // Same reference = cached
});
```

**Pattern 2: Reset cache via public clearCache() method.** All caches have a `clearCache()` method in the existing code. Use it to set up known states in tests.

```javascript
beforeEach(() => {
  CompendiumManager.clearCache();
  WildcardResolver.clearCache();
});
```

**Pattern 3 (Avoid): Export private state via debug API.** The existing `NPCTokenReplacer.getDebugAPI()` window object already exposes some internals. Do not extend it for test purposes — this leaks internals to production.

### Importing Classes from main.js

Since `main.js` is not written as a module with explicit exports, tests cannot simply `import { NameMatcher } from "../scripts/main.js"`.

**Two options:**

**Option A (Recommended for pure logic classes): Extract testable classes to a separate file.**
Move `NameMatcher`, `WildcardResolver`, and `Logger` to `scripts/lib/` files with explicit ES module exports. Main.js imports from those files. This is the cleanest pattern and does not require a build step since Foundry loads ES modules natively.

```javascript
// scripts/lib/name-matcher.js
export class NameMatcher { /* ... */ }

// scripts/main.js
import { NameMatcher } from "./lib/name-matcher.js";
```

**Option B: Mock-import the entire main.js and rely on globalThis side effects.**
Since `main.js` registers classes on `window.NPCTokenReplacer` in the ready hook, tests could trigger the hook and access classes through the debug API. This is fragile and couples tests to the init sequence.

**Verdict:** Extract `NameMatcher`, `WildcardResolver`, and `Logger` to separate files under `scripts/lib/`. Leave `CompendiumManager`, `TokenReplacer`, `NPCTokenReplacerController`, `FolderManager`, and `CompendiumSelectorForm` in `main.js` because they have heavy Foundry API dependencies that cannot be cleanly separated. Test the extracted classes with pure unit tests. Test controller-level behavior with integration-style tests using the full mock suite.

---

## Architectural Patterns

### Pattern 1: Dependency Boundary via File Extraction

**What:** Split `main.js` classes into pure-logic files (no Foundry deps) vs. Foundry-integrated files.
**When to use:** Any class whose methods can be reasoned about without Foundry API knowledge.
**Trade-offs:** Adds files to the repo but keeps module-level test coverage achievable without a running Foundry. The no-build constraint is maintained because Foundry supports native ES module imports.

**File split recommendation:**

```
scripts/
├── lib/
│   ├── name-matcher.js      # Pure logic, no Foundry deps — fully unit testable
│   ├── wildcard-resolver.js # Has fetch() dep — mock fetch in tests
│   └── logger.js            # Thin wrapper over console — trivially testable
└── main.js                  # Foundry-integrated classes + hooks + init
```

### Pattern 2: Global Mock Injection via setupFiles

**What:** A single setup file runs before every test file, populating `globalThis` with minimal Foundry mock objects. Individual tests override specific mock functions for their scenario.
**When to use:** Any test that exercises code touching `game`, `canvas`, or `ui`.
**Trade-offs:** Mock fidelity degrades over Foundry major versions. If Foundry changes `game.packs` API signatures, mocks must be updated. This is acceptable because the existing v12/v13 compat layer already handles API differences in the module code.

**Example per-test override:**

```javascript
describe("validatePrerequisites", () => {
  it("returns false if user is not GM", () => {
    game.user.isGM = false;
    const result = NPCTokenReplacerController.validatePrerequisites();
    expect(result).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalled();
  });

  it("returns false if no active scene", () => {
    game.user.isGM = true;
    canvas.scene = null;
    const result = NPCTokenReplacerController.validatePrerequisites();
    expect(result).toBe(false);
    expect(ui.notifications.error).toHaveBeenCalled();
  });
});
```

### Pattern 3: Progress Bar Integration via Version-Aware Wrapper

**What:** A thin `ProgressReporter` utility wraps both progress APIs. In v12 it calls `SceneNavigation.displayProgressBar({label, pct})`. In v13 it calls `ui.notifications.info(label, {progress: true})` and stores the returned notification handle for `.update()` calls.
**When to use:** Whenever a multi-token replacement loop runs (the existing per-token loop in `NPCTokenReplacerController.replaceNPCTokens()`).
**Trade-offs:** Two code paths to test, but both are thin wrappers over native Foundry APIs.

**API comparison:**

| API | Foundry Version | Call Pattern |
|-----|-----------------|-------------|
| `SceneNavigation.displayProgressBar({label, pct})` | v12 (and v13 for compat) | Stateless static call per update |
| `const n = ui.notifications.info(msg, {progress:true}); n.update({pct, message})` | v13 preferred | Stateful object handle |

**Implementation pattern:**

```javascript
// In scripts/main.js or scripts/lib/progress-reporter.js
class ProgressReporter {
  static #handle = null;

  static start(label) {
    if (typeof ui.notifications.info === "function" && /* v13 check */) {
      ProgressReporter.#handle = ui.notifications.info(label, { progress: true });
    } else {
      SceneNavigation.displayProgressBar({ label, pct: 0 });
    }
  }

  static update(pct, label) {
    if (ProgressReporter.#handle) {
      ProgressReporter.#handle.update({ pct, message: label });
    } else {
      SceneNavigation.displayProgressBar({ label, pct: Math.round(pct * 100) });
    }
  }

  static finish() {
    if (ProgressReporter.#handle) {
      ProgressReporter.#handle.update({ pct: 1 });
    } else {
      SceneNavigation.displayProgressBar({ label: "", pct: 100 });
    }
    ProgressReporter.#handle = null;
  }
}
```

### Pattern 4: Dry-Run Preview via Enhanced Confirmation Dialog

**What:** The existing `showConfirmationDialog` lists token names before replacement. A dry-run extends this by also showing what the match result would be (matched name, source compendium) before committing.
**When to use:** The dry-run option is shown in the same confirmation dialog as a tabular result set.
**Trade-offs:** Requires running `NameMatcher.findMatch()` against the monster index before the dialog, which adds latency. Index is usually cached after the first `ready` hook load, so this is typically fast.

**Data flow for dry-run dialog:**

```
User clicks button
    → Gather NPC tokens
    → Load monster index (usually cached)
    → Run NameMatcher on each token name   ← new dry-run step
    → Build match results table
    → Show dialog: [Token Name | Matched As | Compendium | Action]
    → User confirms or cancels
    → If confirmed: proceed with actual replacement using same match results
```

**Dialog content structure:**

```javascript
// Dry-run dialog table (replaces simple list)
const rows = previewResults.map(r =>
  `<tr>
    <td>${escapeHtml(r.tokenName)}</td>
    <td>${r.match ? escapeHtml(r.match.entry.name) : "(no match)"}</td>
    <td>${r.match ? escapeHtml(r.match.pack.metadata.label) : "—"}</td>
  </tr>`
).join("");

const content = `
  <p>${game.i18n.format("NPC_REPLACER.DryRunContent", {total: tokens.length, matched: matchCount})}</p>
  <table style="width:100%; max-height:200px; overflow-y:auto; display:block;">
    <thead><tr><th>Token</th><th>Will Match As</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
`;
```

**Integration with existing Dialog.confirm pattern:** The current `showConfirmationDialog` uses `Dialog.confirm()`. The dry-run dialog replaces it with a richer Dialog — same `Dialog.confirm` wrapper, different HTML `content`. For v13 compatibility, `DialogV2.confirm` is the preferred replacement, but the existing `Dialog.confirm` still works in v13 as `foundry.appv1.api.Dialog`.

---

## Data Flow

### Test Execution Flow

```
npm test (vitest)
    ↓
Load vitest.config.js
    ↓ setupFiles
tests/setup/foundry-mocks.js
    → globalThis.game = { ... }
    → globalThis.canvas = { ... }
    → globalThis.ui = { ... }
    → globalThis.Hooks = { ... }
    ↓
import scripts/lib/name-matcher.js    (pure — no Foundry deps)
    ↓
import scripts/lib/wildcard-resolver.js  (fetch mocked via vi.fn)
    ↓
Run test cases
    ↓
vi.unstubGlobals() between files (unstubGlobals: true)
```

### Progress Bar Data Flow (New Feature)

```
replaceNPCTokens() starts
    ↓
ProgressReporter.start("Replacing tokens...")
    ↓
for each token (i of n):
    ↓
    processToken(token, index, processedIds)
        ↓ (yields result)
    ProgressReporter.update(i/n, `Processing ${name}...`)
    ↓
ProgressReporter.finish()
    ↓
Report results via ui.notifications
```

### Dry-Run Data Flow (New Feature)

```
replaceNPCTokens() starts
    ↓
getNPCTokensToProcess()
    ↓
loadMonsterIndex()          ← cached on second+ call
    ↓
runDryRun(tokens, index)    ← new: calls NameMatcher.findMatch() for all
    → returns [{tokenName, match: {entry, pack} | null}]
    ↓
showDryRunDialog(previewResults)
    → Returns: {confirmed: bool, matchResults: [...]}
    ↓ if confirmed
Use cached matchResults for actual replacement (no double-matching)
```

---

## Anti-Patterns

### Anti-Pattern 1: Testing Via the Foundry Ready Hook

**What people do:** Import `main.js` into tests and call `Hooks.call("ready")` to initialize the module, then access `window.NPCTokenReplacer` for class references.
**Why it's wrong:** This couples all tests to the entire initialization sequence. A bug in `registerSettings()` breaks every test. Private class state bleeds between tests. It tests initialization logic when you want to test individual methods.
**Do this instead:** Import the individual class files directly. Test each class in isolation. Test the initialization hooks in a dedicated `hooks.test.js` that explicitly checks that hooks register correctly.

### Anti-Pattern 2: Mocking Foundry APIs at Method Level in Every Test

**What people do:** In each test file: `const packs = [{...}]; vi.stubGlobal("game", { packs: { filter: () => packs } })`.
**Why it's wrong:** Duplicated setup, inconsistent mock fidelity, mock drift as the real API changes. When Foundry API changes between v12 and v13, 50 test files all need updating.
**Do this instead:** Centralize all Foundry mocks in `tests/setup/foundry-mocks.js`. Update in one place. Individual tests only override what they need for their specific scenario via `game.packs.filter.mockReturnValue(...)`.

### Anti-Pattern 3: Asserting on Private Fields

**What people do:** Use `Object.getOwnPropertyDescriptor` tricks or `--expose-gc` flags to inspect `#indexCache`.
**Why it's wrong:** Fragile, defeats encapsulation, will break when private field names change, is not supported in all test environments.
**Do this instead:** Test the observable behavior — call the method twice, verify the second call doesn't call external APIs again. Use `clearCache()` to reset to known state.

### Anti-Pattern 4: Trying to Test Dialog Rendering

**What people do:** Mount Dialog UI, query DOM elements, simulate button clicks to test `showConfirmationDialog`.
**Why it's wrong:** Foundry's Dialog class renders using its own template system into a window outside your test environment. Even with jsdom, the inner workings require a full Foundry ApplicationV1 render cycle.
**Do this instead:** Mock `Dialog.confirm` with `vi.fn()` that resolves to `true` or `false`. Test that the correct content string is passed. The Dialog rendering itself is Foundry's responsibility — trust it.

### Anti-Pattern 5: Using Quench as Primary Test Strategy

**What people do:** Skip unit tests, write all tests as Quench batches that run inside a live Foundry instance.
**Why it's wrong:** Quench tests require a running Foundry with all WotC content packs installed. Slow to run (minutes vs. seconds). Cannot run in CI without Docker and a licensed Foundry instance. Tests fail due to content differences between users.
**Do this instead:** Unit tests with mocks for logic coverage (fast, CI-compatible). Quench only for smoke-testing the full replacement workflow against a real scene with real tokens.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Foundry v12 progress bar | `SceneNavigation.displayProgressBar({label, pct})` | Available since 2021, confirmed HIGH confidence |
| Foundry v13 progress notifications | `ui.notifications.info(msg, {progress:true})` → `.update({pct})` | Confirmed in v13.332+ release notes |
| Foundry Dialog (v12 + v13 compat) | `Dialog.confirm({...})` still works in v13 as legacy | Deprecated but functional in v13, target DialogV2 in future |
| fetch() for wildcard HEAD probing | `AbortController` + `fetch()` — already in WildcardResolver | Mock with `vi.fn()` in tests |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `scripts/lib/*.js` ↔ `scripts/main.js` | ES module imports | Allows test isolation without breaking no-build constraint |
| Test setup ↔ test files | `globalThis` assignment via setupFiles | Vitest guarantees setupFiles run before any test file |
| `ProgressReporter` ↔ `NPCTokenReplacerController` | Direct static method calls | ProgressReporter stays in main.js unless also extracted |
| Dry-run results ↔ actual replacement | Passed as argument (no re-computation) | Match results computed once, reused if user confirms |

---

## Build Order for Implementation

The correct sequencing, based on dependencies between components:

```
Phase 1: Test Infrastructure
  1a. Add vitest + jsdom to package.json devDependencies
  1b. Create vitest.config.js
  1c. Create tests/setup/foundry-mocks.js (minimal viable mocks)
  1d. Validate: `npm test` runs with 0 tests, 0 errors

Phase 2: Extract Pure Logic (enables testing)
  2a. Extract NameMatcher → scripts/lib/name-matcher.js
  2b. Extract Logger → scripts/lib/logger.js
  2c. Extract WildcardResolver → scripts/lib/wildcard-resolver.js
  2d. Update main.js imports
  2e. Validate: module still works via manual Foundry test

Phase 3: Unit Tests (uses Phase 2 extractions)
  3a. tests/unit/NameMatcher.test.js (highest value — pure logic)
  3b. tests/unit/WildcardResolver.test.js (mock fetch())
  3c. tests/unit/Logger.test.js (trivial but establishes pattern)
  3d. tests/unit/CompendiumManager.test.js (mock game.packs)
  3e. tests/unit/Controller.test.js (mock canvas, Dialog, ui.notifications)

Phase 4: Error Handling + Bug Fixes (validated by Phase 3 tests)
  4a. Fix null pointer risks (now caught by tests failing for wrong reasons)
  4b. Fix actor race condition
  4c. Add per-compendium error tracking
  4d. Tests prove fixes work

Phase 5: Progress Bar (new class, integrates with existing loop)
  5a. Create ProgressReporter class (v12/v13 version-aware)
  5b. Integrate into replaceNPCTokens() loop
  5c. Add tests for ProgressReporter (mock SceneNavigation, ui.notifications)

Phase 6: Dry-Run Preview (depends on Phase 3 tests proving NameMatcher works)
  6a. Extract dry-run logic from showConfirmationDialog
  6b. Build match results before dialog
  6c. Upgrade dialog to tabular view
  6d. Pass match results through to replacement (no double-matching)
```

---

## Scaling Considerations

This is a Foundry VTT module — "scaling" means scene size and compendium volume, not user count.

| Concern | At 20 tokens | At 200 tokens | Mitigation |
|---------|--------------|---------------|------------|
| Progress bar usefulness | Not needed | Essential for UX | Implement with 10+ token threshold |
| Dry-run dialog height | Readable | Overflow scroll needed | Already in existing confirmation dialog pattern |
| WildcardResolver HEAD probes | Fast | Many parallel fetches | Existing parallel probing with AbortController |
| Monster index load | Fast | Fast (cached) | Already cached in CompendiumManager |
| Test suite speed | <1s | <1s | Unit tests with mocks are always fast |

---

## Sources

- [rayners/foundry-test-utils — Vitest setup for Foundry modules](https://github.com/rayners/foundry-test-utils) — MEDIUM confidence (community library, not official)
- [XDXA: FoundryVTT Module Test Automation](https://xdxa.org/2023/foundryvtt-module-test-automation/) — MEDIUM confidence (2023, still valid approach)
- [Quench — Foundry VTT Packages](https://foundryvtt.com/packages/quench) — HIGH confidence (official package listing)
- [Ethaks/FVTT-Quench GitHub](https://github.com/Ethaks/FVTT-Quench) — HIGH confidence (official Quench repo)
- [Foundry VTT Issue #5692 — displayProgressBar API](https://github.com/foundryvtt/foundryvtt/issues/5692) — HIGH confidence (official, closed/completed)
- [Foundry VTT Issue #9637 — Progress notifications v13](https://github.com/foundryvtt/foundryvtt/issues/9637) — HIGH confidence (official, implemented in v13.332)
- [Foundry v13 Notifications API](https://foundryvtt.com/api/classes/foundry.applications.ui.Notifications.html) — HIGH confidence (official docs)
- [DialogV2 API v13](https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html) — HIGH confidence (official docs)
- [Dialog API v13 (legacy)](https://foundryvtt.com/api/classes/foundry.appv1.api.Dialog.html) — HIGH confidence (official docs)
- [Vitest Mocking Globals Guide](https://vitest.dev/guide/mocking/globals) — HIGH confidence (official Vitest docs)
- [Vitest Features — ESM first](https://vitest.dev/guide/features) — HIGH confidence (official Vitest docs)

---

*Architecture research for: Foundry VTT module testing and reliability (NPC Token Replacer)*
*Researched: 2026-02-28*

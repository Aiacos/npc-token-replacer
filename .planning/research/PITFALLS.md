# Pitfalls Research

**Domain:** Foundry VTT module — stability, testing, and reliability hardening
**Researched:** 2026-02-28
**Confidence:** MEDIUM (Foundry-specific testing ecosystem is thin on documentation; findings are cross-referenced from community sources, official API docs, and direct codebase analysis)

---

## Critical Pitfalls

### Pitfall 1: Testing Static Classes with ES Private Fields via External Mocks

**What goes wrong:**
The codebase uses ES2022 private static fields (`#indexCache`, `#isProcessing`, `#variantCache`, etc.) throughout every class. When setting up unit tests with Vitest+jsdom, tests cannot directly access or reset these fields between test runs. A test that exercises `CompendiumManager.loadMonsterIndex()` pollutes `#indexCache` for every subsequent test in the suite. Test ordering then determines outcomes, and the test suite appears to pass in isolation but fails in batch runs.

**Why it happens:**
ES private fields are language-enforced — no reflection, no `Object.getOwnPropertyDescriptor`, no prototype access. Test frameworks cannot spy on them or reset them. Developers see the pattern working for public static methods and assume private fields are similarly testable.

**How to avoid:**
Design tests to go through the public clearing API (`CompendiumManager.clearCache()`, `NPCTokenReplacerController.clearCache()`, `WildcardResolver.clearCache()`) in `beforeEach`/`afterEach` hooks. Every test that exercises a cached code path must call the public clear method before and after. Do NOT attempt to reach into private fields via workarounds like `Reflect` or transpilation hacks — this breaks on any engine update. MEDIUM confidence — sourced from Vitest mocking docs and JS language spec.

**Warning signs:**
- Tests pass when run individually but fail in full suite
- Test output depends on execution order
- A test that clears cache manually works; the same test without clearing does not

**Phase to address:**
Test framework setup phase. Establish a `beforeEach` template that clears all module caches before every test case.

---

### Pitfall 2: Mocking Foundry Globals Incompletely, Then Believing Tests Are Meaningful

**What goes wrong:**
Developers stub `game.settings.get` and think the test environment is ready. But `CompendiumManager` also calls `game.packs.filter`, `game.packs.get`, `game.actors.has`, `game.i18n.localize`, `game.i18n.format`, `ui.notifications.error`, `ui.notifications.info`, `canvas.scene.tokens.has`, and `Dialog.confirm`. When any of these is `undefined`, the code throws with cryptic errors that look like bugs in the module, not gaps in the mock.

**Why it happens:**
The Foundry `game` object is enormous. Developers mock only what they know the entry-point calls. Code paths that work in Foundry silently fail in test because a downstream call hits `undefined`. The real Foundry runtime provides all these globals; tests provide none of them unless explicitly set up.

**How to avoid:**
Use `@rayners/foundry-test-utils` as the mock foundation — it provides ~600 lines of pre-built global stubs covering `game`, `ui`, `canvas`, `Hooks`, `Dialog`, `CONFIG`, and ApplicationV2. Configure it in `vitest.config.js` as a global setup file so every test starts with a complete stub environment. Supplement with per-test overrides using `vi.fn()` for specific behaviors. Do not build your own mock file from scratch — it will be incomplete and will drift from Foundry's actual API surface. MEDIUM confidence — sourced from `@rayners/foundry-test-utils` documentation and community posts.

**Warning signs:**
- `TypeError: Cannot read properties of undefined` in test output at lines inside the module (not the test file)
- Tests only exercise the first 3-4 lines of a method before throwing
- Mock setup grows to hundreds of lines in individual test files

**Phase to address:**
Test framework setup phase. Get the full mock harness right before writing a single assertion.

---

### Pitfall 3: Treating Quench (In-Foundry Testing) as the Only Option, Then Abandoning CI

**What goes wrong:**
Quench runs tests inside a live Foundry instance in the browser. It works for integration tests that need real compendium data. But it requires a running Foundry server with a valid license, a licensed D&D 5e world, WotC compendiums installed, and Cypress or manual invocation for CI. Teams set up Quench, hit the CI complexity wall, abandon automated testing, and the test suite becomes manual-only.

**Why it happens:**
Quench is the most-visible Foundry testing solution. Its name is prominently listed in Foundry packages. Developers discover it first and assume it is the standard approach for all test types. The CI overhead of a live Foundry instance is only apparent after committing to the approach.

**How to avoid:**
Use a two-tier strategy. Unit tests (pure logic — `NameMatcher.normalizeName`, `NameMatcher.findMatch` with mocked index, `WildcardResolver.selectVariant` with injected variants) run with Vitest+jsdom and no Foundry instance. These run in CI with no special setup. Quench is reserved only for true integration tests (compendium loading, actual token creation) that genuinely need the live environment. For this module, >80% of testable logic can be covered in the Vitest tier. HIGH confidence for this strategic recommendation; individual tool capabilities are MEDIUM confidence.

**Warning signs:**
- All test writing is blocked on "setting up Quench properly"
- Test file count is zero after two weeks of framework work
- CI pipeline requires Docker with a Foundry license to run tests

**Phase to address:**
Test framework setup phase. Decide the two-tier split before writing tests. Default to Vitest for anything that doesn't need live compendiums.

---

### Pitfall 4: Progress Bar API Differs Between v12 and v13 with No Backward-Compatible Shim

**What goes wrong:**
Foundry v13 introduced `ui.notifications.progress()` with `notification.updateProgress(pct)` (released September 2024, v13.332). Foundry v12 has no `progress()` method — only `info()`, `warn()`, `error()`. Code that calls `ui.notifications.progress()` without a version check throws `TypeError: ui.notifications.progress is not a function` on v12. The module currently targets v12+, so a direct progress API call breaks v12 compatibility.

**Why it happens:**
Official v13 documentation documents `progress()` prominently. Developers read current docs, implement it, test on v13, and ship. v12 users then report the module is broken.

**How to avoid:**
Implement a version-aware wrapper before using progress notifications:
```javascript
function showProgress(message, total) {
  if (typeof ui.notifications.progress === "function") {
    // v13+ native progress notification
    const n = ui.notifications.progress(message, { closeOnComplete: true });
    return { update: (done) => n.updateProgress(done / total), close: () => n.updateProgress(total) };
  } else {
    // v12 fallback: re-use info notification, no live update
    const id = ui.notifications.info(message);
    return { update: () => {}, close: () => ui.notifications.remove(id) };
  }
}
```
Use the wrapper everywhere. Do not call `ui.notifications.progress()` directly. MEDIUM confidence — sourced from Foundry v13 API docs and GitHub issue #9637.

**Warning signs:**
- Progress bar works in test environment (v13) but breaks for users (v12 still widely used)
- `TypeError: ui.notifications.progress is not a function` in v12 console

**Phase to address:**
Progress bar implementation phase. Write the version shim first, use it everywhere in the implementation.

---

### Pitfall 5: `Dialog.confirm` Is v12 API — `DialogV2` Is v13 API, and They Are Not Compatible

**What goes wrong:**
The module currently uses `Dialog.confirm({...})` (v12 FormApplication-based dialog). In Foundry v13, `Dialog` is deprecated in favor of `DialogV2`. Code using `Dialog.confirm` will continue to work in v13 (backward compat shim exists) but will eventually break in v14+. More critically, if the dry-run preview dialog is built with `DialogV2` syntax, it will fail on v12.

**Why it happens:**
The v13 migration guide promotes `DialogV2.confirm()` as the new API. Developers building new features use it, not realizing the confirmation dialog must work on v12 too.

**How to avoid:**
For any new dialog code, use `Dialog.confirm` (v12 API) which has a backward compat shim in v13. Do NOT introduce `DialogV2` calls for new features in this milestone — the module still targets v12+. The existing `Dialog.confirm` in `showConfirmationDialog()` is correct. New dialogs for dry-run preview should follow the same pattern. MEDIUM confidence — sourced from Foundry v13 release notes and community migration discussions.

**Warning signs:**
- New dialog code references `DialogV2`, `foundry.applications.api.DialogV2`, or uses `await DialogV2.confirm()`
- v12 users report new dialogs don't open

**Phase to address:**
Dry-run preview implementation phase. Establish a rule: no `DialogV2` until v12 support is explicitly dropped.

---

### Pitfall 6: Hooks Are Never Awaited — Async Code in Hook Callbacks Causes Silent Race Conditions

**What goes wrong:**
Foundry's `Hooks.on()` and `Hooks.once()` never await registered callbacks. If a hook callback is `async`, the Promise it returns is ignored. Code that runs after an async hook callback assumes the callback completed — but it may still be in-flight. This module's `ready` hook triggers async index pre-caching. If tests trigger the `ready` hook and then immediately assert on cache state, the cache is empty because the async work hasn't finished.

**Why it happens:**
Async/await makes sequential-looking code. Developers assume `Hooks.once("ready", async () => { ... })` behaves like awaiting the callback. Foundry's documentation notes this limitation but it is easy to miss.

**How to avoid:**
Never depend on hook callback completion timing in tests. When testing code that is triggered by hooks, call the underlying method directly (e.g., `await NPCTokenReplacerController.initialize()`) instead of triggering via `Hooks.callAll("ready")`. In production code, be explicit: hook callbacks that do async work must handle their own errors internally (wrapped in try/catch) since errors in ignored promises are uncaught. MEDIUM confidence — sourced from Foundry VTT community wiki Hooks documentation and `xdxa.org` testing guide.

**Warning signs:**
- Tests that trigger hooks pass intermittently depending on machine speed
- Assertions on cached state immediately after hook trigger are flaky
- Console shows uncaught Promise rejection from hook callback

**Phase to address:**
Test writing phase (across all test suites). Establish rule: test methods directly, not via hooks.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single combined try/catch for settings get + JSON.parse | Less code | Muddled diagnostics — can't tell which operation failed | Never — split into two blocks |
| Testing through `Dialog.confirm` mock in unit tests | No dialog popup | Tests simulate confirm=true/false but never test dialog content | Acceptable for unit tests; integration test the actual dialog |
| Skipping Quench/integration tests for now | Unblocks CI pipeline | Wildcard probing, compendium loading, token creation never get automated coverage | Acceptable for first milestone if documented as tech debt |
| Using `ui.notifications.info` for progress instead of a real progress bar | One line of code | Users see no feedback during 10+ second operations | Only acceptable for MVP; must replace with real progress in this milestone |
| Null-checking only at entry point, not in internal methods | Cleaner internal code | Internal methods silently fail when called directly from debug API | Acceptable if debug API is documented as "best-effort, no guarantees" |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `CompendiumCollection.getIndex()` | Assuming it always returns array; not handling empty pack | Check `index.size === 0` after call; pack might be empty |
| `game.packs.filter()` | Treating result as guaranteed non-null | Result is always array but may be empty; check length before use |
| `canvas.scene.tokens.has(id)` | Calling when no scene is active (`canvas.scene` is null in certain states) | Guard with `canvas?.scene?.tokens?.has(id)` — scene can be null if no scene is loaded |
| `Actor.createFromCompendium()` (import) | Assuming import succeeds; not checking return value | Import can fail silently if actor already exists or folder creation fails; always check return value |
| `TokenDocument.create()` | Not wrapping in try/catch; assuming scene is ready | Scene might not be ready for mutations (loading state); wrap in try/catch |
| `game.settings.get()` | Not wrapping in try/catch | Settings can throw if module is in uninitialized state; existing code correctly wraps this |
| `ui.notifications.remove(id)` | Calling with undefined id (when notification creation failed) | Check id is defined before calling remove; notification creation can return undefined on failure |
| `Dialog.confirm` close callback | Not handling close as cancel | User closing dialog via X should behave same as "No" — current code handles this, new dialogs must too |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Wildcard probing: 45 parallel HEAD requests per unique creature | Hangs on slow home networks; server sees burst of requests | Implement early-exit after finding 2-3 variants; keep cache, reduce probe count | Already a problem at 5+ unique wildcard creatures simultaneously |
| Sequential token processing: one token blocks the next | 20-token replacement takes 20x single-token time; progress bar appears frozen | Parallel resolve phase (compendium lookup, import) before sequential mutation phase | Noticeable at 10+ tokens; painful at 20+ |
| Index rebuild on every replacement session | 500ms+ delay before first token processes on cold start | Cache already handles this; bug: `loadMonsterIndex()` called twice (init + replacement) — eliminate second call if index is warm | Every replacement after a browser refresh |
| NameMatcher stage-3 partial matching: O(N) iterations for every miss | Slow match for rare creature names; 2000+ iterations per unmatched name | Skip stage 3 early if direct/variant match found; stage 3 is only needed for exotic names | Noticeable only with many misses (50+ non-matching tokens) |
| Progress bar UI updates in tight loop | Reflow/repaint per token in loop causes jank | Batch notifications; update progress at intervals (every 5 tokens) not per-token | Only visible at 20+ tokens with a live progress bar |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| New dialog content built with template literals and unescaped data | XSS in dry-run preview if creature names contain `<script>` | Always use `escapeHtml()` on any actor/token name inserted into dialog HTML; existing pattern is correct |
| Error messages that expose internal paths | Foundry console error logs showing server filesystem paths | Keep error messages user-facing and generic; log details to console, not to `ui.notifications.error` |
| Dry-run preview showing compendium UUIDs unescaped | Information leakage / minor XSS vector | UUIDs are safe (hex+hyphen only) but apply `escapeHtml()` defensively for any string that originates from external data |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress feedback during 10-token replacement | User thinks module is frozen; clicks button again; double-trigger hits `#isProcessing` lock (lock works, but user experience is broken) | Show progress notification immediately with count, update after each token, show final result |
| Progress bar dismisses before user reads result | User doesn't see "10 replaced, 2 not found" message | Show result notification as a separate `ui.notifications.info` call after progress bar completes; don't auto-dismiss result |
| Dry-run shows match names but not compendium source | User can't tell if "Goblin" matches Monster Manual or SRD | Include compendium name (abbreviated) next to each match in the preview list |
| Dry-run preview uses same confirmation dialog pattern | Users see "proceed?" instead of "these are your matches" | Dry-run dialog should be a distinct application or at least a read-only dialog with a separate "Run" button |
| Error dialog for every failed token | 5 errors = 5 popup notifications; user has to dismiss each | Batch errors: "3 tokens failed — see console for details" as single notification |

---

## "Looks Done But Isn't" Checklist

- [ ] **Progress bar:** Shows initial notification with count but never updates — verify the notification updates after each token, not just at start and end
- [ ] **Dry-run preview:** Runs `NameMatcher.findMatch()` for each token and shows results — verify it does NOT modify any scene data, even partially
- [ ] **Error handling hardening:** Each known bug has a test that triggers the bug condition — verify `getEnabledCompendiums` split try/catch test, actor race condition test, empty variant test all exist
- [ ] **Wildcard cache on settings change:** `WildcardResolver.clearCache()` is called in `NPCTokenReplacerController.clearCache()` — verify the call is present and the test confirms cache is actually empty after change
- [ ] **v12/v13 progress API:** Progress wrapper works on both versions — verify the version check path is tested with a mock that has no `.progress()` method
- [ ] **Dry-run cancellable:** User can dismiss dry-run preview without running replacement — verify cancel path leaves scene untouched
- [ ] **Test suite runs in CI:** `npm test` exits 0 with no Foundry instance — verify by running in a clean shell with no Foundry globals defined

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Private field test pollution causing flaky suite | MEDIUM | Add `afterEach(() => NPCTokenReplacerController.clearCache())` to every test file that touches caching code; re-run full suite |
| Incomplete mock causes test suite to always throw | LOW | Add `@rayners/foundry-test-utils` setup file to `vitest.config.js`; re-run |
| Progress bar API breaks v12 users | MEDIUM | Ship hotfix: wrap `ui.notifications.progress` call in try/catch with fallback to `info()`; release as patch version |
| DialogV2 breaks v12 users | HIGH | Revert to `Dialog.confirm` pattern; test on v12 before any release |
| Dry-run modifies scene data unexpectedly | HIGH | Add explicit guard: dry-run code path must never call `createEmbeddedDocuments` or `deleteEmbeddedDocuments` — enforce with a flag parameter, not just code review |
| Hook async race condition in tests causes intermittent failures | LOW | Replace all `Hooks.callAll("ready")` test triggers with direct method calls |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Private field test pollution | Test framework setup | `npm test` runs full suite in randomized order without failures |
| Incomplete Foundry global mocks | Test framework setup | Every test file imports from shared setup; no `is not a function` errors from mock gaps |
| Quench-only strategy blocking CI | Test framework setup (decision) | CI pipeline runs `npm test` without Foundry instance and exits 0 |
| Progress API v12/v13 divergence | Progress bar implementation | v12 compatibility test: mock `ui.notifications` without `.progress()`, verify no throw |
| Dialog v12/v13 divergence | Dry-run preview implementation | No `DialogV2` references in `git grep`; all dialogs use `Dialog` API |
| Hooks async race conditions | Test writing (all phases) | Zero flaky tests: suite runs 10x in a row with consistent results |
| Dry-run modifying scene data | Dry-run implementation | Dry-run test asserts `createEmbeddedDocuments` mock was never called |
| Error message batching | Error handling hardening phase | No `ui.notifications.error` called more than once per replacement session |
| Progress bar no live updates | Progress bar implementation | Test asserts notification update called N times for N tokens processed |
| Missing escapeHtml in dry-run | Dry-run implementation | Code review checklist: all template literal interpolations use `escapeHtml()` |

---

## Sources

- [Quench — Foundry VTT module testing via Mocha/Chai in-browser](https://github.com/Ethaks/FVTT-Quench) — official source, HIGH confidence for Quench-specific claims
- [FoundryVTT Module Test Automation — xdxa.org (2023)](https://xdxa.org/2023/foundryvtt-module-test-automation/) — MEDIUM confidence; practical CI experience report
- [@rayners/foundry-test-utils GitHub](https://github.com/rayners/foundry-test-utils) — MEDIUM confidence; shared mock library, pre-built Foundry stubs for Vitest
- [Foundry VTT Notifications API v13](https://foundryvtt.com/api/classes/foundry.applications.ui.Notifications.html) — HIGH confidence; official docs
- [Foundry VTT Notifications API v12](https://foundryvtt.com/api/v12/classes/client.Notifications.html) — HIGH confidence; official docs
- [GitHub Issue #9637 — Refactor Notifications, add progress type](https://github.com/foundryvtt/foundryvtt/issues/9637) — HIGH confidence; closed September 2024, confirmed in v13.332
- [Hooks documentation — Foundry VTT Community Wiki](https://foundryvtt.wiki/en/development/guides/Hooks_Listening_Calling) — MEDIUM confidence; community wiki
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html) — HIGH confidence; official Vitest docs
- [Jest ES6 Class Mocks](https://jestjs.io/docs/es6-class-mocks) — HIGH confidence; applicable patterns for private field limitations
- [Foundry VTT GitHub Issue #7151 — canvas.tokens.get with no scene throws](https://github.com/foundryvtt/foundryvtt/issues/7151) — HIGH confidence; confirmed null-canvas issue
- [Foundry VTT GitHub Issue #9934 — Simultaneous embedded Document updates dropped](https://github.com/foundryvtt/foundryvtt/issues/9934) — HIGH confidence; known engine issue with concurrent mutations
- Codebase CONCERNS.md — direct analysis of this module's known bugs and fragile areas — HIGH confidence (first-party)

---
*Pitfalls research for: Foundry VTT module stability/testing milestone*
*Researched: 2026-02-28*

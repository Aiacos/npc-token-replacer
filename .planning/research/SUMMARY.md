# Project Research Summary

**Project:** NPC Token Replacer — Stability & Quality Milestone
**Domain:** Foundry VTT module testing and reliability infrastructure
**Researched:** 2026-02-28
**Confidence:** MEDIUM

## Executive Summary

NPC Token Replacer v1.4.0 is a functioning, published Foundry VTT module with a solid OOP architecture, but it lacks automated tests, has several known null-pointer risks, and provides minimal user feedback during operations. The stability milestone goal is to make the module production-grade: add a test layer that runs in CI without a live Foundry instance, fix the known fragile code paths, and add user-visible progress feedback. The recommended approach is Vitest + `@rayners/foundry-test-utils` for unit tests (fast, no Foundry required, CI-compatible), with pure-logic classes extracted to testable files under `scripts/lib/`, while keeping Foundry-integrated classes in `main.js`.

The two highest-value deliverables are: (1) unit tests for `NameMatcher`, `WildcardResolver`, and `CompendiumManager` — these are the classes most likely to silently break when Foundry APIs change; and (2) error handling hardening — fixing the conflated try/catch in settings parsing and adding a null guard on actor lookup. Both are prerequisite to safe future development. A live progress bar for multi-token replacement and a dry-run match preview are the primary UX differentiators and should follow test infrastructure.

The primary risks are (a) mocking Foundry's large global API surface incompletely, causing misleading test results, and (b) the v12/v13 API split for progress notifications. Both are mitigated by using the pre-built `foundry-test-utils` mock suite and writing version-aware wrappers before any progress API call. The module already handles v12/v13 differences for toolbar controls — the same pattern must be applied to the new progress API.

## Key Findings

### Recommended Stack

The test stack adds zero runtime dependencies and requires no build-step changes. Vitest 4.x (native ES module support, jsdom environment) replaces what would otherwise require complex Babel transforms with Jest. `@rayners/foundry-test-utils` v1.2.2 provides ~600 lines of pre-built Foundry global mocks covering `game`, `ui`, `canvas`, `Hooks`, and document classes — preventing the most common test setup failure mode (incomplete mocks). `@vitest/coverage-v8` provides native V8 coverage at zero overhead.

**Core technologies:**
- **Vitest 4.0.18**: Unit test runner — native ESM, no transpilation, jsdom environment, `vi.stubGlobal` for Foundry globals; requires Node >=20 (environment has 25.6.1)
- **@rayners/foundry-test-utils 1.2.2**: Pre-built Foundry mock suite — eliminates 300-600 lines of hand-rolled mock boilerplate; use as `setupFiles` in vitest config
- **@vitest/coverage-v8 4.0.18**: V8-native code coverage — zero instrumentation overhead; must match Vitest exact version
- **jsdom 28.1.0**: Browser environment for Node — peer dependency of Vitest 4.x, provides `window`, `fetch`, DOM APIs

Globals NOT covered by foundry-test-utils and requiring manual stubs: `Dialog`, `FormApplication`, `FilePicker`, `CompendiumCollection`, `TokenDocument`.

### Expected Features

This is a stability milestone, not a feature release. The target state is "production-grade reliability."

**Must have (table stakes for v1.5.0):**
- Graceful error messages for all known failure modes — every caught exception in user-triggered flows must reach `ui.notifications`, not just `Logger`
- Null guard on actor lookup before map use — prevents silent race condition bug (CONCERNS.md line 38)
- Split try/catch in `getEnabledCompendiums()` — settings retrieval failure vs. JSON parse failure have different causes and different user messages
- Wildcard cache cleared on settings change — one-line addition to `NPCTokenReplacerController.clearCache()`
- Live progress bar for multi-token replacement — `ui.notifications.info({progress: true})` with per-token `.update({pct})` calls, v12/v13 version-aware
- Automated unit tests for pure logic — `NameMatcher.findMatch()`, `normalizeName()`, `WildcardResolver.isWildcardPath()`, `selectVariant()`, `CompendiumManager` priority resolution

**Should have (v1.5.x, after v1.5.0 stabilizes):**
- Dry-run match preview in confirmation dialog — shows token-to-creature mapping before committing; highest UX differentiator vs. competitors
- Per-compendium load error tracking — `CompendiumManager.getLastLoadErrors()` for diagnosing silent pack failures
- Configurable HTTP timeout — settings field for `DEFAULT_HTTP_TIMEOUT_MS`; targets slow-network users

**Defer (v2.0+):**
- Quench integration tests — requires running Foundry instance, not feasible in CI without Docker + license
- Batch token mutations — performance optimization requiring major loop refactor; only safe after test coverage exists
- Errors & Echoes telemetry integration — premature without an active user base
- Full i18n localization — infrastructure (lang/en.json) exists; blocked on translation content, not code

### Architecture Approach

The architecture adds a `tests/` layer alongside the existing module without modifying its runtime structure. Classes are split into two tiers: pure-logic classes (`NameMatcher`, `WildcardResolver`, `Logger`) extracted to `scripts/lib/` as named ES module exports for direct unit testing, and Foundry-integrated classes (`CompendiumManager`, `TokenReplacer`, `NPCTokenReplacerController`, `FolderManager`, `CompendiumSelectorForm`) remaining in `main.js` and tested via the full mock suite. A `ProgressReporter` class wraps the v12/v13 progress API divergence behind a stable internal interface.

**Major components:**
1. `tests/setup/foundry-mocks.js` — centralizes all Foundry global stubs; individual tests override specific behaviors via `vi.fn()` mockImplementation
2. `scripts/lib/` (new) — extracted pure-logic classes with ES module exports; directly importable by test files without Foundry runtime
3. `ProgressReporter` (new class) — version-aware wrapper; `start()`, `update(pct)`, `finish()` API; uses v13 progress notifications or v12 SceneNavigation fallback
4. Enhanced confirmation dialog — dry-run preview extends existing `Dialog.confirm` pattern with tabular match results; must stay on `Dialog` API (not `DialogV2`) while v12 support is active

Testing patterns: always reset private-field caches via `clearCache()` in `beforeEach`; test observable behavior not private state; call methods directly rather than triggering hooks (Hooks never await async callbacks).

### Critical Pitfalls

1. **Private field test pollution** — ES private fields (`#indexCache`, `#variantCache`, etc.) cannot be reset externally; tests that omit `clearCache()` in `beforeEach` produce order-dependent failures. Prevention: establish `beforeEach` template clearing all caches before writing any test.

2. **Incomplete Foundry global mocks producing misleading tests** — stubs that cover only entry-point calls miss downstream calls to `game.packs.filter`, `game.actors.has`, `ui.notifications.info`, etc., causing `TypeError: undefined is not a function` that looks like a module bug. Prevention: use `@rayners/foundry-test-utils` as the mock foundation; never build a mock file from scratch.

3. **Progress API v12/v13 divergence** — `ui.notifications.progress()` (v13) throws `TypeError` on v12; `SceneNavigation.displayProgressBar()` (v12) is deprecated in v13. Prevention: write a `ProgressReporter` shim before any progress API call; test the v12 path explicitly by mocking `ui.notifications` without `.progress()`.

4. **Hooks never await async callbacks** — `Hooks.on("ready", async () => {...})` returns a ignored Promise; tests that trigger the ready hook and immediately assert on cache state are flaky. Prevention: test methods directly (e.g., `await NPCTokenReplacerController.initialize()`), not via hook triggers.

5. **DialogV2 breaking v12 users** — `DialogV2.confirm()` is the v13 API; it fails on v12. The existing `Dialog.confirm` has a v13 backward-compat shim and must remain the pattern for all new dialogs while v12 support is active.

## Implications for Roadmap

Based on combined research, a 6-phase implementation order is recommended. Each phase has hard dependencies on the previous one.

### Phase 1: Test Infrastructure Setup
**Rationale:** All subsequent changes risk regressions without a safety net. Tests must exist before bugs are fixed, because the fix could silently introduce a new bug. This is the critical prerequisite identified across all four research files.
**Delivers:** `npm test` runs in CI with 0 tests, 0 errors; Vitest + foundry-test-utils configured; `beforeEach` cache-clearing template established; `vitest.config.js` with jsdom environment and `unstubGlobals: true`
**Addresses:** Table-stakes feature — automated test coverage
**Avoids:** Pitfall 2 (incomplete mocks), Pitfall 3 (Quench-only strategy blocking CI)

### Phase 2: Extract Pure Logic Classes
**Rationale:** `NameMatcher`, `WildcardResolver`, and `Logger` have no Foundry dependencies and are fully unit-testable, but only after they have named ES module exports. This extraction is a structural prerequisite for Phase 3 unit tests.
**Delivers:** `scripts/lib/name-matcher.js`, `scripts/lib/wildcard-resolver.js`, `scripts/lib/logger.js` with explicit exports; `main.js` updated to import from them; module validated to still work via manual Foundry test
**Uses:** No new dependencies — native ES module imports, no build step change
**Implements:** Dependency boundary pattern from ARCHITECTURE.md

### Phase 3: Unit Tests for Pure Logic
**Rationale:** With extracted classes and a working test harness, write the highest-value tests first. `NameMatcher` and `WildcardResolver` are stateless logic that can be tested exhaustively. These tests become the regression guard for all subsequent changes.
**Delivers:** `tests/unit/NameMatcher.test.js`, `tests/unit/WildcardResolver.test.js`, `tests/unit/Logger.test.js`, `tests/unit/CompendiumManager.test.js`, `tests/unit/Controller.test.js`; measurable coverage baseline
**Avoids:** Pitfall 1 (private field pollution — via `beforeEach` clearing), Pitfall 4 (hooks async race — by calling methods directly)

### Phase 4: Error Handling Hardening
**Rationale:** Known bugs (null actor lookup, conflated try/catch in settings) are now safely fixable with tests in place to catch regressions. This phase converts "production-grade" from aspirational to verified.
**Delivers:** Null guard on actor lookup; split try/catch in `getEnabledCompendiums()`; audit confirms all error paths reach `ui.notifications`; wildcard cache invalidated on settings change; tests proving each fix
**Addresses:** All P1 table-stakes reliability features from FEATURES.md

### Phase 5: Progress Bar
**Rationale:** The UX gap of no feedback during 10-50 token operations is independently deliverable and does not depend on the dry-run feature. The `ProgressReporter` class isolates the v12/v13 API split from the main loop logic.
**Delivers:** `ProgressReporter` class with `start()`, `update(pct, label)`, `finish()` API; integrated into `replaceNPCTokens()` loop; progress bar tests covering both v12 and v13 code paths
**Implements:** Progress bar pattern from ARCHITECTURE.md; version-aware wrapper
**Avoids:** Pitfall 3 (progress API v12/v13 divergence) — the shim is the entire phase deliverable

### Phase 6: Dry-Run Match Preview
**Rationale:** Requires Phase 3 tests proving NameMatcher works correctly (so preview results are trusted), and Phase 4 hardening (so the confirmation dialog path is reliable). This is the primary UX differentiator vs. competitor modules.
**Delivers:** Pre-replacement match preview showing [Token | Will Match As | Compendium]; extended confirmation dialog using `Dialog.confirm` (not `DialogV2`); dry-run results passed through to actual replacement (no double-matching); tests asserting `createEmbeddedDocuments` is never called in dry-run path
**Addresses:** Dry-run preview from FEATURES.md Should Have list
**Avoids:** Pitfall 5 (DialogV2 breaking v12); security issue (escapeHtml on all interpolated names)

### Phase Ordering Rationale

- Phases 1-2 are structural prerequisites, not features. No meaningful test can be written until the test harness exists and classes have exports.
- Phase 3 before Phase 4 is deliberate: fixing bugs without tests is high-risk; the tests catch whether the fix works and whether it breaks something else.
- Progress bar (Phase 5) is independent of dry-run (Phase 6) but both require the test foundation. Phase 5 is simpler and delivers visible UX value sooner.
- Dry-run (Phase 6) depends on confirmed-correct `NameMatcher` behavior (Phase 3) and is the most complex new UI code — it belongs last in the milestone.

### Research Flags

Phases needing deeper research during planning:
- **Phase 5 (Progress Bar):** v12 `SceneNavigation.displayProgressBar` exact signature and behavior should be verified against a v12 Foundry instance before implementation. STACK.md notes MEDIUM confidence on v12 compatibility — inferred from docs, not tested.
- **Phase 6 (Dry-Run Preview):** The `Dialog.confirm` content rendering in v13 compatibility mode should be verified. PITFALLS.md notes the shim exists but is deprecated and will eventually break.

Phases with standard patterns (skip research):
- **Phase 1 (Test Infrastructure):** Vitest + foundry-test-utils configuration is well-documented with HIGH confidence sources. Follow STACK.md config verbatim.
- **Phase 2 (Extract Classes):** ES module extraction is a standard refactor. No unknowns.
- **Phase 3 (Unit Tests):** ARCHITECTURE.md provides concrete test patterns with code examples. Follow them.
- **Phase 4 (Error Handling):** CONCERNS.md identifies exact line numbers. Changes are surgical and well-scoped.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Vitest 4.x config verified HIGH; foundry-test-utils v1.2.2 is a young library (3 versions, created June 2025) — MEDIUM; v12 progress fallback inferred from docs, not tested |
| Features | MEDIUM | Foundry VTT module quality standards are community-consensus, not official spec; CONCERNS.md (first-party) is HIGH confidence for bug locations |
| Architecture | MEDIUM | Test architecture patterns are well-established; specific Foundry-mock interaction patterns are MEDIUM (community sources, 2023 articles) |
| Pitfalls | MEDIUM | ES private field behavior is HIGH (language spec); Foundry API version divergence is HIGH (official docs); CI strategies are MEDIUM (community experience reports) |

**Overall confidence:** MEDIUM

### Gaps to Address

- **foundry-test-utils mock coverage completeness:** The library is young (v1.2.2, June 2025 creation). If it does not cover `game.actors.has`, `canvas.scene.tokens`, or `CompendiumCollection` adequately, `tests/setup/foundry-mocks.js` must be extended. Verify coverage before committing to the library as the sole mock source.
- **v12 progress bar behavior:** `SceneNavigation.displayProgressBar()` v12 signature needs validation against an actual v12 Foundry instance. The PITFALLS.md shim example should be tested before shipping.
- **Dialog.confirm v13 shim longevity:** The backward-compat shim for `Dialog.confirm` in v13 will be removed in v14. The milestone should document this as a known future breaking change so it is tracked, not discovered.
- **Node.js version in CI:** Vitest 4.x requires Node >=20. CI environment must be confirmed to have a compatible Node version before the test pipeline is set up.

## Sources

### Primary (HIGH confidence)
- [Foundry VTT v13 Notifications API](https://foundryvtt.com/api/classes/foundry.applications.ui.Notifications.html) — progress notification signatures, `update()`, `remove()` patterns
- [Foundry VTT GitHub Issue #9637](https://github.com/foundryvtt/foundryvtt/issues/9637) — progress notification design, confirmed in v13.332
- [Foundry VTT GitHub Issue #7151](https://github.com/foundryvtt/foundryvtt/issues/7151) — null canvas issue when no scene active
- [Vitest 4.0 official docs](https://vitest.dev/) — configuration, `vi.stubGlobal`, jsdom environment, coverage options
- [npm: vitest@4.0.18](https://www.npmjs.com/package/vitest) — version and engine requirements verified via `npm info`
- [DialogV2 API v13](https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html) — confirmed v13 dialog API
- [.planning/codebase/CONCERNS.md](file:///home/aiacos/workspace/FoundryVTT/token_updater/.planning/codebase/CONCERNS.md) — authoritative first-party bug analysis with line numbers

### Secondary (MEDIUM confidence)
- [npm: @rayners/foundry-test-utils@1.2.2](https://www.npmjs.com/package/@rayners/foundry-test-utils) — mock coverage verified from package docs; young library
- [GitHub: Ethaks/FVTT-Quench v0.10.0](https://github.com/Ethaks/FVTT-Quench) — Quench capabilities and CI limitations
- [XDXA: FoundryVTT Module Test Automation](https://xdxa.org/2023/foundryvtt-module-test-automation/) — integration vs. unit test tradeoffs for Foundry modules
- [Foundry VTT GitHub Issue #9934](https://github.com/foundryvtt/foundryvtt/issues/9934) — concurrent embedded document update race condition

### Tertiary (LOW confidence)
- [Foundry VTT Package Best Practices Wiki](https://foundryvtt.wiki/en/development/guides/package-best-practices) — page dynamically rendered, content unverified; existence confirmed only

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*

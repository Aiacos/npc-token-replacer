# Roadmap: NPC Token Replacer — Stability & Reliability Milestone

## Overview

This milestone takes NPC Token Replacer from a functioning v1.4.0 module to a production-grade, publicly distributable release. The work proceeds in dependency order: establish a test harness first, extract pure-logic classes to make them testable, write the unit tests, harden error handling under test coverage, then add the two user-facing features (progress bar and dry-run preview) that distinguish this module from alternatives.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Test Infrastructure** - Configure Vitest + foundry-test-utils so `npm test` runs clean with zero errors
- [x] **Phase 2: Extract Pure Logic** - Move NameMatcher, WildcardResolver, Logger to scripts/lib/ with named exports
- [x] **Phase 3: Unit Tests** - Write unit tests for all pure-logic classes and CompendiumManager; establish coverage baseline
- [ ] **Phase 4: Error Handling Hardening** - Fix known bugs and ensure all user-triggered errors surface via ui.notifications
- [x] **Phase 5: Progress Bar** - Add live progress bar during multi-token replacement with v12/v13 version-aware ProgressReporter (completed 2026-03-06)
- [ ] **Phase 6: Dry-Run Preview** - Add pre-replacement match preview dialog showing token-to-creature mapping before committing

## Phase Details

### Phase 1: Test Infrastructure
**Goal**: `npm test` runs in CI without a Foundry instance, exits 0, and establishes the structural foundation all subsequent tests depend on
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-06
**Success Criteria** (what must be TRUE):
  1. Running `npm test` from the project root exits with code 0 and produces Vitest output (not a placeholder error)
  2. Vitest is configured with jsdom environment, `unstubGlobals: true`, and foundry-test-utils as setupFiles
  3. A `beforeEach` cache-clearing template exists in the test setup that other test files can follow
  4. The test suite runs with 0 test files and 0 errors — a clean slate that proves infrastructure works before tests are written
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Install Vitest + foundry-test-utils, configure test runner, create mock setup files and smoke test

### Phase 2: Extract Pure Logic
**Goal**: NameMatcher, WildcardResolver, and Logger exist as named ES module exports in scripts/lib/ so unit tests can import them without Foundry globals
**Depends on**: Phase 1
**Requirements**: TEST-02
**Success Criteria** (what must be TRUE):
  1. `scripts/lib/name-matcher.js`, `scripts/lib/wildcard-resolver.js`, and `scripts/lib/logger.js` exist with explicit named exports
  2. `scripts/main.js` imports from scripts/lib/ and the module loads correctly in Foundry (manual verify)
  3. A test file can `import { NameMatcher } from '../scripts/lib/name-matcher.js'` without any Foundry global stubs and the import succeeds
**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Extract Logger, WildcardResolver, NameMatcher to scripts/lib/, update main.js imports, add remaining exports, write import validation tests

### Phase 3: Unit Tests
**Goal**: Unit tests for all pure-logic classes and CompendiumManager establish a regression safety net before any bug fixes are made
**Depends on**: Phase 2
**Requirements**: TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. `npm test` runs tests for NameMatcher (normalizeName, exact match, variant match, partial match, selectBestMatch) and all pass
  2. `npm test` runs tests for WildcardResolver (isWildcardPath, selectVariant for none/sequential/random modes, resolveWildcardVariants with mocked fetch) and all pass
  3. `npm test` runs tests for CompendiumManager (priority resolution, detectWOTCCompendiums filtering, getEnabledCompendiums with valid/corrupt settings) and all pass
  4. Coverage report is generated and shows a measurable baseline percentage for the tested classes
  5. Each test file uses `beforeEach` to clear all relevant caches, preventing order-dependent failures
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Write unit tests for NameMatcher (normalizeName, findMatch stages, selectBestMatch) and WildcardResolver (isWildcardPath, selectVariant, resolveWildcardVariants)
- [x] 03-02-PLAN.md — Write unit tests for CompendiumManager (priority resolution, detection filtering, settings parsing) and verify coverage baseline

### Phase 4: Error Handling Hardening
**Goal**: All known bugs are fixed under test coverage and every user-triggered failure produces a visible ui.notifications error, not a silent log entry
**Depends on**: Phase 3
**Requirements**: BUG-01, BUG-02, BUG-03, ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. Actor lookup checks `game.actors.has()` before use — deleting an actor between lookup build and token processing does not throw a null pointer error
  2. `getEnabledCompendiums()` has separate try/catch blocks for settings retrieval and JSON.parse, and each produces a distinct localized error message
  3. Calling `NPCTokenReplacerController.clearCache()` also clears the WildcardResolver variant cache — changing the variation mode setting takes effect immediately on next run
  4. After a replacement run with partial failures, the user sees a summary notification classifying failures as no_match, import_failed, or creation_failed
  5. `CompendiumManager.getLastLoadErrors()` is exposed via the debug API and returns per-compendium load success/failure from the most recent index load
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Fix BUG-01/02/03 bugs and add ERR-01 ui.notifications pairing for all user-triggered error paths
- [ ] 04-02-PLAN.md — Implement ERR-02 failure classification and ERR-03 per-compendium load error tracking with debug API

### Phase 5: Progress Bar
**Goal**: Users see a live progress bar during multi-token replacement operations so they know the module is working and how far along it is
**Depends on**: Phase 4
**Requirements**: UX-01
**Success Criteria** (what must be TRUE):
  1. During a replacement run with 2+ tokens, a progress bar appears in the Foundry UI and advances as each token is processed
  2. The progress bar works on both Foundry v12 (SceneNavigation fallback) and v13 (ui.notifications progress API) without throwing errors on either version
  3. The progress bar reaches 100% and disappears when the run completes or fails
  4. A `ProgressReporter` class with `start()`, `update(pct, label)`, and `finish()` wraps the version divergence and is tested with mocks for both v12 and v13 code paths
**Plans:** 2/2 plans complete

Plans:
- [ ] 05-01-PLAN.md — Create ProgressReporter class with TDD covering v12 SceneNavigation and v13 notifications progress paths
- [ ] 05-02-PLAN.md — Wire ProgressReporter into replaceNPCTokens loop and add progress localization keys

### Phase 6: Dry-Run Preview
**Goal**: Users can preview which tokens will match to which compendium creatures before committing any changes to their scene
**Depends on**: Phase 5
**Requirements**: UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. Before replacement begins, a dialog shows a table of [Token Name | Will Match As | Source Compendium] for every token that would be replaced
  2. Users can cancel from the preview dialog and no scene changes are made — `createEmbeddedDocuments` is never called in the dry-run path
  3. Accepting the preview runs the actual replacement using the already-computed match results (no double-matching)
  4. All token and creature names in the preview dialog are HTML-escaped via `escapeHtml` before rendering
  5. The HTTP timeout for wildcard HEAD requests is configurable via a module setting (replacing the hardcoded DEFAULT_HTTP_TIMEOUT_MS constant)
**Plans:** 1/2 plans executed

Plans:
- [ ] 06-01-PLAN.md — Add HTTP timeout setting, wire into WildcardResolver, extract computeMatches method
- [ ] 06-02-PLAN.md — Create preview dialog replacing confirmation dialog, refactor replaceNPCTokens to use pre-computed matches

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Infrastructure | 1/1 | Complete | 2026-03-01 |
| 2. Extract Pure Logic | 1/1 | Complete | 2026-03-01 |
| 3. Unit Tests | 2/2 | Complete | 2026-03-01 |
| 4. Error Handling Hardening | 0/2 | Not started | - |
| 5. Progress Bar | 2/2 | Complete   | 2026-03-06 |
| 6. Dry-Run Preview | 1/2 | In Progress|  |

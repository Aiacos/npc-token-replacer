---
phase: 02-extract-pure-logic
plan: 01
subsystem: testing
tags: [es-modules, dependency-injection, static-setter, named-exports, pure-logic-extraction]

# Dependency graph
requires:
  - phase: 01-test-infrastructure
    provides: "Working test runner: npm test exits 0 with Vitest 3.2.4"
provides:
  - "Logger, MODULE_ID exported from scripts/lib/logger.js (zero dependencies)"
  - "WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS exported from scripts/lib/wildcard-resolver.js (imports Logger only)"
  - "NameMatcher exported from scripts/lib/name-matcher.js with setCompendiumManager() dependency injection"
  - "FolderManager, CompendiumManager, TokenReplacer, NPCTokenReplacerController exported from scripts/main.js"
  - "Import validation tests proving lib/ files load without Foundry globals (10 tests)"
affects: [03-unit-tests, 04-error-handling, 05-progress-bar, 06-dry-run]

# Tech tracking
tech-stack:
  added: []
  patterns: [es-module-extraction, static-setter-dependency-injection, null-safe-optional-chaining]

key-files:
  created: [scripts/lib/logger.js, scripts/lib/wildcard-resolver.js, scripts/lib/name-matcher.js, tests/lib/import-validation.test.js]
  modified: [scripts/main.js]

key-decisions:
  - "MODULE_ID exported from logger.js (primary consumer) rather than a separate constants.js"
  - "Static setter pattern for NameMatcher's CompendiumManager dependency (setCompendiumManager) - simplest approach that doesn't change public API"
  - "Null-safe optional chaining (_CompendiumManager?.method() ?? fallback) for graceful degradation when dependency not wired"
  - "Named exports added to main.js for 4 remaining classes (FolderManager, CompendiumManager, TokenReplacer, NPCTokenReplacerController)"

patterns-established:
  - "ES module extraction pattern: move class verbatim to lib/, add import/export, verify in Node.js"
  - "Dependency injection via static setter: module-level let variable + static setCompendiumManager()"
  - "Import validation test pattern: verify exports exist and pure methods work without Foundry globals"

requirements-completed: [TEST-02]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 2 Plan 1: Extract Pure Logic Summary

**Logger, WildcardResolver, NameMatcher extracted to scripts/lib/ as ES modules with named exports, dependency injection for NameMatcher, and 10 import validation tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T06:55:23Z
- **Completed:** 2026-03-01T07:01:56Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Extracted 3 pure-logic classes from monolithic main.js (2152 lines) to individual files under scripts/lib/
- Implemented dependency injection for NameMatcher via static setter, breaking the compile-time dependency on CompendiumManager
- Added named exports for all 7 classes across lib/ files and main.js, fully satisfying TEST-02
- Created 10 import validation tests proving lib/ files load and function without Foundry globals
- Total test suite: 16 passing tests (6 smoke + 10 import validation)
- Coverage report now includes scripts/lib/ files

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract Logger, WildcardResolver, and NameMatcher to scripts/lib/** - `c11a462` (feat)
2. **Task 2: Update main.js imports, wire dependency, and add remaining exports** - `18b59c5` (refactor)
3. **Task 3: Write import validation tests and run full suite** - `666a156` (test)

## Files Created/Modified
- `scripts/lib/logger.js` - Logger class and MODULE_ID constant (zero imports, pure console.* logging)
- `scripts/lib/wildcard-resolver.js` - WildcardResolver class and DEFAULT_HTTP_TIMEOUT_MS (imports Logger only)
- `scripts/lib/name-matcher.js` - NameMatcher class with setCompendiumManager() dependency injection (imports Logger only)
- `scripts/main.js` - Imports from lib/, wires NameMatcher dependency, exports remaining 4 classes
- `tests/lib/import-validation.test.js` - 10 tests validating imports work without Foundry globals

## Decisions Made
- Exported MODULE_ID from logger.js rather than creating a separate constants.js file (only one constant needed, Logger is primary consumer)
- Used static setter pattern (`setCompendiumManager()`) for dependency injection instead of parameter injection on every method call (doesn't change public API, called once during module init)
- Applied null-safe optional chaining (`_CompendiumManager?.method() ?? fallback`) at all 5 CompendiumManager call sites in NameMatcher for graceful degradation
- Added export statement for all 4 remaining classes in main.js in this plan (not deferred) to fully satisfy TEST-02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 7 classes now have named exports, enabling direct import in unit tests
- Phase 3 can write unit tests that import Logger, WildcardResolver, NameMatcher directly from scripts/lib/ without Foundry global stubs
- Phase 3 can import FolderManager, CompendiumManager, TokenReplacer, NPCTokenReplacerController from scripts/main.js (with Foundry mocks from Phase 1 setup)
- Import validation test pattern established for future extraction work

## Self-Check: PASSED

- All 5 created/modified files exist on disk
- All 3 task commits (c11a462, 18b59c5, 666a156) found in git history
- `npm test` exits 0 with 16 passing tests

---
*Phase: 02-extract-pure-logic*
*Completed: 2026-03-01*

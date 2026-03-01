---
phase: 04-error-handling-hardening
plan: 02
subsystem: error-handling
tags: [error-classification, debug-api, localization, foundry-vtt]

# Dependency graph
requires:
  - phase: 04-error-handling-hardening (plan 01)
    provides: ERR-01 per-compendium load error notifications, BUG-01/02/03 fixes
provides:
  - ERR-02 structured failure classification (import_failed, creation_failed) in token processing
  - ERR-03 per-compendium load error tracking via CompendiumManager.getLastLoadErrors()
  - SummaryPartialFailure localization key for classified error summary
  - Debug API exposure of getLastLoadErrors
affects: [phase-05-progress-dry-run, phase-06-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error message heuristic for failure classification (import vs creation stage)"
    - "Defensive copy pattern for getLastLoadErrors (spread operator)"
    - "End-to-end behavioral testing of private method paths via public API"

key-files:
  created: []
  modified:
    - scripts/main.js
    - lang/en.json
    - tests/error-handling.test.js

key-decisions:
  - "Error message heuristic for import vs creation classification — checks for 'import', 'failed to load', 'getdocument' keywords; defaults to creation_failed for unknown errors"
  - "Single SummaryPartialFailure notification replaces generic ErrorCount — shows all four counts (replaced, noMatch, importFailed, creationFailed) in one notification"

patterns-established:
  - "Error classification via message heuristic: check controlled error messages rather than mutating thrown errors"
  - "Debug API wiring pattern: public static getter on class + delegation in getDebugAPI()"

requirements-completed: [ERR-02, ERR-03]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 4 Plan 2: Failure Classification & Load Error Tracking Summary

**Structured failure classification (import_failed/creation_failed) replacing generic error status, plus per-compendium load error tracking via getLastLoadErrors debug API**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T08:34:55Z
- **Completed:** 2026-03-01T08:40:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ERR-02: Token processing now classifies failures as "import_failed" or "creation_failed" instead of generic "error", with a single classified summary notification (SummaryPartialFailure)
- ERR-03: CompendiumManager tracks per-compendium load errors during loadMonsterIndex, exposed via getLastLoadErrors() and the debug API
- 9 new tests (6 ERR-03 + 3 ERR-02 end-to-end behavioral), all 102 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement ERR-02 failure classification and ERR-03 load error tracking** - `4d54145` (feat)
2. **Task 2: Write tests for ERR-02 and ERR-03** - `fd2ad81` (test)

## Files Created/Modified
- `scripts/main.js` - ERR-02 failure classification in #processToken/#reportResults, ERR-03 #lastLoadErrors tracking in CompendiumManager, getLastLoadErrors() method, debug API wiring
- `lang/en.json` - SummaryPartialFailure localization key for classified error summary
- `tests/error-handling.test.js` - 9 new tests for ERR-02 classification and ERR-03 load error tracking

## Decisions Made
- Used error message heuristic (checking for "import", "failed to load", "getdocument" keywords) to classify failures rather than mutating thrown errors or restructuring replaceToken internals. Defaults to "creation_failed" for unknown errors since import is attempted first.
- Single SummaryPartialFailure notification replaces the old generic ErrorCount, showing all four counts in one message for better user awareness.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Error handling hardening phase (Phase 4) fully complete
- All 102 tests passing, no regressions
- Ready for Phase 5 (Progress & Dry Run)
- No blockers or concerns

## Self-Check: PASSED

- All created files exist (scripts/main.js, lang/en.json, tests/error-handling.test.js, 04-02-SUMMARY.md)
- All commits verified (4d54145, fd2ad81)
- All 102 tests passing

---
*Phase: 04-error-handling-hardening*
*Completed: 2026-03-01*

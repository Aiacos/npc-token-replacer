---
phase: 06-dry-run-preview
plan: 02
subsystem: ui
tags: [dialog, preview, dry-run, token-replacement, html-escape, localization]

# Dependency graph
requires:
  - phase: 06-dry-run-preview
    provides: computeMatches method for pre-computing token-to-creature matches
provides:
  - showPreviewDialog with 3-column match table replacing old confirmation dialog
  - Refactored replaceNPCTokens using computeMatches + preview + direct replacement
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [preview-before-action dialog with pre-computed data, sorted matched/unmatched display]

key-files:
  created: []
  modified:
    - scripts/main.js
    - lang/en.json
    - tests/dry-run-preview.test.js
    - tests/error-handling.test.js

key-decisions:
  - "showPreviewDialog uses Dialog.confirm pattern matching existing codebase conventions"
  - "Render callback disables yes button only when matched.length===0 (all unmatched)"
  - "Error classification logic inlined from removed #processToken into replacement loop"

patterns-established:
  - "Preview-before-action: computeMatches -> showPreviewDialog -> use pre-computed results"
  - "Sorted display: matched items first, unmatched items last in preview tables"

requirements-completed: [UX-02]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 6 Plan 2: Preview Dialog + replaceNPCTokens Refactor Summary

**3-column preview dialog (Token Name | Will Match As | Source Compendium) replacing old confirmation, with pre-computed match reuse eliminating double-matching**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T06:53:41Z
- **Completed:** 2026-03-06T06:59:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- showPreviewDialog renders sorted 3-column table with HTML-escaped names, scrollable container, disabled Replace when all unmatched
- replaceNPCTokens refactored: computeMatches -> showPreviewDialog -> direct replacement using pre-computed match.entry/match.pack
- Old showConfirmationDialog and #processToken removed (zero dead code)
- 17 new tests (10 preview dialog + 7 integration), all 136 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create showPreviewDialog and add preview localization keys** - `7b5bee5` (feat)
2. **Task 2: Refactor replaceNPCTokens to use computeMatches + showPreviewDialog flow** - `37734e0` (feat)

_Note: Task 1 used TDD (RED+GREEN committed together)._

## Files Created/Modified
- `scripts/main.js` - showPreviewDialog added, replaceNPCTokens refactored, showConfirmationDialog and #processToken removed
- `lang/en.json` - PreviewTitle, PreviewSummary, PreviewColToken, PreviewColMatch, PreviewColSource, PreviewNoMatch keys
- `tests/dry-run-preview.test.js` - 17 new tests for preview dialog and integration flow
- `tests/error-handling.test.js` - Updated to mock showPreviewDialog instead of showConfirmationDialog

## Decisions Made
- showPreviewDialog uses Dialog.confirm pattern matching existing codebase conventions
- Render callback disables yes button only when matched.length===0 (all unmatched)
- Error classification logic inlined from removed #processToken into replacement loop
- Test assertions check localization keys (not English text) since mock i18n returns keys

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 phases complete - full milestone v1.4 feature set delivered
- 136 tests passing across 8 test files
- Dry-run preview flow fully operational with no double-matching

## Self-Check: PASSED

All 4 modified files verified present. Both task commits (7b5bee5, 37734e0) verified in git log. 136/136 tests passing.

---
*Phase: 06-dry-run-preview*
*Completed: 2026-03-06*

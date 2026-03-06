---
phase: 06-dry-run-preview
plan: 01
subsystem: ui
tags: [foundry-settings, wildcard-resolver, dry-run, name-matching, progress-reporter]

# Dependency graph
requires:
  - phase: 05-progress-bar
    provides: ProgressReporter class for scan progress feedback
  - phase: 02-extract-pure-logic
    provides: NameMatcher.findMatch extracted for direct use
provides:
  - httpTimeout user-configurable setting (1-30s) wired into WildcardResolver
  - computeMatches(tokens, index, progress) static method on NPCTokenReplacerController
affects: [06-02-preview-dialog, wildcard-resolver, settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [settings-aware getter with try/catch fallback, match pre-computation separation]

key-files:
  created:
    - tests/dry-run-preview.test.js
  modified:
    - scripts/lib/wildcard-resolver.js
    - scripts/main.js
    - lang/en.json
    - tests/lib/wildcard-resolver.test.js

key-decisions:
  - "WildcardResolver.DEFAULT_TIMEOUT uses try/catch around game.settings.get for safe fallback when settings not yet registered"
  - "computeMatches is public static (not private) to enable testing and Plan 02 preview flow access"

patterns-established:
  - "Settings-aware getter: try game.settings.get with catch fallback to constant default"
  - "Match pre-computation: separate find-matches from replace-tokens for preview flow"

requirements-completed: [UX-03, UX-02]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 6 Plan 1: HTTP Timeout Setting + Match Pre-computation Summary

**Configurable HTTP timeout setting (1-30s) wired into WildcardResolver, plus computeMatches method separating match-finding from token replacement for dry-run preview**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T06:47:41Z
- **Completed:** 2026-03-06T06:50:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- httpTimeout setting registered in Foundry module settings with Number type, 1-30 range, default 5 seconds
- WildcardResolver.DEFAULT_TIMEOUT reads from game.settings with safe 5000ms fallback
- computeMatches extracts match pre-computation from replacement loop, returning {tokenDoc, creatureName, match} arrays
- 8 new tests (3 httpTimeout + 5 computeMatches), all 119 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add configurable HTTP timeout setting and wire into WildcardResolver** - `988bc71` (feat)
2. **Task 2: Extract computeMatches method and create dry-run-preview test scaffold** - `0e9880f` (feat)

_Note: TDD tasks committed RED+GREEN together since tests and implementation are tightly coupled._

## Files Created/Modified
- `scripts/lib/wildcard-resolver.js` - DEFAULT_TIMEOUT getter reads from game.settings with fallback, imports MODULE_ID
- `scripts/main.js` - httpTimeout setting registration, computeMatches static method, removed unused DEFAULT_HTTP_TIMEOUT_MS import
- `lang/en.json` - HttpTimeout setting labels, PreviewScanning localization key
- `tests/lib/wildcard-resolver.test.js` - 3 tests for httpTimeout setting integration and fallback
- `tests/dry-run-preview.test.js` - 5 tests for computeMatches shape, call count, progress integration

## Decisions Made
- WildcardResolver.DEFAULT_TIMEOUT uses try/catch around game.settings.get for safe fallback when settings not yet registered
- computeMatches is public static (not private) to enable testing and Plan 02 preview flow access
- Removed DEFAULT_HTTP_TIMEOUT_MS import from main.js since it is no longer needed there (only used internally by WildcardResolver)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- computeMatches method ready for Plan 02 to wire into preview dialog between match-finding and replacement
- httpTimeout setting visible in Foundry module configuration
- All 119 tests passing

## Self-Check: PASSED

All 5 created/modified files verified present. Both task commits (988bc71, 0e9880f) verified in git log. 119/119 tests passing.

---
*Phase: 06-dry-run-preview*
*Completed: 2026-03-06*

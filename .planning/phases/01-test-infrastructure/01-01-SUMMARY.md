---
phase: 01-test-infrastructure
plan: 01
subsystem: testing
tags: [vitest, jsdom, foundry-test-utils, coverage-v8, esm]

# Dependency graph
requires:
  - phase: none
    provides: first phase -- no prior dependencies
provides:
  - "Working test runner: npm test exits 0 with Vitest 3.2.4"
  - "Foundry VTT mock setup: foundry-test-utils + project-specific extensions"
  - "Cache-clearing beforeEach template for test isolation"
  - "Coverage infrastructure: npm run test:coverage produces v8 coverage report"
  - "Smoke test proving infrastructure works (6 passing tests)"
affects: [02-extract-pure-logic, 03-unit-tests, 04-error-handling, 05-progress-bar, 06-dry-run]

# Tech tracking
tech-stack:
  added: [vitest@3.2.4, "@rayners/foundry-test-utils@1.2.2", "@vitest/coverage-v8@3.2.4", jsdom@27.4.0]
  patterns: [vitest-jsdom-foundry-mocks, setupFiles-chain, cache-clearing-beforeEach]

key-files:
  created: [vitest.config.js, tests/setup/foundry-mocks.js, tests/setup/cache-clearing.js, tests/smoke.test.js]
  modified: [package.json, .gitignore]

key-decisions:
  - "Vitest 3.x (not 4.x) due to foundry-test-utils peer dependency constraint"
  - "v8 coverage provider for native ESM support without transpilation"
  - "Guard mocks with globalThis checks for forward compatibility with foundry-test-utils updates"

patterns-established:
  - "setupFiles chain: foundry-test-utils first, then project-specific mocks"
  - "Cache-clearing template: each test file adapts the pattern for its classes"
  - "Mock gap documentation: table in foundry-mocks.js tracks what each phase needs"

requirements-completed: [TEST-01, TEST-06]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 1 Plan 1: Test Infrastructure Summary

**Vitest 3.2.4 test runner with jsdom, foundry-test-utils Foundry global mocks, v8 coverage, and 6 passing smoke tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T06:11:30Z
- **Completed:** 2026-03-01T06:14:13Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Vitest configured with jsdom environment, unstubGlobals, passWithNoTests, and foundry-test-utils setup
- Project-specific Foundry mocks added for game.packs, CompendiumCollection, TokenDocument, FilePicker
- Cache-clearing beforeEach template documented for all 4 class cache methods
- Coverage infrastructure verified (v8 provider, text + html reporters)
- 6 smoke tests pass validating both foundry-test-utils globals and project mocks

## Task Commits

Each task was committed atomically:

1. **Task 1: Install test dependencies and configure Vitest** - `40f386d` (chore)
2. **Task 2: Create test setup files and smoke test** - `b5396a0` (feat)

## Files Created/Modified
- `package.json` - Updated name to npc-token-replacer, added type:module, test scripts, 4 devDependencies
- `vitest.config.js` - Vitest config with jsdom, unstubGlobals, passWithNoTests, setupFiles chain, coverage v8
- `.gitignore` - Added coverage/ exclusion
- `tests/setup/foundry-mocks.js` - Project-specific Foundry mock extensions (game.packs, CompendiumCollection, TokenDocument, FilePicker)
- `tests/setup/cache-clearing.js` - Documented beforeEach template for cache clearing pattern
- `tests/smoke.test.js` - 6 smoke tests validating infrastructure works

## Decisions Made
- Used Vitest 3.2.4 (not 4.x) to satisfy foundry-test-utils peer dependency `vitest: "^3.1.0"`
- Chose v8 coverage provider over Istanbul for native ESM + private field support
- Guarded all project mocks with `if (!globalThis.X)` / `if (typeof globalThis.X === "undefined")` for forward compatibility
- Made cache-clearing.js a reference template (not auto-executed via setupFiles) so test files can selectively import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi type assertion in smoke test**
- **Found during:** Task 2 (smoke test verification)
- **Issue:** Plan specified `typeof vi === 'function'` but Vitest's `vi` global is an object (namespace), not a function
- **Fix:** Changed assertion to `vi.toBeDefined()` and `typeof vi.fn === 'function'`
- **Files modified:** tests/smoke.test.js
- **Verification:** All 6 smoke tests pass
- **Committed in:** b5396a0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor assertion correction. No scope change.

## Issues Encountered
- npm install showed deprecation warnings for transitive dependencies (inflight, glob, whatwg-encoding) -- these are in foundry-test-utils' dependency tree and not actionable by this project
- 2 vulnerabilities reported by npm audit (in transitive dependencies) -- not addressable here

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Test runner fully operational: `npm test` exits 0, `npm run test:coverage` produces coverage output
- Phase 2 can extract classes to scripts/lib/ and immediately write test imports
- Phase 3 can write unit tests using the established mock setup and cache-clearing pattern
- Mock gap table in foundry-mocks.js documents exactly what Phase 3 needs to extend

## Self-Check: PASSED

- All 6 created/modified files exist on disk
- Both task commits (40f386d, b5396a0) found in git history
- `npm test` exits 0 with 6 passing tests

---
*Phase: 01-test-infrastructure*
*Completed: 2026-03-01*

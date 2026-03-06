# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.4 — Stability & Reliability

**Shipped:** 2026-03-06
**Phases:** 6 | **Plans:** 10

### What Was Built
- Vitest test infrastructure with Foundry mocks (136 tests, 58%+ coverage)
- Modular ES module architecture (Logger, WildcardResolver, NameMatcher, ProgressReporter)
- Bug fixes: stale actor cache, ambiguous settings errors, cache propagation
- Structured error handling with failure classification and per-compendium load tracking
- Version-agnostic ProgressReporter (v12 SceneNavigation / v13 notifications)
- Dry-run preview dialog with 3-column match table and configurable HTTP timeout

### What Worked
- TDD approach for new features (ProgressReporter, computeMatches) caught issues early
- Duck-typing for v12/v13 detection avoided brittle version string checks
- Pre-computing matches before preview eliminated double-matching cleanly
- Extracting pure logic to scripts/lib/ made testing straightforward

### What Was Inefficient
- Phase 4 roadmap checkbox not auto-checked (minor tracking gap)
- UAT manual testing not completed before milestone close

### Patterns Established
- Flat localization keys (NPC_REPLACER.ErrorSettingsRetrieve) to avoid dot-separator conflicts
- Settings-aware getters with try/catch fallback for pre-registration safety
- Match result data structure {tokenDoc, creatureName, match} as contract between scan/preview/replace
- Instance-based reporters (not static) for per-session state

### Key Lessons
1. Extract pure logic before writing tests — dramatically reduces mock complexity
2. Duck-typing (typeof checks) > version string parsing for API compatibility
3. Compute-then-present pattern enables both preview and no-double-work guarantees

### Cost Observations
- Model mix: primarily opus for execution, sonnet for verification
- Total execution time: ~38 minutes across 10 plans
- Notable: average 3.8 min/plan — consistent velocity throughout

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.4 | 6 | 10 | First milestone with GSD workflow |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.4 | 136 | 58%+ | 0 (native APIs only) |

### Top Lessons (Verified Across Milestones)

1. Extract pure logic before testing — reduces mock complexity by 80%+
2. TDD for new features catches integration issues early

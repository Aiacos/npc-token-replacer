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

## Milestone: v1.7 — Future-Proofing & Release Automation

**Shipped:** 2026-08-30
**Phases:** 0 (outside the GSD workflow) | **Releases:** 1.7.0 → 1.7.3

### What Was Built
- `FoundryCompat`: feature-detected access to every relocated Foundry API
- `SourceDetector`: WotC whitelist plus opt-in signals, dynamic priority classification
- ApplicationV2 settings form with a legacy FormApplication fallback, one shared model
- `tools/`: manifest/i18n/template/translation validation, version bumping, Foundry
  generation watch, package registry publishing — all with unit tests
- Self-maintaining CI/CD: one-trigger release, weekly compatibility watch,
  Dependabot auto-merge for low-risk updates
- English and Italian READMEs, `docs/`, and a Constitution in `CLAUDE.md`

### What Worked
- **Empirical verification beat reading release notes.** Judging the four
  dependency upgrades from their changelogs would have approved vitest 4 (none of
  its breaking changes affected us) and probably jsdom 30 (its tests pass).
  Installing them in an isolated copy revealed an `ERESOLVE` conflict and a Node
  floor bump that no upstream document mentioned.
- **Reading `main` before merging into it.** `develop` was 24 commits ahead but
  4 behind, and those 4 contained a deliberate breaking change in the opposite
  direction. A fast merge would have silently reverted it.
- **Feature detection as a policy, not a technique.** Extending the v1.4
  duck-typing convention into a single layer made the v14 migration mechanical.

### What Was Inefficient
- Two of three milestones shipped without touching `.planning/`, so it went six
  months stale and the branch divergence went unnoticed until it was expensive
- The `FOUNDRY_PACKAGE_TOKEN` guide was written from documentation without
  checking that the package existed on foundryvtt.com. It returns 404 — the guide
  described an impossible first step until the user tried it
- Two workflow bugs of the same family (`&&` and `!=` under `set -e` / GitHub
  expression coercion) shipped before being caught by inspection rather than tests
- Version 1.5.0 was chosen for the develop line while 1.5.0 was already published

### Patterns Established
- Resolve Foundry base classes at registration time, never at module evaluation
- Blocklists over allowlists when classifying external data
- Errors narrow scope, never widen it
- Every cache declares a maximum size
- Both compatibility paths get a test — API present and absent
- Structural parity checks in CI for things text comparison cannot cover
  (translation keys, README chapter icons)

### Key Lessons
1. **Verify the premise before writing the procedure.** A guide can be perfectly
   accurate about steps 2-4 and still be useless if step 1 is impossible.
2. **Install the upgrade, do not read about it.** Peer-dependency conflicts and
   engine floors are invisible in release notes.
3. **A green PR is not evidence that releasing works** — release workflows are
   never exercised by pull-request CI. That asymmetry drives the policy of never
   auto-merging major updates.
4. **Planning docs that skip a milestone stop being trustworthy for all of them.**
   The vitest 3.x constraint rediscovered empirically in August had been recorded
   in `.planning` in March under decision [01-01].

### Cost Observations
- Single long session; releases 1.7.0 through 1.7.3 in one day
- Heaviest cost was reconciling a divergence that regular merges would have avoided

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.4 | 6 | 10 | First milestone with GSD workflow |
| v1.5–v1.6 | 0 | 0 | Shipped outside the workflow; `.planning/` went stale |
| v1.7 | 0 | 0 | Shipped outside the workflow; reconciled the resulting divergence |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.4 | 136 | 58%+ | 0 (native APIs only) |
| v1.5–v1.6 | ~150 | not measured | 0 |
| v1.7 | 232 | not re-measured | 0 |

### Top Lessons (Verified Across Milestones)

1. Extract pure logic before testing — reduces mock complexity by 80%+
2. TDD for new features catches integration issues early
3. Feature-detect APIs; never parse version strings
4. Install a dependency upgrade before judging it — release notes hide peer conflicts
5. Work that skips the workflow still has to land a ROADMAP and STATE entry

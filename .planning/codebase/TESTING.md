# Testing

**Analysis Date:** 2026-08-30

## Test Framework

Vitest 3.x with the jsdom environment and globals enabled. Foundry globals come
from `@rayners/foundry-test-utils`, extended by `tests/setup/foundry-mocks.js`
for what that library does not provide (`game.packs`, `canvas.tokens`,
`FilePicker`, `SceneNavigation`).

```bash
npm test              # 232 tests, 16 files
npm run test:watch
npm run test:coverage # v8 provider, reports into coverage/
npm run check         # lint → validate → test
```

## Test File Organization

Tests mirror the source layout. Files under `tests/` cover classes that live in
`main.js`; `tests/lib/` and `tests/tools/` mirror their source directories.

| File | Tests | Covers |
|------|-------|--------|
| `tests/compendium-manager.test.js` | 32 | Detection, priorities, enabled-compendium modes, caches |
| `tests/dry-run-preview.test.js` | 22 | Preview dialog content, escaping, confirm/cancel, flow order |
| `tests/error-handling.test.js` | 20 | Failure classification, notifications, cache propagation |
| `tests/lib/compendium-selector.test.js` | 20 | Settings model, save paths, mode toggling, shell factory |
| `tests/lib/name-matcher.test.js` | 21 | Three matching stages and priority tie-breaking |
| `tests/lib/wildcard-resolver.test.js` | 20 | HEAD probing, variant modes, cache behaviour |
| `tests/lib/foundry-compat.test.js` | 17 | Both dialog paths, API resolution order, generation parsing |
| `tests/lib/source-detector.test.js` | 16 | Tier recognition, prefix rejection, dynamic priority |
| `tests/tools/dependabot-triage.test.js` | 16 | Update classification and merge/hold decisions |
| `tests/lib/import-validation.test.js` | 10 | Module import surface |
| `tests/lib/progress-reporter.test.js` | 9 | v13+ and v12 progress paths |
| `tests/tools/bump-version.test.js` | 8 | Bump arithmetic, no-op guard, changelog promotion |
| `tests/smoke.test.js` | 6 | Basic wiring |
| `tests/replace-token.test.js` | 6 | Token replacement, ordering, delete failures |
| `tests/register-control-button.test.js` | 5 | v12 array and v13+ object control formats |
| `tests/folder-manager.test.js` | 4 | Import folder resolution |

## Testing Approach

Unit tests against mocked Foundry globals. There are no integration tests
against a real Foundry client — see Coverage Gaps.

## Mock Patterns

**Mocks must execute predicates, never return canned data.** This is the pattern
that makes the filtering logic actually testable:

```javascript
game.packs.filter = vi.fn(predicate => mockPacks.filter(predicate));
```

**Both compatibility paths get tested.** Anything routed through `FoundryCompat`
needs a test with the modern API present *and* absent — `foundry-compat.test.js`
swaps `globalThis.foundry` per test to exercise DialogV2 and the AppV1 fallback.

**Clear static caches in `beforeEach`.** Every class caches; a leaked cache makes
tests pass or fail depending on order.

## Error Testing

`TokenReplacerError` carries a `phase` (`import_failed`, `creation_failed`,
`delete_failed`), so failure classification is asserted directly rather than by
matching message strings.

## Coverage Gaps

- **No runtime verification against a real Foundry client.** The ApplicationV2
  form path, the v13/v14 `onChange` toolbar registration and detection against
  real compendiums are covered only by doubles. Largest gap in the project.
- `loadMonsterIndex()` is covered at the error level but not for full index
  construction across multiple packs.
- No Quench in-engine tests.
- No performance or load testing; behaviour with a very large scene is untested.

## Regression Prevention

Beyond the suite, CI enforces:

- `npm run validate` — manifest fields, referenced files exist, i18n keys used in
  source exist in `lang/en.json`, template and Handlebars partial paths resolve,
  translation parity, README chapter-icon parity, and that
  `compatibility.maximum` is never set
- A package smoke test that opens the built ZIP and asserts every
  manifest-referenced file is inside it

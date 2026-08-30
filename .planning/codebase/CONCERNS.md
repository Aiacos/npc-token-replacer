# Concerns

**Analysis Date:** 2026-08-30

The previous version of this file (2026-02-28) cited line numbers in a `main.js`
that has since been refactored from ~2000 lines to 1220 across 8 files. Those
references no longer resolve and have been removed rather than repaired.

## Tech Debt

### Sequential token replacement — 2N socket round-trips
- Severity: **medium**
- Where: the replacement loop in `NPCTokenReplacerController.replaceNPCTokens()`
- Each token does its own `createEmbeddedDocuments` then `deleteEmbeddedDocuments`.
  A parallel resolve phase followed by one batched create and one batched delete
  would cut this to two calls.
- Why deferred: needs a real rework of the loop and of failure classification,
  and cannot be validated without a live client.

### `VARIANT_SUFFIXES` is hardcoded
- Severity: **low**
- Where: `scripts/lib/wildcard-resolver.js`
- Variants are probed as 1-5, 01-05 and a-e. `FilePicker.browse()` would list the
  directory instead of guessing, but was never investigated.

## Known Bugs

None open. Resolved in v1.7: the dialog timeout leaving its window open, the
lock-release race condition, the wildcard 404 cache miss, the `disposition` dead
write, and the module-load failure that `extends FormApplication` would have
caused once Foundry removes that global.

## Security Considerations

Fixed in v1.7 (these had been sitting on `develop`, unreleased, since March):

- Path traversal in wildcard probe URLs — now validated before the request
- XSS in progress bar labels — creature names are escaped
- Token data allowlist — only named fields are copied from the compendium prototype
- jQuery removed from the last DOM interactions

Standing posture: no `eval`, no `innerHTML` with unescaped input, no secrets in
the repository, HEAD probes are same-origin and timeout-bounded, and the only
pipeline secret is a repository secret that never appears in logs.

## Performance Bottlenecks

- The sequential replacement loop (above)
- Wildcard probing is a series of HEAD requests per creature; results are cached
  including negative results, bounded FIFO at 200 entries
- Index building is O(n) over every entry of every enabled compendium, done once
  per session and cached; name matching itself is O(1) through prebuilt maps

## Fragile Areas

### Detection depends on package metadata shapes
`SourceDetector` reads `pack.metadata.packageName/packageType`,
`game.modules.get(id).authors/protected/relationships/packs`. If Foundry changes
those shapes, detection silently returns fewer sources. Every access is
optional-chained and wrapped, so it degrades to "nothing detected" rather than
throwing — but it degrades quietly.

### `compendiumSource` path for the actor lookup
`TokenReplacer.buildActorLookup()` reads `a._stats?.compendiumSource` with
`a.flags?.core?.sourceId` as fallback. If both move, the lookup returns an empty
map and every replacement re-imports actors, creating duplicates.

### The release workflow is not exercised by PR CI
`release.yml` and `foundry-compat.yml` only ever run for real. A change that
breaks them passes CI. Mitigated by ordering: the release pushes its tag before
building, so a failure stops before anything is published.

## Scaling Limits

Untested above modest scene sizes. The index is held entirely in memory; a world
with every official book installed is on the order of a few thousand entries,
which is fine, but this has never been measured.

## Dependencies at Risk

### `@rayners/foundry-test-utils` — the whole test suite depends on it
Version 1.2.2 is its latest release and it pins `peer vitest: ^3.1.0` and
`peer jsdom: ^26.1.0 || ^27.0.0`. vitest 4 is refused by npm outright. If the
package is abandoned, the suite is stuck on vitest 3 or the Foundry mocks have to
be written in-house. Recorded as `ignore` entries in `.github/dependabot.yml`.

### Foundry AppV1 removal in v16
`Dialog` and `FormApplication` are deprecated with removal announced for v16.
Already mitigated: both are reached through `FoundryCompat`, which prefers the V2
path, and the settings form resolves its base class lazily.

## Missing Critical Features

- **Runtime verification.** Nothing here has ever run against a real Foundry
  client. This is the single largest risk in the project.
- **Package listing.** The module is not on foundryvtt.com, so it cannot be found
  in Foundry's package browser and the registry announcement is dormant.

## Test Coverage Gaps

- No integration test against a live Foundry client, and no Quench in-engine tests
- `loadMonsterIndex()` is covered for failures but not for full index construction
  across multiple packs
- No performance or large-scene testing

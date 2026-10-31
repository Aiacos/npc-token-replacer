# 📋 TODO

Open work only. Finished items are removed — their record lives in
[CHANGELOG.md](CHANGELOG.md). Code-level markers use `// TODO [PRIORITY] Category: …`.

## Medium

- [ ] **Batch token mutations** — the replace loop makes 2N sequential socket round-trips.
  Split into a parallel resolve phase and one batched create/delete per scene.
  → `scripts/main.js` (`TODO [MEDIUM] Performance`)
- [ ] **`compendiumSource` fallback** — if core moves `_stats.compendiumSource`, the actor
  lookup empties and actors are re-imported. Overwritten DDB actors already carry
  `flags.npc-token-replacer.sourceUuid`; extend that tag to regular imports.
  → `scripts/main.js` (`TODO [MEDIUM] Compatibility`, `buildActorLookup`)
- [ ] **Preserved-property allowlist** silently drops token fields added by future Foundry
  versions. → `scripts/main.js` (`TODO [MEDIUM] Compatibility`)
- [ ] **Verify in a live v13/v14 world**: a DDB Importer actor is overwritten with its
  items and effects replaced (not merged) — both from a scene token and from the
  world-wide pass; the replace button shows at the bottom of the Actors tab; a
  protected WotC book outside the list is used and announced; DialogV2 honours
  `disabled` on the confirm button. → `scripts/lib/compendium-selector.js`,
  `scripts/lib/foundry-compat.js`

## Low

- [ ] **Foundry registry announcements never ran**: the Release workflow skips the
  step because the `FOUNDRY_PACKAGE_TOKEN` secret is not set (it logs a skip and
  stays green). Installs via the manifest URL still update; the package listing on
  foundryvtt.com does not. → repository secrets, `tools/publish-foundry.mjs`

- [ ] **Hardcoded wildcard variant suffixes** — investigate `FilePicker.browse()` instead of
  HEAD probes. → `scripts/lib/wildcard-resolver.js` (`TODO [LOW] Maintainability`)
- [ ] **Dependabot triage treats 0.x minor bumps as non-breaking** and auto-merges them.
  → `tools/dependabot-triage.mjs`
- [ ] **Auto-merge loop stops at the first failing PR** under `set -e`.
  → `.github/workflows/dependabot-auto-merge.yml`
- [ ] **Compatibility-watch PR targets the default branch**, while work flows through
  `develop`. → `.github/workflows/foundry-compat.yml`
- [ ] **Legacy-shell test leaks `globalThis.FormApplication`** into later tests in the file.
  → `tests/lib/compendium-selector.test.js`

## Blocked

- [ ] **Vitest 4 / jsdom ≥28** — blocked by `@rayners/foundry-test-utils` peer ranges.
  See `docs/DEVELOPMENT.md` and `.github/dependabot.yml`.

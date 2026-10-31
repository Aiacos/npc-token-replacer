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
- [ ] **Verify in a live v13/v14 world**: the compendium picker opens and saves; a DDB
  Importer actor is overwritten with its items replaced (not merged); DialogV2 honours
  `disabled` on the confirm button. → `scripts/lib/compendium-selector.js`,
  `scripts/lib/foundry-compat.js`

## Low

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

# 📋 TODO

Open work only. Finished items are removed — their record lives in
[CHANGELOG.md](CHANGELOG.md). Code-level markers use `// TODO [PRIORITY] Category: …`.

## Medium

- [ ] **Batch token mutations** — the replace loop makes 2N sequential socket round-trips.
  Split into a parallel resolve phase and one batched create/delete per scene.
  → `scripts/main.js` (`TODO [MEDIUM] Performance`)
- [ ] **Tag regular imports too** — overwritten DDB actors carry
  `flags.npc-token-replacer.sourceUuid`, plain imports rely on `_stats.compendiumSource`.
  Tagging imports as well removes the last dependency on that core field.
  → `scripts/lib/actor-importer.js` (`buildActorLookup`, `resolveWorldActor`)
- [ ] **Preserved-property allowlist** silently drops token fields added by future Foundry
  versions. → `scripts/main.js` (`TODO [MEDIUM] Compatibility`)
- [ ] **Verify in a live v13/v14 world**: a DDB Importer actor is overwritten with its
  items and effects replaced (not merged); a protected WotC book outside the list is
  used and announced; DialogV2 honours `disabled` on the confirm button; Custom
  Selection saves the ticked packs. (The Actors-tab button was confirmed on 14.369.)
  → `scripts/lib/actor-importer.js`, `scripts/lib/foundry-compat.js`
- [ ] **`protected` as a trust signal** — the `verified` tier assumes a homebrew manifest
  cannot meaningfully claim `protected: true`. Confirm against Foundry's package
  handling; if it can, require `owned` too. → `scripts/lib/source-detector.js`
- [ ] **Finish the main.js split**: one guarded settings reader instead of six
  try/catch copies; extract the per-token loop into its own method; move the
  controller to `scripts/lib/` so `main.js` is only the entry point.

## Low

- [ ] **Foundry registry announcements never ran**: the Release workflow skips the
  step because the `FOUNDRY_PACKAGE_TOKEN` secret is not set (it logs a skip and
  stays green). Installs via the manifest URL still update; the package listing on
  foundryvtt.com does not. → repository secrets, `tools/publish-foundry.mjs`

- [ ] **Hardcoded wildcard variant suffixes** — investigate `FilePicker.browse()` instead of
  HEAD probes. → `scripts/lib/wildcard-resolver.js` (`TODO [LOW] Maintainability`)
- [ ] **Dependabot triage treats 0.x minor bumps as non-breaking** and auto-merges them.
  → `tools/dependabot-triage.mjs`
- [ ] **Compatibility-watch PR targets the default branch**, while work flows through
  `develop`. → `.github/workflows/foundry-compat.yml`
- [ ] **Test harness defaults to v12-like globals** (no `foundry.applications`, global
  `Dialog`/`FormApplication`, `game.system.id = "test-system"`), so most dialog and
  settings tests run the legacy path. Add a v13/v14 harness and cover the DialogV2
  timeout/close path and the AppV2 settings render. Several tests assign globals
  (`fetch`, `Dialog`, `FormApplication`) without restoring them — use `vi.stubGlobal`.
  → `tests/setup/`, `tests/dry-run-preview.test.js`, `tests/lib/compendium-selector.test.js`
- [ ] **Tool scripts lack tests**: `validate-manifest.mjs` (spawn against fixture
  folders), `publish-foundry.mjs` (extract `buildPayload`), `check-foundry-version.mjs`
  (it also matches Testing/Prototype release links, not only stable). → `tools/`
- [ ] **README.it.md parity**: the Italian README links to the Architecture chapter
  instead of translating it, and its Credits differ. → `README.it.md`
- [ ] **Old CHANGELOG entries** use placeholder dates (1.0.0–1.5.0) and a few
  non-standard headings. → `CHANGELOG.md`

## Blocked

- [ ] **Vitest 4 / jsdom ≥28** — blocked by `@rayners/foundry-test-utils` peer ranges.
  See `docs/DEVELOPMENT.md` and `.github/dependabot.yml`.

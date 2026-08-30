# Milestones

## v1.4 Stability & Reliability (Shipped: 2026-03-06)

**Phases completed:** 6 phases, 10 plans
**Timeline:** 6 days (2026-03-01 to 2026-03-06)
**Tests:** 136 passing across 8 test files

**Key accomplishments:**
- Vitest test infrastructure with Foundry mocks (136 tests, 58%+ coverage)
- Modular architecture: Logger, WildcardResolver, NameMatcher extracted to ES modules
- Bug fixes: stale actor cache, ambiguous settings errors, cache propagation
- Error handling: structured failure classification, per-compendium load tracking, user-facing notifications
- Progress bar: version-agnostic ProgressReporter (v12 SceneNavigation / v13 notifications)
- Dry-run preview: 3-column match preview dialog with pre-computed results, configurable HTTP timeout

**Known Gaps:**
- Phase 6 UAT incomplete (manual testing not finished)
- No milestone audit performed

---

## v1.5 – v1.6 Official Content Detection (Shipped: 2026-04-24)

**Phases completed:** none — delivered directly on `main`, outside the GSD workflow
**Timeline:** one day
**Tests:** 10 test files on that branch

**Key accomplishments:**
- Support for all official D&D 5e manuals; compatibility raised to v13 minimum
- First CI/CD pipeline (CI and Release workflows)
- Italian UI localization (`lang/it.json`)
- v1.6.0, breaking: detection restricted to an explicit whitelist of the 11 WotC
  packages. Prefix matching was removed because `dnd-` and `ddb-` also match the
  DDB-Importer, homebrew and community adventures

**Known Gaps:**
- Shipped without a ROADMAP or STATE entry, so `.planning/` went stale
- `develop` was never merged back, leaving that line's security fixes unreleased
- No stylesheet: `styles/` did not exist on this branch, so the preview dialog
  and the settings form were unstyled

---

## v1.7 Future-Proofing & Release Automation (Shipped: 2026-08-30)

**Phases completed:** none — delivered in one session, outside the GSD workflow
**Timeline:** one day, releases 1.7.0 through 1.7.3
**Tests:** 232 passing across 16 test files

**Key accomplishments:**
- Reconciled the `main` / `develop` divergence. v1.6.0's whitelist kept as the
  trusted default; signal-based detection layered on top as opt-in, so a book
  released after this version is surfaced with a warning rather than ignored
- `FoundryCompat`: every relocated Foundry API resolved by feature detection
- Settings form built by a factory — ApplicationV2 when available, legacy
  FormApplication otherwise. The previous `extends FormApplication` declaration
  would have failed the entire module import once Foundry removes that global in v16
- Security fixes from the `develop` line reached a release for the first time:
  path traversal, XSS in progress labels, token data allowlist, jQuery removal
- `tools/`: manifest, i18n, template, partial and translation validation; version
  bumping; Foundry generation watch; package registry publishing
- CI/CD: Node 20+22 matrix, package smoke test, one-trigger release pipeline,
  weekly Foundry compatibility watch, Dependabot with auto-merge for low-risk updates
- Documentation: English and Italian READMEs, `docs/COMPATIBILITY.md`,
  `docs/DEVELOPMENT.md`, Constitution of non-negotiable principles in `CLAUDE.md`
- GitHub Actions upgraded to v7 after verifying every intermediate major

**Known Gaps:**
- Nothing has been exercised against a real Foundry client — all evidence comes
  from test doubles
- The package is not listed on foundryvtt.com, so `FOUNDRY_PACKAGE_TOKEN` cannot
  exist and the registry announcement is dormant
- Three dev-dependency majors pinned by `@rayners/foundry-test-utils`

---


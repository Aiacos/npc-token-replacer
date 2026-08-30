---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Future-Proofing & Release Automation
status: completed
stopped_at: v1.7.3 released and verified; .planning refreshed
last_updated: "2026-08-30T07:45:00.000Z"
last_activity: "2026-08-30 — v1.7.3 released; main and develop aligned; planning docs brought current"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-30)

**Core value:** Token replacement must work correctly and predictably every time.
Since v1.7, equally: the module must keep working without maintenance as Foundry
and Wizards of the Coast keep shipping.

**Current focus:** No active milestone. v1.7.3 is published and verified.

## Current Position

Milestone: v1.7 Future-Proofing & Release Automation — shipped 2026-08-30
Published version: **1.7.3** (Foundry minimum 13, verified 14)
Branches: `main` and `develop` aligned
Open PRs: none
Tests: 232 passing across 16 files; lint and manifest validation clean

Progress: [██████████] 100%

## What changed since the last update (2026-03-06)

The previous state file described milestone v1.4 and was six months stale. Two
milestones shipped in between, one of them without touching `.planning/`.

**v1.5–v1.6 (2026-04-24), delivered directly on `main`:**
- All official D&D manuals, v13+ compatibility, first CI/CD pipeline
- v1.6.0 restricted detection to a whitelist of the 11 WotC packages, removing
  prefix matching because it captured DDB-Importer, homebrew and community
  adventures
- `main` and `develop` diverged: the develop line's security fixes never reached
  a published release

**v1.7 (2026-08-30), this session:**
- Reconciled the divergence. v1.6.0's whitelist stays the trusted default;
  signal-based detection (WotC authorship, premium-for-dnd5e, manual override)
  is layered on top as opt-in, so a book released after this version is surfaced
  with a warning instead of silently ignored
- `scripts/lib/foundry-compat.js` — every relocated Foundry API resolved by
  feature detection, namespace first, deprecated global as fallback
- Settings form built by a factory: ApplicationV2 when available, legacy
  FormApplication otherwise. The old `extends FormApplication` declaration would
  have failed the whole module import once Foundry removes that global in v16
- Security fixes carried from `develop` reached a release for the first time:
  path traversal in wildcard resolution, XSS in progress labels, token data
  allowlist, jQuery removal
- `tools/` — manifest/i18n/template/translation validation, version bumping,
  Foundry generation watch, package registry publishing
- CI/CD: Node 20+22 matrix, package smoke test, one-trigger release pipeline,
  weekly Foundry compatibility watch, Dependabot with auto-merge for low-risk
  updates
- Documentation: English and Italian READMEs, `docs/COMPATIBILITY.md`,
  `docs/DEVELOPMENT.md`, and a Constitution of non-negotiable principles in
  `CLAUDE.md`

## Accumulated Context

### Decisions

Full table in PROJECT.md. Decisions from this milestone:

- [v1.7]: Whitelist stays the default; signals are opt-in — a third-party module must never be silently trusted, and a new official book must never be silently ignored
- [v1.7]: Package-id prefixes are not a detection signal (carried from v1.6)
- [v1.7]: Never branch on `game.version`; every relocated API goes through `FoundryCompat`
- [v1.7]: The settings form class is resolved at registration time, not at module evaluation
- [v1.7]: Non-creature actor types use a blocklist, so future system types stay indexed
- [v1.7]: `compatibility.maximum` must never be set — enforced by the validator
- [v1.7]: Corrupt settings fall back to the conservative core set, never the broader default
- [v1.7]: Dependabot auto-merge runs as a daily sweep — no branch protection needed, no race with CI
- [v1.7]: Major dependency updates are never auto-merged — `release.yml` and `foundry-compat.yml` are not exercised by PR CI
- [v1.7]: Compendium checkboxes keyed by pack id, not list position, so detection order cannot shift a saved selection

### Pending Todos

- Runtime smoke test in a live Foundry world (see Blockers)
- Submit the package to foundryvtt.com
- Batch token mutations to remove the 2N socket round-trips
- `VARIANT_SUFFIXES` is hardcoded; `FilePicker.browse()` was never investigated

### Blockers/Concerns

- **Nothing has been exercised against a real Foundry client.** All evidence in
  this milestone comes from test doubles. The ApplicationV2 form path, the
  v13/v14 `onChange` toolbar registration and source detection against real
  compendiums are unverified in practice. This is the largest open risk.
- **The package is not listed on foundryvtt.com.**
  `https://foundryvtt.com/packages/npc-token-replacer` returns 404 — it has never
  been submitted. Until it is approved, `FOUNDRY_PACKAGE_TOKEN` cannot exist and
  the release pipeline's registry step logs a skip. Submission needs an active
  Foundry licence and passes a manual review.
- **Three dev-dependency majors are pinned upstream.** `@rayners/foundry-test-utils@1.2.2`
  (the latest release) declares `peer vitest: ^3.1.0` and
  `peer jsdom: ^26.1.0 || ^27.0.0`. vitest 4 is refused by npm outright; jsdom 30
  additionally raises its Node floor above the Node 20 CI job. Recorded as
  `ignore` entries in `.github/dependabot.yml`. Note this constraint was already
  documented in March under decision [01-01] and rediscovered empirically in August.
- **Resolved since the last state file:** the v14 FormApplication deprecation,
  the dialog timeout leaving its window open, the lock-release race condition,
  the wildcard 404 cache miss, and the `disposition` dead write.

## Session Continuity

Last session: 2026-08-30
Stopped at: v1.7.3 released and verified end to end; planning docs refreshed
Resume file: none — no milestone in progress. Start from PROJECT.md "Active".

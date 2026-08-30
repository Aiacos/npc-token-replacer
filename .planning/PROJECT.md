# NPC Token Replacer — Future-Proofing & Release Automation

## What This Is

A Foundry VTT module (v13+, verified on v14) for D&D 5e that replaces scene NPC
tokens with official WotC compendium versions while preserving position,
elevation, dimensions, and other token properties. 232 automated tests,
structured error handling, progress feedback, dry-run preview, and a release
pipeline that runs from a single trigger.

## Core Value

Token replacement must work correctly and predictably every time — no silent
failures, no corrupted state, no confusing errors. Users trust the module to
modify their scenes safely.

Since v1.7 a second value sits alongside it: **the module must keep working
without maintenance**. Foundry ships a new generation every year and Wizards of
the Coast keeps publishing books; neither should require a code change.

## Requirements

### Validated

- ✓ Multi-stage name matching (exact → variant transforms → partial word) — existing
- ✓ Wildcard token path resolution with variant selection modes — existing
- ✓ Token replacement preserving position, elevation, dimensions, visual state — existing
- ✓ GM-only access enforcement, debug API, multi-level caching — existing
- ✓ Automated test suite (Vitest + Foundry mocks) — v1.4, now 232 tests
- ✓ Error handling hardening with structured failure classification — v1.4
- ✓ Progress bar during multi-token replacements — v1.4
- ✓ Dry-run preview dialog with match mapping before committing — v1.4
- ✓ Configurable HTTP timeout for wildcard probing — v1.4
- ✓ CI pipeline running lint, validation and tests on push and PR — v1.5, extended in v1.7
- ✓ Detection restricted to the 11 official WotC packages — v1.6
- ✓ Signal-based detection of content released after this version — v1.7
- ✓ Feature-detected Foundry API access, no version checks anywhere — v1.7
- ✓ ApplicationV2 settings form with legacy fallback — v1.7
- ✓ Manifest, i18n, template and translation validation in CI — v1.7
- ✓ One-trigger release pipeline with Foundry registry announcement — v1.7
- ✓ Weekly Foundry compatibility watch that opens a bump PR — v1.7
- ✓ Dependabot with auto-merge for low-risk updates — v1.7
- ✓ Italian localization and Italian README — v1.7

### Active

- [ ] Runtime smoke test in a live Foundry world — nothing in this module has
      ever been exercised against the real client; all evidence is from test
      doubles. This is the single largest gap.
- [ ] Submit the package to foundryvtt.com (manual, needs an active licence and
      passes a review). Blocks `FOUNDRY_PACKAGE_TOKEN` and the package browser
      listing.
- [ ] Batch token mutations — the replacement loop is still 2N socket round-trips
- [ ] Quench in-engine integration tests for the full replacement workflow

### Out of Scope

- Rollback/undo after partial failures — high complexity, major architectural change
- localStorage/IndexedDB index persistence — complex browser compatibility
- Supporting Foundry v12 — dropped in v1.6; the compatibility layer keeps the
  AppV1 fallbacks, but the manifest requires 13

## Context

- Published: v1.7.3 (2026-08-30). Distributed by manifest URL only — the package
  is not listed on foundryvtt.com
- 2,851 lines of source across 8 module files and 5 CI tools; 232 tests in 16 files
- Zero runtime dependencies — native browser APIs only
- Vitest 3.x, pinned by `@rayners/foundry-test-utils@1.2.2`
  (`peer vitest: ^3.1.0`, `peer jsdom: ^26.1.0 || ^27.0.0`)
- `main` and `develop` are aligned; two branches diverged badly between March and
  August and had to be reconciled by hand

## Constraints

- **Runtime**: Foundry VTT v13+ browser environment
- **Dependencies**: zero runtime dependencies; dev dependencies must stay
  compatible with foundry-test-utils' peer ranges
- **Compatibility**: cannot break existing settings or behaviour for current users
- **No build step**: plain ES modules loaded directly by Foundry
- **No `compatibility.maximum`**: enforced by the manifest validator, so a new
  Foundry generation is never blocked by the manifest
- **Governance**: the Constitution in `CLAUDE.md` applies to every change

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Test suite as top priority | Enables safe future changes and catches regressions | ✓ Good — 232 tests |
| Vitest 3.x + foundry-test-utils | Works with Foundry module structure, no build step | ⚠️ Pins vitest and jsdom majors |
| Duck-typing for version detection | typeof checks instead of version strings | ✓ Good — became `FoundryCompat` |
| Whitelist of 11 WotC packages (v1.6) | Prefix matching captured DDB-Importer and homebrew | ✓ Good — kept as the default |
| Signals layered on the whitelist (v1.7) | A book released after this version must not be silently ignored | ✓ Good — surfaced, not trusted |
| Factory for the settings form class | `extends FormApplication` would break module import once the global is removed in v16 | ✓ Good |
| Blocklist for non-creature actor types | New actor types stay indexed instead of being dropped | ✓ Good |
| Conservative fallback on corrupt settings | An error must never widen the set of sources read | ✓ Good |
| Daily sweep for Dependabot auto-merge | Needs no branch protection and cannot race CI | ✓ Good |
| Majors never auto-merged | `release.yml` is not exercised by PR CI, so green ≠ releasable | ✓ Good |

---
*Last updated: 2026-08-30 after the v1.7 milestone*

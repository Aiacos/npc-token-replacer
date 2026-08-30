# Roadmap: NPC Token Replacer

## Milestones

- v1.4 Stability & Reliability — Phases 1-6 (shipped 2026-03-06)
- v1.5–v1.6 Official Content Detection — shipped directly on `main` (2026-04-24), outside the phase workflow
- v1.7 Future-Proofing & Release Automation — shipped 2026-08-30

## Phases

<details>
<summary>v1.4 Stability & Reliability (Phases 1-6) — SHIPPED 2026-03-06</summary>

- [x] Phase 1: Test Infrastructure (1/1 plans) — completed 2026-03-01
- [x] Phase 2: Extract Pure Logic (1/1 plans) — completed 2026-03-01
- [x] Phase 3: Unit Tests (2/2 plans) — completed 2026-03-01
- [x] Phase 4: Error Handling Hardening (2/2 plans) — completed 2026-03-01
- [x] Phase 5: Progress Bar (2/2 plans) — completed 2026-03-06
- [x] Phase 6: Dry-Run Preview (2/2 plans) — completed 2026-03-06

</details>

<details>
<summary>v1.5–v1.6 Official Content Detection — SHIPPED 2026-04-24 (unplanned)</summary>

Delivered straight on `main` without phase plans, while the `develop` line
continued separately. This divergence had to be reconciled in v1.7.

- [x] v1.5.0: all official D&D manuals, v13+ compatibility, first CI/CD pipeline
- [x] v1.5.1: lint cleanup, duplicate ESLint config removed
- [x] v1.6.0: **breaking** — detection restricted to an explicit whitelist of the
      11 WotC packages; prefix matching removed because it captured DDB-Importer,
      homebrew and community adventures

</details>

<details>
<summary>v1.7 Future-Proofing & Release Automation — SHIPPED 2026-08-30</summary>

Delivered in one session, outside the phase workflow. Reconciles the `main` and
`develop` lines, then builds on the result.

- [x] Reconcile the divergence: v1.6.0's whitelist kept as the trusted default,
      the develop line's signal-based detection layered on top as opt-in
- [x] `FoundryCompat` — feature-detected access to every relocated Foundry API
- [x] ApplicationV2 settings form with a legacy FormApplication fallback
- [x] `SourceDetector` — whitelist plus forward-looking signals, dynamic priority
- [x] Security fixes from the develop line reach a release for the first time
- [x] Validation tooling (`tools/`) and a self-maintaining CI/CD pipeline
- [x] Documentation: English + Italian READMEs, `docs/`, Constitution in CLAUDE.md
- [x] Released 1.7.0 → 1.7.3

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test Infrastructure | v1.4 | 1/1 | Complete | 2026-03-01 |
| 2. Extract Pure Logic | v1.4 | 1/1 | Complete | 2026-03-01 |
| 3. Unit Tests | v1.4 | 2/2 | Complete | 2026-03-01 |
| 4. Error Handling Hardening | v1.4 | 2/2 | Complete | 2026-03-01 |
| 5. Progress Bar | v1.4 | 2/2 | Complete | 2026-03-06 |
| 6. Dry-Run Preview | v1.4 | 2/2 | Complete | 2026-03-06 |
| — | v1.5–v1.6 | unplanned | Shipped | 2026-04-24 |
| — | v1.7 | unplanned | Shipped | 2026-08-30 |

## Note on process

Two of the three milestones shipped without going through the phase workflow.
That is why `.planning/` fell six months out of date, and why v1.5–v1.6 diverged
from `develop` far enough to need a conflict resolution. Work that skips the
workflow should still land a ROADMAP entry when it ships.

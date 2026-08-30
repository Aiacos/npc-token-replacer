# Integrations

**Analysis Date:** 2026-08-30

## APIs & External Services

| Service | Used by | Purpose |
|---------|---------|---------|
| Foundry VTT client API | the module | Everything: compendiums, actors, scene tokens, settings, UI |
| Foundry Package Release API | `tools/publish-foundry.mjs` | Announce a release to the package registry. **Not active** — needs `FOUNDRY_PACKAGE_TOKEN`, which requires an approved package listing |
| `foundryvtt.com/releases/` | `tools/check-foundry-version.mjs` | Scraped weekly for the newest generation |
| GitHub API (`gh` CLI) | release, compat watch, dependabot triage | Releases, PRs, labels |
| Same-origin HEAD requests | `WildcardResolver` | Probe for numbered token art variants |

## Data Storage

- **World settings** (`game.settings`) — `tokenVariationMode`,
  `enabledCompendiums` (JSON string), `dialogTimeout`, `httpTimeout`,
  `additionalSources`. All world-scoped, GM-restricted.
- **In-memory caches only.** Nothing is persisted to localStorage or IndexedDB.

## Authentication & Identity

`game.user.isGM` gates the toolbar button, the settings menu and the replacement
itself. No external authentication. The only secret in the pipeline is
`FOUNDRY_PACKAGE_TOKEN`, stored as a repository secret and never in the repo.

## Monitoring & Observability

Console logging through `Logger`, plus `window.NPCTokenReplacer` for interactive
inspection (`detectWOTCCompendiums`, `getEnabledCompendiums`,
`getLastLoadErrors`, `clearCache`, `debugEnabled`). No telemetry.

## CI/CD & Deployment

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push, PR, manual | Lint, validate, test on Node 20 and 22; coverage; package smoke test |
| `release.yml` | manual dispatch or a `v*` tag | Bump → validate → tag → build → verify → GitHub release → registry announcement |
| `foundry-compat.yml` | weekly cron, manual | Opens a PR when Foundry's newest generation is ahead of `compatibility.verified` |
| `dependabot-auto-merge.yml` | daily cron, manual | Merges green patch/minor updates, labels the rest `needs-review` |

Distribution is by manifest URL:
`https://github.com/Aiacos/npc-token-replacer/releases/latest/download/module.json`

## Environment Configuration

| Variable | Where | Notes |
|----------|-------|-------|
| `FOUNDRY_PACKAGE_TOKEN` | repository secret | Optional; absent, the registry step logs a skip |
| `GITHUB_TOKEN` | provided by Actions | Releases, tags, PRs, labels |

## Network Requests

Only two kinds, both timeout-bounded:

- HEAD probes for wildcard token art, same-origin, path-validated against
  traversal, timeout configurable (`httpTimeout`, default 5s)
- CI-side requests from `tools/` to foundryvtt.com and GitHub

## Foundry VTT Integration Points

| API | Reached via | Notes |
|-----|-------------|-------|
| `Dialog` / `DialogV2` | `FoundryCompat.confirmDialog()` | V2 preferred, AppV1 fallback |
| `FormApplication` / `ApplicationV2` | `buildCompendiumSelectorForm()` | Resolved at registration time |
| `SceneNavigation` / notification progress | `ProgressReporter` | Duck-typed |
| `loadTemplates` | `FoundryCompat.loadTemplates` | Namespaced in v13+ |
| `foundry.utils.mergeObject` | `FoundryCompat.mergeObject` | Global fallback for v12 |
| `game.packs`, `game.actors`, `game.modules`, `game.settings` | directly in `main.js` | Stable across generations |
| `canvas.scene.createEmbeddedDocuments` / `deleteEmbeddedDocuments` | `TokenReplacer` | Create before delete, never the reverse |
| `getSceneControlButtons` hook | `registerControlButton()` | Two container shapes, two callback names |

## Data Flow Between Systems

Compendium (read-only) → world Actor (imported once, cached by UUID) → scene
Token. The compendium prototype token is always the source of visual identity;
the original token is the source of placement. Nothing flows back to the
compendium.

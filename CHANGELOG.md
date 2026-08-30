# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **README documents the foundryvtt.com submission process** (`🔄 Listing the module on foundryvtt.com`): submit → manual review → copy the release token → store it as a repository secret, plus what the review checks and why this module ships no third-party content.
- **Installation chapter states that the module is not in Foundry's package browser** and points at the manifest URL as the recommended route, so users stop searching for it in the Install Module dialog.


### Fixed
- **Corrected the `FOUNDRY_PACKAGE_TOKEN` guide in `docs/DEVELOPMENT.md`.** It described copying the token from the package edit page, but skipped the prerequisite: the package must first be submitted to foundryvtt.com and manually approved. `https://foundryvtt.com/packages/npc-token-replacer` currently returns 404 — the module has never been submitted — so no token exists yet. The guide now starts from submission and states what the review checks.


### Added
- **Dependabot auto-merge** (`.github/workflows/dependabot-auto-merge.yml`): a daily sweep merges patch and minor dependency updates whose checks are green, and labels everything else `needs-review`. Major updates are never merged automatically — `release.yml` and `foundry-compat.yml` are not exercised by pull-request CI, so a green PR does not prove that releasing still works. The classification lives in `tools/dependabot-triage.mjs` and is unit-tested (16 new tests).
- **Step-by-step guide for obtaining `FOUNDRY_PACKAGE_TOKEN`** in `docs/DEVELOPMENT.md`, including the dry-run behaviour and what to do if the token leaks.

### Fixed
- **Dependabot grouped every dev dependency into one PR.** `patterns: ["*"]` with no `update-types` filter mixed three major bumps with one patch in a single PR, so the safe part could not be taken without the risky part. Minor and patch updates are now grouped; majors arrive as individual PRs.

## [1.7.1] - 2026-08-30

### Fixed
- **Foundry package registry announcement was skipped on every tag-triggered release.** The step was guarded by `inputs.publish_to_registry != false`, and on a `push` event `inputs` is empty — GitHub coerces `""` to `false`, so the condition evaluated false and the step never ran. Only the `workflow_dispatch` path may opt out now.
- **`tools/bump-version.mjs` could break a release halfway through.** Passing a version equal to the current one produced a duplicate CHANGELOG heading and then failed on an empty commit, after `module.json` had already been rewritten. The bump now refuses a no-op version and an unknown bump type, and changelog promotion is idempotent.

### Added
- Unit tests for the release tooling (`tests/tools/bump-version.test.js`), covering the bump arithmetic, the no-op guard and changelog promotion.


## [1.7.0] - 2026-08-30

This release merges the long-lived `develop` line into `main`. It keeps the
strict Wizards of the Coast whitelist introduced in 1.6.0 and adds a detection
layer around it, a version-agnostic compatibility layer, and the security and
reliability fixes that had accumulated on `develop` without ever reaching a
published release.

### Security
- **Path traversal in wildcard token resolution**: probe URLs are validated before the HEAD request, so a crafted token path can no longer reach outside the expected asset directory.
- **XSS in progress bar labels**: creature names are HTML-escaped before being rendered into progress messages.
- **Token data allowlist**: token creation copies an explicit list of fields from the compendium prototype instead of spreading arbitrary data.
- **jQuery removed**: the last DOM interactions using jQuery were rewritten with vanilla DOM.

### Added
- **Forward-looking source detection** on top of the 1.6.0 whitelist. A package authored by Wizards of the Coast / Foundry Gaming, or premium content declaring the dnd5e system, is now detected as `publisher` / `premium` tier: logged with a warning that names the package, listed in the compendium picker, and usable by switching to **Everything Detected**. A newly released official book is therefore never silently ignored — and never silently trusted either.
- **`FoundryCompat`** (`scripts/lib/foundry-compat.js`): feature-detected access to every Foundry API that moved between generations — `DialogV2`/`Dialog`, `ApplicationV2`/`FormApplication`, `SceneNavigation`, the Handlebars template loader, `foundry.utils.mergeObject`. Namespaced APIs resolve first, so deprecated-global warnings are never triggered.
- **ApplicationV2 settings form**: the compendium picker renders as an `ApplicationV2` when available and falls back to `FormApplication` otherwise, both driven by one shared model. It also finally has a **Save button** — the previous form had no submit control.
- **Dynamic priority classification** for sources outside the whitelist: an Adventure compendium means adventure content (4), Scene compendiums mean a setting book (3), neither means a rulebook (2).
- **`core` selection mode** (SRD + rulebooks only) and the **Additional Compendium Sources** setting for package ids the automatic signals cannot recognise.
- **Dedicated stylesheet** (`styles/npc-token-replacer.css`), replacing the inline styles previously emitted from `main.js`.
- **Tooling**: `tools/validate-manifest.mjs` (manifest, referenced files, i18n keys, template and partial paths, translation parity), `tools/bump-version.mjs`, `tools/check-foundry-version.mjs`, `tools/publish-foundry.mjs`; npm scripts `validate` and `check`.
- **CI/CD**: lint + validation + tests on a Node 20/22 matrix, coverage artifact, and a package smoke test asserting every manifest-referenced file is inside the ZIP. A one-trigger Release workflow (bump → validate → tag → build → verify → GitHub release → Foundry package registry). A weekly Foundry compatibility watch that opens a PR when a new generation ships. Dependabot for actions and dev dependencies.
- **Documentation**: `docs/COMPATIBILITY.md`, `docs/DEVELOPMENT.md`, and a Constitution of non-negotiable principles in `CLAUDE.md`.
- **57 new unit tests** covering source detection, the compatibility layer and the settings form (208 total).

### Changed
- **Italian translation completed**: `lang/it.json` was missing 19 keys and carried 8 that no longer exist. Both language files are now in parity, and the manifest validator warns when they drift again.
- **Only creature entries are indexed**: `character`, `group` and `vehicle` compendium entries are skipped. The filter is a blocklist, so actor types added by future system versions are still indexed.
- **Scene control registration**: v13+ object-format controls use `onChange`, v12 array-format controls use `onClick` — attaching both made v13 run the replacement twice.
- **Compendium checkboxes are keyed by pack id** rather than list position, so a change in detection order can no longer shift a saved custom selection.
- **Corrupt settings fall back conservatively** to the core-rulebook set.
- **`compatibility.verified` raised to 14.** No `compatibility.maximum` is declared, and the validator now fails the build if one is added.
- **`module.json` declares `flags.hotReload`** for live reloading of styles, templates and language files during development.

### Fixed
- **Module load could break on a future Foundry release**: the settings form extended the `FormApplication` global at module-evaluation time, so removing that global (announced for v16) would have failed the entire module import, not just the settings dialog. The class is now built by a factory at registration time.
- **Dialog timeout left the window open**: the timeout resolved the promise but never dismissed the dialog.
- **Lock release race condition**: `clearActorLookup()` now runs before the processing lock is released.
- **Wildcard 404 cache miss**: empty results are cached, preventing dozens of redundant HEAD requests per duplicate creature.
- **Infinite loop guard** in `FolderManager.getFolderPath` for circular folder references.
- **Disposition dead write**: `disposition` was listed in both the compendium and preserved property lists, so the compendium value was silently discarded.

### Removed
- `eslint.config.mjs`, a second dead ESLint configuration.
- 12 unused i18n keys.
- `fix-todos/` session state is no longer tracked.


## [1.6.0] - 2026-04-24

### Changed (BREAKING)

- **Strict whitelist of official Wizards of the Coast packages.** The module
  now recognises **only the 11 premium packages published by WotC on Foundry
  VTT** (see [Foundry VTT creator page](https://foundryvtt.com/creators/wizards-of-the-coast/)).
  Auto-discovery is no longer prefix-based.
  - Whitelisted package IDs:
    `dnd5e`, `dnd-monster-manual`, `dnd-players-handbook`,
    `dnd-dungeon-masters-guide`, `dnd-forge-artificer`, `dnd-tashas-cauldron`,
    `dnd-phandelver-below`, `dnd-tomb-annihilation`, `dnd-adventures-faerun`,
    `dnd-heroes-faerun`, `dnd-heroes-borderlands`.
  - Removed non-WotC legacy books (Volo's Guide, Mordenkainen's Tome of Foes,
    Monsters of the Multiverse, Fizban's, Mythic Odysseys of Theros, Eberron:
    Rising from the Last War, Explorer's Guide to Wildemount, Van Richten's,
    Spelljammer: Light of Xaryxis) — these are **not** published by WotC on
    Foundry.
  - Removed non-WotC adventures (Curse of Strahd, Descent into Avernus,
    Icewind Dale, Ghosts of Saltmarsh, Candlekeep Mysteries, Wild Beyond the
    Witchlight, Strixhaven, Golden Vault, Netherdeep, Spelljammer: Adventures
    in Space, Radiant Citadel, Dragonlance, Planescape, Vecna, Infinite
    Staircase, Book of Many Things).
  - Removed `ddb-` (DDB-Importer) prefix — DDB-Importer is a third-party
    community module, not a WotC package.
- **`CompendiumManager.detectWOTCCompendiums()`** now uses
  `OFFICIAL_WOTC_PACKAGES.includes(packageName)` instead of prefix matching.
  Non-whitelisted `dnd-*` or `ddb-*` compendiums are no longer auto-detected.
- **`CompendiumManager.getCompendiumPriority()`** fall-through changed: unknown
  `dnd-*` packages now return priority 1 (fallback) instead of 4 (adventure).

### Added

- **`CompendiumManager.OFFICIAL_WOTC_PACKAGES`** — new frozen static getter
  exposing the authoritative 11-package whitelist.

### Deprecated

- **`CompendiumManager.WOTC_MODULE_PREFIXES`** — kept for backward compatibility
  but no longer used by detection logic. Will be removed in a future major
  release. Consumers should migrate to `OFFICIAL_WOTC_PACKAGES`.

### Migration notes

If your world relied on auto-detection of non-WotC `dnd-*` or `ddb-*`
compendiums, you will need to either (a) enable those compendiums via an
explicit pack-ID setting, or (b) fork the module and extend
`OFFICIAL_WOTC_PACKAGES` locally.

## [1.5.1] - 2026-04-24

### Fixed

- ESLint configuration consolidated (removed duplicate `eslint.config.mjs`); `lint` / `lint:fix` npm scripts added so CI quality gate passes cleanly.
- Cleared unused imports in `progress-reporter.js`, `error-handling.test.js`, `wildcard-resolver.test.js`, and `dry-run-preview.test.js`.

## [1.5.0] - 2025-05-XX

### Added
- **Expanded official D&D 5e manual support**: `CompendiumManager.#COMPENDIUM_PRIORITIES` now
  explicitly covers 37 official WotC module IDs across four priority tiers:
  - *Priority 1 – FALLBACK*: SRD (`dnd5e`), Tasha's Cauldron, Volo's Guide to Monsters,
    Mordenkainen's Tome of Foes, Monsters of the Multiverse (+ alias), Fizban's Treasury of
    Dragons, Mythic Odysseys of Theros, Eberron: Rising from the Last War, Explorer's Guide
    to Wildemount, Van Richten's Guide to Ravenloft, Spelljammer: Light of Xaryxis
  - *Priority 2 – CORE*: Monster Manual 2024, Player's Handbook 2024, Dungeon Master's Guide 2024
  - *Priority 3 – EXPANSION*: Forge of the Artificer; placeholder comments for future 2024/2025
    sourcebooks (Planescape, Spelljammer rework, Greyhawk)
  - *Priority 4 – ADVENTURE*: 19 adventure modules from Tomb of Annihilation to Planescape:
    Adventures in the Multiverse
- **`KNOWN_MODULE_LABELS`** static map — human-readable names for all known module IDs, used
  in logs and future UI improvements.
- **`ddb-` prefix** added to `WOTC_MODULE_PREFIXES` for DDB-Importer compendium auto-discovery.
- **Italian localization** (`lang/it.json`) — full translation of all UI strings.
- **CI/CD workflows** (`.github/workflows/ci.yml` and `release.yml`):
  - `ci.yml`: runs on push/PR to main & develop; `npm ci` → `npm test` → optional lint
  - `release.yml`: stable releases from `main`, pre-release RC from `develop`; auto-bumps
    patch if tag exists; builds ZIP; creates GitHub Release with ZIP + module.json as assets
    (The Forge compatible via `manifest` URL)
- **`MIGRATION_V13.md`**: checklist of deprecated Foundry APIs with fix status.

### Changed
- **Compatibility**: `minimum` bumped from `12` → `13`; `verified` bumped to `14`;
  `maximum` removed for forward-compatibility.
- **dnd5e system relationship**: added `compatibility.minimum: "4.0.0"`.
- **`Dialog.confirm`** now feature-detects `foundry.applications.api.DialogV2` (Foundry v13+)
  and falls back to legacy `Dialog.confirm` — no behaviour change on v13/v14.
- **`package.json`**: version aligned to `1.5.0`; added `foundry` section
  (`minimum: "13"`, `verified: "14"`).

## [1.4.1] - 2025-03-07

### Added
- **Configurable dialog timeout**: New "Preview Dialog Timeout" setting (1-30 minutes) controls how long the preview dialog stays open before auto-closing
- **Reverse word index**: O(1) lookup for Stage 3 partial name matching, significantly faster for large monster indexes
- **Compendium document cache**: Avoids repeated `getDocument()` calls during batch replacements
- **New unit tests**: Added test suites for FolderManager, registerControlButton, and TokenReplacer.replaceToken

### Changed
- **Parallel compendium loading**: Monster indexes are now loaded in parallel via `Promise.allSettled` instead of sequentially
- **Immutable caches**: All cached arrays are now frozen with `Object.freeze` to prevent accidental mutation
- **Structured errors**: New `TokenReplacerError` class replaces fragile string-matching for failure classification
- **CSS extraction**: Moved inline styles from preview dialog and templates to dedicated CSS classes
- **Token properties**: `extractTokenProperties` now uses a `PRESERVED_PROPERTIES` constant instead of hardcoded property list
- **Actor link preservation**: Token replacement now preserves `actorLink` from prototype token data

### Fixed
- Dialog timeout and notification timing issues resolved
- Wildcard resolver no longer permanently caches failed network probes
- Execution lock bug in `NPCTokenReplacerController` fixed
- `FolderManager.getFolderPath` now handles null folder input gracefully
- Fixed missing `await` in `computeMatches` test
- i18n key corrections for compendium priority labels

### Security
- Resolved npm audit vulnerabilities in dependencies
- Added `_bmad/` directory to `.gitignore`

## [1.4.0] - 2025-01-XX

### Changed
- **Complete OOP refactoring** of the codebase from procedural/mixed architecture to proper class-based design
- Reorganized ~2000 lines of code into well-defined classes with single responsibilities:
  - `NPCTokenReplacerController` - Main facade orchestrating all operations
  - `CompendiumManager` - Detects WOTC compendiums and manages monster indexes
  - `TokenReplacer` - Handles token replacement operations and actor imports
  - `NameMatcher` - Normalizes creature names and matches to compendium entries
  - `WildcardResolver` - Resolves Monster Manual 2024 wildcard token paths
  - `FolderManager` - Manages Actor folders for compendium imports
  - `Logger` - Centralized logging with module prefix
  - `CompendiumSelectorForm` - Settings UI for compendium selection
- Improved encapsulation using ES6 private static fields (`#field`) for internal state
- Enhanced JSDoc documentation for all classes and methods
- Updated CLAUDE.md with comprehensive architecture documentation and class diagrams
- Updated README.md with architecture section

### Fixed
- Improved error handling in `getEnabledCompendiums()` to preserve error context
- Added graceful handling for `_stats.compendiumSource` on older actor documents
- Increased HTTP timeout for wildcard path resolution from 3000ms to 5000ms for slow connections

### Technical
- All classes use static methods where instance state is not needed
- Caches moved to private static class fields for better encapsulation
- Preserved `window.NPCTokenReplacer` debug API for backward compatibility

## [1.3.0] - 2024-XX-XX

### Added
- Support for selected tokens: Replace only selected tokens instead of all scene tokens
- Confirmation dialog now shows separate counts for selected vs all tokens

### Changed
- Improved user workflow when specific tokens are selected

## [1.2.1] - 2024-XX-XX

### Fixed
- Corrected priority label from "SRD" to "FALLBACK" in settings UI

## [1.2.0] - 2024-XX-XX

### Changed
- Default compendium selection now includes only Core + Fallback compendiums
- Improved default experience for users without adventure modules

## [1.1.3] - 2024-XX-XX

### Fixed
- Moved Tasha's Cauldron of Everything to fallback priority level
- Fixed settings persistence across sessions

## [1.1.2] - 2024-XX-XX

### Fixed
- Implemented proper 4-tier priority system (Adventure > Expansion > Core > Fallback)
- Fixed priority conflicts when same creature exists in multiple compendiums

## [1.1.1] - 2024-XX-XX

### Fixed
- Bug fixes and stability improvements

## [1.1.0] - 2024-XX-XX

### Added
- Token variation modes (none, sequential, random) for creatures with multiple art variants
- Wildcard token art resolution for Monster Manual 2024 (e.g., `specter-*.webp`)
- Support for numbered variants (1-5, 01-05, a-e)

### Changed
- Improved compendium detection for WotC content

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- Automatic detection of WOTC D&D compendiums
- Token replacement with compendium versions preserving position, elevation, dimensions
- Multi-stage name matching (exact, variant transforms, partial word)
- Compendium selector for choosing which sources to use
- Support for Foundry VTT v12 and v13
- Localization support (English)

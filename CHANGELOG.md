# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [1.4.1] - 2025-04-XX

### Fixed
- Minor stability improvements.

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

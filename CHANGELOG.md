# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Lock release race condition**: Swapped `clearActorLookup()` before `#isProcessing = false` in the `finally` block to prevent re-entry with stale state
- **Wildcard 404 cache miss**: Empty (404) results are now cached, preventing 45+ redundant HEAD requests per duplicate creature
- **Infinite loop guard**: `FolderManager.getFolderPath` now has a `depth < 10` counter to protect against circular folder references
- **Disposition dead write**: Removed `disposition` from `COMPENDIUM_TOKEN_FIELDS` — it was always overwritten by `PRESERVED_PROPERTIES`, so the compendium value was silently discarded

### Changed
- **jQuery removal**: Replaced the last jQuery usage in `showPreviewDialog` render callback with vanilla DOM (`querySelectorAll`), forward-compatible with Foundry's eventual jQuery removal
- **JSDoc harmonization**: Condensed verbose JSDoc across all lib modules to match main.js style (logger.js -58%, name-matcher.js -19%, progress-reporter.js -16%). Zero executable code changes.
- **NPC filter consolidation**: Extracted shared `#isNPCToken()` predicate, replacing 3 duplicated inline filter patterns
- **Wildcard cache bounded**: Added 200-entry LRU cap to `WildcardResolver.#variantCache` to prevent unbounded memory growth

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

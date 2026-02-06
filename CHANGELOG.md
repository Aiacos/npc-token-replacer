# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

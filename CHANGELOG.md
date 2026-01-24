# Changelog

All notable changes to NPC Token Replacer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-01-09

### Added
- Support for selected tokens - now you can select specific tokens to replace instead of replacing all scene NPCs
- When no tokens are selected, all scene NPCs are processed (previous behavior)

### Changed
- Updated notification messages to distinguish between selected and scene-wide operations

## [1.2.1] - 2026-01-09

### Fixed
- Priority label changed from "SRD" to "FALLBACK" for consistency

## [1.2.0] - 2026-01-08

### Changed
- Default compendium selection now uses only Core (Monster Manual, PHB, DMG) and Fallback (SRD, Tasha's) compendiums
- Added "Core + Fallback Only" as the default mode in compendium selector
- Adventures and expansions are no longer included by default (can be enabled via settings)

### Added
- Three selection modes in compendium selector: Default (Core + Fallback), All, Custom

## [1.1.3] - 2026-01-08

### Changed
- Moved Tasha's Cauldron of Everything from priority 2 (Core) to priority 1 (Fallback)
- Tasha's content now serves as fallback along with SRD

### Fixed
- Settings persistence issue when saving compendium selections

## [1.1.2] - 2026-01-08

### Fixed
- Priority system now uses 4-tier levels (1=Fallback, 2=Core, 3=Expansion, 4=Adventure)
- Consistent priority logging and labeling across all functions

## [1.1.1] - 2026-01-08

### Added
- Compendium priority system for selecting best match when creature exists in multiple sources
- Priority order: Adventures (4) > Expansions (3) > Core Rulebooks (2) > SRD/Fallback (1)

### Added
- Debug logging for priority system decisions

## [1.1.0] - 2026-01-08

### Added
- Multi-compendium support - search across all installed official D&D compendiums
- Automatic WOTC compendium detection using module prefixes (dnd-, dnd5e)
- Compendium selector settings form for choosing which compendiums to use
- Token variation mode setting (None/Sequential/Random) for creatures with multiple token art variants

### Changed
- Upgraded from single Monster Manual support to full multi-compendium architecture
- Improved name matching algorithm with variant transforms

## [1.0.4] - 2026-01-08

### Changed
- Version bump for release

## [1.0.3] - 2026-01-08

### Added
- Workaround for wildcard token paths used by Monster Manual 2024 (e.g., "specter-*.webp")
- Automatic probing for numbered variants (1-5, 01-05, a-e)
- Fallback to actor portrait when wildcard resolution fails

## [1.0.2] - 2026-01-08

### Added
- Automatic folder organization for imported monsters
- Creates "MonsterManual" folder or uses existing monster-related folders
- Detailed console logging for debugging

### Fixed
- Token image now correctly uses compendium actor's prototype token
- Previous imports are detected and reused to avoid duplicates

## [1.0.1] - 2026-01-07

### Fixed
- Double execution issue when clicking the toolbar button
- Removed `onChange` handler that caused duplicate processing
- Foundry v12 deprecation warnings for actor source checking

### Changed
- Uses `_stats.compendiumSource` instead of deprecated `flags.core.sourceId` for v12+

## [1.0.0] - 2026-01-07

### Added
- Initial release
- One-click NPC token replacement from Token Controls toolbar
- Automatic Monster Manual compendium detection
- Smart name matching with variant support (prefixes/suffixes)
- Preserves token properties: position, elevation, dimensions, visibility, rotation, disposition
- Confirmation dialog before replacement
- Support for Foundry VTT v12 and v13
- Console debugging API via `window.NPCTokenReplacer`
- Localization support (English)

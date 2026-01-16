# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NPC Token Replacer is a Foundry VTT module (v12/v13) for D&D 5e that replaces scene NPC tokens with official WotC compendium versions while preserving position, elevation, dimensions, and other token properties.

## Development Setup

This is a Foundry VTT module with no build system - plain JavaScript ES modules. To develop:

1. Symlink or copy the module to Foundry's `Data/modules/npc-token-replacer/` directory
2. Enable the module in a D&D 5e world
3. Changes to `scripts/main.js` require a browser refresh (F5)

The `release/` folder contains packaged releases - do not edit files there directly.

## Architecture

**Single-file module**: All logic is in `scripts/main.js` (~1135 lines). Key components:

- **Compendium Detection** (`detectWOTCCompendiums`): Auto-discovers WotC Actor compendiums by `dnd-` and `dnd5e` prefixes
- **Priority System** (`COMPENDIUM_PRIORITIES`): 4-tier system (Adventure > Expansion > Core > Fallback) determines which compendium version to use when duplicates exist
- **Name Matching** (`findInMonsterManual`): Exact match → variant transforms (removes prefixes/suffixes) → partial word matching
- **Token Replacement** (`replaceToken`): Handles wildcard token art paths (`*.webp`), imports actors to world, creates tokens with preserved properties
- **Settings Form** (`CompendiumSelectorForm`): FormApplication subclass for compendium selection UI

**Caches** (module-level variables):
- `monsterIndexCache`: Combined index from all enabled compendiums
- `wotcCompendiumsCache`: Detected WotC compendiums
- `importFolderCache`: Actor folder for imports

**Foundry Integration Points**:
- `Hooks.once("init")`: Register settings
- `Hooks.once("ready")`: Pre-cache monster index
- `Hooks.on("getSceneControlButtons")`: Add toolbar button (handles both v12 array and v13 object formats)
- `window.NPCTokenReplacer`: Debug API exposed globally

## Key Patterns

**Version Compatibility**: The `registerControlButton` function handles both Foundry v12 (array-based controls) and v13 (object-based controls) structures.

**Settings Storage**: Compendium selection is stored as JSON string (`JSON.stringify`/`JSON.parse`) for reliability across Foundry versions.

**Wildcard Token Resolution**: Monster Manual 2024 uses wildcard patterns like `specter-*.webp`. The module probes for numbered variants (1-5, 01-05, a-e) via HEAD requests and selects based on variation mode setting.

## Console Debugging

```javascript
NPCTokenReplacer.replaceNPCTokens();      // Run replacement
NPCTokenReplacer.detectWOTCCompendiums(); // List detected compendiums
NPCTokenReplacer.getEnabledCompendiums(); // List enabled compendiums
NPCTokenReplacer.clearCache();            // Force index reload
```

## Localization

All user-facing strings use `game.i18n.localize()` with keys from `lang/en.json`. Pattern: `NPC_REPLACER.<Category>.<Key>`.

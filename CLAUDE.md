# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NPC Token Replacer is a Foundry VTT module (v12/v13) for D&D 5e that replaces scene NPC tokens with official WotC compendium versions while preserving position, elevation, dimensions, and other token properties.

## Development Setup

This is a Foundry VTT module with no build system - plain JavaScript ES modules. To develop:

1. Symlink or copy the module to Foundry's `Data/modules/npc-token-replacer/` directory
2. Enable the module in a D&D 5e world
3. Changes to `scripts/main.js` require a browser refresh (F5)

The `releases/` folder contains packaged releases - do not edit files there directly.

## Build & Release

### Build the package

```bash
bash build.sh      # Linux/macOS
build.bat           # Windows
```

The build script auto-detects module ID, version, and GitHub URL from `module.json`. It creates a clean ZIP in `releases/{id}-v{version}.zip` with the download URL already set in the packaged module.json.

### Publish a new release

1. **Update `module.json`** - change these two fields:
   - `"version"`: bump to the new version (e.g. `"X.Y.Z"`)
   - `"download"`: update to match: `https://github.com/Aiacos/npc-token-replacer/releases/download/vX.Y.Z/npc-token-replacer-vX.Y.Z.zip`

2. **Build the package**:
   ```bash
   bash build.sh
   ```

3. **Commit and push**:
   ```bash
   git add module.json
   git commit -m "Bump version to X.Y.Z"
   git push
   ```

4. **Create GitHub release** (uploads both module.json manifest AND ZIP):
   ```bash
   gh release create vX.Y.Z releases/npc-token-replacer-vX.Y.Z.zip module.json --title "vX.Y.Z - Description" --latest
   ```

> **Why `module.json` is uploaded separately**: Foundry VTT downloads the standalone `module.json` first (via the manifest URL) to discover the module version and its download URL. The ZIP also contains a `module.json` but that's only used after installation.

### Foundry VTT Manifest URL

```
https://github.com/Aiacos/npc-token-replacer/releases/latest/download/module.json
```

## Architecture

**Single-file OOP module**: All logic is in `scripts/main.js` (~2000 lines), organized into well-defined classes with single responsibilities.

### Class Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      NPCTokenReplacerController                  │
│        (Main Facade - orchestrates all operations)              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ uses
                               ▼
    ┌──────────────────────────┼───────────────────────────┐
    │                          │                           │
    ▼                          ▼                           ▼
┌────────────────┐   ┌─────────────────┐   ┌────────────────────┐
│ CompendiumManager │ │  TokenReplacer   │ │   NameMatcher       │
│ (compendiums)   │   │ (token ops)      │ │ (name matching)     │
└────────────────┘   └─────────────────┘   └────────────────────┘
    │                          │
    │                          │ uses
    │                          ▼
    │                 ┌─────────────────┐
    │                 │ WildcardResolver │
    │                 │ (path resolution)│
    │                 └─────────────────┘
    │                          │
    │                          │ uses
    │                          ▼
    │                 ┌─────────────────┐
    │                 │  FolderManager   │
    │                 │ (import folders) │
    │                 └─────────────────┘
    │                          │
    └──────────────────────────┼───────────────────────────┐
                               │                           │
                               ▼                           ▼
                        ┌────────────┐           ┌─────────────────────┐
                        │   Logger   │           │ CompendiumSelectorForm│
                        │ (logging)  │           │ (settings UI)        │
                        └────────────┘           └─────────────────────┘
```

### Class Responsibilities

| Class | Responsibility | Key Methods |
|-------|---------------|-------------|
| **NPCTokenReplacerController** | Main facade that orchestrates token replacement workflow, validates prerequisites, and coordinates all operations | `replaceNPCTokens()`, `validatePrerequisites()`, `showConfirmationDialog()`, `clearCache()`, `initialize()`, `getDebugAPI()` |
| **CompendiumManager** | Detects WOTC compendiums, manages enabled compendiums, loads monster indexes, handles compendium priorities | `detectWOTCCompendiums()`, `getEnabledCompendiums()`, `loadMonsterIndex()`, `getCompendiumPriority()`, `clearCache()` |
| **TokenReplacer** | Handles token replacement operations, imports actors, creates new tokens with preserved properties | `replaceToken()`, `extractTokenProperties()`, `getNPCTokensToProcess()`, `getNPCTokensFromScene()`, `resetCounter()` |
| **NameMatcher** | Normalizes creature names and matches them to compendium entries using multi-stage matching | `findMatch()`, `normalizeName()`, `selectBestMatch()` |
| **WildcardResolver** | Resolves Monster Manual 2024 wildcard token paths (e.g., `specter-*.webp`) to actual files | `resolve()`, `resolveWildcardVariants()`, `selectVariant()`, `isWildcardPath()`, `clearCache()` |
| **FolderManager** | Manages Actor folders for compendium imports | `getOrCreateImportFolder()`, `getFolderPath()`, `clearCache()` |
| **Logger** | Provides centralized logging with module prefix | `log()`, `error()`, `warn()`, `debug()` |
| **CompendiumSelectorForm** | FormApplication subclass for compendium selection UI | `getData()`, `_updateObject()` |

### Key Features by Component

**Compendium Detection** (`CompendiumManager`): Auto-discovers WotC Actor compendiums by `dnd-` and `dnd5e` prefixes

**Priority System** (`CompendiumManager.COMPENDIUM_PRIORITIES`): 4-tier system (Adventure > Expansion > Core > Fallback) determines which compendium version to use when duplicates exist

**Name Matching** (`NameMatcher.findMatch`): Exact match → variant transforms (removes prefixes/suffixes) → partial word matching

**Token Replacement** (`TokenReplacer.replaceToken`): Handles wildcard token art paths (`*.webp`), imports actors to world, creates tokens with preserved properties

**Caches** (class private static fields):
- `CompendiumManager.#indexCache`: Combined monster index from all enabled compendiums
- `CompendiumManager.#wotcCompendiumsCache`: Detected WotC compendiums
- `FolderManager.#importFolderCache`: Actor folder for imports
- `WildcardResolver.#variantCache`: Resolved wildcard paths
- `NPCTokenReplacerController.#isProcessing`: Execution lock
- `TokenReplacer.#sequentialCounter`: Token variant counter

### Foundry Integration Points

- `Hooks.once("init")`: Register settings
- `Hooks.once("ready")`: Initialize controller, pre-cache monster index
- `Hooks.on("getSceneControlButtons")`: Add toolbar button (handles both v12 array and v13 object formats)
- `window.NPCTokenReplacer`: Debug API exposed globally via `NPCTokenReplacerController.getDebugAPI()`

## Key Patterns

**Version Compatibility**: The `registerControlButton` function handles both Foundry v12 (array-based controls) and v13 (object-based controls) structures.

**Settings Storage**: Compendium selection is stored as JSON string (`JSON.stringify`/`JSON.parse`) for reliability across Foundry versions.

**Wildcard Token Resolution**: Monster Manual 2024 uses wildcard patterns like `specter-*.webp`. The `WildcardResolver` class probes for numbered variants (1-5, 01-05, a-e) via HEAD requests and selects based on variation mode setting.

**Private Fields**: All classes use ES6 private static fields (`#field`) for internal state and caching, preventing external access and ensuring encapsulation.

**Static Methods**: Most classes use static methods since they don't need instance state - this simplifies the API and avoids instantiation overhead.

## Console Debugging

```javascript
NPCTokenReplacer.replaceNPCTokens();      // Run replacement
NPCTokenReplacer.detectWOTCCompendiums(); // List detected compendiums
NPCTokenReplacer.getEnabledCompendiums(); // List enabled compendiums
NPCTokenReplacer.clearCache();            // Force index reload
NPCTokenReplacer.getNPCTokensFromScene(); // Get NPC tokens in current scene
NPCTokenReplacer.findInMonsterManual(name, index); // Find creature in index
NPCTokenReplacer.getOrCreateImportFolder(); // Get/create import folder
```

## Localization

All user-facing strings use `game.i18n.localize()` with keys from `lang/en.json`. Pattern: `NPC_REPLACER.<Category>.<Key>`.

## Utility Functions

In addition to classes, three standalone utility functions remain:
- `registerSettings()`: Registers module settings during init hook
- `registerControlButton(controls)`: Adds the replace button to token controls
- `escapeHtml(str)`: Escapes HTML special characters for safe display

## Configuration Constants

```javascript
const MODULE_ID = "npc-token-replacer";     // Module identifier
const DEFAULT_HTTP_TIMEOUT_MS = 5000;        // HTTP timeout for HEAD requests
const WOTC_MODULE_PREFIXES = ["dnd-", "dnd5e"]; // WOTC package prefixes
const COMPENDIUM_PRIORITIES = {...};         // Priority levels by package name
```

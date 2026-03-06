# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Single-file Object-Oriented Module with Layered Facade Pattern

**Key Characteristics:**
- Monolithic single-file design (`scripts/main.js`, ~2150 lines) with no external build system
- All logic organized into well-defined ES6 classes with static methods and private fields
- Facade pattern: `NPCTokenReplacerController` provides unified API, internally coordinates specialized classes
- Private static fields (`#field`) for encapsulation and state management per class
- Caching at multiple layers for performance (compendiums, monster index, folders, wildcard variants)
- Foundry VTT ES module (v12/v13 compatible) using Hooks-based initialization

## Layers

**Presentation Layer:**
- Purpose: UI interactions and user-facing feedback
- Location: `scripts/main.js` (Hooks, CompendiumSelectorForm, dialog handling)
- Contains: Scene control button registration, confirmation dialogs, notifications
- Depends on: Foundry APIs (ui.notifications, Dialog), Controller
- Used by: Foundry VTT toolbar, user interactions

**Controller/Orchestration Layer:**
- Purpose: Main facade coordinating all replacement operations
- Location: `scripts/main.js` (NPCTokenReplacerController class, lines 1508-1862)
- Contains: `replaceNPCTokens()`, `validatePrerequisites()`, `showConfirmationDialog()`, `clearCache()`, `initialize()`
- Depends on: CompendiumManager, TokenReplacer, NameMatcher
- Used by: Presentation layer, Hooks, debug API

**Data Management Layer:**
- Purpose: Handle compendium detection, indexing, and configuration
- Location: `scripts/main.js` (CompendiumManager class, lines 601-940)
- Contains: Compendium detection, priority management, monster index loading and caching
- Depends on: Foundry game.packs API
- Used by: Controller, NameMatcher

**Business Logic Layer:**
- Purpose: Core token replacement and name matching operations
- Location: `scripts/main.js` (TokenReplacer, NameMatcher, WildcardResolver classes)
- Contains: Token property extraction, actor lookup, name matching algorithms, wildcard resolution
- Depends on: CompendiumManager, Logger
- Used by: Controller

**Utility/Infrastructure Layer:**
- Purpose: Reusable helper classes for cross-cutting concerns
- Location: `scripts/main.js` (Logger, FolderManager classes)
- Contains: Logging, folder management, escape utilities
- Depends on: Foundry APIs (game.folders, console)
- Used by: All other classes

## Data Flow

**Token Replacement Workflow:**

1. **Initiation**: User clicks toolbar button → calls `NPCTokenReplacerController.replaceNPCTokens()`
2. **Validation**: Check GM status, active scene, available compendiums
3. **Token Gathering**: Get selected tokens or all NPC tokens in scene via `TokenReplacer.getNPCTokensToProcess()`
4. **Index Loading**: Load combined monster index from enabled compendiums via `CompendiumManager.loadMonsterIndex()`
5. **Confirmation**: Show dialog with token list via `NPCTokenReplacerController.showConfirmationDialog()`
6. **Processing** (per token):
   - Find match in index via `NameMatcher.findMatch()` (3-stage matching: exact → variant → partial)
   - If found, import actor from compendium
   - Resolve token art path (handles wildcards via `WildcardResolver.resolve()`)
   - Create new token with preserved properties via `TokenReplacer.replaceToken()`
7. **Results**: Report replaced/not found/errors via notifications and logs

**State Management:**
- Session state: Cleared after each replacement (actor lookup, sequential counter, processing lock)
- Persistent state: Stored in game.settings (variation mode, enabled compendiums)
- Cached state: Monster index, compendium packs, import folder (cleared via `clearCache()`)

## Key Abstractions

**CompendiumManager:**
- Purpose: Detect WotC compendiums and provide uniform access to creature data
- Examples: `scripts/main.js` lines 601-940
- Pattern: Static utility with multi-level caching (detection, enabled packs, combined index)
- Key Methods: `detectWOTCCompendiums()`, `getEnabledCompendiums()`, `loadMonsterIndex()`
- Caching Strategy: Cached results with explicit cache invalidation via `clearCache()`

**NameMatcher:**
- Purpose: Normalize creature names and match them across compendium variations
- Examples: `scripts/main.js` lines 942-1147
- Pattern: Static utility with multi-stage matching algorithm
- Key Methods: `findMatch()` (3-stage), `normalizeName()`, `selectBestMatch()`
- Matching Stages: (1) Exact match via O(1) Map lookup, (2) Variant transforms (remove prefixes/suffixes), (3) Partial word matching with bidirectional threshold

**TokenReplacer:**
- Purpose: Handle low-level token operations (extraction, replacement, import)
- Examples: `scripts/main.js` lines 1155-1500
- Pattern: Static utility with session-scoped state (sequential counter, actor lookup)
- Key Methods: `replaceToken()`, `extractTokenProperties()`, `getNPCTokensToProcess()`, `buildActorLookup()`
- Preserved Properties: Position (x, y, elevation), dimensions (width, height), visual state (hidden, rotation, disposition, locked, alpha)

**WildcardResolver:**
- Purpose: Resolve Monster Manual 2024 wildcard token paths to concrete files
- Examples: `scripts/main.js` lines 317-593
- Pattern: Static utility with variant caching and parallel probing
- Key Methods: `resolve()`, `resolveWildcardVariants()`, `selectVariant()`, `isWildcardPath()`
- Variant Selection: Three modes (none=first, sequential=cycling, random=randomized)

**FolderManager:**
- Purpose: Create and manage the Actor folder hierarchy for compendium imports
- Examples: `scripts/main.js` lines 139-309
- Pattern: Static utility with intelligent parent folder detection
- Key Methods: `getOrCreateImportFolder()`, `getFolderPath()`, `clearCache()`
- Folder Logic: Looks for monster/creature/NPC-related folders, creates subfolder with "MonsterManual" suffix

**CompendiumSelectorForm:**
- Purpose: Provide UI for compendium selection settings
- Examples: `scripts/main.js` lines 1914-2005
- Pattern: FormApplication subclass with mode-based UI
- Modes: Default (Core + Fallback only), All (all installed), Custom (manual selection)

## Entry Points

**Toolbar Button:**
- Location: Scene control registration via `registerControlButton()` (lines 2070-2095)
- Triggers: User click on token controls toolbar
- Responsibilities: Invoke `NPCTokenReplacerController.replaceNPCTokens()`, handle v12/v13 control format differences

**Init Hook:**
- Location: `Hooks.once("init")` (lines 2102-2105)
- Triggers: Foundry init phase (before game.ready)
- Responsibilities: Register settings via `registerSettings()`

**Ready Hook:**
- Location: `Hooks.once("ready")` (lines 2124-2146)
- Triggers: Foundry ready phase (all APIs available)
- Responsibilities: Initialize controller, detect compendiums, pre-cache index, expose debug API

**Scene Controls Hook:**
- Location: `Hooks.on("getSceneControlButtons")` (lines 2148-2151)
- Triggers: Scene control UI initialization
- Responsibilities: Register toolbar button with proper formatting for Foundry version

**Debug API:**
- Location: `window.NPCTokenReplacer` (set in ready hook)
- Triggers: Console access, external automation
- Responsibilities: Expose OOP class methods for debugging and CLI use

## Error Handling

**Strategy:** Defensive approach with graceful degradation

**Patterns:**
- **Prerequisite Validation**: Check GM status, active scene, compendiums before starting
- **Result Tracking**: Collect replaced/not_found/error counts, report separately
- **Try-Catch**: Wrap async operations (actor import, token creation, compendium loading) with error logging
- **Fallback Paths**: Wildcard resolution → fallback path → mystery-man token; settings parse errors → default values
- **Lock Mechanism**: `#isProcessing` flag prevents concurrent execution and double-processing
- **Session Cleanup**: Always clean up temporary state (actor lookup, sequential counter) in finally blocks

## Cross-Cutting Concerns

**Logging:**
- Framework: `Logger` class (lines 37-132)
- Approach: Centralized static methods with module ID prefix
- Debug gating: `Logger.debugEnabled` flag to avoid expensive debug calls in hot paths
- Usage: All classes use `Logger.log()`, `Logger.warn()`, `Logger.error()`, `Logger.debug()` for tracing

**Validation:**
- Input validation: Name normalization, empty checks, type checks
- State validation: Scene existence, GM status, token existence checks before mutation
- Configuration validation: JSON parsing with fallbacks for settings

**Authentication:**
- Approach: GM-only check in `validatePrerequisites()`
- Enforcement: `game.user.isGM` check before any token operations

**Caching:**
- Strategy: Multi-level with explicit invalidation
- Cache locations:
  - `CompendiumManager.#indexCache` - Combined monster index
  - `CompendiumManager.#wotcCompendiumsCache` - Detected compendiums
  - `FolderManager.#importFolderCache` - Import folder reference
  - `WildcardResolver.#variantCache` - Resolved wildcard paths
  - `TokenReplacer.#actorLookup` - Per-session actor UUID → Actor mapping
- Invalidation: Call `NPCTokenReplacerController.clearCache()` after settings change

**Settings Storage:**
- Approach: Foundry game.settings API with JSON serialization
- Settings: `tokenVariationMode` (string), `enabledCompendiums` (JSON string)
- Form UI: `CompendiumSelectorForm` provides FormApplication-based configuration menu

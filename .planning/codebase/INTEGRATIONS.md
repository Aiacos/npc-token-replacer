# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**None**

This module contains no external API integrations. All operations are local to the Foundry VTT instance.

## Data Storage

**Databases:**
- Foundry VTT compendium system (local file-based)
  - Connection: Via `game.packs` API (in-process)
  - Client: Native Foundry `CompendiumCollection` API

**File Storage:**
- Local filesystem via Foundry's file serving
  - Token artwork from installed D&D content packages
  - Stored in compendium data directories
  - Access: Foundry serves via relative paths (e.g., `modules/dnd-monster-manual/tokens/specter-1.webp`)

**Caching:**
- In-memory only (session-scoped):
  - `CompendiumManager.#indexCache` - Combined monster index from enabled compendiums
  - `CompendiumManager.#wotcCompendiumsCache` - Detected WOTC packs
  - `FolderManager.#importFolderCache` - Actor import folder reference
  - `WildcardResolver.#variantCache` - Resolved wildcard paths
  - `TokenReplacer.#actorLookup` - Session-scoped actor UUID lookups

## Authentication & Identity

**Auth Provider:**
- Custom (Foundry VTT permission system)

**Implementation:**
- GM-only permission check: `game.user.isGM` enforced at `NPCTokenReplacerController.validatePrerequisites()`
- Module respects Foundry permission system for actor import and token manipulation
- No external auth required

## Monitoring & Observability

**Error Tracking:**
- None - errors logged to browser console

**Logs:**
- Browser console only via `Logger` class
  - Info: `console.log()` with `"npc-token-replacer |"` prefix
  - Errors: `console.error()` with prefix
  - Warnings: `console.warn()` with prefix
  - Debug: `console.debug()` (gated by `Logger.debugEnabled` flag)

**Example Log Output:**
```
npc-token-replacer | Initializing NPC Token Replacer
npc-token-replacer | Detecting official D&D compendiums...
npc-token-replacer | Found 5 official D&D Actor compendiums
npc-token-replacer | Loading monster index from 5 compendium(s)...
```

## CI/CD & Deployment

**Hosting:**
- GitHub releases (module manifest and ZIP downloads)
  - Manifest URL: `https://github.com/Aiacos/npc-token-replacer/releases/latest/download/module.json`
  - Download URL: `https://github.com/Aiacos/npc-token-replacer/releases/download/vX.Y.Z/npc-token-replacer-vX.Y.Z.zip`

**CI Pipeline:**
- None - manual build and release via `build.sh`/`build.bat`

**Release Process:**
1. Update `module.json`: bump `version` field and update `download` URL
2. Run `bash build.sh` to create ZIP in `releases/`
3. Commit and push
4. Create GitHub release with `gh release create` command (uploads ZIP + module.json)

## Environment Configuration

**Required env vars:**
- None - all configuration via Foundry settings UI

**Secrets location:**
- None - no secrets or credentials needed

**Settings Storage:**
- Foundry world database (`game.settings.get/set`)
- Persisted across sessions in world JSON files
- No external configuration files

**Key Settings:**
- `NPC_REPLACER.Settings.VariationMode` - Token art selection strategy (none/sequential/random)
- `NPC_REPLACER.Settings.EnabledCompendiums` - JSON string: compendium selection mode (default/all/custom)
- `NPC_REPLACER.Settings.CompendiumSelector` - Menu for UI-based compendium configuration

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Network Requests

**HTTP Methods Used:**
- `fetch()` with `method: 'HEAD'` only

**Requests Made:**
- Wildcard token art probing: `WildcardResolver.fetchWithTimeout()`
  - Probes for variant images (e.g., `tokens/specter-1.webp`, `tokens/specter-2.webp`)
  - Tests existence via HEAD requests
  - Used only when token texture path contains `*` wildcard
  - Parallel probing with `Promise.allSettled()` for performance

**Example Probed Paths:**
```
GET /modules/dnd-monster-manual/tokens/specter-1.webp (HEAD)
GET /modules/dnd-monster-manual/tokens/specter-2.webp (HEAD)
GET /modules/dnd-monster-manual/tokens/specter-01.webp (HEAD)
GET /modules/dnd-monster-manual/tokens/specter-a.webp (HEAD)
```

**Timeout Handling:**
- Default 5 seconds (`DEFAULT_HTTP_TIMEOUT_MS`)
- Configurable per request via `WildcardResolver.DEFAULT_TIMEOUT`
- Uses `AbortController` for clean cancellation
- Failures logged as warnings, not fatal

## Foundry VTT Integration Points

**Hooks:**
- `Hooks.once("init")` - Register settings (`registerSettings()`)
- `Hooks.once("ready")` - Initialize module, pre-cache monster index
- `Hooks.on("getSceneControlButtons")` - Add "Replace NPC Tokens" button to token controls

**APIs Used:**
- `game.packs` - Detect and access compendium packs
- `game.actors` - Import actors from compendiums
- `game.folders` - Manage actor folders for imports
- `game.settings` - Register and store module settings
- `game.user` - Check GM status
- `game.scenes` - Get current scene and its tokens
- `game.i18n` - Localize UI strings
- `canvas.tokens` - Update token documents on canvas
- `ui` - Show dialogs and forms
- `Folder.create()` - Create actor folders
- `Actor.importFromCompendium()` - Import actors
- `TokenDocument` - Token document API for creation/updates
- `Dialog.confirm()` - Show confirmation dialogs
- `FormApplication` - Base class for settings UI (`CompendiumSelectorForm`)
- `FilePicker` - Available but not used (for future file browsing if needed)

**D&D 5e System Integration:**
- Reads actor data from `dnd5e` system compendiums
- Monster index format assumes D&D 5e actor documents
- Requires `dnd5e` system in `module.json` relationships

## Data Flow Between Systems

**Token Replacement Flow:**
1. User clicks "Replace NPC Tokens" button (scene control)
2. Module identifies NPC tokens in scene (`TokenReplacer.getNPCTokensFromScene()`)
3. Shows confirmation dialog with token list
4. For each token:
   - Get actor name from token
   - Search enabled compendiums via `CompendiumManager.loadMonsterIndex()`
   - Match name using `NameMatcher.findMatch()`
   - Import compendium actor via `game.actors.importFromCompendium()`
   - Handle wildcard token art via `WildcardResolver.resolveWildcardVariants()`
   - Create new token with preserved properties
   - Delete original token
5. Update canvas and report results

**Compendium Management:**
- Detects WotC packs: `game.packs.filter()` with package prefix matching
- Loads monster index: `pack.getIndex()` for each enabled compendium
- Priority selection: Uses 4-tier system (Adventure > Expansion > Core > Fallback)
- Index combination: Merges indexes from all enabled packs

---

*Integration audit: 2026-02-28*

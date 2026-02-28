# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- JavaScript (ES2020+) - All module logic in `scripts/main.js`
- JSON - Configuration and localization in `module.json`, `lang/en.json`, `package.json`

**Markup:**
- HTML - Form templates in `templates/` directory (FormApplication UI)

## Runtime

**Environment:**
- Foundry VTT v12/v13 browser runtime (Web APIs via browser globals)
- Node.js 16.0+ (for dev tooling only)

**Global Objects:**
- Foundry VTT globals: `game`, `canvas`, `ui`, `Hooks`, `Dialog`, `Folder`, `FormApplication`, `FilePicker`, `CompendiumCollection`, `TokenDocument`, `Actor`
- Browser globals: `window`, `document`, `console`, `fetch`, `AbortController`, `setTimeout`, `clearTimeout`, `Promise`, `Map`, `Set`, `Math`

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Foundry VTT v12-v13 - Game engine providing actor/token/compendium APIs
- D&D 5e System (`dnd5e` required) - Provides creature data and compendium structure

**Testing:**
- None configured (test script in `package.json` is placeholder)

**Build/Dev:**
- ESLint v9.39.2 - Code linting and style enforcement via flat config format

## Key Dependencies

**Dev Dependencies:**
- `eslint` v9.39.2 - Linting, code quality enforcement

**No runtime dependencies** - Module is zero-dependency, using native browser APIs only.

## Configuration

**Environment:**
- Foundry VTT settings system (`game.settings.register/get/set`)
- Configuration files:
  - `module.json` - Module manifest with version, compatibility, entry points
  - `eslint.config.js` - ESLint configuration (flat format with browser/Foundry globals)
  - `package.json` - Dev dependencies and project metadata

**Module Settings:**
- `tokenVariationMode` - String setting: "none" | "sequential" | "random" for wildcard token selection
- `enabledCompendiums` - JSON string setting storing array of enabled compendium IDs

**Localization:**
- `lang/en.json` - English strings for UI messages, dialog text, settings labels
- Loaded via `game.i18n.localize()` with keys pattern `NPC_REPLACER.<Category>.<Key>`

## Build Configuration

**Entry Point:**
- `scripts/main.js` (2000+ lines) - Single ES module containing all logic

**Module Definition:**
- `module.json`:
  - `esmodules`: `["scripts/main.js"]` - Loads as ES module
  - `languages`: English localization file
  - `relationships.systems`: Requires `dnd5e` system

**Build Output:**
- `build.sh` (Linux/macOS) / `build.bat` (Windows) - Creates distributable ZIP
- Output: `releases/npc-token-replacer-vX.Y.Z.zip` with all source files
- Auto-updates download URL in packaged `module.json`

## Platform Requirements

**Development:**
- Linux/macOS (for `build.sh`) or Windows (for `build.bat`)
- `jq` (optional, for faster module.json parsing; falls back to grep/sed)
- `zip` command for packaging

**Runtime (Production):**
- Foundry VTT v12 minimum (verified v13)
- D&D 5e system installed and active
- Browser with Fetch API support (all modern browsers)
- At least one official WOTC D&D compendium pack (Monster Manual, adventures, etc.) with Actor documents

**Installation:**
- Module symlinked/copied to `Data/modules/npc-token-replacer/` in Foundry instance
- Enabled in world settings
- Accessed via scene control buttons or `NPCTokenReplacer.*` console API

## HTTP & Network

**HTTP Library:**
- Native `fetch()` API with custom wrapper `WildcardResolver.fetchWithTimeout()`
- Uses `AbortController` for timeout support (default 5 seconds)

**External Requests:**
- HEAD requests only to probe for wildcard token art variants (e.g., `tokens/specter-1.webp`, `tokens/specter-2.webp`)
- No external API calls or data fetches
- All data comes from local Foundry compendiums (`game.packs`)

## Constants & Configuration Values

```javascript
const MODULE_ID = "npc-token-replacer";           // Module identifier
const DEFAULT_HTTP_TIMEOUT_MS = 5000;              // HTTP timeout for HEAD requests
const WOTC_MODULE_PREFIXES = ["dnd-", "dnd5e"];   // Compendium package prefixes
const COMPENDIUM_PRIORITIES = {                    // Priority system (1=highest)
  "dnd5e.srd": 2,                                  // Core SRD
  "dnd-phb.compendium.srd": 2,
  // ... (full list in CompendiumManager.COMPENDIUM_PRIORITIES)
}
```

**Wildcard Resolution:**
- Probes variants: `1-5`, `01-05`, `a-e` numeric and letter suffixes
- Extensions: `.webp`, `.png`, `.jpg`, `.jpeg`
- Parallel HEAD requests with Promise.allSettled() for discovery

---

*Stack analysis: 2026-02-28*

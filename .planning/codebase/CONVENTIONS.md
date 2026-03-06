# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

**Files:**
- Single-file module pattern: `scripts/main.js` contains all logic (~2150 lines)
- Configuration files: camelCase with `.js` or `.mjs` extensions (e.g., `eslint.config.js`, `eslint.config.mjs`)

**Classes:**
- PascalCase with descriptive names: `Logger`, `FolderManager`, `WildcardResolver`, `CompendiumManager`, `NameMatcher`, `TokenReplacer`, `NPCTokenReplacerController`, `CompendiumSelectorForm`
- Static-only utility classes (no instance creation): All major classes are designed as static method containers

**Functions & Methods:**
- camelCase: `log()`, `getCompendiumPriority()`, `loadMonsterIndex()`, `detectWOTCCompendiums()`
- Private methods: Prefixed with `#` using ES6 private field syntax: `#getOrImportWorldActor()`, `#processToken()`, `#prepareNewTokenData()`
- Async methods: No special naming convention; async behavior indicated by JSDoc `@returns` mentioning `Promise`
- Getter/setter pairs: Use static getter/setter syntax for configuration access (e.g., `static get FOLDER_NAME()`, `static set debugEnabled()`)

**Constants:**
- UPPER_SNAKE_CASE: `MODULE_ID`, `DEFAULT_HTTP_TIMEOUT_MS`
- Module-level constants declared at file top
- Class-level constants: Private static fields accessed via getters for encapsulation: `#WOTC_MODULE_PREFIXES`, `#COMPENDIUM_PRIORITIES`

**Variables:**
- let/const (never var): Enforced by ESLint rule `"no-var": "error"`
- camelCase: `enabledPackIds`, `combinedIndex`, `importFolder`
- Unused parameters: Prefixed with `_` to satisfy ESLint rule `argsIgnorePattern: "^_"`
- Loop variables: Descriptive names preferred (`for (const result of results)`) over single letters

**Types:**
- JSDoc @type annotations throughout: `@type {string}`, `@type {CompendiumCollection}`, `@type {Map<string, Array>}`
- Structured object types documented in JSDoc: `@param {Object} formData`, `@returns {{status: 'replaced'|'not_found'|'error'|'skipped', name: string}}`

## Code Style

**Formatting:**
- ESLint configuration: `eslint.config.js` (ESLint 9.x flat config format)
- 2-space indentation: `"indent": ["warn", 2, { SwitchCase: 1 }]`
- Double quotes: `"quotes": ["warn", "double", { avoidEscape: true }]` (allow backticks for template literals via config)
- Semicolons: Always present, enforced by `"semi": ["error", "always"]`
- No trailing spaces: `"no-trailing-spaces": "warn"`
- EOL: Unix-style line endings, enforced by `"eol-last": ["warn", "always"]`
- No empty lines at EOF: `"no-multiple-empty-lines": ["warn", { max: 2, maxEOF: 1 }]`

**Linting:**
- Tool: ESLint 9.39.2
- Config file: `/eslint.config.js` (primary) and `eslint.config.mjs` (alternative for ESM default)
- Key enforced rules:
  - `"no-unused-vars"`: Error (with exceptions for underscore-prefixed and caught errors)
  - `"no-var"`: Error (const/let only)
  - `"prefer-const"`: Warning (prefer const over let when not reassigned)
  - `"eqeqeq"`: Warning, always with null ignore (use === not ==)
  - `"no-eval"`: Error
  - `"no-duplicate-imports"`: Error
- Globals configured:
  - Browser: `window`, `document`, `console`, `fetch`, `AbortController`, `setTimeout`, `clearTimeout`, `Promise`, `Map`, `Set`, `Math`
  - Foundry VTT: `game`, `canvas`, `ui`, `Hooks`, `Dialog`, `FormApplication`, `Folder`, `Actor`, `TokenDocument`, `foundry`, `CompendiumCollection`, `FilePicker`

## Import Organization

**Order:**
1. No explicit imports pattern (plain ES6 modules loaded by Foundry VTT)
2. Module uses global namespace for Foundry APIs

**Path Aliases:**
- Not used (single-file module, no internal imports)

**Module Export:**
- Hook registration and settings setup called via Foundry hooks
- Debug API exposed via `NPCTokenReplacerController.getDebugAPI()` → `window.NPCTokenReplacer`

## Error Handling

**Patterns:**
- Try/catch blocks with context-preserving error logging:
  ```javascript
  try {
    await pack.getIndex({ fields: ["name", "type"] });
    // ...
  } catch (error) {
    Logger.error(`Failed to load index from ${pack.collection}`, error);
  }
  ```
- Error parameter always passed to Logger: `Logger.error(message, error)` includes full error object for debugging
- Settings parsing wrapped in try/catch with graceful fallback: `JSON.parse()` can throw, caught and logged with fallback value
- User-facing errors via Foundry UI: `ui.notifications.error()`, `ui.notifications.warn()`, `ui.notifications.info()`
- No stack trace leaking to console in error logs (security practice for module operations)
- Promise.allSettled() for parallel operations to handle individual failures: `WildcardResolver.resolveWildcardVariants()` probes all candidates in parallel without aborting on single failure

## Logging

**Framework:** Logger custom utility class (not console directly)

**Patterns:**
- Centralized Logger class with static methods: `Logger.log()`, `Logger.error()`, `Logger.warn()`, `Logger.debug()`
- Module prefix automatically added: All logs prefixed with `npc-token-replacer | `
- Level-appropriate methods: `log()` for info, `error()` for errors, `warn()` for warnings, `debug()` for development
- Optional data parameter: Second parameter for additional context objects
  ```javascript
  Logger.log("Found creatures", { count: 5, names: ["Goblin", "Orc"] });
  Logger.error("Failed to load compendium", new Error("Network timeout"));
  ```
- Debug logging gated by `Logger.debugEnabled` flag: Expensive debug calls checked before execution to avoid template literal cost
  ```javascript
  if (Logger.debugEnabled) {
    Logger.debug("Processing token", { name: "Goblin", id: "token123" });
  }
  ```

## Comments

**When to Comment:**
- Class-level documentation: Comprehensive JSDoc blocks with @class and purpose
- Public method documentation: Full JSDoc with @param, @returns, @throws, @static, @example
- Complex logic: Inline comments explain "why" not "what" (e.g., "Single pass — gather all Actor folders once and reuse for all searches")
- Algorithm explanation: Multi-stage matching strategy documented before implementation
- Important caveats: Marked with IMPORTANT or all-caps: "IMPORTANT: Always use the COMPENDIUM actor's prototypeToken"
- Workarounds: Documented with context (e.g., "Note: All caches are now managed by their respective classes...")

**JSDoc/TSDoc:**
- Full JSDoc documentation on all classes and public methods
- Format: Standard JSDoc with type hints:
  ```javascript
  /**
   * [Description]
   * @param {type} paramName - [Description]
   * @returns {type} [Description]
   * @static
   * @example
   * [Example code]
   */
  ```
- @static tag used for all class methods (everything is static)
- @private tag for private methods
- @readonly tag for immutable constants and getters
- @example blocks show real usage patterns for most public methods
- Type documentation includes complex shapes: `@returns {{status: 'replaced'|'not_found'|'error'|'skipped', name: string}}`

## Function Design

**Size:**
- Methods range from ~5 lines (getters) to ~100 lines (complex workflows like `replaceNPCTokens()`)
- Single responsibility enforced: Each class has focused purpose (e.g., `NameMatcher` only does name normalization and matching)

**Parameters:**
- Explicit parameters preferred over config objects (most methods take 1-4 parameters)
- Optional parameters use default values: `async loadMonsterIndex(forceReload = false)`
- Variadic patterns avoided in favor of arrays passed explicitly
- Settings passed through parameters, not queried repeatedly (performance)

**Return Values:**
- Consistent return types: Async methods always return Promise-wrapped results
- Complex returns documented as objects: `{ tokens: TokenDocument[], isSelection: boolean }`
- Null for "not found" cases, never undefined
- Error throwing for exceptional conditions: `throw new Error("Failed to...")`

## Module Design

**Exports:**
- Single-file module: All classes defined in `scripts/main.js`
- Hook handlers registered during `init` and `ready` phases
- Debug API exposed via `window.NPCTokenReplacer` for console access
- No CommonJS exports; plain ES6 module loaded by Foundry

**Barrel Files:**
- Not applicable (single-file architecture)

**Private Fields:**
- ES6 private static fields extensively used: `#indexCache`, `#wotcCompendiumsCache`, `#isProcessing`, `#sequentialCounter`, `#variantCache`
- Accessed only through public static getters/setters: `static get debugEnabled()`, `static set debugEnabled(value)`
- Prevents external mutation and encapsulates internal state
- Cache invalidation controlled via `clearCache()` methods on each class

## Performance Patterns

**Caching:**
- Static fields store cached results: Maps for O(1) lookups, arrays for sorted data
- Cache invalidation points explicit: `clearCache()` called after settings changes
- Session-scoped caches: `TokenReplacer.#actorLookup` built once per session, cleared after completion

**Optimization Techniques:**
- O(1) lookups via Map: `CompendiumManager.#indexMap` for exact name matching
- Set-based filtering: `new Set(enabledPackIds)` for O(1) pack lookup
- Parallel operations with Promise.allSettled(): Wildcard probes don't block on individual failures
- Expensive operations gated: Debug logging checks `Logger.debugEnabled` before template literals

## Code Patterns

**Static-Only Classes:**
- All classes use static methods exclusively (no instantiation)
- Singleton pattern via private static fields
- Configuration stored as class-level static constants

**Async/Await:**
- Consistently used for Foundry async operations: `await pack.getIndex()`, `await TokenReplacer.replaceToken()`
- Promise chaining avoided in favor of async/await
- Error handling via try/catch, not `.catch()` chains

**Type Safety:**
- JSDoc type hints throughout (no TypeScript)
- Guard clauses for type checking: `if (!name || typeof name !== "string")`
- Null checks before operations: `if (folder && game.folders.has(folder.id))`

## Localization

- All user-facing strings use `game.i18n.localize()` or `game.i18n.format()`
- String keys from `lang/en.json` following pattern: `NPC_REPLACER.<Category>.<Key>`
- Example: `game.i18n.localize("NPC_REPLACER.GMOnly")` → "Only the GM can replace tokens"
- Format with interpolation: `game.i18n.format("NPC_REPLACER.Complete", { count: replaced })`

---

*Convention analysis: 2026-02-28*

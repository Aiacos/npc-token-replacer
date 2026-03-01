# Phase 2: Extract Pure Logic - Research

**Researched:** 2026-03-01
**Domain:** ES module extraction, dependency decoupling, Foundry VTT module loading
**Confidence:** HIGH

## Summary

Phase 2 moves three classes (Logger, WildcardResolver, NameMatcher) from the monolithic `scripts/main.js` into individual files under `scripts/lib/`, each with explicit named exports. The primary challenge is decoupling NameMatcher from CompendiumManager -- NameMatcher's `findMatch()` and `selectBestMatch()` methods call `CompendiumManager.getCompendiumPriority()` and `CompendiumManager.getIndexMap()` at runtime. Logger and WildcardResolver are straightforward extractions with zero or minimal dependencies.

Research verified that: (1) ES2020 private static fields survive extraction into separate modules without any issues (tested in Node.js and matches Phase 1 Vitest findings), (2) Foundry VTT fully supports `import` statements within a module's own file tree -- the entry point in `esmodules` can import from sub-files using relative paths, (3) a class can reference another class in method bodies without importing it if the reference is resolved at call-time rather than import-time, and (4) the cleanest decoupling pattern for NameMatcher is dependency injection via a static setter -- `NameMatcher.setCompendiumManager(CompendiumManager)` -- called from main.js after both classes are available.

**Primary recommendation:** Extract all three classes in dependency order (Logger first, then WildcardResolver, then NameMatcher), use a static `setCompendiumManager()` setter on NameMatcher to break the import-time dependency on CompendiumManager, and have main.js wire the dependency after importing both classes.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-02 | Named exports added to scripts/main.js for all classes (Logger, FolderManager, WildcardResolver, CompendiumManager, NameMatcher, TokenReplacer, NPCTokenReplacerController) | Phase 2 **partially satisfies** this requirement by extracting 3 of 7 classes (Logger, WildcardResolver, NameMatcher) to `scripts/lib/` with named exports. The remaining 4 classes stay in main.js and need export statements added in a later phase. The phase success criteria explicitly scope to these 3 classes only. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.2.4 | Test runner (existing from Phase 1) | Already installed; tests validate import success |
| ES Modules | Native | Module system for file splitting | Foundry VTT `esmodules` supports internal relative imports; Node.js/Vitest support native ESM |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @rayners/foundry-test-utils | 1.2.2 | Foundry global mocks (existing from Phase 1) | Only needed in setupFiles; extracted pure-logic classes should NOT need these mocks at import time |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static setter for CompendiumManager dependency | Parameter injection on every method call | Changes the public API of selectBestMatch/findMatch; more invasive refactor; all callers must be updated |
| Static setter for CompendiumManager dependency | Keep inline reference (no import, rely on scope) | NameMatcher.js would have undefined CompendiumManager at import; breaks the success criterion of importing without stubs |
| Separate files in scripts/lib/ | Barrel file (scripts/lib/index.js) re-exporting all | Adds indirection; Foundry VTT loads the esmodules entry point which is main.js -- barrel is unnecessary |

**Installation:**
```bash
# No new packages needed -- Phase 1 stack is sufficient
```

## Architecture Patterns

### Recommended Project Structure
```
scripts/
  lib/
    logger.js            # Logger class, MODULE_ID constant
    wildcard-resolver.js # WildcardResolver class, DEFAULT_HTTP_TIMEOUT_MS constant
    name-matcher.js      # NameMatcher class (pure matching logic)
  main.js                # Remaining classes + Hooks + imports from lib/
```

### Pattern 1: Logger Extraction (Zero Dependencies)
**What:** Extract Logger and its MODULE_ID constant into a standalone module
**When to use:** Always -- Logger is the simplest extraction and a dependency of the other two
**Example:**
```javascript
// scripts/lib/logger.js
// Source: verified via Node.js ES module test 2026-03-01

const MODULE_ID = "npc-token-replacer";

class Logger {
  static #MODULE_PREFIX = MODULE_ID;
  static get MODULE_PREFIX() { return Logger.#MODULE_PREFIX; }

  static #debugEnabled = false;
  static get debugEnabled() { return Logger.#debugEnabled; }
  static set debugEnabled(value) { Logger.#debugEnabled = !!value; }

  static log(message, data = null) {
    if (data !== null && data !== undefined) {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }
  // ... error, warn, debug methods identical
}

export { Logger, MODULE_ID };
```

**Key details:**
- `MODULE_ID` is exported alongside Logger because other classes (WildcardResolver, CompendiumManager, etc.) reference it for settings registration
- Logger has ZERO Foundry global dependencies -- it only uses `console.*`
- Private static fields (`#MODULE_PREFIX`, `#debugEnabled`) work identically when extracted (verified)

### Pattern 2: WildcardResolver Extraction (Logger Dependency Only)
**What:** Extract WildcardResolver with its `DEFAULT_HTTP_TIMEOUT_MS` constant
**When to use:** After Logger is extracted
**Example:**
```javascript
// scripts/lib/wildcard-resolver.js
import { Logger } from "./logger.js";

const DEFAULT_HTTP_TIMEOUT_MS = 5000;

class WildcardResolver {
  static #variantCache = new Map();
  // ... (all methods transfer verbatim)
}

export { WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS };
```

**Key details:**
- Depends only on Logger (imported from `./logger.js`) and browser/Node built-ins (`fetch`, `AbortController`, `setTimeout`, `clearTimeout`, `Math.floor`, `Math.random`)
- `DEFAULT_HTTP_TIMEOUT_MS` is extracted alongside the class because it's referenced as `WildcardResolver.DEFAULT_TIMEOUT`
- `fetch` is available in both browser (Foundry) and Vitest jsdom environment

### Pattern 3: NameMatcher Extraction with Dependency Injection
**What:** Extract NameMatcher and break its compile-time dependency on CompendiumManager using a static setter
**When to use:** After Logger is extracted
**Example:**
```javascript
// scripts/lib/name-matcher.js
import { Logger } from "./logger.js";

// Late-bound dependency on CompendiumManager
// Set by main.js after both classes are loaded
let _CompendiumManager = null;

class NameMatcher {
  /**
   * Set the CompendiumManager dependency for priority lookups.
   * Called from main.js after CompendiumManager is defined.
   * @param {object} cm - CompendiumManager class with getCompendiumPriority() and getIndexMap()
   */
  static setCompendiumManager(cm) {
    _CompendiumManager = cm;
  }

  static normalizeName(name) {
    // ... pure logic, no external deps
  }

  static selectBestMatch(matches) {
    if (!matches || matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    const getPriority = m => m.priority ?? _CompendiumManager?.getCompendiumPriority(m.pack) ?? 1;

    // ... rest identical to current code
  }

  static findMatch(creatureName, index) {
    // ...
    const indexMap = _CompendiumManager?.getIndexMap() ?? null;
    // ... rest identical, using indexMap variable
  }
}

export { NameMatcher };
```

**Key design decisions:**
- A module-level `let _CompendiumManager = null` holds the late-bound reference
- `NameMatcher.setCompendiumManager(CompendiumManager)` is called from main.js during module initialization
- Null-safe access (`_CompendiumManager?.getCompendiumPriority(...)`) with sensible fallbacks ensures import-time safety
- `normalizeName()` and the pattern constants are fully pure and testable without any setup
- `selectBestMatch()` and `findMatch()` degrade gracefully when CompendiumManager is not set (use pre-computed `priority` field on match objects, fall back to linear scan instead of Map lookup)

### Pattern 4: main.js Import and Wiring
**What:** How main.js imports extracted classes and wires dependencies
**When to use:** After all three classes are extracted
**Example:**
```javascript
// scripts/main.js (top of file, replacing the inline class definitions)
import { Logger, MODULE_ID } from "./lib/logger.js";
import { WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS } from "./lib/wildcard-resolver.js";
import { NameMatcher } from "./lib/name-matcher.js";

// ... CompendiumManager class definition remains inline ...

// Wire late-bound dependency (after CompendiumManager class is defined)
NameMatcher.setCompendiumManager(CompendiumManager);

// ... rest of main.js continues as before ...
```

**Key details:**
- `import` statements go at the very top of main.js (ES module spec requirement)
- The `NameMatcher.setCompendiumManager(CompendiumManager)` call goes AFTER the CompendiumManager class definition but BEFORE any code that calls `NameMatcher.findMatch()`
- `MODULE_ID` and `DEFAULT_HTTP_TIMEOUT_MS` are imported because other classes in main.js still reference them
- The `esmodules: ["scripts/main.js"]` in module.json stays unchanged -- Foundry loads main.js which in turn imports from lib/

### Anti-Patterns to Avoid
- **Circular imports:** Do NOT have `name-matcher.js` import from a file that imports `name-matcher.js`. The current approach avoids this: Logger has no imports, WildcardResolver imports only Logger, NameMatcher imports only Logger. CompendiumManager stays in main.js.
- **Import-time Foundry global access:** Do NOT reference `game`, `ui`, `canvas`, `Hooks`, etc. at the top level of extracted files. These globals don't exist during Vitest test runs. All extracted files must only reference these inside method bodies (runtime), not at module evaluation time.
- **Re-exporting from main.js:** Do NOT add `export { Logger, NameMatcher, WildcardResolver }` to main.js. Foundry's `esmodules` entry point is not designed for other modules to import from. The exports are for test files only, and test files import directly from `scripts/lib/`.
- **Barrel file (index.js):** Do NOT create a `scripts/lib/index.js` that re-exports all classes. It adds an unnecessary layer and can create import ordering issues. Test files should import directly from the specific lib file.
- **Moving CompendiumManager to lib/ in this phase:** CompendiumManager depends heavily on Foundry globals (`game.packs`, `game.settings`). Extracting it would defeat the "no Foundry global stubs" requirement. It stays in main.js for now.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Module bundling/concatenation | Build script to merge lib/ files back into main.js | Native ES module imports | Foundry VTT supports ESM imports natively; no build step needed |
| Dependency injection framework | Custom DI container, service locator | Simple static setter (`setCompendiumManager`) | Only ONE dependency to inject; a framework is massive overkill |
| Module loading shim | Custom `importScripts` or dynamic `import()` | Static `import` statements | Static imports are resolved by the browser/Node; reliable and debuggable |

**Key insight:** This phase is a refactoring operation with zero new functionality. The complexity is entirely in getting the dependency graph right and ensuring nothing breaks at import time.

## Common Pitfalls

### Pitfall 1: Breaking the Import Chain with Foundry Globals
**What goes wrong:** An extracted file references a Foundry global (like `game.settings`) at module level, causing `ReferenceError: game is not defined` when tests import it
**Why it happens:** Some class initializers or constant definitions read from Foundry globals at parse time
**How to avoid:** Audit every line of code being extracted. Foundry global references must only appear inside method bodies, not at module scope or in static field initializers
**Warning signs:** `ReferenceError` during `import` in test files

### Pitfall 2: Forgetting to Wire NameMatcher's CompendiumManager Dependency
**What goes wrong:** `NameMatcher.findMatch()` returns null for all queries because `_CompendiumManager` is null and `getIndexMap()` returns null, falling through to the non-Map fallback path which may also behave differently
**Why it happens:** The `NameMatcher.setCompendiumManager(CompendiumManager)` call is missing or placed after first use
**How to avoid:** Place the wiring call immediately after CompendiumManager class definition in main.js, well before any Hook callbacks that might trigger `findMatch()`
**Warning signs:** All name lookups returning null or using O(n) scan instead of O(1) Map lookup

### Pitfall 3: Circular Import Dependencies
**What goes wrong:** Module evaluation hangs or produces undefined imports
**Why it happens:** File A imports from file B which imports from file A
**How to avoid:** Maintain a strict one-way dependency graph: Logger <- WildcardResolver, Logger <- NameMatcher. Never import main.js from lib/ files
**Warning signs:** `undefined` values for imported symbols, or `TypeError: X is not a function`

### Pitfall 4: Constants Left Behind in main.js
**What goes wrong:** Extracted classes reference `MODULE_ID` or `DEFAULT_HTTP_TIMEOUT_MS` but the constants remain defined only in main.js, causing `ReferenceError`
**Why it happens:** The constants were module-level in main.js and classes referenced them implicitly through closure scope
**How to avoid:** Move each constant into the lib/ file where it's primarily used, and export it so main.js can import it
**Warning signs:** `ReferenceError: MODULE_ID is not defined` on first import

### Pitfall 5: Private Static Field Cloning Issues
**What goes wrong:** Copy-pasting a class definition loses private field identity -- `#field` in copy is a different slot than `#field` in original
**Why it happens:** Misunderstanding of how private fields work -- each class definition creates its own private field slot
**How to avoid:** This is actually NOT an issue for extraction -- each file has exactly one class definition. The private fields are self-contained within the class. Just verify tests can access public getters that expose private field values.
**Warning signs:** None expected -- this is a non-issue but worth documenting to prevent unnecessary worry

### Pitfall 6: Vitest Coverage Config Needs Update
**What goes wrong:** Coverage reports show 0% for extracted files or miss them entirely
**Why it happens:** The current `vitest.config.js` has `include: ["scripts/**/*.js"]` which should cover `scripts/lib/` automatically via the glob. However, if the exclude pattern in coverage config changes, files could be missed.
**How to avoid:** Verify that `scripts/**/*.js` glob in coverage config includes `scripts/lib/*.js`. After extraction, run `npm run test:coverage` and confirm the lib/ files appear.
**Warning signs:** Coverage report missing the new lib/ files

## Code Examples

Verified patterns from research tests:

### Complete Logger Extraction
```javascript
// scripts/lib/logger.js
// Source: extracted from scripts/main.js lines 37-132

/**
 * The unique identifier for this module.
 * Used for settings registration, hook identification, and logging.
 * @type {string}
 * @constant
 */
const MODULE_ID = "npc-token-replacer";

/**
 * Logger utility class for consistent logging with module prefix.
 * All methods are static. No Foundry global dependencies.
 * @class
 */
class Logger {
  static #MODULE_PREFIX = MODULE_ID;
  static get MODULE_PREFIX() {
    return Logger.#MODULE_PREFIX;
  }

  static #debugEnabled = false;
  static get debugEnabled() {
    return Logger.#debugEnabled;
  }
  static set debugEnabled(value) {
    Logger.#debugEnabled = !!value;
  }

  static log(message, data = null) {
    if (data !== null && data !== undefined) {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  static error(message, error = null) {
    if (error !== null && error !== undefined) {
      console.error(`${Logger.#MODULE_PREFIX} | ${message}`, error);
    } else {
      console.error(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  static warn(message, data = null) {
    if (data !== null && data !== undefined) {
      console.warn(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.warn(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  static debug(message, data = null) {
    if (!Logger.#debugEnabled) return;
    if (data !== null && data !== undefined) {
      console.debug(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.debug(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }
}

export { Logger, MODULE_ID };
```

### Import Validation Test (Vitest)
```javascript
// tests/lib/name-matcher.test.js
// Verifies Phase 2 success criterion 3: import succeeds without Foundry stubs
import { describe, it, expect } from "vitest";
import { NameMatcher } from "../../scripts/lib/name-matcher.js";

describe("NameMatcher import", () => {
  it("imports successfully without Foundry globals", () => {
    expect(NameMatcher).toBeDefined();
    expect(typeof NameMatcher.normalizeName).toBe("function");
  });

  it("normalizeName works without any setup", () => {
    expect(NameMatcher.normalizeName("Goblin Warrior")).toBe("goblin warrior");
    expect(NameMatcher.normalizeName("")).toBe("");
    expect(NameMatcher.normalizeName(null)).toBe("");
  });
});
```

### main.js Import Section After Extraction
```javascript
// scripts/main.js (top of file)
import { Logger, MODULE_ID } from "./lib/logger.js";
import { WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS } from "./lib/wildcard-resolver.js";
import { NameMatcher } from "./lib/name-matcher.js";

// ... FolderManager class (remains inline) ...
// ... CompendiumManager class (remains inline) ...

// Wire late-bound dependency
NameMatcher.setCompendiumManager(CompendiumManager);

// ... TokenReplacer class (remains inline) ...
// ... NPCTokenReplacerController class (remains inline) ...
// ... CompendiumSelectorForm class (remains inline) ...
// ... registerSettings(), escapeHtml(), registerControlButton() functions ...
// ... Hooks.once("init", ...), Hooks.once("ready", ...), Hooks.on(...) ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single monolithic script | ES module imports within same package | Foundry v10+ (2022) | Modules can split code into files using standard `import`/`export` |
| Global scope pollution | Named exports from individual files | ES2015+ | Each file explicitly exports its public API |
| Tight coupling via shared scope | Dependency injection / late binding | Evergreen pattern | Classes become testable in isolation |

**Deprecated/outdated:**
- `scripts` array in module.json: Still supported but `esmodules` is preferred. Using `esmodules` enables `import`/`export` syntax. This project already uses `esmodules`.

## Open Questions

1. **Should NameMatcher's `findMatch()` method stay in the extracted file or move to a CompendiumManager-aware wrapper?**
   - What we know: `findMatch()` has tight coupling to CompendiumManager via `getIndexMap()` and `getCompendiumPriority()`. The dependency injection setter cleanly breaks the import-time dependency.
   - What's unclear: Whether the setter pattern will feel natural to future maintainers vs. having `findMatch()` live in a different location.
   - Recommendation: Keep `findMatch()` in NameMatcher with the setter pattern. It's the cleanest approach that doesn't change the public API. The setter is called once during module initialization and is invisible to callers.

2. **Will TEST-02 be marked partially complete after Phase 2?**
   - What we know: TEST-02 says "Named exports added to scripts/main.js for all classes (Logger, FolderManager, WildcardResolver, CompendiumManager, NameMatcher, TokenReplacer, NPCTokenReplacerController)" -- 7 classes total. Phase 2 extracts 3.
   - What's unclear: Whether the remaining 4 classes should also get `export` statements in main.js in this phase, or if that's deferred.
   - Recommendation: Phase 2 satisfies TEST-02 for the 3 extracted classes. Adding `export` to the remaining classes in main.js is trivial but changes main.js's module interface. Defer to Phase 3 discussion unless the planner decides to include it.

3. **Should `MODULE_ID` live in logger.js or a separate constants.js?**
   - What we know: `MODULE_ID` is used by Logger (prefix), CompendiumManager (settings registration), registerSettings(), and the Hooks in main.js.
   - What's unclear: Whether a separate constants file is cleaner for a single constant.
   - Recommendation: Export `MODULE_ID` from `logger.js` since Logger is the primary consumer and it's just one constant. If more constants need extraction later, a constants.js can be introduced.

## Sources

### Primary (HIGH confidence)
- Verified test installation: ES module extraction with private static fields works in Node.js 22+ and Vitest 3.2.4 (tested 2026-03-01)
- Verified test installation: Import chain Logger -> WildcardResolver -> NameMatcher works without circular dependencies (tested 2026-03-01)
- Verified test installation: NameMatcher.normalizeName() works in isolation without any global stubs (tested 2026-03-01)
- [Foundry VTT Module Development](https://foundryvtt.com/article/module-development/) -- esmodules supports internal relative imports
- scripts/main.js source code analysis -- identified exact coupling points between NameMatcher and CompendiumManager

### Secondary (MEDIUM confidence)
- [Foundry VTT Community Wiki: Package Best Practices](https://foundryvtt.wiki/en/development/guides/package-best-practices) -- never do relative import across modules, internal imports are fine
- [Foundry Community: Importing a JS File](https://github.com/foundry-vtt-community/foundry-vtt-community.github.io/blob/main/_docs/Importing-a-.JS-file-in-Foundry.md) -- example of `import { classname } from "./module/yourclasshere.js"` pattern

### Tertiary (LOW confidence)
- None -- all findings verified via testing or source code analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; using existing Phase 1 infrastructure
- Architecture: HIGH - Extraction patterns verified via actual Node.js ES module tests; dependency graph analyzed from source
- Pitfalls: HIGH - Each pitfall identified through source code analysis or direct testing

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days -- this is a refactoring phase with stable technology; no time-sensitive dependencies)

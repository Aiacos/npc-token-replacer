# Phase 1: Test Infrastructure - Research

**Researched:** 2026-03-01
**Domain:** JavaScript test infrastructure (Vitest + Foundry VTT mocks)
**Confidence:** HIGH

## Summary

Phase 1 establishes the test infrastructure that all subsequent phases depend on. The stack is fully locked by user decisions and roadmap requirements: Vitest with jsdom environment, `@rayners/foundry-test-utils` for Foundry global mocks, and `@vitest/coverage-v8` for coverage infrastructure. A critical version constraint exists: `@rayners/foundry-test-utils@1.2.2` has a peer dependency on `vitest ^3.1.0`, so we must use Vitest 3.x (latest 3.2.4), NOT Vitest 4.x.

Research verified the full stack through a test installation: Vitest 3.2.4 + jsdom 27.4.0 + @vitest/coverage-v8 3.2.4 + @rayners/foundry-test-utils 1.2.2 install cleanly with zero dependency conflicts. A smoke test confirmed that Foundry globals (game, ui, canvas, Hooks, Dialog, FormApplication, foundry.utils) are all properly stubbed by the setup file. ES2020 private static fields (`#field`) work natively in Vitest 3.2.4 without any transpilation -- verified with an actual test.

The main gap is that `@rayners/foundry-test-utils` does NOT mock several Foundry globals that `scripts/main.js` uses: `game.packs` (with Foundry Collection `.filter()` method), `CompendiumCollection`, `TokenDocument`, `FilePicker`, and `canvas.tokens`. These must be added in the project's own setup file. Phase 1 only needs to document these gaps and provide the setup template -- Phase 2/3 will fill in the actual mocks when tests need them.

**Primary recommendation:** Install Vitest 3.2.4 (not 4.x) with foundry-test-utils, configure `passWithNoTests: true` so `npm test` exits 0 with zero test files, and create a setup file template documenting the mock gap pattern for later phases.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tests live in `tests/` directory at project root, separate from source
- Test files use `*.test.js` naming convention (Vitest default)
- Directory structure mirrors source: `tests/lib/` mirrors `scripts/lib/` (Phase 2+)
- Setup and helper files go in `tests/setup/` subdirectory
- Vitest config references `tests/setup/` files via `setupFiles`
- Use existing public `clearCache()` methods on each class in `beforeEach` blocks
- No test-only reset helpers -- leverage the existing API surface
- Provide a template `beforeEach` pattern in setup that other test files can follow
- Use `vitest.config.js` (plain JavaScript, no TypeScript dependency)
- Test files import via relative paths (e.g., `../../scripts/lib/name-matcher.js`)
- Vitest config uses explicit `include: ['tests/**/*.test.js']` to avoid scanning releases/, .planning/, etc.
- Configure coverage infrastructure now so Phase 3 can use it immediately
- No coverage thresholds enforced yet -- Phase 3 establishes baseline first

### Claude's Discretion
- ESM handling approach (native ESM vs Vitest transforms) -- pick based on Vitest ESM support and private field compatibility
- Mock depth -- determine appropriate level based on what @rayners/foundry-test-utils provides and what the codebase's classes actually reference
- Mock style -- choose between factory functions or shared objects based on class interaction patterns with Foundry globals
- Coverage provider (v8 vs istanbul) -- pick based on ESM compatibility and private field support
- Coverage report formats -- choose sensible defaults (text + HTML suggested but Claude can adjust)
- Whether to add a smoke test in setup that validates foundry-test-utils stubs are functional

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Vitest 4 test framework configured with jsdom environment and Foundry global mocks via @rayners/foundry-test-utils | Version constraint: must use Vitest 3.x (3.2.4) due to foundry-test-utils peer dep on `vitest ^3.1.0`. All config options verified: jsdom environment, `unstubGlobals: true`, setupFiles path `@rayners/foundry-test-utils/dist/helpers/setup.js`. Smoke-tested successfully. |
| TEST-06 | npm test script runs all tests without a Foundry instance and exits 0 | Verified: `passWithNoTests: true` config option makes Vitest exit 0 with zero test files. Package.json scripts.test must be `vitest run`. |

**Note on TEST-01:** The requirement says "Vitest 4" but `@rayners/foundry-test-utils@1.2.2` has `peerDependencies: { "vitest": "^3.1.0" }`. Using Vitest 4.x would cause peer dependency warnings/failures. Use Vitest 3.2.4 instead -- it satisfies the spirit of the requirement (modern Vitest with jsdom + foundry mocks).

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.2.4 | Test runner | Peer dependency constraint from foundry-test-utils (^3.1.0); native ESM, jsdom environment, fast |
| @rayners/foundry-test-utils | 1.2.2 | Foundry VTT global mocks | Only published mock package for Foundry VTT; provides game, ui, canvas, Hooks, Dialog, FormApplication, foundry.utils stubs |
| jsdom | 27.4.0 | DOM environment | Required by both Vitest and foundry-test-utils; 27.x satisfies foundry-test-utils peer dep (^26.1.0 \|\| ^27.0.0) |
| @vitest/coverage-v8 | 3.2.4 | Code coverage | V8-based coverage; native ESM support without transpilation; must match Vitest major version |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eslint | ^9.39.2 | Linting | Already installed; may need test file globals config |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest 3.2.4 | Vitest 4.0.18 | Would break peer dependency with foundry-test-utils; wait for foundry-test-utils to update |
| @vitest/coverage-v8 | @vitest/coverage-istanbul | Istanbul requires instrumentation transforms; v8 is faster and native for ESM with private fields |
| jsdom 27.4.0 | jsdom 26.1.0 | 27.x is newer and compatible; no reason to use older version |

**Installation:**
```bash
npm install --save-dev vitest@^3.1.0 @rayners/foundry-test-utils@^1.2.2 @vitest/coverage-v8@^3.1.0 jsdom@^27.0.0
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
  setup/
    foundry-mocks.js     # Project-specific mock extensions (game.packs, TokenDocument, etc.)
    cache-clearing.js     # beforeEach template for cache clearing pattern
  lib/                    # Phase 2+: mirrors scripts/lib/ structure
  smoke.test.js           # Optional: validates test infrastructure works
vitest.config.js          # At project root, plain JS
```

### Pattern 1: Vitest Config for Foundry Module
**What:** Complete vitest.config.js with all required settings
**When to use:** Always -- this is the project's test configuration
**Example:**
```javascript
// Source: verified via test installation 2026-03-01
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    unstubGlobals: true,
    passWithNoTests: true,
    setupFiles: [
      "@rayners/foundry-test-utils/dist/helpers/setup.js",
      "./tests/setup/foundry-mocks.js"
    ],
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["scripts/**/*.js"],
      exclude: ["scripts/main.js"]  // Until Phase 2 extracts to lib/
    }
  }
});
```

### Pattern 2: Cache-Clearing beforeEach Template
**What:** Template pattern for clearing static caches between tests
**When to use:** Every test file that imports classes with private static caches
**Example:**
```javascript
// Source: CONTEXT.md locked decision + CLAUDE.md class documentation
import { beforeEach } from "vitest";

// Template: cache-clearing pattern for test files
// Copy and adapt this block for each test file.
// Only call clearCache() on classes your test actually uses.
beforeEach(() => {
  // CompendiumManager.clearCache();  // clears #indexCache, #wotcCompendiumsCache
  // FolderManager.clearCache();       // clears #importFolderCache
  // WildcardResolver.clearCache();    // clears #variantCache
  // TokenReplacer.resetCounter();     // resets #sequentialCounter
});
```

### Pattern 3: Project-Specific Foundry Mock Extensions
**What:** Setup file that adds mocks not provided by foundry-test-utils
**When to use:** As a setupFile, runs before every test
**Example:**
```javascript
// tests/setup/foundry-mocks.js
// Extends @rayners/foundry-test-utils with project-specific mocks
import { vi } from "vitest";

// game.packs is not provided by foundry-test-utils
// Phase 2/3 will populate this with actual mock data
// For now, provide the Collection-like interface the code expects
if (!globalThis.game.packs) {
  globalThis.game.packs = {
    get: vi.fn(),
    filter: vi.fn(() => []),
    forEach: vi.fn(),
    size: 0
  };
}

// Globals used in main.js but not mocked by foundry-test-utils
if (typeof globalThis.CompendiumCollection === "undefined") {
  globalThis.CompendiumCollection = class MockCompendiumCollection {};
}
if (typeof globalThis.TokenDocument === "undefined") {
  globalThis.TokenDocument = class MockTokenDocument {};
}
if (typeof globalThis.FilePicker === "undefined") {
  globalThis.FilePicker = {
    browse: vi.fn().mockResolvedValue({ files: [] })
  };
}
```

### Anti-Patterns to Avoid
- **Using Vitest 4.x:** Breaks peer dependency with @rayners/foundry-test-utils. The package specifies `vitest: "^3.1.0"` -- semver caret does not include 4.x.
- **Importing from `@rayners/foundry-test-utils/helpers/setup.js`:** README suggests this path but the actual file is at `dist/helpers/setup.js`. Use `@rayners/foundry-test-utils/dist/helpers/setup.js`.
- **Setting `globals: false` with foundry-test-utils:** The setup file uses `vi` from vitest and expects globals mode. Setting `globals: false` means describe/it/expect must be explicitly imported but the setup still works -- just ensure consistency.
- **Forgetting `passWithNoTests: true`:** Without it, `npm test` exits 1 when no test files exist, failing the Phase 1 success criteria.
- **Running `vitest` (watch mode) instead of `vitest run`:** The npm test script must use `vitest run` for CI compatibility (exits after run, no watch).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Foundry VTT global mocks | Custom 600-line mock file | @rayners/foundry-test-utils | Maintained by community, covers game/ui/canvas/Hooks/Dialog/FormApplication/foundry.utils |
| DOM environment for tests | Custom DOM setup | jsdom (via Vitest environment) | Vitest manages lifecycle, `unstubGlobals` handles cleanup |
| Coverage instrumentation | Custom coverage collection | @vitest/coverage-v8 | V8 native coverage, no transpilation needed for ESM + private fields |
| Test file discovery | Custom glob patterns | Vitest `include` option | Vitest handles file discovery, filtering, and parallel execution |

**Key insight:** The only hand-rolling needed is the mock extension file for project-specific Foundry globals not covered by foundry-test-utils (game.packs, CompendiumCollection, TokenDocument, FilePicker). This is expected and minimal.

## Common Pitfalls

### Pitfall 1: Vitest 4.x Peer Dependency Conflict
**What goes wrong:** Installing Vitest 4.x alongside @rayners/foundry-test-utils causes npm peer dependency warnings and potentially broken imports
**Why it happens:** foundry-test-utils@1.2.2 specifies `"vitest": "^3.1.0"` which caps at 3.x
**How to avoid:** Pin to `vitest@^3.1.0` in devDependencies
**Warning signs:** npm WARN messages about unmet peer dependencies during install

### Pitfall 2: Wrong setupFiles Path for foundry-test-utils
**What goes wrong:** `Error: Cannot find module '@rayners/foundry-test-utils/helpers/setup.js'`
**Why it happens:** README says `helpers/setup.js` but package has no `exports` field and the file is at `dist/helpers/setup.js`
**How to avoid:** Use `@rayners/foundry-test-utils/dist/helpers/setup.js` as the setupFiles entry
**Warning signs:** Module not found error on first `npm test` run

### Pitfall 3: Missing `passWithNoTests` Causes Exit Code 1
**What goes wrong:** `npm test` exits 1 even though infrastructure is correct, because there are no test files
**Why it happens:** Vitest defaults to exiting with code 1 when no tests are found
**How to avoid:** Add `passWithNoTests: true` to vitest.config.js test section
**Warning signs:** "No test files found, exiting with code 1" message

### Pitfall 4: Vitest Watch Mode in CI
**What goes wrong:** `npm test` hangs waiting for file changes instead of exiting
**Why it happens:** Default `vitest` command runs in watch mode
**How to avoid:** Use `vitest run` in package.json scripts.test
**Warning signs:** Test command never exits

### Pitfall 5: game.packs Missing Collection Methods
**What goes wrong:** Tests fail because `game.packs.filter is not a function`
**Why it happens:** foundry-test-utils does not mock `game.packs`; the project code calls `game.packs.filter()` which is a Foundry Collection method (not Array.filter)
**How to avoid:** Add `game.packs` mock with `filter()` and `get()` methods in project setup file
**Warning signs:** TypeError at any code that touches `game.packs`

### Pitfall 6: coverage/ Directory Not in .gitignore
**What goes wrong:** Coverage report HTML files get committed to git
**Why it happens:** `.gitignore` currently does not list `coverage/`
**How to avoid:** Add `coverage/` to `.gitignore` in this phase
**Warning signs:** `git status` shows hundreds of untracked files after running coverage

### Pitfall 7: package.json Name Contains Invalid Characters
**What goes wrong:** npm warnings about invalid package name
**Why it happens:** Current name is `001-ricontrolla-il-progetto-correggi-gli-errori-rendil` -- while npm allows this, it should be updated to something meaningful like `npc-token-replacer`
**How to avoid:** Update the name field when modifying package.json for test scripts
**Warning signs:** npm install warnings

## Code Examples

Verified patterns from test installation (2026-03-01):

### Complete vitest.config.js
```javascript
// Source: verified via test install + smoke test 2026-03-01
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    unstubGlobals: true,
    passWithNoTests: true,
    setupFiles: [
      "@rayners/foundry-test-utils/dist/helpers/setup.js",
      "./tests/setup/foundry-mocks.js"
    ],
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["scripts/**/*.js"]
    }
  }
});
```

### package.json Changes
```json
{
  "name": "npc-token-replacer",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^3.1.0",
    "@rayners/foundry-test-utils": "^1.2.2",
    "@vitest/coverage-v8": "^3.1.0",
    "jsdom": "^27.0.0",
    "eslint": "^9.39.2"
  }
}
```

### .gitignore Addition
```
# Test coverage output
coverage/
```

### Foundry Mock Gaps (tests/setup/foundry-mocks.js)
```javascript
// Source: verified via mock-gaps test 2026-03-01
// These globals are used in scripts/main.js but NOT provided by @rayners/foundry-test-utils:
//
// Missing from foundry-test-utils  | Used by           | Phase needed
// -------------------------------- | ----------------- | -----------
// game.packs (.filter, .get)       | CompendiumManager | Phase 3
// CompendiumCollection             | Type annotations  | Phase 3
// TokenDocument                    | TokenReplacer     | Phase 3
// FilePicker                       | WildcardResolver  | Phase 3
// canvas.tokens (.controlled)      | TokenReplacer     | Phase 3
// SceneNavigation                  | Phase 5 (progress)| Phase 5
//
// Provided by foundry-test-utils (verified working):
// game (settings, i18n, user, actors, modules, system, version)
// ui (notifications.info, .warn, .error)
// canvas (scene with createEmbeddedDocuments, deleteEmbeddedDocuments)
// Hooks (on, once, off, call, callAll)
// Dialog (confirm, prompt, render, close)
// FormApplication (base class)
// Folder (create, createDocuments)
// Actor (create, createDocuments)
// foundry.utils (mergeObject, duplicate, randomID)
// CONFIG, CONST
// jQuery ($)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for JS testing | Vitest | 2022-2023 | Native ESM, faster, Vite-powered transforms |
| Istanbul coverage | V8 coverage (via @vitest/coverage-v8) | Vitest 3.2.0+ | AST-based remapping gives Istanbul accuracy with V8 speed |
| Custom Foundry mocks per project | @rayners/foundry-test-utils | June 2025 | Shared ~600 lines of mock code across projects |
| CommonJS test files | ESM test files | Node 18+ | Native import/export in tests, no require() |

**Deprecated/outdated:**
- `globals: true` in Vitest: Still supported but Vitest recommends explicit imports. Since foundry-test-utils uses globals and the project convention is plain JS (not TS), `globals: true` is the pragmatic choice.
- foundry-test-utils README path `helpers/setup.js`: Does not resolve correctly; use `dist/helpers/setup.js`.

## Discretion Decisions (Researcher Recommendations)

### ESM Handling: Use Native ESM
**Recommendation:** Native ESM (no transforms needed)
**Rationale:** Vitest 3.2.4 supports ESM natively. ES2020 private static fields (`#field`) work without any transpilation -- verified in test installation. The project uses `"type": "module"` in foundry-test-utils and Vitest is ESM-first. Add `"type": "module"` to the project's package.json.

### Mock Depth: Minimal for Phase 1
**Recommendation:** Phase 1 creates the setup file with placeholder stubs for missing globals. Phase 2/3 fills in real mock behavior as tests need them.
**Rationale:** Writing detailed mocks now is premature -- we don't know exact mock shapes until tests exercise the code. The setup file should document the gaps and provide minimal stubs that prevent import-time crashes.

### Mock Style: Factory Functions
**Recommendation:** Use factory functions (like foundry-test-utils' `createMockScene`, `createMockActor`) for test-specific mock data. Use shared global stubs in setup files for always-present globals.
**Rationale:** Factory functions allow per-test customization without cross-test pollution. foundry-test-utils already uses this pattern -- follow it for consistency.

### Coverage Provider: v8
**Recommendation:** Use @vitest/coverage-v8
**Rationale:** V8 coverage works with native ESM without instrumentation transforms. Since Vitest 3.2.0, V8 coverage uses AST-based remapping for Istanbul-equivalent accuracy. Faster execution and lower memory than Istanbul.

### Coverage Report Formats: text + html
**Recommendation:** `reporter: ["text", "html"]`
**Rationale:** `text` provides console output for quick feedback during development and CI. `html` provides detailed drill-down for Phase 3 baseline analysis. No need for lcov/json until CI integration (v2 requirement ITEST-02).

### Smoke Test: Yes, Add One
**Recommendation:** Add a minimal smoke test (`tests/smoke.test.js`) that validates foundry-test-utils stubs are functional
**Rationale:** Proves the infrastructure actually works (not just "zero tests, zero errors"). The roadmap success criteria says "a clean slate that proves infrastructure works" -- a smoke test validating globals exist is the most concrete proof. This test can be removed or moved in Phase 3.

## Open Questions

1. **foundry-test-utils future compatibility with Vitest 4.x**
   - What we know: Current peer dep is `^3.1.0`. Vitest 4.0.18 is latest.
   - What's unclear: When/if foundry-test-utils will update to support Vitest 4.x
   - Recommendation: Use Vitest 3.2.4 now. The API surface is nearly identical between 3.x and 4.x. Upgrading later should be a minor version bump in vitest.config.js.

2. **game.packs mock shape for Phase 3**
   - What we know: `game.packs` needs `.filter()` and `.get()` like a Foundry Collection
   - What's unclear: Exact mock data shapes needed for CompendiumManager tests
   - Recommendation: Phase 1 stubs with empty implementations. Phase 3 research will define exact mock shapes when writing CompendiumManager tests.

## Sources

### Primary (HIGH confidence)
- npm registry: `@rayners/foundry-test-utils@1.2.2` -- package.json peer dependencies, file structure, source code inspected via `npm pack`
- npm registry: `vitest@3.2.4` -- version and peer dependencies verified via `npm view`
- Test installation: Full stack installed and smoke-tested in `/tmp/test-install` on 2026-03-01
- Package source: `dist/helpers/setup.js` and `dist/mocks/foundry-mocks.js` read directly from tarball
- [Vitest coverage guide](https://vitest.dev/guide/coverage) -- v8 provider configuration
- [Vitest mocking globals](https://vitest.dev/guide/mocking/globals) -- unstubGlobals documentation

### Secondary (MEDIUM confidence)
- [GitHub: rayners/foundry-test-utils](https://github.com/rayners/foundry-test-utils) -- README and setup instructions
- [Vitest config reference](https://vitest.dev/config/) -- passWithNoTests, include, setupFiles options

### Tertiary (LOW confidence)
- None -- all findings verified via installation and test execution

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified via actual test installation with zero dependency conflicts
- Architecture: HIGH - Config patterns verified via working smoke test
- Pitfalls: HIGH - Each pitfall discovered through actual testing or source code inspection

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days -- stack is stable; watch for foundry-test-utils updates adding Vitest 4.x support)

# Stack Research

**Domain:** Foundry VTT module testing and quality infrastructure
**Researched:** 2026-02-28
**Confidence:** MEDIUM (Vitest + foundry-test-utils approach verified; Foundry notification API verified via official docs; Quench v13 support inferred from 2025 release, not directly confirmed)

---

## Recommended Stack

### Core Testing Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vitest | 4.0.18 (latest) | Unit test runner | Native ES module support without transpilation; Vite-powered so no separate bundler config; jsdom environment for browser globals; `vi.stubGlobal` for Foundry globals; fastest iteration loop for no-build-step projects. Verified current as of 2026-02-28. |
| jsdom | 28.1.0 (peer dep) | Browser environment simulation | Provides `window`, `document`, `fetch` and browser APIs in Node.js; required by Vitest `environment: 'jsdom'` for testing Foundry's DOM-dependent code |
| @vitest/coverage-v8 | 4.0.18 | Code coverage | V8 native coverage — zero performance overhead vs Istanbul; AST-based in v4 so accurate line/branch coverage without instrumentation |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @rayners/foundry-test-utils | 1.2.2 (latest) | Pre-built Foundry VTT global mocks | Use this instead of writing your own `game`, `ui`, `canvas`, `Hooks` mocks. Provides `game.settings`, `ui.notifications`, `canvas`, `Hooks.on/emit`, document classes, `duplicate()`, `mergeObject()`. Saves ~300-600 lines of mock boilerplate. Published to npm registry as of 2025-06-05 creation date. |

### Development Tools (Existing — Keep)

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint v9.39.2 | Linting | Already configured with Foundry globals; no changes needed |
| build.sh / build.bat | Packaging | Unaffected by test infrastructure addition |

---

## Installation

```bash
# Test runner + coverage (dev dependencies only — zero runtime impact)
npm install -D vitest@4.0.18 jsdom@28.1.0 @vitest/coverage-v8@4.0.18

# Foundry VTT mock utilities
npm install -D @rayners/foundry-test-utils@1.2.2
```

**Node.js requirement:** Vitest 4.x requires Node `^20.0.0 || ^22.0.0 || >=24.0.0`. The current environment has Node 25.6.1 which satisfies `>=24.0.0`. This is important — Vitest 4 dropped Node 18 support.

**`package.json` changes needed:**
```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

Adding `"type": "module"` tells Node.js to treat `.js` files as ES modules, which is required for Vitest to import the single-file module under test (`scripts/main.js`) without transpilation.

---

## Configuration

**`vitest.config.js`** (at project root):
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['@rayners/foundry-test-utils/helpers/setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['scripts/**'],
      reporter: ['text', 'html']
    }
  }
});
```

**Why `globals: true`:** Exposes `describe`, `it`, `expect`, `beforeEach`, `vi` globally so test files don't need explicit imports — matching the style used in Foundry module development where globals are the norm.

**Why `setupFiles` with foundry-test-utils:** This runs before every test file and populates the global scope with mocked `game`, `ui`, `canvas`, `Hooks`, `CONFIG`, and document classes. Without this, every test file would need to declare its own stubs for 15+ Foundry globals.

---

## Mocking Strategy for Foundry Globals

### What foundry-test-utils provides automatically

The setup file from `@rayners/foundry-test-utils` stubs these globals before each test suite:

| Global | What's mocked |
|--------|--------------|
| `game` | `game.settings.get/set/register`, `game.i18n.localize/format`, `game.actors`, `game.packs`, `game.user`, `game.time` |
| `ui` | `ui.notifications.info/warn/error/update`, `ui.sidebar` |
| `canvas` | `canvas.scene`, `canvas.grid`, `canvas.tokens` |
| `Hooks` | `Hooks.on`, `Hooks.once`, `Hooks.call`, `Hooks.callAll` |
| `CONFIG` | Basic CONFIG object |
| Document classes | `JournalEntry`, `User`, `Folder`, `Actor` (partial) |
| Utilities | `duplicate()`, `mergeObject()` |

### What you must stub manually

These are NOT in foundry-test-utils and must be added to your test setup file or per-test `vi.stubGlobal` calls:

| Global | Stub approach |
|--------|--------------|
| `Dialog` | `vi.stubGlobal('Dialog', { confirm: vi.fn(), prompt: vi.fn() })` |
| `FormApplication` | `vi.stubGlobal('FormApplication', class {})` |
| `FilePicker` | `vi.stubGlobal('FilePicker', { browse: vi.fn() })` |
| `CompendiumCollection` | `vi.stubGlobal('CompendiumCollection', class {})` |
| `TokenDocument` | `vi.stubGlobal('TokenDocument', class {})` |
| `fetch` | jsdom provides this, but override for HEAD request testing: `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))` |

### Per-test customization pattern

```javascript
// In a test file
beforeEach(() => {
  // Override game.settings.get for this specific test
  game.settings.get.mockImplementation((moduleId, key) => {
    if (key === 'tokenVariationMode') return 'sequential';
    if (key === 'enabledCompendiums') return JSON.stringify(['default']);
    return null;
  });
});
```

### Module under test — import strategy

Because `scripts/main.js` uses `export` and accesses Foundry globals at module load time (via `Hooks.once("init")`), the import must happen AFTER stubs are set up:

```javascript
// Import happens after setup file runs — globals already exist
import '../scripts/main.js';
```

If classes are not exported from `main.js`, you test indirectly through the `window.NPCTokenReplacer` debug API that's already exposed:

```javascript
await window.NPCTokenReplacer.replaceNPCTokens();
expect(ui.notifications.error).not.toHaveBeenCalled();
```

**Recommendation:** Export the classes from `main.js` during the testing milestone to enable direct unit testing of `NameMatcher`, `CompendiumManager`, `WildcardResolver` etc. without needing to trigger the full workflow. This is a one-line-per-class change and does not affect runtime behavior.

---

## Foundry Progress & Notification APIs

### v13 Progress Notification (HIGH confidence — verified via official API docs)

```javascript
// Create a progress notification
const progress = ui.notifications.info("Replacing tokens...", {
  progress: true,
  permanent: true
});

// Update during operation (pct: 0.0 to 1.0)
progress.update({ pct: 0.5, message: "Processed 5 of 10 tokens" });

// Complete
progress.update({ pct: 1.0, message: "Replacement complete" });
```

**Key facts:**
- `ui.notifications.info(message, { progress: true })` returns a `Readonly<Notification>` object
- `.update({ pct, message })` updates the bar and message in-place
- `permanent: true` prevents auto-dismiss; omit it if you want auto-dismiss on complete
- `progress` notifications do NOT count toward the max on-screen notification limit
- They cannot be dismissed by the user while active
- `SceneNavigation.displayProgressBar()` is deprecated in v13; use the notifications API instead

### v12 Compatibility (MEDIUM confidence — inferred from API docs, not tested)

In v12, `ui.notifications.info()` does not accept `{ progress: true }`. For v12/v13 dual support:

```javascript
function showProgress(message, pct) {
  if (game.release?.generation >= 13) {
    // v13 progress API
    return ui.notifications.info(message, { progress: true, permanent: true });
  } else {
    // v12 fallback: use SceneNavigation or simple notification refresh
    SceneNavigation.displayProgressBar({ label: message, pct: pct * 100 });
    return null;
  }
}
```

### Error Notification Pattern (HIGH confidence — verified via official API docs)

```javascript
// Standard error with localization
ui.notifications.error(
  game.i18n.localize("NPC_REPLACER.Error.NoCompendiums"),
  { permanent: true }   // permanent=true for errors users need to read
);

// For transient warnings (auto-dismiss)
ui.notifications.warn("NPC_REPLACER.Warning.PartialMatch", { localize: true });

// Remove a notification programmatically
const notification = ui.notifications.info("Processing...");
// ... later ...
ui.notifications.remove(notification);
```

**Pattern recommendation for this module:** All errors that require user action should use `{ permanent: true }`. Progress messages should use `{ progress: true }`. Informational completions should use no options (auto-dismiss).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vitest 4 | Jest | If project already has Jest config and can't migrate. Jest has more fragile ES module support requiring `--experimental-vm-modules` flag. For greenfield testing setup, Vitest is strictly better. |
| Vitest 4 | Quench (Mocha/Chai in-engine) | If you need integration tests running against real Foundry behavior — Quench tests real compendium data, real token operations. Complement Vitest (unit tests) with Quench (integration tests) if budget allows. Quench v0.10.0 released April 2025. |
| jsdom | happy-dom | happy-dom is faster but lacks some APIs. jsdom is safer for testing code that uses DOM APIs Foundry depends on. |
| @rayners/foundry-test-utils | Hand-rolled mocks | If foundry-test-utils mock coverage is insufficient for specific classes needed. Write supplemental stubs in `tests/setup/foundry-mocks.js` to extend the base setup. |
| @vitest/coverage-v8 | @vitest/coverage-istanbul | V8 is native (no instrumentation overhead). Istanbul produces more stable branch coverage numbers but is slower. Use V8 for this project. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Jest (with CJS transforms) | Requires Babel or `@babel/preset-env` to handle ES modules, adding a build step that violates the project constraint. `--experimental-vm-modules` workaround is fragile across Node versions. | Vitest — ES module native, no transpilation needed |
| Cypress/Playwright E2E tests | Requires running Foundry VTT instance, Docker setup, and CI infrastructure far exceeding the scope of a stability milestone. High setup cost for a single-module project. | Vitest unit tests cover the logic layer; manual QA covers the UI layer |
| Karma + Jasmine | Deprecated browser-based test runner approach. Requires complex webpack/rollup config. No longer maintained actively. | Vitest |
| Quench alone (without Vitest) | Quench only runs inside a live Foundry session. No CI without Cypress. Can't run in GitHub Actions without Docker and a licensed Foundry install. Good complement but not a standalone CI solution. | Vitest for unit tests; add Quench later if desired |
| `SceneNavigation.displayProgressBar()` | Deprecated in Foundry v13. Will be removed in a future version. | `ui.notifications.info(msg, { progress: true })` |

---

## Stack Patterns by Variant

**For testing pure logic (NameMatcher, WildcardResolver, CompendiumManager):**
- Export classes from `scripts/main.js` using named exports
- Import in test files and test methods directly
- Mock only what the specific class touches (e.g., `fetch` for WildcardResolver, `game.settings.get` for CompendiumManager)
- No need for `setupFiles` Foundry mocks for pure functions

**For testing Foundry integration (replaceToken, initialization hooks):**
- Use the full foundry-test-utils setup
- Stub specific mock behaviors in `beforeEach`
- Test via the `window.NPCTokenReplacer` debug API or direct class import
- Use `vi.spyOn` on `ui.notifications.error` to assert error paths

**For testing error recovery (null pointer bugs, race conditions):**
- Use `vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))` to simulate failures
- Verify fallback behavior via `expect(ui.notifications.warn).toHaveBeenCalledWith(...)` assertions

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| vitest@4.0.18 | Node `^20 || ^22 || >=24` | Node 25.6.1 in this environment satisfies >=24. Breaking from v3: pool options renamed, coverage.all removed |
| jsdom@28.1.0 | vitest@4.x (peer dep) | Listed as peer dependency in vitest@4 |
| @rayners/foundry-test-utils@1.2.2 | vitest (any recent version) | Only 3 versions published; latest is 1.2.2. Created June 2025. MIT license. Published to npm. |
| @vitest/coverage-v8@4.0.18 | vitest@4.0.18 | Must match vitest exact version |
| ESLint@9.39.2 | Existing | No conflict with vitest |

---

## Sources

- [Vitest 4.0 blog post](https://vitest.dev/blog/vitest-4) — Vitest 4 release features, stable browser mode, breaking changes (HIGH confidence)
- [Vitest migration guide](https://vitest.dev/guide/migration.html) — v3→v4 breaking changes: pool rewrite, coverage.all removed, mock spy naming (HIGH confidence)
- [Vitest environment docs](https://vitest.dev/guide/environment) — jsdom, happy-dom, custom environments, `populateGlobal` utility (HIGH confidence)
- [Vitest vi API](https://vitest.dev/api/vi.html) — `vi.stubGlobal`, `vi.mock`, `vi.spyOn` signatures (HIGH confidence)
- [npm: vitest@4.0.18](https://www.npmjs.com/package/vitest) — Confirmed version 4.0.18, Node engines `^20.0.0 || ^22.0.0 || >=24.0.0` (HIGH confidence, verified via `npm info`)
- [npm: @rayners/foundry-test-utils@1.2.2](https://www.npmjs.com/package/@rayners/foundry-test-utils) — Confirmed on npm, MIT, version 1.2.2, mocks game/ui/canvas/Hooks (MEDIUM confidence — library is small/young)
- [GitHub: Ethaks/FVTT-Quench v0.10.0](https://github.com/Ethaks/FVTT-Quench) — Active as of April 2025, 649 commits, GPLv3, Mocha+Chai (MEDIUM confidence)
- [Foundry VTT v13 Notifications API](https://foundryvtt.com/api/classes/foundry.applications.ui.Notifications.html) — Official API: `info()`, `error()`, `warn()`, `update()`, `remove()` signatures (HIGH confidence)
- [Foundry VTT NotificationOptions](https://foundryvtt.com/api/interfaces/foundry.NotificationOptions.html) — `progress: boolean`, `permanent: boolean`, `localize: boolean` options confirmed (HIGH confidence)
- [GitHub: foundryvtt/foundryvtt issue #9637](https://github.com/foundryvtt/foundryvtt/issues/9637) — Progress notification design, merged into V13 Prototype 1 (MEDIUM confidence — issue resolved Sept 2024)
- [XDXA: FoundryVTT Module Test Automation](https://xdxa.org/2023/foundryvtt-module-test-automation/) — Integration vs unit testing tradeoffs for Foundry modules; Quench+Cypress approach (MEDIUM confidence — 2023 article, patterns still valid)
- `npm info vitest version` and `npm info jsdom version` — Direct version verification from npm CLI (HIGH confidence)

---

*Stack research for: NPC Token Replacer — Testing & Quality Infrastructure*
*Researched: 2026-02-28*

# Phase 4: Error Handling Hardening - Research

**Researched:** 2026-03-01
**Domain:** JavaScript error handling patterns, Foundry VTT notification API, defensive programming for race conditions
**Confidence:** HIGH

## Summary

Phase 4 addresses three bug fixes (BUG-01, BUG-02, BUG-03) and three error handling improvements (ERR-01, ERR-02, ERR-03) in the existing codebase. This is a code-modification phase with no new dependencies -- all work uses the existing Vitest test infrastructure from Phases 1-3 and the existing Foundry VTT APIs (`ui.notifications`, `game.i18n`, `game.actors`).

The codebase analysis reveals six specific locations where errors are silently logged via `Logger.error()` without calling `ui.notifications.error()`, three bug fixes involving race conditions and cache coherency, and a need for structured failure classification during token replacement runs. All changes are localized to `scripts/main.js` and `lang/en.json` -- no architectural changes are needed. The existing 81 tests provide a safety net and each fix should be accompanied by targeted tests.

The key technical challenge is BUG-01 (actor lookup race condition): the `#actorLookup` map is built at session start, but actors can be deleted between map construction and token processing. The fix requires a `game.actors.has()` guard before using cached actor references. BUG-02 (split try/catch in `getEnabledCompendiums`) and BUG-03 (WildcardResolver cache clearing) are straightforward refactors. The ERR-* requirements add user-visible notifications for every Logger.error call in user-triggered flows, structured failure classification with summary notifications, and a `getLastLoadErrors()` debug API method.

**Primary recommendation:** Fix all three bugs first (they affect correctness), then layer error handling improvements on top. Each fix should be paired with its test to maintain the test-first discipline established in Phases 1-3.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUG-01 | Actor lookup map checks actor existence via `game.actors.has()` before use, preventing race condition when actors are deleted between lookup build and token processing | Direct code analysis: `#getOrImportWorldActor` (line 745) uses `TokenReplacer.#actorLookup?.get(compendiumActor.uuid)` without verifying the returned actor still exists in `game.actors`. Fix: add `game.actors.has(worldActor.id)` check after Map lookup, evict stale entries. |
| BUG-02 | `getEnabledCompendiums()` uses separate try/catch blocks for settings retrieval vs JSON.parse, providing distinct error messages for each failure mode | Direct code analysis: lines 384-391 have a single try/catch wrapping both `game.settings.get()` and `JSON.parse()`. Fix: split into two try/catch blocks with distinct localized error messages. |
| BUG-03 | `WildcardResolver.clearCache()` called in `NPCTokenReplacerController.clearCache()` so variant cache clears when settings change | Direct code analysis: `NPCTokenReplacerController.clearCache()` (lines 1190-1197) already calls `WildcardResolver.clearCache()` on line 1194. This bug appears to be already fixed. Verify with a test that `NPCTokenReplacerController.clearCache()` propagates to WildcardResolver. |
| ERR-01 | All caught exceptions in user-triggered flows call `ui.notifications.error()` with a localized message, not just `Logger.error()` | Code audit identified 5 `Logger.error()` calls in user-triggered flows without corresponding `ui.notifications.error()`: (1) `FolderManager.getOrCreateImportFolder` line 178, (2) `CompendiumManager.loadMonsterIndex` line 474, (3) `#processToken` line 1036, (4) `NPCTokenReplacerController.initialize` line 1225 (borderline -- runs at startup, not user-triggered), (5) `registerControlButton` lines 1484/1487 (not user-triggered -- init hook). Focus on items 1-3. |
| ERR-02 | Per-token failure types classified (no_match, import_failed, creation_failed) and collected into a post-run summary notification | Direct code analysis: `#processToken` (lines 1008-1039) already returns `{status, name}` with statuses "replaced", "not_found", "error", "skipped". Fix: split "error" into "import_failed" and "creation_failed" by catching at different points in `replaceToken()`. The `#reportResults` method (lines 1051-1068) needs to produce a classified summary notification. |
| ERR-03 | Per-compendium load success/failure tracked during `loadMonsterIndex()` with `getLastLoadErrors()` exposed via debug API | Direct code analysis: `loadMonsterIndex()` (lines 456-476) catches per-pack errors but only logs them. Fix: add a `#lastLoadErrors` static field that records `{packId, error}` entries per load, and expose via `getLastLoadErrors()` in the debug API. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.2.4 | Test runner | Already installed, all 81 existing tests pass |
| @rayners/foundry-test-utils | 1.2.2 | Foundry global mocks | Already installed, provides game, ui, canvas, Hooks mocks |

### Supporting
No new libraries needed. All changes use existing Foundry VTT APIs:
- `ui.notifications.error()` / `.warn()` / `.info()` -- already mocked by foundry-test-utils
- `game.i18n.localize()` / `.format()` -- already mocked
- `game.actors.has()` -- already available via foundry-test-utils game.actors mock
- `game.settings.get()` -- already mocked

### Alternatives Considered
None -- this phase modifies existing code with existing tools. No new dependencies.

**Installation:**
No installation needed.

## Architecture Patterns

### Pattern 1: Split Try/Catch for Distinct Error Messages (BUG-02)
**What:** Separate settings retrieval from JSON parsing into distinct try/catch blocks so each failure mode produces a unique, localized error message.
**When to use:** When a single try/catch wraps multiple operations that can fail independently and the user needs to know which operation failed.
**Example:**
```javascript
// BEFORE (current code, lines 383-391):
let enabledPackIds;
try {
  const settingValue = game.settings.get(MODULE_ID, "enabledCompendiums");
  enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
} catch (e) {
  Logger.warn(`Error parsing enabledCompendiums setting...`);
  enabledPackIds = ["default"];
}

// AFTER:
let settingValue;
try {
  settingValue = game.settings.get(MODULE_ID, "enabledCompendiums");
} catch (e) {
  Logger.warn(`Failed to retrieve enabledCompendiums setting (${e.name}: ${e.message})`);
  ui.notifications.error(game.i18n.localize("NPC_REPLACER.Error.SettingsRetrieve"));
  return allPacks.filter(pack => CompendiumManager.getCompendiumPriority(pack) <= 2);
}

let enabledPackIds;
try {
  enabledPackIds = typeof settingValue === "string" ? JSON.parse(settingValue) : settingValue;
} catch (e) {
  Logger.warn(`Failed to parse enabledCompendiums JSON (${e.name}: ${e.message})`);
  ui.notifications.error(game.i18n.localize("NPC_REPLACER.Error.SettingsParse"));
  enabledPackIds = ["default"];
}
```

### Pattern 2: Guard Cached References with Existence Check (BUG-01)
**What:** After retrieving an actor from the lookup map, verify it still exists in the world before using it.
**When to use:** Any time a cached reference might become stale due to external deletion.
**Example:**
```javascript
// BEFORE (current code, line 745):
let worldActor = TokenReplacer.#actorLookup?.get(compendiumActor.uuid) || null;

// AFTER:
let worldActor = TokenReplacer.#actorLookup?.get(compendiumActor.uuid) || null;
if (worldActor && !game.actors.has(worldActor.id)) {
  Logger.warn(`Cached actor "${worldActor.name}" no longer exists, will re-import`);
  TokenReplacer.#actorLookup.delete(compendiumActor.uuid);
  worldActor = null;
}
```

### Pattern 3: Structured Failure Classification (ERR-02)
**What:** Replace generic "error" status with specific failure types that map to distinct causes.
**When to use:** When a user-facing summary needs to explain what went wrong, not just that something failed.
**Example:**
```javascript
// In replaceToken or #processToken, distinguish failure types:
try {
  const compendiumActor = await pack.getDocument(compendiumEntry._id);
  const worldActor = await TokenReplacer.#getOrImportWorldActor(compendiumActor, compendiumEntry, pack);
  // ...
  const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [newTokenData]);
  // ...
} catch (error) {
  // Classify by which stage failed:
  if (error.message.includes("import")) {
    return { status: "import_failed", name: creatureName };
  }
  return { status: "creation_failed", name: creatureName };
}
```

### Pattern 4: Per-Compendium Load Error Tracking (ERR-03)
**What:** Record which compendiums failed to load during `loadMonsterIndex()` and expose via debug API.
**When to use:** When the module loads multiple data sources and the user/developer needs to know which ones failed.
**Example:**
```javascript
class CompendiumManager {
  static #lastLoadErrors = [];

  static async loadMonsterIndex(forceReload = false) {
    CompendiumManager.#lastLoadErrors = [];
    // ...
    for (const pack of sortedPacks) {
      try {
        await pack.getIndex({ fields: ["name", "type"] });
        // success...
      } catch (error) {
        CompendiumManager.#lastLoadErrors.push({
          packId: pack.collection,
          packLabel: pack.metadata.label,
          error: error.message
        });
        Logger.error(`Failed to load index from ${pack.collection}`, error);
        ui.notifications.error(game.i18n.format("NPC_REPLACER.Error.CompendiumLoad", { name: pack.metadata.label }));
      }
    }
  }

  static getLastLoadErrors() {
    return [...CompendiumManager.#lastLoadErrors];
  }
}
```

### Anti-Patterns to Avoid
- **Catching and silently continuing:** Every caught exception in a user-triggered flow must produce a `ui.notifications` call, not just a `Logger.error()`. Users cannot see console logs.
- **Single generic "error" status:** Lumping all failures into one category makes debugging impossible for users. Always classify.
- **Trusting cached references without existence checks:** External systems (other modules, GM actions) can delete actors or documents between cache population and usage.
- **Modifying `replaceToken()` signature:** The `replaceToken()` method should continue to throw on failure -- the caller (`#processToken`) should catch and classify. This preserves the single-responsibility principle.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User notifications | Custom UI popups | `ui.notifications.error/warn/info()` | Foundry's built-in notification system; consistent UX across modules |
| Localized error messages | Hardcoded English strings | `game.i18n.localize()` / `game.i18n.format()` + `lang/en.json` | Existing localization infrastructure; supports future translations |
| Actor existence checking | Custom "is actor alive" utility | `game.actors.has(actorId)` | Foundry's Collection.has() is O(1) and authoritative |

**Key insight:** All the tools needed for this phase already exist in Foundry's API. The work is about using them consistently -- adding `ui.notifications` calls alongside existing `Logger.error` calls, and adding `game.actors.has()` guards.

## Common Pitfalls

### Pitfall 1: BUG-03 May Already Be Fixed
**What goes wrong:** Wasting effort fixing a bug that was resolved during Phase 2 refactoring.
**Why it happens:** The success criteria says "calling `NPCTokenReplacerController.clearCache()` also clears the WildcardResolver variant cache." Code inspection shows line 1194 already calls `WildcardResolver.clearCache()`.
**How to avoid:** Write the verification test first. If it passes, BUG-03 is already fixed and only needs the test added.
**Warning signs:** Looking at the code -- `NPCTokenReplacerController.clearCache()` already includes `WildcardResolver.clearCache()` on line 1194.

### Pitfall 2: Over-Notifying the User
**What goes wrong:** Each individual token failure produces a separate `ui.notifications.error()`, flooding the user with popups.
**Why it happens:** Naively adding `ui.notifications.error()` inside the per-token `#processToken` loop.
**How to avoid:** Individual failures are collected silently during the loop. A single summary notification is shown at the end via `#reportResults()`. Only non-repeating errors (e.g., compendium load failure, settings corruption) should notify immediately.
**Warning signs:** Multiple identical notification popups during a replacement run.

### Pitfall 3: Breaking Existing Test Expectations
**What goes wrong:** Changing error handling in `getEnabledCompendiums` or `loadMonsterIndex` breaks existing tests that mock these error paths.
**Why it happens:** The existing test "corrupt JSON falls back to default behavior" (compendium-manager.test.js line 173-179) mocks `game.settings.get` to throw. After BUG-02, this test needs updating because the behavior changes (separate try/catch blocks produce different fallback paths).
**How to avoid:** Update existing tests alongside the code changes. Read existing tests before modifying the code.
**Warning signs:** Existing tests failing after BUG-02 changes.

### Pitfall 4: Failure Classification Coupling
**What goes wrong:** The `#processToken` method tries to classify failures by parsing error messages, which is brittle.
**Why it happens:** Using `error.message.includes("import")` to classify failures based on string content.
**How to avoid:** Use structured error handling: wrap `#getOrImportWorldActor` and token creation in separate try/catch blocks within `#processToken`, or have `replaceToken` throw typed errors (e.g., custom error classes or error objects with a `type` field). The simpler approach is to split the try/catch in `#processToken` around the two failure points.
**Warning signs:** Misclassified failures when error messages change.

### Pitfall 5: Not Testing the Debug API Exposure
**What goes wrong:** `getLastLoadErrors()` works on `CompendiumManager` but is never wired into `getDebugAPI()`, so `NPCTokenReplacer.getLastLoadErrors()` is undefined.
**Why it happens:** Forgetting the second wiring step after implementing the method on the class.
**How to avoid:** Write a test that verifies `getDebugAPI()` includes the `getLastLoadErrors` key.
**Warning signs:** Debug API missing the new method.

### Pitfall 6: Localization Key Naming Inconsistency
**What goes wrong:** New localization keys don't follow the existing `NPC_REPLACER.*` naming convention.
**Why it happens:** Inventing new naming patterns instead of following `lang/en.json` conventions.
**How to avoid:** All new keys must follow the pattern `NPC_REPLACER.Error.<SubCategory>` or `NPC_REPLACER.Summary.<SubCategory>`. Review existing keys in `lang/en.json` before adding new ones.
**Warning signs:** Keys that don't start with `NPC_REPLACER.`.

## Code Examples

Verified patterns from existing codebase analysis:

### Existing Error Notification Pattern (from validatePrerequisites)
```javascript
// Source: scripts/main.js lines 937-956
// This is the CORRECT pattern -- ui.notifications paired with return/abort
if (!game.user.isGM) {
  ui.notifications.warn(game.i18n.localize("NPC_REPLACER.GMOnly"));
  return false;
}
if (!canvas.scene) {
  ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoScene"));
  return false;
}
```

### Existing Result Reporting Pattern (from #reportResults)
```javascript
// Source: scripts/main.js lines 1051-1068
// Current pattern -- extend this with classified failures
if (replaced > 0) {
  ui.notifications.info(game.i18n.format("NPC_REPLACER.Complete", { count: replaced }));
}
if (notFound.length > 0) {
  ui.notifications.warn(game.i18n.format("NPC_REPLACER.NotFoundCount", { count: notFound.length }));
}
if (errors.length > 0) {
  ui.notifications.error(game.i18n.format("NPC_REPLACER.ErrorCount", { count: errors.length }));
}
```

### Existing Test Pattern for Error Paths (from compendium-manager.test.js)
```javascript
// Source: tests/compendium-manager.test.js lines 173-179
// Pattern for testing error fallback behavior
it("corrupt JSON falls back to default behavior", () => {
  game.settings.get = vi.fn(() => { throw new Error("Invalid JSON"); });
  const result = CompendiumManager.getEnabledCompendiums();
  expect(result).toContain(corePack);
  expect(result).toContain(srdPack);
  expect(result).not.toContain(adventurePack);
});
```

### New Localization Keys Needed (for lang/en.json)
```json
{
  "NPC_REPLACER": {
    "Error": {
      "SettingsRetrieve": "Failed to read compendium settings. Using default compendiums.",
      "SettingsParse": "Compendium settings are corrupted. Using default compendiums.",
      "CompendiumLoad": "Failed to load compendium: {name}",
      "FolderCreate": "Failed to create import folder. Actors will be imported to root.",
      "TokenReplace": "Error replacing token: {name}",
      "ImportFailed": "Failed to import actor: {name}",
      "CreationFailed": "Failed to create token: {name}"
    },
    "Summary": {
      "PartialFailure": "Replacement completed with issues: {replaced} replaced, {noMatch} not found, {importFailed} import failures, {creationFailed} creation failures"
    }
  }
}
```

### Actor Existence Guard Test Pattern
```javascript
// Pattern for testing BUG-01 fix
it("re-imports actor when cached actor no longer exists in game.actors", async () => {
  // Setup: build lookup with an actor
  const mockActor = { id: "actor1", name: "Goblin", uuid: "Compendium.dnd-mm.monsters.goblin1" };
  game.actors = {
    [Symbol.iterator]: function* () { yield mockActor; },
    has: vi.fn(id => id !== "actor1"), // Actor was deleted
    importFromCompendium: vi.fn().mockResolvedValue(/* new actor */)
  };
  TokenReplacer.buildActorLookup();

  // The lookup should find the cached actor but game.actors.has() returns false
  // So it should re-import
  // ...
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silent `console.error` logging | `ui.notifications.error()` for user-facing errors | Foundry VTT best practices | Users can see and act on errors without opening browser console |
| Single try/catch for multiple operations | Granular try/catch per failure mode | Error handling best practices | Each failure gets specific error message and recovery strategy |
| Trusting cached references | Guard with existence checks | Defensive programming | Prevents null pointer errors from stale references |

**Deprecated/outdated:**
- None -- this phase does not involve library changes, only code patterns.

## Open Questions

1. **BUG-03 Status: Likely Already Fixed**
   - What we know: `NPCTokenReplacerController.clearCache()` already calls `WildcardResolver.clearCache()` on line 1194.
   - What's unclear: Whether this was intentionally fixed during Phase 2 refactoring or was always present.
   - Recommendation: Write the verification test. If it passes, mark BUG-03 as "verified existing behavior" and only add the test. The success criterion (#3) says "calling clearCache() ALSO clears the WildcardResolver variant cache" -- this appears to be true already.

2. **ERR-02 Failure Classification Granularity**
   - What we know: Current `#processToken` returns "error" for all failures. The success criteria wants "no_match", "import_failed", "creation_failed".
   - What's unclear: Whether `replaceToken()` should throw typed errors or whether `#processToken` should use nested try/catch to distinguish stages.
   - Recommendation: Use nested try/catch in `#processToken` around distinct stages (match lookup -> import -> create). This avoids changing `replaceToken()`'s public API and keeps error classification at the orchestration level.

3. **ERR-01 Scope: Which Logger.error Calls Are "User-Triggered"?**
   - What we know: 8 `Logger.error()` calls in main.js. Not all are user-triggered.
   - What's unclear: Whether `initialize()` (line 1225) and `registerControlButton()` (lines 1484/1487) count as "user-triggered."
   - Recommendation: `initialize()` runs at module load (not user-triggered) but failure should still notify since it affects module functionality. `registerControlButton()` is a hook handler, not user-triggered -- skip. Focus on: `getOrCreateImportFolder` (line 178), `loadMonsterIndex` (line 474), and `#processToken` (line 1036). Optionally add notification to `initialize()` line 1225.

4. **Test Approach for #processToken and replaceToken**
   - What we know: `#processToken` is a private static method. `replaceToken` depends on canvas, pack.getDocument, and game.actors.importFromCompendium.
   - What's unclear: How to test these methods with the existing mock infrastructure.
   - Recommendation: Test through the public surface. For `replaceToken`, mock `pack.getDocument`, `game.actors.importFromCompendium`, `canvas.scene.createEmbeddedDocuments`, and `canvas.scene.deleteEmbeddedDocuments`. For `#processToken` behavior, test indirectly through `replaceNPCTokens()` or test the individual methods it calls. The existing foundry-test-utils provides canvas.scene mocks for `createEmbeddedDocuments`/`deleteEmbeddedDocuments`.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `scripts/main.js` (1548 lines) -- all line references verified against current develop branch
- Direct codebase analysis: `lang/en.json` -- existing localization key structure inspected
- Direct codebase analysis: `tests/compendium-manager.test.js` -- existing test patterns for error paths
- Foundry VTT API: `ui.notifications.error()`, `game.i18n.localize()`, `game.actors.has()` -- standard Foundry APIs used throughout the existing codebase

### Secondary (MEDIUM confidence)
- @rayners/foundry-test-utils mock coverage: `game.actors`, `ui.notifications`, `canvas.scene` -- verified available in tests/setup/foundry-mocks.js documentation comments

### Tertiary (LOW confidence)
- None -- all findings verified via direct code inspection.

## Metadata

**Confidence breakdown:**
- Bug fixes (BUG-01, BUG-02, BUG-03): HIGH - Direct code analysis with exact line numbers; all bugs have clear, localized fixes
- Error handling (ERR-01, ERR-02, ERR-03): HIGH - Pattern already established in codebase (validatePrerequisites shows correct pattern); extending to remaining error sites
- Testing approach: HIGH - Existing test patterns from Phase 3 provide proven templates

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days -- codebase and tools are stable; no external dependencies to track)

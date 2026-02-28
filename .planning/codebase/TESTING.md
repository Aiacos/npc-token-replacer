# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

**Status:** No automated test framework configured

**Runner:**
- Not applicable — package.json declares `"test": "echo \"Error: no test specified\" && exit 1"`

**Assertion Library:**
- Not applicable — no test runner present

**Run Commands:**
```bash
npm test              # Currently returns error message, no tests available
```

## Test File Organization

**Location:**
- Not applicable — no test files in repository

**Naming:**
- No test file naming convention established (no test files exist)

**Structure:**
- No test directory structure

## Testing Approach

**Current State:**
This is a single-file Foundry VTT module with no automated testing infrastructure. Testing is manual and integration-based.

**Manual Testing Workflow:**
1. Symlink module to Foundry VTT data directory: `Data/modules/npc-token-replacer/`
2. Enable module in a D&D 5e world
3. Open browser console and execute debug API commands
4. Verify behavior in Foundry UI
5. Refresh browser (F5) after code changes

## Debug API (Manual Testing Interface)

**Access Point:**
```javascript
window.NPCTokenReplacer
```

**Available Methods:**
All exposed via `NPCTokenReplacerController.getDebugAPI()` at `scripts/main.js` lines 1844-1861

```javascript
// Main operation
NPCTokenReplacer.replaceNPCTokens()
  // Orchestrates full replacement workflow
  // Returns: Promise<void>

// Compendium inspection
NPCTokenReplacer.detectWOTCCompendiums()
  // Lists all detected WOTC compendiums
  // Returns: CompendiumCollection[]

NPCTokenReplacer.getEnabledCompendiums()
  // Lists compendiums selected in settings
  // Returns: CompendiumCollection[]

// Monster lookup
NPCTokenReplacer.findInMonsterManual(name, index)
  // Find creature by name (requires index from loadMonsterIndex)
  // Parameters: name (string), index (from loadMonsterIndex)
  // Returns: {entry: Object, pack: CompendiumCollection} | null

// Token inspection
NPCTokenReplacer.getNPCTokensFromScene()
  // Lists all NPC tokens in current scene
  // Returns: TokenDocument[]

// Folder operations
NPCTokenReplacer.getOrCreateImportFolder()
  // Get or create the MonsterManual import folder
  // Returns: Promise<Folder | null>

// Cache management
NPCTokenReplacer.clearCache()
  // Clear all internal caches (after settings changes)
  // Returns: void

// Logging control
NPCTokenReplacer.debugEnabled         // Get debug logging status
NPCTokenReplacer.debugEnabled = true  // Set debug logging on
NPCTokenReplacer.debugEnabled = false // Set debug logging off
```

## Testing Patterns

**Logging-Based Verification:**
The module relies on console logging for verification of behavior. Key classes provide logging at decision points:

```javascript
// Logger class (`scripts/main.js` lines 37-132)
Logger.log(message, data = null)     // Info-level logs
Logger.error(message, error = null)  // Error logs with context
Logger.warn(message, data = null)    // Warning logs
Logger.debug(message, data = null)   // Development logs (gated by Logger.debugEnabled)
```

**Testing by Console Inspection:**
```javascript
// Enable debug logging first
NPCTokenReplacer.debugEnabled = true;

// Run operation and check console output
NPCTokenReplacer.replaceNPCTokens();
// Console shows:
// "npc-token-replacer | Detecting official D&D compendiums..."
// "npc-token-replacer | Found X official D&D Actor compendiums:"
// "npc-token-replacer | Loading monster index from X compendium(s)..."
// etc.
```

## Mock Patterns

**Not Applicable:**
- No mocking framework configured
- Foundry VTT globals (`game`, `canvas`, `ui`, `Hooks`) cannot be mocked in browser environment
- Manual testing done in live Foundry VTT instance

**Testing Against Foundry APIs:**
- Module interacts directly with Foundry VTT APIs
- Manual testing requires:
  1. Running Foundry VTT server
  2. Opening browser with module enabled
  3. Creating/manipulating scene tokens
  4. Verifying state changes in UI and console

## Error Testing

**Error Scenarios (Manual Testing):**

1. **No Active Scene:**
   ```javascript
   // Deselect all scenes, then:
   NPCTokenReplacer.replaceNPCTokens();
   // Expected: ui.notifications.error("No active scene found")
   ```

2. **No WOTC Compendiums Installed:**
   ```javascript
   // Without any dnd-* or dnd5e modules:
   NPCTokenReplacer.replaceNPCTokens();
   // Expected: ui.notifications.error("No official D&D compendiums found...")
   ```

3. **No NPC Tokens in Scene:**
   ```javascript
   // Scene with only player characters:
   NPCTokenReplacer.replaceNPCTokens();
   // Expected: ui.notifications.info("No NPC tokens found in the current scene")
   ```

4. **Non-GM User Attempt:**
   ```javascript
   // As non-GM player:
   NPCTokenReplacer.replaceNPCTokens();
   // Expected: ui.notifications.warn("Only the GM can replace tokens")
   ```

5. **Wildcard Resolution Timeout:**
   - Caught by `WildcardResolver.fetchWithTimeout()` with DEFAULT_HTTP_TIMEOUT_MS (5000ms)
   - Network failures logged: `Logger.warn("All X wildcard probe requests failed...")`

6. **Import Folder Creation Failure:**
   - Caught in `FolderManager.getOrCreateImportFolder()` lines 280-293
   - Logged: `Logger.error("Failed to create import folder", error)`
   - Returns null, actor imports to root folder instead

## Coverage Gaps

**Untested Areas:**

1. **Network-dependent operations:**
   - Wildcard token path resolution (`WildcardResolver.resolveWildcardVariants()` lines 412-473)
   - HEAD requests to probe variant files (lines 444-449)
   - No ability to mock fetch in Foundry VTT browser context

2. **Compendium operations:**
   - Actor import from compendium (`game.actors.importFromCompendium()` lines 1367)
   - Compendium index loading (`pack.getIndex()` lines 855)
   - Depends on specific Foundry VTT version and installed modules

3. **Token manipulation:**
   - Token creation (`canvas.scene.createEmbeddedDocuments()` lines 1486)
   - Token deletion (`canvas.scene.deleteEmbeddedDocuments()` lines 1494)
   - Property extraction and merging (lines 1257-1440)

4. **UI interactions:**
   - Confirmation dialog flow (`Dialog.confirm()` lines 1593-1601)
   - Form submission in `CompendiumSelectorForm._updateObject()` (lines 1994+)
   - Notification display (`ui.notifications.*` calls)

5. **Cache invalidation:**
   - Settings change hooks triggering cache clear
   - Session-scoped cache lifecycle (`TokenReplacer.#actorLookup`)

6. **Edge cases:**
   - Duplicate token names with different creatures
   - Circular folder references
   - Corrupted compendium index entries
   - Extremely long creature name lists (scaling limits)

## Test Data Fixtures

**Manual Test Scenarios:**

1. **Basic Setup:**
   ```javascript
   // Required in Foundry VTT:
   - Create world for D&D 5e system
   - Enable module
   - Install Monster Manual 2024 or equivalent WOTC module
   - Create scene with at least one NPC token
   ```

2. **Test Creatures by Name Matching Complexity:**

   **Simple Exact Match:**
   - Token name: "Goblin"
   - Expected: Finds "Goblin" in Monster Manual exactly

   **Variant Transform (Prefix Removal):**
   - Token name: "Young Red Dragon"
   - Expected: Strips "Young" prefix, finds "Red Dragon"

   **Variant Transform (Suffix Removal):**
   - Token name: "Orc Warrior"
   - Expected: Strips "Warrior" suffix, finds "Orc"

   **Partial Word Matching:**
   - Token name: "Fire Elemental Guardian"
   - Expected: Matches "Fire Elemental" (min 4 chars per word)

   **Not Found:**
   - Token name: "Custom Homebrew Monster"
   - Expected: Logs "not found", token remains unchanged

3. **Wildcard Token Variants:**
   ```javascript
   // Creature with variant art:
   - Specter with tokens: specter-1.webp, specter-2.webp, specter-3.webp

   // Test modes:
   // Sequential: first token gets specter-1, second gets specter-2, etc.
   // Random: each token gets random variant
   // None: all tokens get specter-1
   ```

4. **Folder Organization:**
   ```javascript
   // Existing structure:
   Monsters/
     ├── Humanoids/
     ├── Dragons/

   // Module should create:
   Monsters - MonsterManual/
     (or at root if no "Monsters" folder exists)
   ```

## Performance Testing

**No Performance Benchmarks:**
- No automated performance tests
- Manual observation via console timing available:
  ```javascript
  console.time("replacement");
  NPCTokenReplacer.replaceNPCTokens();
  console.timeEnd("replacement");
  ```

**Known Performance Considerations:**
- TODO comment at line 1747: "token processing loop is fully sequential — 2N socket round-trips"
- Suggested optimization: "Split into parallel resolve phase + batched mutation phase"

## Regression Prevention

**Manual Regression Testing Checklist:**

- [ ] Basic replacement works (1-2 tokens)
- [ ] Batch replacement works (5+ tokens)
- [ ] Selected tokens respected (selection mode vs full scene)
- [ ] Wildcard variants resolve correctly
- [ ] Folder creation/organization works
- [ ] Settings persist after world reload
- [ ] Compendium priority honored (Monster Manual > SRD)
- [ ] Error cases show appropriate notifications
- [ ] Debug logging can be toggled
- [ ] Module loads without errors (check console on world load)

## Integration Testing

**Module Loads Successfully:**
```javascript
// Check in browser console on world load:
console.log(window.NPCTokenReplacer);
// Should output: {...replaceNPCTokens, detectWOTCCompendiums, ...}
```

**Module Integrates with Foundry Hooks:**
- Registered during `Hooks.once("init")` → `registerSettings()`
- Initialized during `Hooks.once("ready")` → `NPCTokenReplacerController.initialize()`
- Button added during `Hooks.on("getSceneControlButtons")` → `registerControlButton()`

**Version Compatibility:**
- Code handles both Foundry v12 (array-based controls) and v13 (object-based controls)
- Setting persistence tested across module updates

---

*Testing analysis: 2026-02-28*

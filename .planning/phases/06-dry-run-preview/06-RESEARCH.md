# Phase 6: Dry-Run Preview - Research

**Researched:** 2026-03-06
**Domain:** Foundry VTT Dialog API, module settings, workflow refactoring
**Confidence:** HIGH

## Summary

Phase 6 adds a dry-run preview dialog that replaces the existing confirmation dialog. Instead of showing a simple list of token names, the new dialog shows a three-column table mapping each token to its compendium match (or "No match found") before any scene changes occur. Additionally, the hardcoded `DEFAULT_HTTP_TIMEOUT_MS` constant becomes a configurable module setting.

The implementation requires restructuring `replaceNPCTokens()` to move index loading and match computation before the dialog, then passing pre-computed match results to the replacement loop to avoid double-matching. The existing `Dialog.confirm()` pattern, `escapeHtml()` utility, `ProgressReporter`, and `registerSettings()` function all provide established patterns to follow.

**Primary recommendation:** Split the work into two plans: (1) HTTP timeout setting + match pre-computation extraction, (2) preview dialog replacing confirmation dialog + wiring pre-computed results into replacement loop.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three-column table: Token Name | Will Match As | Source Compendium
- Scrollable with max-height (~300px), consistent with existing confirmation dialog pattern
- Summary count line above the table: "X of Y tokens matched"
- Matched tokens sorted first, unmatched tokens last
- Dialog buttons: "Replace" / "Cancel" (simple, clear)
- Unmatched tokens shown inline in the same table with "No match found" styled in red
- Source column shows em-dash for unmatched tokens
- If ALL tokens are unmatched: still show the preview table but disable the Replace button
- No match-type indicator for variant matches -- just show the matched creature name
- Preview dialog REPLACES the current confirmation dialog (one dialog, not two)
- New flow: get tokens -> load index -> compute matches -> show preview -> replace
- Index loading moves earlier (before preview instead of after confirmation)
- ProgressReporter reused during match computation phase ("Scanning tokens...")
- Pre-computed match results passed directly to replacement loop (no double-matching)
- All token and creature names HTML-escaped via escapeHtml before rendering
- HTTP timeout: Number input with range 1-30 seconds, step 1, default 5
- Display in seconds in UI, convert to milliseconds internally (multiply by 1000)
- WildcardResolver reads from game.settings.get() at call time (no API change)
- Changing timeout does NOT clear wildcard cache
- Registered alongside existing settings in registerSettings()

### Claude's Discretion
- Exact CSS styling of the preview table (colors, borders, fonts)
- Error handling for edge cases during match computation
- Internal refactoring of replaceNPCTokens to accommodate the new preview step

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-02 | Dry-run preview dialog showing token-to-creature match mapping before committing replacements | Preview dialog architecture, Dialog.confirm pattern, match pre-computation extraction, HTML table rendering with escapeHtml |
| UX-03 | Configurable HTTP timeout setting for wildcard HEAD requests (replacing hardcoded DEFAULT_HTTP_TIMEOUT_MS) | game.settings.register pattern for Number type with range, WildcardResolver integration point |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundry VTT API | v12/v13 | Dialog.confirm, game.settings.register, game.i18n | Native platform API -- no alternatives |
| Vitest | 3.x | Test framework | Already configured in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @rayners/foundry-test-utils | 1.2.2 | Foundry global mocks | Test setup |

No new dependencies needed. This phase uses only existing Foundry VTT APIs and project utilities.

## Architecture Patterns

### Current Flow (to be replaced)
```
replaceNPCTokens():
  1. validatePrerequisites()
  2. getEnabledCompendiums()
  3. loadMonsterIndex()          <-- already before dialog
  4. getNPCTokensToProcess()
  5. showConfirmationDialog()    <-- simple token list, no match info
  6. resetCounter/buildActorLookup
  7. for each token:
     a. #processToken()          <-- matches AND replaces together
  8. #reportResults()
```

### New Flow (target)
```
replaceNPCTokens():
  1. validatePrerequisites()
  2. getEnabledCompendiums()
  3. loadMonsterIndex()
  4. getNPCTokensToProcess()
  5. computeMatches(tokens, index) <-- NEW: pre-scan all matches
     - ProgressReporter("Scanning tokens...")
     - NameMatcher.findMatch for each token
     - Returns array of {tokenDoc, creatureName, match|null}
  6. showPreviewDialog(matchResults) <-- REPLACES showConfirmationDialog
     - Renders 3-column table
     - Returns boolean (Replace/Cancel)
  7. resetCounter/buildActorLookup
  8. for each matchResult where match !== null:
     a. TokenReplacer.replaceToken(tokenDoc, match.entry, match.pack)
     - Skip matching (already done)
     - Progress bar for replacement only
  9. #reportResults()
```

### Pattern 1: Dialog.confirm with HTML Content
**What:** The existing pattern wraps Foundry's `Dialog.confirm()` in a Promise for async/await usage.
**When to use:** For the preview dialog -- same pattern, richer HTML content.
**Example (existing at main.js:1033-1042):**
```javascript
return new Promise(resolve => {
  Dialog.confirm({
    title: game.i18n.localize("NPC_REPLACER.ConfirmTitle"),
    content,
    yes: () => resolve(true),
    no: () => resolve(false),
    defaultYes: false,
    close: () => resolve(false)
  });
});
```

**Note from STATE.md:** Dialog.confirm v13 shim will be removed in v14. This is a known future breaking change but does not affect the current implementation.

### Pattern 2: game.settings.register with Number Type and Range
**What:** Register a numeric setting with min/max/step constraints.
**When to use:** For the HTTP timeout setting.
**Example (Foundry VTT standard pattern):**
```javascript
game.settings.register(MODULE_ID, "httpTimeout", {
  name: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Name"),
  hint: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Hint"),
  scope: "world",
  config: true,
  type: Number,
  range: { min: 1, max: 30, step: 1 },
  default: 5
});
```

The `range` property automatically renders a slider/number input with constraints. The value stored is in seconds (1-30), converted to milliseconds at read time.

### Pattern 3: Settings Read at Call Time (No Caching)
**What:** WildcardResolver reads the timeout from `game.settings.get()` each time it makes requests, rather than caching the value.
**When to use:** For the HTTP timeout integration.
**Example:**
```javascript
// In WildcardResolver, replace static DEFAULT_TIMEOUT getter:
static get DEFAULT_TIMEOUT() {
  try {
    return game.settings.get(MODULE_ID, "httpTimeout") * 1000;
  } catch {
    return 5000; // Fallback if settings not yet registered
  }
}
```

This approach requires no API changes -- `WildcardResolver.DEFAULT_TIMEOUT` is already used throughout the class as the default timeout value.

### Pattern 4: Match Result Data Structure
**What:** Pre-computed match results passed between preview and replacement.
**Structure:**
```javascript
// Each entry in the match results array:
{
  tokenDoc: TokenDocument,       // Original token document
  creatureName: string,          // Display name (actor?.name || name)
  match: {                       // null if no match found
    entry: Object,               // Compendium index entry
    pack: CompendiumCollection   // Source compendium pack
  } | null
}
```

### Anti-Patterns to Avoid
- **Double-matching:** Never call `NameMatcher.findMatch()` twice for the same token -- compute once, reuse.
- **Inline HTML without escaping:** Every token name and creature name MUST go through `escapeHtml()` before insertion into dialog HTML.
- **Blocking index load after dialog:** The index must load BEFORE the preview dialog renders, not after user confirms.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dialog rendering | Custom DOM manipulation | `Dialog.confirm()` with HTML content string | Foundry handles focus, close, escaping, theming |
| Settings UI for number | Custom slider component | `game.settings.register` with `range` property | Native settings panel with validation |
| XSS prevention | Manual string replacement | `escapeHtml()` (already exists at main.js:1530) | Handles all HTML special characters |
| Progress display | Custom progress bar | `ProgressReporter` (already exists) | Handles v12/v13 differences |

## Common Pitfalls

### Pitfall 1: Stale Token References After Match Computation
**What goes wrong:** Tokens could be deleted between match computation and replacement start (e.g., another GM action).
**Why it happens:** There's a time gap while the user reviews the preview dialog.
**How to avoid:** The existing `#processToken` already checks `canvas.scene.tokens.has(tokenDoc.id)` before processing. When refactoring, preserve this check in the replacement loop even though tokens were pre-scanned.
**Warning signs:** "Token no longer exists" errors during replacement after preview.

### Pitfall 2: processedIds Set Must Be Maintained
**What goes wrong:** Duplicate token processing if the processedIds dedup mechanism is lost during refactoring.
**Why it happens:** The existing `#processToken` manages processedIds internally; the refactored code must maintain this.
**How to avoid:** Keep the processedIds Set in the replacement loop, even though matches are pre-computed.

### Pitfall 3: Lock Release on Preview Cancel
**What goes wrong:** If the user cancels the preview, the `#isProcessing` lock must still be released.
**Why it happens:** The preview dialog is inside the try block; cancellation returns early but must go through `finally`.
**How to avoid:** The existing `finally` block already handles this for the confirmation dialog. Ensure the preview cancel path also exits through the same `finally` block.

### Pitfall 4: HTML Table in Dialog Sizing
**What goes wrong:** Long creature names or many tokens make the dialog unusable.
**Why it happens:** No max-height or scrolling on the table container.
**How to avoid:** Use `max-height: 300px; overflow-y: auto` on the table container (locked decision). Use `text-overflow: ellipsis` if names are extremely long.

### Pitfall 5: DEFAULT_HTTP_TIMEOUT_MS Import Becomes Dead Code
**What goes wrong:** The `DEFAULT_HTTP_TIMEOUT_MS` constant is still exported from wildcard-resolver.js and imported in main.js line 7. After adding the setting, this import becomes unused.
**Why it happens:** The constant was the original mechanism; the setting replaces it.
**How to avoid:** Keep the constant as the fallback default value inside WildcardResolver (for when settings aren't registered yet), but remove the import from main.js if no longer needed there.

### Pitfall 6: Settings Registration Order
**What goes wrong:** If `game.settings.get(MODULE_ID, "httpTimeout")` is called before `registerSettings()` runs, it throws.
**Why it happens:** WildcardResolver.DEFAULT_TIMEOUT might be accessed during module init/ready phase.
**How to avoid:** The try/catch in the DEFAULT_TIMEOUT getter with fallback to 5000ms handles this. The `registerSettings()` is called in `Hooks.once("init")` which runs before any replacement operations.

## Code Examples

### Preview Dialog HTML Structure
```javascript
static async showPreviewDialog(matchResults) {
  const matched = matchResults.filter(r => r.match !== null);
  const unmatched = matchResults.filter(r => r.match === null);
  const sorted = [...matched, ...unmatched];

  let tableRows = "";
  for (const result of sorted) {
    const tokenName = escapeHtml(result.creatureName);
    if (result.match) {
      const matchName = escapeHtml(result.match.entry.name);
      const sourceName = escapeHtml(result.match.pack.metadata.label);
      tableRows += `<tr><td>${tokenName}</td><td>${matchName}</td><td>${sourceName}</td></tr>`;
    } else {
      tableRows += `<tr><td>${tokenName}</td><td style="color: red;">${game.i18n.localize("NPC_REPLACER.PreviewNoMatch")}</td><td>&mdash;</td></tr>`;
    }
  }

  const content = `
    <p>${game.i18n.format("NPC_REPLACER.PreviewSummary", { matched: matched.length, total: matchResults.length })}</p>
    <div style="max-height: 300px; overflow-y: auto; margin: 10px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th>${game.i18n.localize("NPC_REPLACER.PreviewColToken")}</th>
            <th>${game.i18n.localize("NPC_REPLACER.PreviewColMatch")}</th>
            <th>${game.i18n.localize("NPC_REPLACER.PreviewColSource")}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  const hasMatches = matched.length > 0;

  return new Promise(resolve => {
    Dialog.confirm({
      title: game.i18n.localize("NPC_REPLACER.PreviewTitle"),
      content,
      yes: () => resolve(true),
      no: () => resolve(false),
      defaultYes: false,
      close: () => resolve(false),
      // Disable "Replace" button when no matches
      render: hasMatches ? undefined : (html) => {
        html.find('.yes, [data-button="yes"]').prop('disabled', true);
      }
    });
  });
}
```

### Match Pre-Computation
```javascript
static async computeMatches(tokens, index, progress) {
  const results = [];
  progress.start(tokens.length, game.i18n.localize("NPC_REPLACER.PreviewScanning"));

  for (let i = 0; i < tokens.length; i++) {
    const tokenDoc = tokens[i];
    const creatureName = tokenDoc.actor?.name || tokenDoc.name;
    const match = NameMatcher.findMatch(creatureName, index);
    results.push({ tokenDoc, creatureName, match });

    progress.update(i + 1, game.i18n.format("NPC_REPLACER.ProgressUpdate", {
      current: i + 1, total: tokens.length, name: tokenDoc.name
    }));
  }

  progress.finish();
  return results;
}
```

### HTTP Timeout Setting Registration
```javascript
// In registerSettings(), add after existing settings:
game.settings.register(MODULE_ID, "httpTimeout", {
  name: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Name"),
  hint: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Hint"),
  scope: "world",
  config: true,
  type: Number,
  range: { min: 1, max: 30, step: 1 },
  default: 5
});
```

### WildcardResolver Timeout Integration
```javascript
// Replace the DEFAULT_TIMEOUT getter in WildcardResolver:
static get DEFAULT_TIMEOUT() {
  try {
    const seconds = game.settings.get("npc-token-replacer", "httpTimeout");
    return seconds * 1000;
  } catch {
    return DEFAULT_HTTP_TIMEOUT_MS; // Fallback to constant
  }
}
```

## Localization Keys Needed

New keys following the flat `NPC_REPLACER.*` pattern (no dots after NPC_REPLACER to avoid conflicts with existing "Error" key):

```json
{
  "PreviewTitle": "Token Replacement Preview",
  "PreviewSummary": "{matched} of {total} tokens matched",
  "PreviewColToken": "Token Name",
  "PreviewColMatch": "Will Match As",
  "PreviewColSource": "Source Compendium",
  "PreviewNoMatch": "No match found",
  "PreviewScanning": "Scanning tokens...",
  "PreviewReplace": "Replace",
  "PreviewCancel": "Cancel",
  "Settings.HttpTimeout.Name": "HTTP Timeout (seconds)",
  "Settings.HttpTimeout.Hint": "Timeout for network requests when resolving wildcard token paths. Increase for slow connections."
}
```

Note: Some existing keys (`ConfirmTitle`, `ConfirmContent`, `ConfirmYes`, `ConfirmNo`, `ConfirmProceed`) will become unused after the preview dialog replaces the confirmation dialog. They can be removed or left for backward compatibility.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded timeout constant | Configurable setting with UI | This phase | Users can tune for their network |
| Confirm-then-match | Match-then-preview | This phase | Users see results before committing |
| Dialog.confirm (v12 native) | Dialog.confirm (v13 shim, removed in v14) | v13 | Known future breaking change, no action needed now |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom |
| Config file | vitest.config.js |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-02a | computeMatches returns correct match results | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 |
| UX-02b | showPreviewDialog renders table with escaped names | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 |
| UX-02c | Preview cancel returns false, no replacement calls | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 |
| UX-02d | Pre-computed results passed to replacement (no double-match) | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 |
| UX-02e | All unmatched disables Replace button | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 |
| UX-03a | httpTimeout setting registered with correct range | unit | `npx vitest run tests/lib/wildcard-resolver.test.js -x` | Partially (file exists, test needs adding) |
| UX-03b | WildcardResolver.DEFAULT_TIMEOUT reads from settings | unit | `npx vitest run tests/lib/wildcard-resolver.test.js -x` | Partially |
| UX-03c | Fallback to 5000ms when setting unavailable | unit | `npx vitest run tests/lib/wildcard-resolver.test.js -x` | Partially |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `tests/dry-run-preview.test.js` -- covers UX-02 (computeMatches, preview dialog, replacement integration)
- [ ] Add httpTimeout tests to existing `tests/lib/wildcard-resolver.test.js` -- covers UX-03

## Open Questions

1. **Dialog.confirm button label customization**
   - What we know: The locked decision says buttons should be "Replace" / "Cancel". Foundry's Dialog.confirm uses `yes`/`no` labels which default to localized Yes/No but may accept custom labels via the options object.
   - What's unclear: Whether Dialog.confirm directly supports custom button labels or if a full `new Dialog()` is needed.
   - Recommendation: Use `Dialog.confirm` if it supports label customization; otherwise use `new Dialog({buttons: {...}})` which definitely supports custom labels. Both patterns are safe and standard.

2. **Disabling the Replace button when all unmatched**
   - What we know: The `render` callback on Dialog receives the jQuery HTML element.
   - What's unclear: The exact selector for the "yes" button varies between v12 and v13 (`.dialog-button.yes` vs `[data-button="yes"]`).
   - Recommendation: Try both selectors in the render callback for cross-version compatibility: `html.find('.yes, [data-button="yes"]').prop('disabled', true)`.

## Sources

### Primary (HIGH confidence)
- Project source code: `scripts/main.js` -- existing Dialog.confirm pattern (lines 1018-1043), replaceNPCTokens flow (lines 1150-1254), registerSettings (lines 1341-1376)
- Project source code: `scripts/lib/wildcard-resolver.js` -- DEFAULT_HTTP_TIMEOUT_MS constant, DEFAULT_TIMEOUT getter, fetchWithTimeout usage
- Project source code: `scripts/lib/name-matcher.js` -- NameMatcher.findMatch API
- Project source code: `scripts/lib/progress-reporter.js` -- ProgressReporter API
- Project source code: `lang/en.json` -- existing localization key patterns
- `.planning/phases/06-dry-run-preview/06-CONTEXT.md` -- locked decisions

### Secondary (MEDIUM confidence)
- Foundry VTT Dialog API documentation -- Dialog.confirm options including render callback
- Foundry VTT game.settings.register -- Number type with range property

### Tertiary (LOW confidence)
- Dialog button selectors for disabled state -- may vary between v12/v13, needs runtime testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using only existing project patterns and Foundry APIs
- Architecture: HIGH - clear refactoring path from existing flow, all integration points identified
- Pitfalls: HIGH - based on direct code analysis of existing implementation
- Dialog button customization: MEDIUM - v12/v13 selector differences need runtime validation

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, no fast-moving dependencies)

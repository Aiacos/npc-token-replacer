# Phase 6: Dry-Run Preview - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a pre-replacement match preview dialog that shows users which tokens will match to which compendium creatures before committing any scene changes. Also make the HTTP timeout for wildcard HEAD requests configurable via a module setting. The existing confirmation dialog is replaced by this richer preview.

</domain>

<decisions>
## Implementation Decisions

### Preview dialog layout
- Three-column table: Token Name | Will Match As | Source Compendium
- Scrollable with max-height (~300px), consistent with existing confirmation dialog pattern
- Summary count line above the table: "X of Y tokens matched"
- Matched tokens sorted first, unmatched tokens last
- Dialog buttons: "Replace" / "Cancel" (simple, clear)

### Unmatched token handling
- Unmatched tokens shown inline in the same table with "No match found" styled in red
- Source column shows em-dash for unmatched tokens
- If ALL tokens are unmatched: still show the preview table but disable the Replace button
- No match-type indicator for variant matches — just show the matched creature name

### Workflow integration
- Preview dialog REPLACES the current confirmation dialog (one dialog, not two)
- New flow: get tokens -> load index -> compute matches -> show preview -> replace
- Index loading moves earlier (before preview instead of after confirmation)
- ProgressReporter reused during match computation phase ("Scanning tokens...")
- Pre-computed match results passed directly to replacement loop (no double-matching)
- All token and creature names HTML-escaped via escapeHtml before rendering

### HTTP timeout setting
- Number input with range: 1-30 seconds, step 1, default 5
- Display in seconds in UI, convert to milliseconds internally (multiply by 1000)
- WildcardResolver reads from game.settings.get() at call time (no API change)
- Changing timeout does NOT clear wildcard cache (timeout affects future requests, not cached results)
- Registered alongside existing settings in registerSettings()

### Claude's Discretion
- Exact CSS styling of the preview table (colors, borders, fonts)
- Error handling for edge cases during match computation
- Internal refactoring of replaceNPCTokens to accommodate the new preview step

</decisions>

<specifics>
## Specific Ideas

- Preview table visual style should match Foundry's native dialog aesthetics
- The "No match found" indicator should use red text to draw attention to unmatched tokens
- Summary line provides instant overview before user scrolls through potentially long table

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showConfirmationDialog()` (main.js:1018): Current Dialog.confirm pattern — will be replaced/evolved into preview dialog
- `escapeHtml()` (main.js:1530): Already used for XSS prevention in current confirmation dialog
- `NameMatcher.findMatch()`: Can be called in a pre-scan loop to build match results before showing preview
- `ProgressReporter` (scripts/lib/progress-reporter.js): Reusable for "Scanning tokens..." phase before preview appears
- `registerSettings()` (main.js:1341): Existing settings registration function — add httpTimeout here

### Established Patterns
- `Dialog.confirm()` with Promise wrapper (main.js:1033-1042): Pattern for async dialog results
- `game.settings.register()` with type/scope/config/range: Pattern for numeric settings
- `game.i18n.localize()`/`format()` with `NPC_REPLACER.*` flat keys: Localization pattern
- Flat localization keys (no dots after NPC_REPLACER) to avoid conflicts with existing "Error" key

### Integration Points
- `replaceNPCTokens()` (main.js:1160): Main orchestration method — needs restructuring to add preview step
- `#processToken()` (main.js:1055): Currently does match + replace together — match phase needs extraction
- `DEFAULT_HTTP_TIMEOUT_MS` import (main.js:7): Currently from wildcard-resolver.js — will be replaced by settings read
- `TokenReplacer.getNPCTokensToProcess()` (main.js:1180): Entry point for getting tokens to preview

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dry-run-preview*
*Context gathered: 2026-03-06*

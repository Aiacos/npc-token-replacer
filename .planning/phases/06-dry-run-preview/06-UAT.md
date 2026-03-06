---
status: testing
phase: 06-dry-run-preview
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md]
started: 2026-03-06T08:10:00Z
updated: 2026-03-06T08:10:00Z
---

## Current Test

number: 1
name: Preview Dialog Appears
expected: |
  When you click the NPC Token Replacer button in a scene with NPC tokens, a preview dialog appears showing a 3-column table: Token Name | Will Match As | Source Compendium. Above the table, a summary line reads "X of Y tokens matched".
awaiting: user response

## Tests

### 1. Preview Dialog Appears
expected: When you click the NPC Token Replacer button in a scene with NPC tokens, a preview dialog appears showing a 3-column table: Token Name | Will Match As | Source Compendium. Above the table, a summary line reads "X of Y tokens matched".
result: [pending]

### 2. Matched Token Row
expected: Tokens that match a compendium creature show the matched creature name in the "Will Match As" column and the compendium label (e.g., "Monster Manual 2024") in the "Source Compendium" column.
result: [pending]

### 3. Unmatched Token Row
expected: Tokens with no compendium match show "No match found" in red text in the "Will Match As" column and an em-dash in the "Source Compendium" column.
result: [pending]

### 4. Sort Order
expected: In the preview table, all matched tokens appear first (at the top), followed by all unmatched tokens at the bottom.
result: [pending]

### 5. Cancel Does Nothing
expected: Clicking Cancel (or closing the dialog) dismisses it. No tokens are replaced, no actors are imported, and the scene remains unchanged.
result: [pending]

### 6. Replace Executes
expected: Clicking Replace closes the dialog and runs the token replacement. Tokens are replaced with compendium versions. A progress bar shows during replacement. Results notification appears when done.
result: [pending]

### 7. Disabled Replace When All Unmatched
expected: If every token in the scene has no compendium match, the Replace button in the preview dialog is disabled (greyed out, not clickable). Cancel still works.
result: [pending]

### 8. Scrollable Table
expected: When many NPC tokens exist in the scene, the preview table area scrolls vertically rather than making the dialog excessively tall. The table container has a visible scrollbar when content overflows.
result: [pending]

### 9. HTTP Timeout Setting
expected: In the module settings (Configure Settings > Module Settings > NPC Token Replacer), there is an "HTTP Timeout (seconds)" setting with a number input. It accepts values from 1 to 30 with a default of 5.
result: [pending]

### 10. Timeout Affects Wildcard Requests
expected: Changing the HTTP timeout setting to a different value (e.g., 10 seconds) affects how long wildcard token path resolution waits for HEAD requests. The setting takes effect on the next replacement run without needing to reload.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]

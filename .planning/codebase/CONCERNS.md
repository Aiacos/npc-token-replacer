# Codebase Concerns

**Analysis Date:** 2026-02-28

## Tech Debt

**Sequential Token Processing Bottleneck:**
- Issue: Token replacement loop in `NPCTokenReplacerController.replaceNPCTokens()` processes tokens fully sequentially (lines 1760-1775). Each token operation performs: 1) getDocument from compendium, 2) actor import to world, 3) wildcard resolution (if needed), 4) token creation, 5) old token deletion. This results in 2N socket round-trips.
- Files: `scripts/main.js` (lines 1747-1750 TODO comment, lines 1760-1775 loop)
- Impact: Replace operations scale linearly with token count. A 10-token replacement with slow network could take 10-20 seconds. Future scaling to mass replacements (50+ tokens) will be noticeably slow.
- Fix approach: Refactor into phases: (1) parallel resolve phase (getDocument, import, wildcard resolution), (2) single batched mutation phase (one createEmbeddedDocuments + deleteEmbeddedDocuments call). This reduces socket round-trips from 2N to ~3-4 total.

**Index Map Lifecycle Management:**
- Issue: `CompendiumManager.#indexMap` is built during `loadMonsterIndex()` but cleared alongside `#indexCache` in `clearCache()`. The Map is cached for O(1) lookups but there's no explicit documentation about when stale Map data could cause issues if loadMonsterIndex is called with forceReload=true while operations are in progress.
- Files: `scripts/main.js` (lines 616-616 field declaration, 878-888 map building, 901-906 clearing, 914-915 getter, 1085 usage in NameMatcher.findMatch)
- Impact: If settings change mid-operation (settings saved while replacement is running), old indexMap could remain in use briefly. The execution lock in `NPCTokenReplacerController` prevents concurrent replaceNPCTokens calls, but indirect callers could theoretically trigger inconsistency.
- Fix approach: Clear indexMap only when settings change, not on every forceReload. Document that Map validity is tied to cache invalidation boundaries.

**Wildcard Variant Cache Doesn't Clear on Settings Change:**
- Issue: `WildcardResolver.#variantCache` caches resolved wildcard paths but isn't explicitly cleared when variant selection mode (none/sequential/random) changes. If a user changes mode mid-session, old cached variants remain.
- Files: `scripts/main.js` (lines 325 cache field, 414-417 cache hit, 472 cache set, 580-582 clearCache method, 1798-1802 NPCTokenReplacerController.clearCache)
- Impact: Low. Variant cache stores paths (e.g., specter-1.webp, specter-2.webp), not selection modes. Changing mode won't break path resolution — just the selected variant might repeat or randomize differently than expected on next run.
- Fix approach: Add `WildcardResolver.clearCache()` call to `NPCTokenReplacerController.clearCache()` which is already called when settings update (line 2031).

## Known Bugs

**Null Pointer Risk in getEnabledCompendiums Error Handling:**
- Symptoms: If JSON.parse() fails in `CompendiumManager.getEnabledCompendiums()` and fallback is triggered, the code logs the full error but doesn't validate that `game.settings.get()` didn't already throw before the parse attempt.
- Files: `scripts/main.js` (lines 781-787)
- Trigger: Corrupted enabledCompendiums setting string (e.g., `"[broken json"`). The try/catch catches both errors together, so diagnostics are muddled.
- Workaround: Manually clear the setting via Foundry console: `game.settings.set("npc-token-replacer", "enabledCompendiums", JSON.stringify(["default"]))`
- Fix approach: Split try/catch into separate blocks for settings retrieval vs. JSON parse to distinguish error sources.

**Potential Race Condition in Actor Lookup Map:**
- Symptoms: `TokenReplacer.#actorLookup` is built at session start (line 1745) but if tokens are deleted between building the map and processing them, lookups could hit deleted actors.
- Files: `scripts/main.js` (lines 1181 field, 1188-1194 buildActorLookup, 1351-1356 usage, 1745 call site)
- Trigger: Rare. Requires user to delete world actors between confirmation dialog and actual replacement.
- Workaround: Rebuild lookup before each token replacement (performance penalty).
- Fix approach: Check if actor still exists via `game.actors.has(uuid)` before using from map (low overhead).

**Unhandled Edge Case: Empty Variant Selection:**
- Symptoms: `WildcardResolver.selectVariant()` returns `{path: null, nextIndex: sequentialIndex}` if variants array is empty (line 498), but callers don't consistently check for null path.
- Files: `scripts/main.js` (lines 496-499 returns null path, 548-551 chains to resolve, 1405-1418 resolver call usage)
- Trigger: Wildcard path exists but no variants probed successfully (network timeouts, server misconfiguration).
- Workaround: `WildcardResolver.resolve()` catches empty variants and falls back to portrait or mystery-man (lines 554-568), so end users don't see null. But intermediate null isn't documented.
- Fix approach: Ensure null checks in all consumers or document guaranteed non-null return.

## Security Considerations

**XSS Prevention in Dialog Content:**
- Risk: Token names displayed in confirmation dialog (line 1581) are properly escaped via `escapeHtml()`, preventing injection of malicious actor names into HTML.
- Files: `scripts/main.js` (lines 2050-2062 escapeHtml function, 1581 usage in dialog)
- Current mitigation: HTML_ESCAPES Map covers &, <, >, ", ' (line 2050-2056). Pattern matches all potentially dangerous chars.
- Recommendations: Continue using escapeHtml for all user-facing data in dialogs. Consider using Foundry's `TextEditor.enrichHTML()` if rich text support is ever needed.

**Compendium Source Validation:**
- Risk: Actor UUID extraction (line 1191) checks `_stats?.compendiumSource` or `flags?.core?.sourceId`. If either property is spoofed, the actor lookup map could be poisoned.
- Files: `scripts/main.js` (lines 1188-1194 buildActorLookup)
- Current mitigation: UUIDs are Foundry-controlled identifiers, not user-supplied input. Map is session-scoped and cleared after each replacement (line 1782).
- Recommendations: UUIDs are safe enough. No additional validation needed.

**Settings Persistence with Untrusted Input:**
- Risk: Enabled compendium IDs are stored as JSON strings (line 2024). If corrupted externally, could bypass validation.
- Files: `scripts/main.js` (lines 1887-1894 setting registration, 1945-1952 parsing in form, 2024-2028 saving in form)
- Current mitigation: JSON.parse is wrapped in try/catch (lines 1946, 1781). Malformed JSON falls back to default compendiums ["default"].
- Recommendations: Current approach is solid. No security issue here.

## Performance Bottlenecks

**Wildcard Path Probing — Parallel All-Suffixes Strategy:**
- Problem: `WildcardResolver.resolveWildcardVariants()` probes 15 variant suffixes × N extension candidates in parallel (lines 437-449). For a single wildcard path (specter-*.webp) with 3 extensions, that's 45 HEAD requests at once. If multiple tokens use different wildcards, probe traffic accumulates.
- Files: `scripts/main.js` (lines 357 VARIANT_SUFFIXES list, 437-449 candidates loop, 444-449 Promise.allSettled)
- Cause: The code probes all possible variants up-front to avoid repeated requests. This is correct for caching, but the parallelism could overwhelm slow servers or networks.
- Improvement path: Implement early-exit strategy. Probe suffixes sequentially (1, 2, 3...) and stop after finding 2-3 matches. For most use cases, sequential probing (15 HEAD requests serially) is only slightly slower than parallel 45.

**Index Loading on Every Session:**
- Problem: `CompendiumManager.loadMonsterIndex()` is called at game.ready (initialization, line 1828) and again at the start of each replacement operation (line 1716). For large compendiums (2000+ creatures), each load re-indexes entries and rebuilds the Map.
- Files: `scripts/main.js` (lines 1715-1716 call in replaceNPCTokens, 1826-1829 call in initialize)
- Cause: Cache is session-scoped and survives settings changes (with forceReload=true), but index rebuild is only skipped if cache exists. Each new browser session reloads.
- Improvement path: Persist index in localStorage or IndexedDB between sessions. This is complex for browser compatibility but would skip 500ms+ of index building per session.

**Compendium Index Load Errors Not Isolated:**
- Problem: If one compendium's `getIndex()` fails (line 855), the error is caught but the combined index continues with remaining packs. However, there's no separate tracking of which packs succeeded/failed, so users don't know which compendium had issues.
- Files: `scripts/main.js` (lines 854-872 load loop with catch, 870-871 error log)
- Cause: Robust error handling, but lacks visibility into partial failures.
- Improvement path: Track per-pack success/failure and include in logs or debug output. Add method like `CompendiumManager.getLastLoadErrors()` for diagnostic purposes.

**Partial Word Matching Allocates Per-Entry Set:**
- Problem: `NameMatcher.findMatch()` builds a new `Set` (searchWordSet) once per match stage (line 1117), but the stage-3 partial matching filter (lines 1119-1132) creates temporary allocations for every index entry tested.
- Files: `scripts/main.js` (lines 1110-1142 stage 3 matching)
- Cause: The filter uses pre-computed `significantWords` arrays (built at index load time), but the bidirectional check (line 1130-1131) computes matchingCount for each entry. With 2000+ entries, this is 2000 iterations.
- Improvement path: Skip stage 3 entirely if a direct match is found (which is >95% of cases). Only run partial matching for creatures with unusual names.

## Fragile Areas

**WildcardResolver Fetch Timeouts:**
- Files: `scripts/main.js` (lines 373-385 fetchWithTimeout, 446 usage with DEFAULT_TIMEOUT)
- Why fragile: Timeout is fixed at 5000ms (line 20). On very slow connections or overloaded servers, all probes could time out, leaving no variants. Users won't see error (fallback to mystery-man), but replacement silently degrades.
- Safe modification: Make timeout configurable via settings. Test with multiple variants to ensure at least one completes. Add user warning if all probes timeout.
- Test coverage: No unit tests for timeout behavior. Edge cases (network drops, CORS errors) are caught but not validated.

**FolderManager Parent Folder Selection Logic:**
- Files: `scripts/main.js` (lines 250-258 parent folder search)
- Why fragile: Searches for top-level (no parent) folders matching monster patterns. If user has nested "Monsters > Humanoids" folder structure, the code won't find "Humanoids" as a parent (line 252 checks `!f.folder`). Creates folder at root level instead.
- Safe modification: Change line 252 to remove `&& !f.folder` check to allow nested parents. Test with various folder structures.
- Test coverage: No automated tests for folder creation logic. Manual testing needed.

**NameMatcher.normalizeName Unicode Handling:**
- Files: `scripts/main.js` (lines 1005-1012)
- Why fragile: Uses Unicode regex `/[^\p{L}\p{N}\s]/gu` to strip special characters. This works in ES2018+, but if users have Foundry on older engines, the flag `u` might fail silently.
- Safe modification: Add fallback for non-Unicode engines. Test with creature names containing accents (é, ñ, etc.).
- Test coverage: No localization testing. Assumed English creature names only.

**Concurrent Execution Prevention — Single isProcessing Lock:**
- Files: `scripts/main.js` (lines 1516-1529 isProcessing flag, 1695-1700 lock check, 1779-1783 release in finally)
- Why fragile: Only `replaceNPCTokens()` is locked. If a developer calls `TokenReplacer.replaceToken()` directly (via debug API), it bypasses the lock. Unclear if concurrent token replacements could corrupt state.
- Safe modification: Document that `replaceToken()` is private to replacement sessions. Add assertion/guard in public API.
- Test coverage: No concurrent execution tests.

## Scaling Limits

**Monster Index Memory Usage:**
- Current capacity: Tested with Monster Manual (400 creatures) + SRD (150 creatures). Each entry in index stores {entry, pack, normalizedName, significantWords, priority} — roughly 500 bytes per entry when stringified.
- Limit: 2000+ creatures × 500 bytes = ~1MB index. Combined with compendium lookup Maps, realistic limit is 5000 entries before memory becomes noticeable.
- Scaling path: Implement lazy-loading of compendium entries (fetch-on-demand instead of pre-indexing). Requires async findMatch, breaking current API.

**Wildcard Variant Cache Accumulation:**
- Current capacity: Each cached wildcard (e.g., "tokens/specter-*.webp" -> ["tokens/specter-1.webp", ...]) stores ~5 variants on average. With 50 different creatures, that's 250 cached paths.
- Limit: After ~500 different wildcard paths, cache Map will be ~250KB. No hard limit, but memory grows unbounded unless cleared.
- Scaling path: Implement LRU (Least Recently Used) eviction in WildcardResolver. Limit cache size to 100 most-used paths.

**Actor Lookup Map Session Scope:**
- Current capacity: Built once per replacement session from all world actors. If world has 10,000 actors, Map allocates ~500KB.
- Limit: No practical limit. Map is cleared immediately after replacement (line 1782).
- Scaling path: Current approach is fine for realistic game worlds (100-1000 actors).

## Dependencies at Risk

**AbortController Usage for Fetch Timeout:**
- Risk: `WildcardResolver.fetchWithTimeout()` uses AbortController (lines 374-385), which is ES2020+. Older browsers (IE11) don't support it.
- Impact: If Foundry somehow runs on older browsers, wildcard resolution fails silently.
- Migration plan: Polyfill AbortController or switch to Promise.race() with setTimeout-based timeout. Current approach is modern and sufficient.

**Promise.allSettled Usage:**
- Risk: `WildcardResolver.resolveWildcardVariants()` uses Promise.allSettled (line 444), ES2020+. All modern Foundry versions support this.
- Impact: Negligible. This is the right tool for parallel requests with mixed success/failure.
- Migration plan: No action needed.

**JSON.stringify/parse for Settings:**
- Risk: Storing complex data (compendium IDs array) as JSON string is fragile if corrupted. Current code has try/catch (lines 1945-1952, 1781-1787), so graceful fallback exists.
- Impact: Moderate. Corrupted settings require manual intervention via console.
- Migration plan: Consider using Foundry's built-in typed settings (Array type) instead of storing JSON. Would require settings schema update across all instances.

## Missing Critical Features

**No Progress Bar During Long Replacements:**
- Problem: Users get a single "Processing N tokens" notification (line 1757) but no live progress updates. Multi-second replacements show no activity.
- Blocks: User experience for large token counts (20+). Can't tell if operation is stuck.
- Fix: Add SceneControlButtons update with percentage or replace-as-you-go UI. Requires restructuring sequential loop to emit events.

**No Dry-Run Mode:**
- Problem: Confirmation dialog shows tokens to replace but doesn't preview which compendium creature each token will match to.
- Blocks: Users can't verify matches before committing. If name matching is unexpected, operation proceeds anyway.
- Fix: Add optional "show matches" button in confirmation dialog that runs NameMatcher.findMatch() for each token and displays results before execution.

**No Rollback After Errors:**
- Problem: If replacement partially succeeds (N of M tokens replaced) and then fails, there's no undo. User must manually revert.
- Blocks: Recovery from partial failures requires manual work.
- Fix: Implement transaction-like semantics with rollback. Complex, requires tracking created tokens and deleted originals.

## Test Coverage Gaps

**No Tests for Wildcard Resolution Timeouts:**
- What's not tested: Behavior when all HEAD requests timeout (networks errors from all variants).
- Files: `scripts/main.js` (lines 412-473 resolveWildcardVariants, 460-462 timeout warn, 465-468 error catch)
- Risk: If all probe requests fail, fallback path (mystery-man token) is used. This is acceptable but untested. Users won't notice, but diagnostics are unclear.
- Priority: Medium. Edge case but affects reliability.

**No Tests for Concurrent Replacement Calls:**
- What's not tested: Double-clicking button, parallel console calls, network delays that overlap calls.
- Files: `scripts/main.js` (lines 1695-1700 lock check, 1779-1783 lock release)
- Risk: Lock is checked once (line 1696). If call somehow bypasses check (e.g., directly invokes NPCTokenReplacerController.replaceNPCTokens()), could race. Current lock is simple and likely safe, but concurrent async code could have edge cases.
- Priority: Medium. Prevention is simple but untested.

**No Tests for Settings Corruption Handling:**
- What's not tested: Malformed JSON in enabledCompendiums, missing settings, corrupted priorities.
- Files: `scripts/main.js` (lines 1945-1952 form getData, 1781-1787 getEnabledCompendiums)
- Risk: Try/catch catches errors but doesn't validate recovery. Fallback to ["default"] might not match user intent.
- Priority: Low. Graceful degradation exists.

**No Tests for Empty Compendium List:**
- What's not tested: No WOTC compendiums installed, all enabled compendiums disabled, empty packs.
- Files: `scripts/main.js` (lines 1818-1824 init, 1708-1713 replaceNPCTokens validation)
- Risk: Multiple checks prevent null/undefined errors, but user messaging might be confusing if multiple blocks trigger.
- Priority: Low. Validation is comprehensive.

**No Tests for Token Replacement Edge Cases:**
- What's not tested: Token with no actor, actor import fails, new token creation fails (actor exists but can't spawn token).
- Files: `scripts/main.js` (lines 1459-1499 replaceToken, 1631-1644 processToken)
- Risk: Each error is caught and reported (lines 1641-1643), but the sequence of fallbacks isn't validated. Could leave orphaned world actors if token creation fails.
- Priority: Medium. Partial failures should have integration tests.

---

*Concerns audit: 2026-02-28*

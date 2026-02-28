# TODO Fix Plan

## Summary
- Total: 13 (original) + 11 (iteration 1) + 7 (iteration 2) + 4 (iteration 3) + 5 (iteration 4) + 3 (iteration 5) = 43 findings
- Resolved: 42
- Deferred: 1 (batch token mutations — requires major refactor)

## Original Resolution Status (Iteration 0)

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 1 | CRITICAL | Non-atomic delete-before-create | RESOLVED |
| 2 | HIGH | Unhandled async rejection in ready hook | RESOLVED |
| 3 | HIGH | selectBestMatch mutates input via .sort() | RESOLVED |
| 4 | HIGH | Sequential HEAD requests (48 serial) | RESOLVED |
| 5 | HIGH | Overly aggressive partial matching | RESOLVED |
| 6 | MEDIUM | normalizeName called redundantly + no Map | RESOLVED |
| 7 | MEDIUM | game.actors linear scan per token | RESOLVED |
| 8 | MEDIUM | Token processing fully sequential | DEFERRED |
| 9 | MEDIUM | Silent fallthrough when selected aren't NPCs | RESOLVED |
| 10 | MEDIUM | Empty custom selection silently defaults | RESOLVED |
| 11 | LOW | Fragile baseName extension stripping | RESOLVED |
| 12 | LOW | Unicode stripping in normalizeName | RESOLVED |
| 13 | LOW | escapeHtml falsy check | RESOLVED |

## Iteration 1 Review Findings

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 14 | HIGH | Race condition — #isProcessing lock set too late | RESOLVED |
| 15 | HIGH | Partial matching still asymmetric for 2-word searches | RESOLVED |
| 16 | HIGH | Static getters allocate new objects on every call | RESOLVED |
| 17 | MEDIUM | Wildcard resolution strips separator character | RESOLVED |
| 18 | MEDIUM | #actorLookup never cleared after session | RESOLVED |
| 19 | MEDIUM | selectBestMatch re-derives priority instead of using stored field | RESOLVED |
| 20 | MEDIUM | Stage 3 creates new Set per index entry | RESOLVED |
| 21 | MEDIUM | Empty string in VARIANT_SUFFIXES probes wrong file | RESOLVED |
| 22 | LOW | window.NPCTokenReplacer outside ready hook | RESOLVED |
| 23 | LOW | Non-deterministic tie-breaking in selectBestMatch | RESOLVED |
| 24 | LOW | findMatch logging re-derives priority | RESOLVED |

## Iteration 2 Review Findings

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 25 | MEDIUM | Wildcard probes all 3 extensions, can return wrong type | RESOLVED |
| 26 | HIGH | Stage 3: 3 array allocations per entry + threshold recomputed | RESOLVED |
| 27 | HIGH | variantTransforms allocated per findMatch call | RESOLVED |
| 28 | HIGH | getEnabledCompendiums not cached, called twice per session | RESOLVED |
| 29 | MEDIUM | getOrCreateImportFolder: 4+ linear passes over game.folders | RESOLVED |
| 30 | MEDIUM | selectBestMatch verbose logging at info level | RESOLVED |
| 31 | MEDIUM | push(...packEntries) spread risks stack overflow | RESOLVED |

## Iteration 3 Review Findings

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 32 | MEDIUM | Dead #getNextSequentialIndex method | RESOLVED |
| 33 | MEDIUM | PRESERVED_PROPERTIES not wired into #prepareNewTokenData | RESOLVED |
| 34 | MEDIUM | Stage 3 Set direction inverted (build per-entry Set) | RESOLVED |
| 35 | MEDIUM | Logger.MODULE_PREFIX getter on every log call | RESOLVED |

## Iteration 4 Review Findings

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 36 | HIGH | escapeHtml allocates object + regex per call | RESOLVED |
| 37 | HIGH | Logger.debug has no gate — forEach + template literals in hot path | RESOLVED |
| 38 | MEDIUM | Stage 3 partial matching false positives for short names | RESOLVED |
| 39 | MEDIUM | Dialog.confirm close-via-X can leave processing lock held | RESOLVED |
| 40 | MEDIUM | Empty index result not cached in loadMonsterIndex | RESOLVED |

## Iteration 5 Review Findings

| # | Priority | Issue | Status |
|---|----------|-------|--------|
| 41 | MEDIUM | Stage 3 split+filter per entry — pre-compute significantWords | RESOLVED |
| 42 | MEDIUM | game.settings.get per wildcard token — cache per session | RESOLVED |
| 43 | MEDIUM | enabledPackIds.includes O(N) — convert to Set | RESOLVED |

## Post-fix review findings
- Fix #5 partial matching direction was inverted (entry→search vs search→entry) — corrected
- Unused variable `significantSearchSet` after direction fix — removed
- Unused variable `name` after folder search simplification — removed
- ESLint: all clean (0 errors, 0 warnings) after all iterations

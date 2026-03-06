# Feature Research

**Domain:** Foundry VTT module — stability and reliability milestone for a published NPC token replacement module
**Researched:** 2026-02-28
**Confidence:** MEDIUM (Foundry VTT module development documentation is sparse on explicit quality standards; findings synthesized from official API docs, community resources, and comparable module analysis)

---

## Feature Landscape

This research focuses on **reliability and quality features** only — not new functional features. The question is: what does a mature, production-grade Foundry VTT module look like, and how does it compare to what NPC Token Replacer v1.4.0 currently has?

---

### Table Stakes (Users Expect These)

Features users assume exist in a published module. Missing these = module feels unfinished or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Graceful error messages for known failure modes | Users hit errors when compendiums are missing, names don't match, or imports fail. A module that crashes silently or logs to console-only is considered broken. | LOW | Module currently catches errors but messaging is inconsistent — some paths log to console only without `ui.notifications`. Split try/catch for settings retrieval vs. JSON parse is the clearest known gap (CONCERNS.md line 30). |
| `ui.notifications` feedback for all user-visible operations | Foundry's notification system is the contract between module and user. Users expect to see "Replacing X tokens...", success counts, and failure reasons in the toast system — not just console logs. | LOW | Current module shows start notification and completion count but progress during multi-token replacement is absent. The `ui.notifications.info({progress: true})` API (available in FVTT v13) supports live progress bars. |
| No silent data corruption on partial failure | If token replacement fails mid-operation (N of M tokens done), the module must not leave orphaned world actors or broken token state. Users expect either all-or-nothing or clear reporting of what succeeded and what failed. | MEDIUM | Current module catches per-token errors (CONCERNS.md line 199) and reports them individually. This is the correct approach. The null-check on actor lookup (CONCERNS.md line 38) is the critical hardening needed here. |
| Settings that survive corruption gracefully | Published modules must handle corrupted settings (from version upgrades, manual edits, or Foundry bugs) without crashing on startup. Recovery to defaults is expected. | LOW | Current module has try/catch on JSON.parse for settings (CONCERNS.md line 185). The gap is split error reporting — settings read failure vs. parse failure are conflated. |
| Compatibility with the declared Foundry version range | Users trust the version compatibility field in module.json. A module that declares v12/v13 support must actually work on both. | LOW | Already addressed in codebase for toolbar controls. Wildcard resolver uses AbortController (ES2020+) which is safe for declared versions. |
| No crash on empty/missing WotC compendiums | A user without the WotC D&D compendium modules installed must get a clear, actionable error — not a JS exception. | LOW | Validation exists in `replaceNPCTokens()` (CONCERNS.md line 193). The messaging path should be verified to reach `ui.notifications` not just Logger. |

---

### Differentiators (Competitive Advantage)

Features that distinguish a mature, quality module from a minimal one. Not required to function, but significantly raise user confidence and reduce support burden.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live progress bar during multi-token replacement | Users with 10-50 tokens on a scene currently see nothing during a potentially 10-20 second operation (CONCERNS.md line 7). A progress bar transforms "is this frozen?" anxiety into "this is working" confidence. | LOW | Foundry v13 provides `ui.notifications.info("...", {progress: true})` with `.update({pct: N, message: "..."})`. The sequential loop in `NPCTokenReplacerController.replaceNPCTokens()` is the natural place to emit progress after each token. Requires tracking current/total count. |
| Dry-run preview: match report before committing | Before replacing tokens, show which compendium creature each scene token will match to. Users can catch unexpected matches (e.g., "Wolf" matching "Dire Wolf") before scene data changes. | MEDIUM | Requires adding a "Preview Matches" button to the existing confirmation dialog. Runs `NameMatcher.findMatch()` for each token against the loaded index without modifying anything. Displays results in an extended dialog or secondary dialog. This is the primary UX differentiator between NPC Token Replacer and the existing token-replacer module (vtt-lair/token-replacer) which has no preview capability. |
| Per-token failure reporting with actionable reason | When a token fails to replace, tell the user *why* (no match found, import failed, token creation failed) in a post-run summary. Currently errors are per-token console logs. | LOW | Already partially exists. Hardening means: (1) classify failure types, (2) collect in post-run summary dialog or notification rather than individual console errors. |
| Wildcard cache invalidation on settings change | When user changes variant selection mode (none/sequential/random), the cached wildcard paths should clear. Without this, old variants persist until browser refresh. | LOW | One-line fix: call `WildcardResolver.clearCache()` inside `NPCTokenReplacerController.clearCache()` which is already triggered on settings change (CONCERNS.md line 21). Listed separately because it's a correctness fix with user-visible effect. |
| Configurable HTTP timeout for wildcard probing | On slow networks or overloaded servers, the fixed 5000ms timeout may be too short, causing all probes to fail silently and fall back to mystery-man token. A settings field lets users tune this. | LOW | The constant `DEFAULT_HTTP_TIMEOUT_MS = 5000` at line 20 of main.js is already isolated. Adding a Foundry setting for it requires ~20 lines of code. Users on slow connections benefit immediately. |
| Per-compendium load error tracking | If one compendium fails to index (network error, corrupt pack), users get no visibility. Tracking which packs succeeded/failed and exposing via debug API improves diagnostics for bug reports. | LOW | `CompendiumManager.getLastLoadErrors()` method proposed in CONCERNS.md line 85. Adds an array of `{pack, error}` objects populated during `loadMonsterIndex()`. Exposed via `window.NPCTokenReplacer` debug API. |
| Automated test coverage for critical paths | A module with no tests is a maintenance liability. Any future Foundry API change or code refactor risks undetected regressions. Tests are the table stakes for maintainers, even if invisible to end users. | HIGH | The Foundry VTT testing ecosystem has two viable approaches: (1) **Vitest + foundry-test-utils**: `@rayners/foundry-test-utils` provides ~600 lines of Foundry mock infrastructure (game object, ui, canvas, Hooks, collections) — works without running Foundry, supports CI. (2) **Quench**: in-engine Mocha/Chai test runner that runs inside Foundry itself, requires a running instance and Cypress for CI integration. For this module's constraints (no build step, single-file, no heavy dependencies), Vitest + foundry-test-utils is the recommended path for unit tests of pure logic; Quench for integration tests if CI budget allows. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like obvious improvements but create disproportionate complexity or maintenance risk relative to benefit.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full rollback / undo after partial failure | Users fear losing scene state if replacement crashes midway. "Undo" sounds like a safety net. | Requires snapshotting complete token state before every operation, maintaining a transaction log, and implementing reverse operations (re-delete new tokens, re-create originals). Foundry's document model makes this ~4x the complexity of the replacement operation itself. The risk of the rollback code itself being buggy exceeds the risk of partial failure. | Clear per-token failure reporting + post-run summary telling users exactly which tokens failed. GM can manually inspect and re-run. This covers 95% of the safety need at 5% of the cost. |
| Batch token mutations (single createEmbeddedDocuments) | Performance optimization to reduce socket round-trips from 2N to ~4. | Requires a major refactor of the sequential replacement loop into two phases: parallel resolve + batched mutation. This is a significant architectural change that risks introducing new bugs in the process that tests might not catch. The milestone's goal is stability, not performance. | Add progress bar (which makes slow operations feel acceptable) and defer batch optimization to a future performance milestone once tests are in place to guard against regressions. |
| localStorage / IndexedDB index persistence | Speed up session start by caching the monster index across browser sessions. | Complex cross-browser compatibility (Foundry runs in both desktop app and browser), cache invalidation when compendiums update, storage quota concerns. The index load is 500ms+ but only happens once per session, which is tolerable. | Pre-cache the index at `game.ready` (already done) so it's ready before the user acts. The first replacement call has zero index load time. |
| LRU eviction for wildcard variant cache | Prevent memory growth from 500+ cached wildcard paths. | At current usage levels (50-100 wildcard creatures per scene), the cache is ~250KB — not a practical problem. LRU adds algorithmic complexity and a data structure that needs its own tests. | Document the current unbounded growth as a known limitation. Add a note to the debug API that cache can be manually cleared. Revisit if usage scales to 500+ unique wildcard creatures per session. |
| Full i18n / multi-language localization | Make the module accessible to non-English speakers. | Requires translation files for every language, community translators, and ongoing maintenance for every new string added. The infrastructure (lang/en.json) already exists — the blocker is translation content, not code. | Keep English-only for this milestone. Ensure all new strings are added to lang/en.json following existing patterns, so community contributors can add translations later without code changes. |
| Automated error telemetry (Errors & Echoes integration) | The `fvtt-errors-and-echoes` module (rayners) reports JS errors anonymously to module authors for faster bug diagnosis. | Adds a dependency on an external module and opt-in consent workflow. Premature for a module that doesn't yet have basic test coverage. Users are suspicious of any data collection, even anonymous. | Prioritize test coverage and robust error handling first. Errors & Echoes is worth evaluating after v2.0 when the module has an active user base generating real-world error patterns. |

---

## Feature Dependencies

```
[Automated test coverage]
    └──enables──> [Safe refactoring of any feature below]
    └──enables──> [Per-token failure reporting] (tests validate error paths)

[Live progress bar]
    └──requires──> [Sequential loop emits events] (trivial — just add counter tracking)

[Dry-run preview]
    └──requires──> [Monster index loaded] (already happens at game.ready)
    └──requires──> [Extended confirmation dialog] (replaces or augments current Dialog)
    └──enhances──> [Per-token failure reporting] (preview shows predicted matches; post-run shows actual results)

[Wildcard cache invalidation on settings change]
    └──requires──> [Settings change hook already calls clearCache()] (already exists — one-line add)

[Per-compendium load error tracking]
    └──requires──> [loadMonsterIndex() modified to track per-pack results]
    └──enhances──> [Debug API] (exposes getLastLoadErrors())

[Graceful error messages]
    └──requires──> [Split try/catch in getEnabledCompendiums()]
    └──requires──> [Null check in actor lookup before use]
    └──requires──> [All error paths reach ui.notifications, not just Logger]
```

### Dependency Notes

- **Tests enable everything else**: Without automated tests, any change to error handling, progress reporting, or preview logic is a regression risk. Tests should be the first milestone deliverable, not the last.
- **Progress bar is independent**: It does not depend on tests, error handling changes, or preview. It can be implemented in isolation as soon as the sequential loop is understood.
- **Dry-run preview is the highest-value differentiator**: It requires the most new UI code but uses existing infrastructure (NameMatcher, loaded index). The confirmation dialog already exists — preview extends it.
- **Error handling hardening is a prerequisite for production confidence**: The null pointer in actor lookup (CONCERNS.md line 35) and the conflated try/catch in settings parsing (CONCERNS.md line 28) are the two bugs most likely to cause user-visible failures.

---

## MVP Definition (for this milestone)

This is a **stability milestone**, not a new feature release. The MVP is "production-grade reliability" — the module is ready for public distribution with confidence.

### Launch With (v1.5.0)

These are the minimum set to call the module production-grade:

- [ ] **Automated unit tests for pure logic** — NameMatcher.findMatch(), normalizeName(), WildcardResolver.isWildcardPath(), selectVariant(), CompendiumManager priority resolution. These are stateless functions testable without Foundry mocks. Tests catch regressions from future changes.
- [ ] **Null check in actor lookup map** — `game.actors.has(uuid)` guard before map use (CONCERNS.md line 38). Prevents the race condition bug from causing silent failures.
- [ ] **Split try/catch in getEnabledCompendiums()** — Separate settings retrieval from JSON parse so error messages tell users the actual failure source (CONCERNS.md line 28).
- [ ] **Wildcard cache cleared on settings change** — One-line fix that makes mode changes take effect without browser refresh (CONCERNS.md line 21).
- [ ] **Live progress bar for multi-token replacement** — `ui.notifications.info({progress: true})` with per-token `update({pct})` calls. Eliminates the "is it frozen?" anxiety for 10+ token operations.
- [ ] **All error paths reach ui.notifications** — Audit that every caught exception in user-triggered flows calls `ui.notifications.error()` with a localized message, not just `Logger.error()`.

### Add After Validation (v1.5.x)

These raise quality further but are not blockers for production-grade:

- [ ] **Dry-run preview in confirmation dialog** — "Preview Matches" button shows token-to-creature mapping before committing. Add when the v1.5.0 error handling hardening is stable.
- [ ] **Per-compendium load error tracking** — `CompendiumManager.getLastLoadErrors()` for diagnostics. Add when user bug reports identify compendium load failures as a recurring issue.
- [ ] **Configurable HTTP timeout** — Settings field for `DEFAULT_HTTP_TIMEOUT_MS`. Add when user reports emerge from slow-network environments.

### Future Consideration (v2.0+)

These are architecturally significant or require prerequisites not yet in place:

- [ ] **Integration tests with Quench** — Requires a running Foundry instance and CI setup. Valuable after unit tests prove their worth and the test infrastructure is established.
- [ ] **Batch token mutations** — Performance optimization requiring major loop refactor. Only safe after test coverage guards against regressions.
- [ ] **Errors & Echoes integration** — Anonymous telemetry. Only appropriate with an active user base to generate meaningful signal.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Graceful error messages (split try/catch + ui.notifications audit) | HIGH — eliminates silent failures users can't diagnose | LOW — surgical changes to existing error paths | P1 |
| Null check in actor lookup (race condition fix) | HIGH — prevents data corruption on rare but real edge case | LOW — one guard per lookup | P1 |
| Wildcard cache invalidation on settings change | MEDIUM — affects users who change mode mid-session | LOW — one additional clearCache() call | P1 |
| Live progress bar | HIGH — transforms UX for any replacement with 5+ tokens | LOW — fits directly into existing sequential loop | P1 |
| Automated unit tests (pure logic) | HIGH for maintainers, invisible to users — but enables safe future changes | MEDIUM — requires test framework setup, mock design, coverage of NameMatcher/WildcardResolver | P1 |
| Dry-run preview (match report dialog) | HIGH — prevents unexpected replacements, unique vs competitors | MEDIUM — new dialog UI, extended confirmation flow | P2 |
| Per-compendium load error tracking | MEDIUM — helps diagnose rare failures in bug reports | LOW — tracking array in loadMonsterIndex() | P2 |
| Configurable HTTP timeout | LOW — niche (slow network users only) | LOW — one settings field | P3 |
| Integration tests (Quench) | HIGH for maintainers | HIGH — requires running Foundry instance + CI setup | P3 |

---

## Competitor Feature Analysis

The primary comparable module is **Token Replacer** (vtt-lair/token-replacer) — a different approach (file-system folder matching instead of compendium matching) but same user goal.

| Quality Feature | Token Replacer (vtt-lair) | NPC Token Replacer (this module) | Assessment |
|-----------------|--------------------------|-----------------------------------|------------|
| Error handling | Fallback to Tokenizer on no match | Per-token try/catch with error logging | This module is more robust |
| Progress feedback | None documented | Start/end notification only | Both weak — progress bar is gap for this module |
| Dry-run preview | None | Confirmation list (no match details) | Both lack match preview — this is a differentiator opportunity |
| Test coverage | No public tests visible | No tests | Neither has tests — Foundry module ecosystem norm |
| Settings corruption handling | Unknown | Try/catch with fallback to defaults | This module handles it |
| Version compatibility | Unknown | Explicit v12/v13 handling in code | This module more explicit |

**Key insight:** Test coverage and dry-run preview are not norms in the Foundry VTT module ecosystem — they would be genuine differentiators, not merely catching up to competition.

---

## Sources

- [Foundry VTT Notifications API v13](https://foundryvtt.com/api/classes/foundry.applications.ui.Notifications.html) — HIGH confidence — official documentation. Confirms `{progress: true}` option and `.update({pct, message})` pattern.
- [Quench — Foundry VTT testing module](https://foundryvtt.com/packages/quench) — HIGH confidence — official package listing. Mocha+Chai in-engine test runner.
- [foundry-test-utils (rayners)](https://github.com/rayners/foundry-test-utils) — MEDIUM confidence — community package. Vitest + jsdom mocks for ~600 lines of Foundry API, enables unit testing without running Foundry.
- [XDXA — FoundryVTT Module Test Automation](https://xdxa.org/2023/foundryvtt-module-test-automation/) — MEDIUM confidence — community post (2023). Describes Quench + Cypress + GitHub Actions CI pattern.
- [Errors & Echoes (rayners)](https://foundryvtt.com/packages/errors-and-echoes) — MEDIUM confidence — official package listing. Anonymous error telemetry module for Foundry module authors, v13+.
- [Token Replacer (vtt-lair)](https://github.com/vtt-lair/token-replacer) — MEDIUM confidence — GitHub. Competitor module analysis.
- [Foundry VTT Package Best Practices Wiki](https://foundryvtt.wiki/en/development/guides/package-best-practices) — LOW confidence — page content not accessible via fetch (wiki renders dynamically). Existence confirmed; content unverified.
- [DialogV2 API v13](https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html) — HIGH confidence — official documentation. Confirms async dialog patterns.
- [.planning/codebase/CONCERNS.md](file:///home/aiacos/workspace/FoundryVTT/token_updater/.planning/codebase/CONCERNS.md) — HIGH confidence — authoritative codebase analysis. Primary source for bug locations, fragile areas, and missing features.

---

*Feature research for: Foundry VTT module stability/reliability milestone*
*Researched: 2026-02-28*

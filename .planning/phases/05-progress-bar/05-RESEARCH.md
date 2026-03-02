# Phase 5: Progress Bar - Research

**Researched:** 2026-03-02
**Domain:** Foundry VTT progress bar APIs (v12 SceneNavigation, v13 Notifications progress)
**Confidence:** HIGH

## Summary

Phase 5 implements a live progress bar during multi-token replacement operations. Foundry VTT provides two different progress APIs depending on version: v12 uses `SceneNavigation.displayProgressBar({label, pct})` (a static method with percentage 0-100), while v13 introduces a new progress notification system via `ui.notifications.info(message, {progress: true})` that returns a notification object with an `update({pct, message})` method (fraction 0.0-1.0). The old `displayProgressBar` is deprecated in v13 but still works as a compatibility shim (bug fix in 13.345 confirms continued operation).

The implementation pattern is straightforward: create a `ProgressReporter` class that wraps both APIs behind a unified `start()` / `update(pct, label)` / `finish()` interface, using duck-typing (not `game.version`) to detect which API is available -- consistent with the existing project pattern for v12/v13 divergence (see `registerControlButton`). The class integrates into the existing `replaceNPCTokens()` processing loop, calling `update()` after each token is processed.

**Primary recommendation:** Create a `ProgressReporter` class in `scripts/lib/progress-reporter.js` that detects v13 via `typeof ui.notifications?.info({progress: true})` return type, falling back to `SceneNavigation.displayProgressBar` for v12. Wire it into `NPCTokenReplacerController.replaceNPCTokens()` around the existing token processing loop.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | Live progress bar during multi-token replacement using ui.notifications progress API (v13) with SceneNavigation fallback (v12) | v13: `ui.notifications.info(msg, {progress: true})` + `.update({pct, message})`. v12: `SceneNavigation.displayProgressBar({label, pct})`. ProgressReporter class wraps both with `start()/update()/finish()`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundry VTT v12 API | 12.x | `SceneNavigation.displayProgressBar({label, pct})` | Official v12 progress bar API, static method, pct 0-100 |
| Foundry VTT v13 API | 13.x | `ui.notifications.info(msg, {progress: true})` + `.update()` | Official v13 progress notification, replaces deprecated displayProgressBar |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 3.x | Unit testing for ProgressReporter | Test both v12 and v13 code paths with mocks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Duck-typing detection | `foundry.utils.isNewerVersion(game.version, "13")` | Duck-typing is the established project pattern (see `registerControlButton`); version checks are brittle if minor versions change behavior |
| Separate file | Inline in main.js | Separate file follows the Phase 2 extraction pattern (logger.js, name-matcher.js, wildcard-resolver.js) and is more testable |
| v13 `displayProgressBar` (deprecated shim) | Native v13 progress notifications | Using the deprecated shim would avoid branching but will break in v14 when the shim is removed |

## Architecture Patterns

### Recommended Project Structure
```
scripts/
  lib/
    logger.js               # existing
    name-matcher.js          # existing
    wildcard-resolver.js     # existing
    progress-reporter.js     # NEW - ProgressReporter class
scripts/
  main.js                   # modified - import and use ProgressReporter
tests/
  lib/
    progress-reporter.test.js  # NEW - tests for both v12/v13 paths
lang/
  en.json                   # modified - add progress label keys
```

### Pattern 1: Version-Branching via Duck-Typing
**What:** Detect v13 progress API availability by checking if `ui.notifications.info()` returns an object with an `update` method, rather than checking `game.version`.
**When to use:** Any time the code must branch between v12 and v13 behavior.
**Example:**
```javascript
// Source: project pattern from registerControlButton (main.js:1541-1545)
// v13 check: if ui.notifications supports progress option
static #isV13ProgressAvailable() {
  // In v13, ui.notifications is an instance of the new Notifications ApplicationV2
  // that has an update() method. In v12, it does not.
  return typeof ui.notifications?.update === "function";
}
```

### Pattern 2: ProgressReporter with Unified Interface
**What:** A class with `start(total, label)`, `update(current, label)`, and `finish()` that abstracts the v12/v13 API difference.
**When to use:** Any long-running operation that needs progress feedback.
**Example:**
```javascript
// Source: Foundry VTT v13 API docs + v12 SceneNavigation docs
class ProgressReporter {
  #notification = null;  // v13 notification object
  #total = 0;

  start(total, label) {
    this.#total = total;
    if (ProgressReporter.#isV13ProgressAvailable()) {
      this.#notification = ui.notifications.info(label, { progress: true });
    } else {
      SceneNavigation.displayProgressBar({ label, pct: 0 });
    }
  }

  update(current, label) {
    const pct = Math.min(current / this.#total, 1);
    if (this.#notification) {
      // v13: pct is 0.0-1.0
      this.#notification.update({ pct, message: label });
    } else {
      // v12: pct is 0-100
      SceneNavigation.displayProgressBar({ label, pct: Math.round(pct * 100) });
    }
  }

  finish() {
    if (this.#notification) {
      this.#notification.update({ pct: 1.0, message: "Complete" });
    } else {
      SceneNavigation.displayProgressBar({ label: "Complete", pct: 100 });
    }
    this.#notification = null;
  }
}
```

### Pattern 3: Integration Point in replaceNPCTokens
**What:** The progress reporter is created and used in the existing token processing loop.
**When to use:** In the `replaceNPCTokens()` method, wrapping the `for` loop.
**Example:**
```javascript
// In NPCTokenReplacerController.replaceNPCTokens():
const progress = new ProgressReporter();
progress.start(npcTokens.length, game.i18n.format("NPC_REPLACER.ProgressStart", { count: npcTokens.length }));

let processedCount = 0;
for (const tokenDoc of npcTokens) {
  const result = await NPCTokenReplacerController.#processToken(tokenDoc, index, processedIds);
  processedCount++;
  progress.update(processedCount, game.i18n.format("NPC_REPLACER.ProgressUpdate", {
    current: processedCount,
    total: npcTokens.length,
    name: tokenDoc.name
  }));
  // ... existing switch/case for result.status
}

progress.finish();
```

### Anti-Patterns to Avoid
- **Checking `game.version` string directly:** Brittle and inconsistent with project conventions. Use duck-typing.
- **Using `displayProgressBar` on v13:** It works but is deprecated and will be removed in v14. Use the native v13 notifications progress API.
- **Updating progress before processing:** Update progress AFTER each token completes (not before), so the percentage reflects actual completion.
- **Not handling the 0-token case:** If `npcTokens.length === 0`, don't start the progress bar. The existing code already returns early in this case.
- **Instance fields on a static class:** Unlike other project classes that use static methods, ProgressReporter needs instance state (`#notification`, `#total`) since multiple concurrent progress bars could theoretically exist. Use an instance-based class.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar UI | Custom HTML/CSS progress element | `ui.notifications.info(msg, {progress: true})` (v13) / `SceneNavigation.displayProgressBar()` (v12) | Foundry provides native progress UI that matches the application theme, handles positioning, and auto-dismisses |
| Version detection | Custom version parsing logic | Duck-typing on API shape | Project convention, more robust than string comparison |
| Progress percentage math | Complex fraction handling | Simple `current / total` | Only edge case is division by zero, guarded by the early return when `npcTokens.length === 0` |

**Key insight:** Foundry VTT already provides the progress UI -- the only custom code needed is the adapter class that bridges the two different API shapes.

## Common Pitfalls

### Pitfall 1: Different pct Scales Between v12 and v13
**What goes wrong:** v12 `displayProgressBar` uses 0-100 integer percentages. v13 `notification.update()` uses 0.0-1.0 fractions. Mixing them up produces either a stuck-at-zero or instant-100% bar.
**Why it happens:** The APIs were designed years apart and use different conventions.
**How to avoid:** The ProgressReporter class normalizes internally -- compute `current/total` as a fraction, then multiply by 100 for v12 and pass directly for v13.
**Warning signs:** Progress bar jumps to 100% immediately (used 0-100 in v13 context) or never moves (used 0.0-1.0 in v12 context).

### Pitfall 2: SceneNavigation Not Available Early
**What goes wrong:** In v12, `SceneNavigation.displayProgressBar` is a static method on the class, but if called before the UI is rendered, it may fail. In v13, this was fixed in 13.345 (issue #12910).
**Why it happens:** The SceneNavigation application may not be rendered yet during early initialization.
**How to avoid:** This phase only uses progress bars during `replaceNPCTokens()`, which runs after the game is fully initialized (triggered by user button click). No early-init risk.
**Warning signs:** Only relevant if progress were used during `Hooks.once("ready")` -- not our use case.

### Pitfall 3: Progress Notification Auto-Dismiss at 100%
**What goes wrong:** In v13, progress notifications auto-dismiss 500ms after `pct` reaches 1.0. If the finish message is important, it may vanish too quickly.
**Why it happens:** This is by design in v13 (documented in issue #13179).
**How to avoid:** The existing `#reportResults()` method already handles the summary notification separately. The progress bar reaching 100% and auto-dismissing is the desired behavior -- the results notification replaces it.
**Warning signs:** If you try to use the progress notification for the final summary, it will disappear.

### Pitfall 4: v13 Detection False Positive in Tests
**What goes wrong:** Tests mock `ui.notifications` but may accidentally give it an `update` method, causing the ProgressReporter to use v13 path when testing v12.
**Why it happens:** The foundry-test-utils mock may or may not include `update()`.
**How to avoid:** In tests, explicitly control whether `ui.notifications.update` exists or not to test both code paths independently.
**Warning signs:** v12 test path never executes.

### Pitfall 5: Replacing the Existing "Processing" Notification
**What goes wrong:** Line 1213 of main.js currently shows `ui.notifications.info("Processing N tokens...")`. If the progress bar is also shown, users see duplicate feedback.
**Why it happens:** The progress bar replaces the purpose of that static notification.
**How to avoid:** Remove or replace the existing `ui.notifications.info(Processing)` call with the `ProgressReporter.start()` call. The progress bar itself serves as the "processing" indicator.
**Warning signs:** Two overlapping notifications at the start of processing.

## Code Examples

Verified patterns from official sources:

### v12: SceneNavigation Progress Bar
```javascript
// Source: Foundry VTT v12 API - SceneNavigation.displayProgressBar
// https://foundryvtt.com/api/v12/classes/client.SceneNavigation.html
SceneNavigation.displayProgressBar({ label: "Loading tokens...", pct: 0 });
SceneNavigation.displayProgressBar({ label: "Processing 3/10...", pct: 30 });
SceneNavigation.displayProgressBar({ label: "Complete", pct: 100 });
```

### v13: Notifications Progress
```javascript
// Source: Foundry VTT v13 API - Notifications.info with progress option
// https://foundryvtt.com/api/v13/classes/foundry.applications.ui.Notifications.html
const notification = ui.notifications.info("Loading tokens...", { progress: true });
notification.update({ pct: 0.3, message: "Processing 3/10..." });
notification.update({ pct: 1.0, message: "Complete" });
// Notification auto-dismisses ~500ms after pct reaches 1.0
```

### Localization Keys for Progress Labels
```json
{
  "NPC_REPLACER": {
    "ProgressStart": "Replacing {count} tokens...",
    "ProgressUpdate": "Replacing tokens ({current}/{total}): {name}"
  }
}
```

### Test Pattern: Mocking Both v12 and v13 Paths
```javascript
// Source: project test conventions from tests/error-handling.test.js
import { vi, describe, it, expect, beforeEach } from "vitest";

describe("ProgressReporter", () => {
  describe("v13 path (notifications.update available)", () => {
    beforeEach(() => {
      // Simulate v13: ui.notifications.info returns object with update()
      const mockNotification = { update: vi.fn() };
      ui.notifications.info = vi.fn(() => mockNotification);
      ui.notifications.update = vi.fn(); // v13 has this method
    });

    it("creates progress notification on start()", () => {
      // ...
    });
  });

  describe("v12 path (SceneNavigation fallback)", () => {
    beforeEach(() => {
      // Simulate v12: no update method on notifications
      delete ui.notifications.update;
      ui.notifications.info = vi.fn(() => 42); // v12 returns a number/id
      globalThis.SceneNavigation = {
        displayProgressBar: vi.fn()
      };
    });

    it("calls SceneNavigation.displayProgressBar on start()", () => {
      // ...
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SceneNavigation.displayProgressBar({label, pct})` | `ui.notifications.info(msg, {progress: true})` + `.update()` | v13.332 (Sept 2024) | Old API deprecated, will be removed in v14 |
| pct as 0-100 integer | pct as 0.0-1.0 fraction | v13.332 (Sept 2024) | Must normalize in adapter |
| No progress return value | Returns Notification object with `.update()` | v13.332 (Sept 2024) | Enables stateful progress tracking |

**Deprecated/outdated:**
- `SceneNavigation.displayProgressBar`: Deprecated in v13, still functional (bug fix in 13.345). Will be removed in v14. Use for v12 only.

## Open Questions

1. **Exact v12 auto-dismiss behavior at pct: 100**
   - What we know: In v13, progress notifications auto-dismiss after 500ms at pct 1.0
   - What's unclear: Whether v12's `displayProgressBar` has similar auto-dismiss behavior or requires a separate call to hide
   - Recommendation: Test with `pct: 100` in v12; if the bar persists, add a brief timeout then call with `pct: 0` or empty label to dismiss. LOW impact since v12 support is legacy.

2. **v13 detection mechanism**
   - What we know: `ui.notifications.update` exists in v13 but not v12. The `info()` method returns a `Notification` object with `.update()` in v13 but a number in v12.
   - What's unclear: Whether checking `typeof ui.notifications.update === "function"` is the most reliable detection method, or if checking the return type of `info()` is better.
   - Recommendation: Check `typeof ui.notifications.update === "function"` as the primary detection since it avoids calling `info()` just to test the return type. If this proves unreliable, fall back to checking `typeof SceneNavigation?.displayProgressBar === "function"` as the v12 path.

## Sources

### Primary (HIGH confidence)
- [Foundry VTT v12 API - SceneNavigation](https://foundryvtt.com/api/v12/classes/client.SceneNavigation.html) - `displayProgressBar` signature and parameters verified
- [Foundry VTT v13 API - Notifications](https://foundryvtt.com/api/v13/classes/foundry.applications.ui.Notifications.html) - `info()` with progress option, `update()` method, pct scale (0.0-1.0)
- [Foundry VTT v13 API - NotificationOptions](https://foundryvtt.com/api/v13/interfaces/foundry.NotificationOptions.html) - `progress: true` option confirmed
- [Foundry VTT Release 13.332](https://foundryvtt.com/releases/13.332) - Progress notification introduced, displayProgressBar deprecated

### Secondary (MEDIUM confidence)
- [GitHub Issue #9637](https://github.com/foundryvtt/foundryvtt/issues/9637) - Refactor discussion, confirmed completed for v13 Prototype 1 (13.332)
- [GitHub Issue #13179](https://github.com/foundryvtt/foundryvtt/issues/13179) - v13 auto-dismiss at 100% behavior (500ms), pct uses 0-1 scale
- [Foundry VTT Release 13.345](https://foundryvtt.com/releases/13.345) - Bug fix confirming displayProgressBar still works in v13

### Tertiary (LOW confidence)
- v12 auto-dismiss at pct: 100 behavior - not verified in official docs; assumed based on standard Foundry behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Both APIs verified via official Foundry VTT API documentation
- Architecture: HIGH - ProgressReporter pattern follows established project conventions (duck-typing, separate files, instance-based when state needed)
- Pitfalls: HIGH - pct scale difference verified in official docs; auto-dismiss behavior documented in issue #13179
- v12 dismiss behavior: LOW - could not confirm auto-dismiss at pct:100 from official sources

**Research date:** 2026-03-02
**Valid until:** 2026-06-02 (stable APIs, both v12 and v13 are released versions)

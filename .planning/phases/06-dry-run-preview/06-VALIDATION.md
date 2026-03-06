---
phase: 6
slug: dry-run-preview
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x with jsdom |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | UX-03 | unit | `npx vitest run tests/lib/wildcard-resolver.test.js -x` | Partially | pending |
| 06-01-02 | 01 | 1 | UX-02 | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 | pending |
| 06-02-01 | 02 | 2 | UX-02 | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 | pending |
| 06-02-02 | 02 | 2 | UX-02 | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 | pending |
| 06-02-03 | 02 | 2 | UX-02 | unit | `npx vitest run tests/dry-run-preview.test.js -x` | No - Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/dry-run-preview.test.js` — stubs for UX-02 (computeMatches, preview dialog, replacement integration)
- [ ] Add httpTimeout tests to existing `tests/lib/wildcard-resolver.test.js` — covers UX-03

*Existing infrastructure covers test framework and mocks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Preview dialog renders correctly in Foundry | UX-02 | Requires live Foundry VTT browser environment | 1. Open a scene with NPC tokens 2. Click Replace button 3. Verify 3-column table renders with scrolling 4. Verify unmatched tokens show red "No match found" |
| Replace button disabled when all unmatched | UX-02 | Button selector varies by Foundry version | 1. Open scene with only non-matching tokens 2. Click Replace 3. Verify Replace button is disabled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

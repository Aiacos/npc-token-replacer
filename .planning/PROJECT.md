# NPC Token Replacer — Stability & Reliability Milestone

## What This Is

A Foundry VTT module (v12/v13) for D&D 5e that replaces scene NPC tokens with official WotC compendium versions while preserving position, elevation, dimensions, and other token properties. Currently at v1.4.0 with core functionality complete — this milestone focuses on making it production-grade: reliable, tested, and ready for public distribution.

## Core Value

Token replacement must work correctly and predictably every time — no silent failures, no corrupted state, no confusing errors. Users trust the module to modify their scenes safely.

## Requirements

### Validated

- ✓ Auto-detect WotC compendiums by module prefix — existing
- ✓ 4-tier compendium priority system (Adventure > Expansion > Core > Fallback) — existing
- ✓ Multi-stage name matching (exact → variant transforms → partial word) — existing
- ✓ Wildcard token path resolution with variant selection modes (none/sequential/random) — existing
- ✓ Token replacement preserving position, elevation, dimensions, visual state — existing
- ✓ Confirmation dialog with token list before replacement — existing
- ✓ Compendium selection UI with Default/All/Custom modes — existing
- ✓ Foundry v12/v13 compatibility for toolbar controls — existing
- ✓ GM-only access enforcement — existing
- ✓ Debug API via window.NPCTokenReplacer — existing
- ✓ Localization support via lang/en.json — existing
- ✓ Multi-level caching (compendium index, wildcard paths, import folders) — existing
- ✓ XSS prevention in dialog content via escapeHtml — existing

### Active

- [ ] Automated test suite with framework and core coverage
- [ ] Error handling hardening — graceful failures with clear user messages
- [ ] Fix known bugs (null pointer risk, actor race condition, empty variant edge case)
- [ ] Wildcard variant cache cleared on settings change
- [ ] Progress bar during multi-token replacements
- [ ] Dry-run preview showing matches before committing
- [ ] Performance optimization (batch token operations, wildcard probing)
- [ ] Per-compendium load error tracking for diagnostics
- [ ] Configurable HTTP timeout for wildcard probing

### Out of Scope

- Rollback/undo after partial failures — high complexity, major architectural change, defer to future
- Batch token mutations (single createEmbeddedDocuments call) — requires major refactor of replacement loop, defer
- localStorage/IndexedDB index persistence — complex browser compatibility, defer
- LRU eviction for wildcard cache — no practical scaling issue at current usage levels
- Multi-language localization — English-only for now, structure already supports expansion

## Context

- Module has been through 10 iterations of multi-agent code review (code quality, security, performance, architecture, silent failure analysis)
- ESLint reports 0 errors and 0 warnings
- Single-file architecture (~2150 lines) with well-defined OOP classes
- Zero runtime dependencies — native browser APIs only
- No test framework currently configured (package.json test script is placeholder)
- Codebase concerns document identifies specific bugs, performance bottlenecks, and fragile areas
- Users test manually in Foundry; no automated regression catching

## Constraints

- **Runtime**: Must work in Foundry VTT v12+ browser environment (ES2020+ guaranteed)
- **Architecture**: Single-file module — tests must work alongside this structure
- **Dependencies**: Minimize new dependencies; prefer zero-dep test solutions compatible with Foundry's module ecosystem
- **Compatibility**: Cannot break existing settings or behavior for current users
- **No build step**: Module has no build system — test framework must not require transpilation for the module itself

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Comprehensive scope over quick pass | Public release prep needs full confidence, not patches | — Pending |
| Test suite as top priority | Enables safe future changes and catches regressions | — Pending |
| Error handling as second priority | Users need clear feedback, not silent failures | — Pending |
| Include progress bar and dry-run | Improves perceived reliability and user confidence | — Pending |
| Test framework choice | Must work with Foundry module structure (no build step) | — Pending |

---
*Last updated: 2026-02-28 after initialization*

# NPC Token Replacer — Stability & Reliability Milestone

## What This Is

A Foundry VTT module (v12/v13) for D&D 5e that replaces scene NPC tokens with official WotC compendium versions while preserving position, elevation, dimensions, and other token properties. Production-grade with 136 automated tests, structured error handling, progress feedback, and dry-run preview.

## Core Value

Token replacement must work correctly and predictably every time — no silent failures, no corrupted state, no confusing errors. Users trust the module to modify their scenes safely.

## Requirements

### Validated

- ✓ Auto-detect WotC compendiums by module prefix — existing
- ✓ 4-tier compendium priority system (Adventure > Expansion > Core > Fallback) — existing
- ✓ Multi-stage name matching (exact → variant transforms → partial word) — existing
- ✓ Wildcard token path resolution with variant selection modes (none/sequential/random) — existing
- ✓ Token replacement preserving position, elevation, dimensions, visual state — existing
- ✓ Compendium selection UI with Default/All/Custom modes — existing
- ✓ Foundry v12/v13 compatibility for toolbar controls — existing
- ✓ GM-only access enforcement — existing
- ✓ Debug API via window.NPCTokenReplacer — existing
- ✓ Localization support via lang/en.json — existing
- ✓ Multi-level caching (compendium index, wildcard paths, import folders) — existing
- ✓ XSS prevention in dialog content via escapeHtml — existing
- ✓ Automated test suite (136 tests, Vitest + Foundry mocks) — v1.4
- ✓ Error handling hardening with structured failure classification — v1.4
- ✓ Bug fixes (stale actor cache, settings errors, cache propagation) — v1.4
- ✓ Wildcard variant cache cleared on settings change — v1.4
- ✓ Progress bar during multi-token replacements (v12/v13) — v1.4
- ✓ Dry-run preview dialog with match mapping before committing — v1.4
- ✓ Per-compendium load error tracking for diagnostics — v1.4
- ✓ Configurable HTTP timeout for wildcard probing — v1.4

### Active

- [ ] Performance optimization (batch token operations, wildcard probing)
- [ ] CI pipeline with GitHub Actions running npm test on push
- [ ] Quench in-engine integration tests for full replacement workflow

### Out of Scope

- Rollback/undo after partial failures — high complexity, major architectural change, defer to future
- Batch token mutations (single createEmbeddedDocuments call) — requires major refactor of replacement loop, defer
- localStorage/IndexedDB index persistence — complex browser compatibility, defer
- LRU eviction for wildcard cache — no practical scaling issue at current usage levels
- Multi-language localization — English-only for now, structure already supports expansion

## Context

- Shipped v1.4 with 136 automated tests across 8 test files, 58%+ coverage
- ESLint reports 0 errors and 0 warnings
- Modular architecture: main.js (~2000 lines) + scripts/lib/ (name-matcher, wildcard-resolver, logger, progress-reporter)
- Zero runtime dependencies — native browser APIs only
- Vitest 3.x with jsdom + @rayners/foundry-test-utils for Foundry global mocks
- Known future breaking change: Dialog.confirm v13 shim removed in v14

## Constraints

- **Runtime**: Must work in Foundry VTT v12+ browser environment (ES2020+ guaranteed)
- **Architecture**: Single-file module — tests must work alongside this structure
- **Dependencies**: Minimize new dependencies; prefer zero-dep test solutions compatible with Foundry's module ecosystem
- **Compatibility**: Cannot break existing settings or behavior for current users
- **No build step**: Module has no build system — test framework must not require transpilation for the module itself

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Comprehensive scope over quick pass | Public release prep needs full confidence, not patches | ✓ Good |
| Test suite as top priority | Enables safe future changes and catches regressions | ✓ Good — 136 tests |
| Error handling as second priority | Users need clear feedback, not silent failures | ✓ Good |
| Include progress bar and dry-run | Improves perceived reliability and user confidence | ✓ Good |
| Vitest 3.x + foundry-test-utils | Works with Foundry module structure, no build step | ✓ Good |
| Duck-typing for v12/v13 detection | typeof checks instead of version strings | ✓ Good |
| Flat localization keys | Avoid conflicts with existing "Error" key | ✓ Good |

---
*Last updated: 2026-03-06 after v1.4 milestone*

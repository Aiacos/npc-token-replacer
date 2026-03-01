# Requirements: NPC Token Replacer — Stability & Reliability

**Defined:** 2026-02-28
**Core Value:** Token replacement must work correctly and predictably every time — no silent failures, no corrupted state, no confusing errors.

## v1 Requirements

### Testing Infrastructure

- [x] **TEST-01**: Vitest 4 test framework configured with jsdom environment and Foundry global mocks via @rayners/foundry-test-utils
- [x] **TEST-02**: Named exports added to scripts/main.js for all classes (Logger, FolderManager, WildcardResolver, CompendiumManager, NameMatcher, TokenReplacer, NPCTokenReplacerController)
- [x] **TEST-03**: Unit tests for NameMatcher (normalizeName, findMatch exact/variant/partial stages, selectBestMatch)
- [x] **TEST-04**: Unit tests for WildcardResolver (isWildcardPath, selectVariant modes, resolveWildcardVariants with mocked fetch)
- [x] **TEST-05**: Unit tests for CompendiumManager (priority resolution, detectWOTCCompendiums filtering, getEnabledCompendiums with valid/corrupt settings)
- [x] **TEST-06**: npm test script runs all tests without a Foundry instance and exits 0

### Bug Fixes

- [x] **BUG-01**: Actor lookup map checks actor existence via game.actors.has() before use, preventing race condition when actors are deleted between lookup build and token processing
- [x] **BUG-02**: getEnabledCompendiums() uses separate try/catch blocks for settings retrieval vs JSON.parse, providing distinct error messages for each failure mode
- [x] **BUG-03**: WildcardResolver.clearCache() called in NPCTokenReplacerController.clearCache() so variant cache clears when settings change

### Error Handling

- [x] **ERR-01**: All caught exceptions in user-triggered flows call ui.notifications.error() with a localized message, not just Logger.error()
- [ ] **ERR-02**: Per-token failure types classified (no_match, import_failed, creation_failed) and collected into a post-run summary notification
- [ ] **ERR-03**: Per-compendium load success/failure tracked during loadMonsterIndex() with getLastLoadErrors() exposed via debug API

### User Experience

- [ ] **UX-01**: Live progress bar during multi-token replacement using ui.notifications progress API (v13) with SceneNavigation fallback (v12)
- [ ] **UX-02**: Dry-run preview dialog showing token-to-creature match mapping before committing replacements
- [ ] **UX-03**: Configurable HTTP timeout setting for wildcard HEAD requests (replacing hardcoded DEFAULT_HTTP_TIMEOUT_MS)

## v2 Requirements

### Integration Testing

- **ITEST-01**: Quench in-engine integration tests for full replacement workflow
- **ITEST-02**: CI pipeline with GitHub Actions running npm test on push

### Performance

- **PERF-01**: Batch token mutations (single createEmbeddedDocuments/deleteEmbeddedDocuments call)
- **PERF-02**: Early-exit wildcard probing (stop after finding 2-3 variants)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full rollback/undo after partial failure | 4x complexity of replacement itself; clear failure reporting covers 95% of need |
| localStorage/IndexedDB index persistence | Complex browser compatibility; index loads once per session (500ms) |
| LRU eviction for wildcard cache | No practical scaling issue at current usage (250KB max) |
| Multi-language localization | English-only for now; structure supports future community translations |
| Errors & Echoes telemetry | Premature without active user base; test coverage first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Complete |
| TEST-06 | Phase 1 | Complete |
| TEST-02 | Phase 2 | Complete |
| TEST-03 | Phase 3 | Complete |
| TEST-04 | Phase 3 | Complete |
| TEST-05 | Phase 3 | Complete |
| BUG-01 | Phase 4 | Complete |
| BUG-02 | Phase 4 | Complete |
| BUG-03 | Phase 4 | Complete |
| ERR-01 | Phase 4 | Complete |
| ERR-02 | Phase 4 | Pending |
| ERR-03 | Phase 4 | Pending |
| UX-01 | Phase 5 | Pending |
| UX-02 | Phase 6 | Pending |
| UX-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 — traceability complete, all 15 requirements mapped to phases 1-6*

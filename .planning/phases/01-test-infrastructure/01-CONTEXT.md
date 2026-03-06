# Phase 1: Test Infrastructure - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Configure Vitest + foundry-test-utils so `npm test` runs clean with zero errors. Establishes the structural foundation all subsequent test phases depend on. No actual unit tests are written in this phase — just the infrastructure that makes writing them possible.

</domain>

<decisions>
## Implementation Decisions

### Test file organization
- Tests live in `tests/` directory at project root, separate from source
- Test files use `*.test.js` naming convention (Vitest default)
- Directory structure mirrors source: `tests/lib/` mirrors `scripts/lib/` (Phase 2+)
- Setup and helper files go in `tests/setup/` subdirectory
- Vitest config references `tests/setup/` files via `setupFiles`

### Cache clearing in tests
- Use existing public `clearCache()` methods on each class in `beforeEach` blocks
- No test-only reset helpers — leverage the existing API surface
- Provide a template `beforeEach` pattern in setup that other test files can follow

### ESM & module handling
- Use `vitest.config.js` (plain JavaScript, no TypeScript dependency)
- Test files import via relative paths (e.g., `../../scripts/lib/name-matcher.js`)
- Vitest config uses explicit `include: ['tests/**/*.test.js']` to avoid scanning releases/, .planning/, etc.

### Coverage configuration
- Configure coverage infrastructure now so Phase 3 can use it immediately
- No coverage thresholds enforced yet — Phase 3 establishes baseline first

### Claude's Discretion
- ESM handling approach (native ESM vs Vitest transforms) — pick based on Vitest ESM support and private field compatibility
- Mock depth — determine appropriate level based on what @rayners/foundry-test-utils provides and what the codebase's classes actually reference
- Mock style — choose between factory functions or shared objects based on class interaction patterns with Foundry globals
- Coverage provider (v8 vs istanbul) — pick based on ESM compatibility and private field support
- Coverage report formats — choose sensible defaults (text + HTML suggested but Claude can adjust)
- Whether to add a smoke test in setup that validates foundry-test-utils stubs are functional

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The success criteria from ROADMAP.md are prescriptive: Vitest with jsdom environment, `unstubGlobals: true`, and foundry-test-utils as setupFiles.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `clearCache()` methods: CompendiumManager, FolderManager, WildcardResolver, NPCTokenReplacerController all expose public cache clearing — reusable in beforeEach patterns
- `getDebugAPI()`: NPCTokenReplacerController exposes public API — useful for verifying module initialization in integration tests

### Established Patterns
- All classes use ES2020+ private static fields (`#field`) — test runner must support these natively
- Module is zero-dependency (no runtime npm packages) — test setup only needs to mock Foundry globals, not third-party libraries
- All code in single `scripts/main.js` — Phase 2 will extract to `scripts/lib/`, test structure should anticipate this

### Integration Points
- `package.json`: Currently has placeholder test script — needs `vitest` dev dependency and updated scripts
- `eslint.config.js`: Already uses flat config format — may need test file globals added
- `.gitignore`: Needs `coverage/` directory exclusion for coverage reports
- No `node_modules/` in .gitignore check needed (should already be there)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-test-infrastructure*
*Context gathered: 2026-02-28*

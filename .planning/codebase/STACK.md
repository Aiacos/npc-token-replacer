# Technology Stack

**Analysis Date:** 2026-08-30

## Languages

- JavaScript (ES2022+), ES modules throughout. No TypeScript, no transpilation.

## Runtime

- **Shipped module**: Foundry VTT v13+ browser runtime (verified on v14.367)
- **Tooling**: Node.js 20 and 22 in CI; `tools/*.mjs` use `node:` built-ins only

## Frameworks

- **Foundry VTT client API** — ApplicationV2 / DialogV2 where available, AppV1
  classes as fallback, all reached through `FoundryCompat`
- **Handlebars** — Foundry's built-in templating, used by the settings form
- **Vitest 3.x** with jsdom for tests

## Key Dependencies

**Runtime: none.** The shipped module has zero dependencies.

**Development:**

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^3.1.0 | Test runner. **Pinned** — see below |
| `@vitest/coverage-v8` | ^3.1.0 | Coverage. Must share vitest's major |
| `jsdom` | ^27.0.0 | DOM for tests. **Pinned** — see below |
| `@rayners/foundry-test-utils` | ^1.2.2 | Foundry global mocks |
| `eslint` | ^10.9.1 | Linting, flat config |

### Pinned by an upstream constraint

`@rayners/foundry-test-utils@1.2.2` is its latest published release and declares:

```
peerDependencies: { vitest: "^3.1.0", jsdom: "^26.1.0 || ^27.0.0" }
```

so `vitest >=4`, `@vitest/coverage-v8 >=4` and `jsdom >=28` are blocked in
`.github/dependabot.yml`. npm refuses the vitest 4 install outright; jsdom 30
would additionally raise the Node floor above the Node 20 CI job.

## Configuration

| File | Purpose |
|------|---------|
| `module.json` | Foundry manifest. No `compatibility.maximum` — enforced by the validator |
| `package.json` | Dev dependencies and the `lint` / `validate` / `test` / `check` scripts |
| `vitest.config.js` | jsdom environment, globals, setup files, v8 coverage |
| `eslint.config.js` | Flat config: separate blocks for `scripts/`, `tools/`, `tests/` |
| `.github/dependabot.yml` | Update grouping and the three upstream pins |

## Build Configuration

No build step. `build.sh` / `build.bat` copy files and zip them.

## Platform Requirements

- Foundry VTT v13 or newer, D&D 5e system v4.0.0+
- Node 20+ for the tooling (development only)

## Constants & Configuration Values

```javascript
MODULE_ID = "npc-token-replacer"
DEFAULT_HTTP_TIMEOUT_MS = 5000
OFFICIAL_WOTC_PACKAGES  // 11 ids, the trusted whitelist
PRIORITY = { FALLBACK: 1, CORE: 2, EXPANSION: 3, ADVENTURE: 4 }
TIER = { SYSTEM, OFFICIAL, PUBLISHER, PREMIUM, MANUAL, NONE }
COMPENDIUM_DOC_CACHE_MAX = 100   // LRU
WILDCARD_CACHE_MAX = 200         // FIFO
```

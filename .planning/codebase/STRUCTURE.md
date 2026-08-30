# Codebase Structure

**Analysis Date:** 2026-08-30

## Directory Layout

```
├── module.json                 # Foundry manifest (v1.7.3, min 13 / verified 14)
├── scripts/
│   ├── main.js                 # 1220 lines — orchestration and Foundry integration
│   └── lib/                    # 1122 lines across 7 focused modules
│       ├── foundry-compat.js       # 177 — feature-detected Foundry API access
│       ├── source-detector.js      # 227 — official-content signals + priority
│       ├── compendium-selector.js  # 228 — settings form: model + AppV2/AppV1 shells
│       ├── wildcard-resolver.js    # 194 — token art path resolution
│       ├── name-matcher.js         # 177 — 3-stage creature name matching
│       ├── progress-reporter.js    #  71 — v12/v13+ progress bar abstraction
│       └── logger.js               #  48 — prefixed, level-gated logging
├── tools/                      # 509 lines — CI tooling, never shipped to users
│   ├── validate-manifest.mjs       # manifest, i18n, template and translation checks
│   ├── bump-version.mjs            # version bump across manifest, package, changelog
│   ├── dependabot-triage.mjs       # decides which dependency PRs may auto-merge
│   ├── check-foundry-version.mjs   # newest Foundry generation vs compatibility.verified
│   └── publish-foundry.mjs         # Foundry Package Release API announcement
├── templates/
│   ├── compendium-selector-body.hbs    # shared by both form shells
│   ├── compendium-selector-footer.hbs  # submit row
│   └── compendium-selector.html        # AppV1 wrapper, pulls the other two as partials
├── lang/                       # en.json and it.json, 68 keys each, parity enforced in CI
├── styles/npc-token-replacer.css
├── tests/                      # 232 tests across 16 files
├── docs/                       # COMPATIBILITY.md, DEVELOPMENT.md
├── .github/
│   ├── workflows/              # ci, release, foundry-compat, dependabot-auto-merge
│   └── dependabot.yml
├── README.md, README.it.md, CHANGELOG.md, CLAUDE.md, MIGRATION_V13.md
└── releases/                   # build output, gitignored
```

## Directory Purposes

- **`scripts/`** — the shipped module. `main.js` holds everything that touches
  Foundry globals directly; `lib/` holds units that can be tested in isolation.
- **`tools/`** — Node scripts used by CI only. Each exports pure functions so the
  logic can be unit-tested without touching the working tree.
- **`templates/`** — Handlebars. The body and footer are partials shared by the
  ApplicationV2 parts and the AppV1 wrapper, so the two shells cannot drift.
- **`tests/`** — mirrors the source layout: `tests/lib/` for `scripts/lib/`,
  `tests/tools/` for `tools/`, flat files for what lives in `main.js`.

## Key File Locations

| Looking for | File |
|-------------|------|
| Foundry API that moved between generations | `scripts/lib/foundry-compat.js` |
| Which packages count as official | `scripts/lib/source-detector.js` |
| Compendium detection, index building, priorities | `CompendiumManager` in `main.js` |
| Token replacement itself | `TokenReplacer` in `main.js` |
| Workflow orchestration, preview dialog | `NPCTokenReplacerController` in `main.js` |
| Settings registration | `registerSettings()` in `main.js` |
| Toolbar button | `registerControlButton()` in `main.js` |

## Naming Conventions

- Module files: kebab-case (`source-detector.js`)
- Classes: PascalCase, one primary class per lib file
- Private static state: `#camelCase`
- Frozen constants: `SCREAMING_SNAKE_CASE`
- Tests: `<subject>.test.js` mirroring the source path

## Where to Add New Code

| Task | Location |
|------|----------|
| A Foundry API that moved between generations | `foundry-compat.js` + tests for both paths |
| A new detection signal | `source-detector.js` |
| A newly published official WotC package | `OFFICIAL_WOTC_PACKAGES` + `KNOWN_MODULE_LABELS` |
| A new module setting | `registerSettings()` + `lang/en.json` + `lang/it.json` |
| A new field in the settings form | `compendium-selector-body.hbs` + `CompendiumSelectorModel` |
| A token property to preserve or adopt | `PRESERVED_PROPERTIES` / `#COMPENDIUM_TOKEN_FIELDS` |
| A new CI check | `tools/`, with unit tests, wired into `npm run validate` |

## Special Directories

- **`releases/`** — build output from `build.sh`. Gitignored, never edited by hand.
- **`.planning/`** — this planning workspace.
- **`coverage/`, `security-scan/`, `fix-todos/`, `_bmad*/`, `.auto-claude/`** —
  ephemeral tool state, all gitignored.

## Design Rationale

`main.js` is no longer monolithic by choice but by dependency: everything left in
it touches Foundry globals (`game`, `canvas`, `ui`, `Hooks`) directly and cannot
be unit-tested without heavy mocking. Anything that can be made pure has been
moved to `lib/`. That split is what took the suite from 136 to 232 tests.

## Imports and Dependencies

Plain ES modules, no bundler, no transpilation. `main.js` imports from `lib/`;
`lib/` modules import only `logger.js` and each other, never `main.js` — the one
place that needed the reverse (`NameMatcher` needing compendium priorities) uses
a static setter injected at load time.

## Build and Release Process

`build.sh` / `build.bat` read the manifest and produce
`releases/{id}-v{version}.zip`, including every `README*.md`. The Release
workflow drives the whole sequence from one trigger; see `docs/DEVELOPMENT.md`.

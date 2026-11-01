# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ✨ Project Overview

NPC Token Replacer is a Foundry VTT module (v13 through v14+) for D&D 5e that replaces scene NPC tokens with official WotC compendium versions while preserving position, elevation, dimensions, and other token properties.

Official content is recognised in two layers: an **exact whitelist** of the packages Wizards of the Coast publishes on Foundry (trusted by default) plus **forward-looking signals**: a book released after this version is trusted automatically when it is both WotC-authored and a protected premium package for the active system (`verified` tier), and only surfaced otherwise. Every Foundry API that moved between generations is reached through `FoundryCompat`, which feature-detects instead of checking `game.version`.

---

## 📜 Constitution — Non-Negotiable Principles

These fifteen principles govern every change to this repository. They override
convenience, speed, and personal preference. When a request conflicts with a
principle, say so, propose the compliant alternative, and only then proceed.
Each principle states the general rule first, then how it applies here.

### 🧱 I. Simplicity, Quality, Correctness & Security

Prioritise, in this order when they conflict: **correctness, security,
simplicity, readability, maintainability**. The simplest design that is correct
wins over a clever one.

1. **No dead code, no duplicated logic.** Two call sites doing the same thing
   share one implementation. Delete rather than comment out.
2. **Fail loudly at the boundary, degrade gracefully in the UI.** Throw typed
   errors (`TokenReplacerError` with a `phase`) internally; surface a localized
   notification to the user.
3. **Never widen scope on error.** A failure to read configuration falls back to
   the *conservative* option, never the permissive one.
4. **Treat every external value as untrusted.** Actor names, compendium labels
   and settings are escaped (`escapeHtml`) before reaching HTML; network paths
   are probed, never assumed.
5. **Comments explain WHY.** The code already says what. Match the density and
   idiom of the surrounding file.

### 🧩 II. Architecture Before Implementation

1. **Plan before coding.** Any change touching more than one class starts with a
   written plan: affected classes, data flow, and the tests that will prove it.
2. **One responsibility per class.** Classes stay static-only with `#private`
   state unless instance state is genuinely required.
3. **Use OOP and patterns where they pay for themselves** — the facade
   (`NPCTokenReplacerController`), the compatibility adapter (`FoundryCompat`),
   the shared model with thin framework shells (`compendium-selector.js`). Do
   not add a layer, interface or pattern that has a single trivial use.
4. **Prefer blocklists over allowlists where the domain grows** (future actor
   types), and allowlists where safety matters (preserved token properties).

### 📚 III. Research Before Integration

1. **Verify Foundry, dnd5e and library APIs against official documentation**
   before using them — never from memory. Foundry's API moves every generation.
2. **Record the finding, not just the code.** A version-specific behaviour gets
   a comment naming the generation and the deprecation horizon; a dependency
   constraint (e.g. a peer-dependency pin) is recorded in `CHANGELOG.md` and
   `docs/DEVELOPMENT.md` with the reason.
3. **Feature-detect, never version-check.** `game.version` may be logged; it
   must never drive behaviour. Resolve APIs through `FoundryCompat`.
4. **Deprecated globals are reached namespace-first** so Foundry's own
   compatibility warnings stay quiet.

### 🧪 IV. Testing Standards

Tests exist to catch regressions, not to be green.

1. **Every behavioural change ships with a test.** Bug fixes start with a test
   that fails before the fix.
2. **Test the contract, not the implementation.** Mocks execute predicates
   (`game.packs.filter = vi.fn(pred => packs.filter(pred))`), never return
   canned data that bypasses the logic under test.
3. **Cover critical workflows and failure paths**: scan → preview → replace,
   cancelled dialogs, missing compendiums, failed imports, network timeouts.
4. **Both compatibility paths are tested.** Anything routed through
   `FoundryCompat` needs a test with the modern API present *and* absent.
5. **Coverage never regresses.** Currently 320 tests; a PR that lowers the
   count needs an explicit justification in the CHANGELOG.
6. **Cache-clearing in `beforeEach`.** Static caches leak between tests; clear
   every cache the test touches.

### 🐛 V. Automated Debugging & Validation

1. **Reproduce, find the root cause, then fix.** A fix without an understood
   cause is a guess; the reproducing test stays in the suite so the failure
   cannot recur.
2. **`tools/validate-manifest.mjs` is the source of truth** for manifest
   correctness: referenced files exist, i18n keys resolve, templates resolve,
   the download URL matches the version, and `compatibility.maximum` is never
   set. A recurring class of mistake becomes a new validator check.
3. **Debug surface stays available**: `window.NPCTokenReplacer` exposes the
   debug API, and `Logger.debug` output is gated behind a flag, never removed.
4. **Diagnostics record the "why"**: detection logs the tier and priority that
   led to each decision, so a misclassification is diagnosable from the console
   alone.

### ✅ VI. Pre-Commit Gate

1. **`npm run check` passes before every commit**: lint → manifest/i18n/template
   validation → tests. This project has no build or type-check step (plain ES
   modules, no TypeScript) and no separate formatter — ESLint is the style
   gate (`npm run lint:fix` for auto-fixable issues). If a formatter, type
   check or build step is added, it joins `npm run check`.
2. **Fix failures, never bypass them.** No `--no-verify`, no `eslint-disable`
   without a reason comment, no skipped or `.only` tests left behind.
3. **Secrets are scanned before commit** (gitleaks pre-commit hook where
   installed).

### 🔄 VII. CI/CD

1. **CI enforces what the pre-commit gate checks**: lint, validation, tests on
   every supported Node version, plus a package smoke test. Nothing merges to
   `main` red.
2. **Releases are reproducible from a single trigger.** The Release workflow
   bumps, tags, builds, verifies, publishes to GitHub and announces to the
   Foundry package registry.
3. **Nothing is published that was not validated** — the manifest validator
   runs against the exact version being shipped.
4. **The pipeline maintains itself**: Dependabot updates actions and dev
   dependencies; the compatibility watch opens a PR when Foundry ships a new
   generation.
5. **A workflow never fails for a reason outside its job.** Network lookups
   degrade to a no-op; `set -euo pipefail` traps are checked for `&&`
   short-circuit bugs.

### ⚡ VIII. Performance

Measure first; optimise only a verified bottleneck, and never at the cost of
correctness or readability.

1. **Index once, reuse.** Compendium indexes, wildcard resolutions, actor
   lookups and compendium documents are cached; caches are explicitly bounded
   (LRU/FIFO) and cleared through `clearCache()`.
2. **No unbounded growth.** Any new cache declares a maximum size.
3. **Yield to the UI in long loops** (`await new Promise(r => setTimeout(r, 0))`
   every ~10 iterations) so the client never freezes.
4. **Network calls are timeout-bounded** and configurable (`httpTimeout`).
5. **Prefer O(1) lookups over scans**: name matching goes through prebuilt
   `Map` indexes, never a linear search over the full index.

### 🎯 IX. User Experience Consistency

1. **All user-facing text goes through `game.i18n`.** No hardcoded strings —
   CI fails on a key used in source but missing from `lang/en.json`.
2. **Key naming is `NPC_REPLACER.<Category>.<Key>`.** No exceptions; the same
   concept uses the same term in every string, dialog and doc.
3. **Destructive actions are always previewed.** The dry-run dialog is not
   optional; it lists what will change before anything changes.
4. **Every long operation reports progress** through `ProgressReporter`.
5. **Every failure the user can act on produces a notification**; everything
   else goes to the log at `debug` level.
6. **The GM can always override automatic behaviour.** Auto-detection is a
   convenience, never a cage — see the `additionalSources` setting.

### 🤖 X. Subagent Use

1. **Delegate breadth, keep depth.** Use subagents for clearly scoped,
   read-mostly sweeps across many files where only the conclusion matters; do
   focused edits directly.
2. **Brief them fully.** Each agent gets an explicit responsibility, the files
   to read, what is already ruled out, and the shape of the answer expected.
3. **One agent per independent question**, launched in parallel — never a chain
   of agents for a task a single search answers, and never one for a single
   known lookup.
4. **Never delegate a decision.** Agents gather evidence; the decision, the
   edit and the responsibility stay in the main thread.
5. **Verify agent findings before acting** on them; a confident report is not
   evidence.

### 🧰 XI. Plugins & Skills

1. **Use Superpowers and Impeccable skills wherever they are installed and fit
   the task** — e.g. brainstorming/writing-plans before new features,
   test-driven-development for behaviour changes, systematic-debugging for
   failures, verification-before-completion before claiming done, and
   Impeccable's design skills for UI and template work.
2. **The skill serves the constitution, not the reverse.** Where a skill's
   default conflicts with a principle here, this file wins.

### 📝 XII. Documentation

1. **Docs state the current truth.** Technical docs (`CLAUDE.md`, `docs/`) and
   user docs (`README.md`, `README.it.md`) are updated in the same change that
   alters implementation, configuration, workflow or a known limitation.
   Delete stale statements rather than layering corrections on top.
2. **User-facing changes update both READMEs**; the parity check keeps their
   structure aligned.
3. **Known limitations are written down**, not left for users to discover.

### 📋 XIII. Project Ledgers

`TODO.md`, `SECURITY.md` and `CHANGELOG.md` stay short, scannable and easy to
update. Each keeps its own purpose — no file duplicates another.

1. **`TODO.md`** — open work only, as a checklist (`- [ ]`) grouped by priority,
   each item linking to the file, issue or PR it concerns. Done items are
   removed (their record lives in the CHANGELOG), not left ticked forever.
2. **`SECURITY.md`** — supported versions, how to report a vulnerability, and a
   checklist of the module's security-relevant surfaces (HTML escaping,
   network probes, secrets handling) with their current status.
3. **`CHANGELOG.md`** — every release, under Keep a Changelog headings; work in
   progress accumulates under `[Unreleased]`.

### 🎨 XIV. Icon Consistency

The same concept carries the same icon in `README.md`, `README.it.md`,
`CLAUDE.md` and `docs/`:

| Icon | Concept |
|------|---------|
| ✨ | Features / what the module does |
| 📚 | Official D&D content, compendiums, sources |
| ⚙️ | Settings and configuration |
| 📦 | Installation and packaging |
| 🎯 | Usage and workflow |
| 🔍 | Name matching and detection |
| 🧩 | Architecture and internals |
| 🧪 | Testing |
| 🔄 | CI/CD, releases, automation |
| 🛡️ | Compatibility and version policy |
| 🔐 | Security |
| 📋 | Project ledgers (TODO, tracked work) |
| 🐛 | Troubleshooting and debugging |
| 📜 | Principles, licence, credits |

### 🧹 XV. Repository Hygiene & Cleanup

1. **Clean up regularly.** Each release cycle, look for dead code, unused
   exports, unused dev dependencies, obsolete files and duplicate
   implementations, and remove them.
2. **Cleanup must be proven safe**: `npm run check` passes before and after,
   and test count only drops with a CHANGELOG justification.
3. **Only durable artifacts are tracked.** Session state, scan output, coverage
   reports and build output are gitignored.
4. **One config file per tool.** Duplicate or dead configuration is deleted.
5. **Secrets never enter the repository** — not in code, not in fixtures, not
   in tracked config.
6. **`releases/` is build output**: never edited by hand.

---

## 🧩 Development Setup

This is a Foundry VTT module with no build system - plain JavaScript ES modules. To develop:

1. Symlink or copy the module to Foundry's `Data/modules/npc-token-replacer/` directory
2. Enable the module in a D&D 5e world
3. Changes to `scripts/main.js` or `scripts/lib/*.js` require a browser refresh (F5)

The `releases/` folder contains packaged releases - do not edit files there directly.

## 🔄 Build & Release

### Build the package

```bash
bash build.sh      # Linux/macOS
build.bat          # Windows
```

The build script auto-detects module ID, version, and GitHub URL from `module.json`. It creates a clean ZIP in `releases/{id}-v{version}.zip` with the download URL already set in the packaged module.json.

### Publish a new release (automated)

Releases run from **Actions → Release → Run workflow**. Pick a bump (`patch`,
`minor`, `major`, or an explicit `x.y.z`) and the workflow does everything:

1. lint + unit tests
2. bump `module.json`, `package.json`, `package-lock.json` and `scripts/lib/version.js`, and promote the CHANGELOG `[Unreleased]` section
3. validate the manifest against the exact version being shipped
4. commit `chore: release vX.Y.Z`, tag `vX.Y.Z`, push both
5. build and verify the ZIP (manifest and `CODE_VERSION` match the release, every tracked runtime file present)
6. rewrite the standalone `module.json` download/manifest URLs for this release
7. create the GitHub release with both assets (`--prerelease` when the version has a hyphen)
8. announce the release to the Foundry package registry

Pushing a `vX.Y.Z` tag by hand runs lint, tests and validation, then the same
pipeline from step 5, after verifying the tag matches `module.json`.

> **Why `module.json` is uploaded separately**: Foundry VTT downloads the standalone `module.json` first (via the manifest URL) to discover the module version and its download URL. The ZIP also contains a `module.json` but that's only used after installation.

### Repository secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `GITHUB_TOKEN` | provided by Actions | Create the release, push the tag, open compatibility PRs |
| `FOUNDRY_PACKAGE_TOKEN` | optional | Announce releases on the Foundry package registry. Without it that step logs a skip instead of failing. |

### Self-maintaining automation

- **`foundry-compat.yml`** runs weekly, compares the newest published Foundry
  generation with `compatibility.verified`, and opens a PR bumping it (with a
  manual smoke-test checklist) when Foundry moves ahead.
- **Dependabot** keeps the workflow actions and dev dependencies current.
- **`compatibility.maximum` must stay unset** — the manifest validator fails the
  build if it is set, because it would lock the module out of future Foundry
  generations.

### Foundry VTT Manifest URL

```
https://github.com/Aiacos/npc-token-replacer/releases/latest/download/module.json
```

## 🧩 Architecture

**Modular design**: `scripts/main.js` (~750 lines) is the Foundry entry point — the token workflow (`TokenReplacer`), the orchestrating controller, settings registration, the Actors-tab button and the hooks. Everything with a single, separable job lives in `scripts/lib/`. No build system — plain JavaScript ES modules; no `lib` file imports `main.js`.

### File Structure

```
scripts/
├── main.js                     # TokenReplacer, NPCTokenReplacerController,
│                               # registerSettings(), registerActorDirectoryButton(), hooks
└── lib/
    ├── actor-importer.js       # ActorImporter — world-actor resolution + D&D Beyond in-place overwrite
    ├── compendium-docs.js      # CompendiumDocs — bounded FIFO cache of compendium documents
    ├── compendium-manager.js   # CompendiumManager — source detection, enabled packs, monster index
    ├── compendium-selector.js  # Settings form: shared model + AppV2/AppV1 shells
    ├── errors.js               # TokenReplacerError (phase-tagged)
    ├── folder-manager.js       # FolderManager — import folder
    ├── foundry-compat.js       # FoundryCompat (feature-detected Foundry API access)
    ├── html.js                 # escapeHtml
    ├── logger.js               # Logger + MODULE_ID
    ├── name-matcher.js         # NameMatcher (multi-stage creature name matching)
    ├── preview-dialog.js       # PreviewDialog — the mandatory dry-run preview (pure buildContent + confirm)
    ├── progress-reporter.js    # ProgressReporter (notification progress bars)
    ├── source-detector.js      # SourceDetector (official-content tiers + priority)
    ├── startup-notices.js      # StartupNotices — new-book and stale-code notices at ready
    ├── version.js              # CODE_VERSION — kept equal to module.json by bump-version, checked by the validator
    └── wildcard-resolver.js    # WildcardResolver (HEAD-probe token art paths)

tools/
├── validate-manifest.mjs       # Manifest, i18n, template, README-parity and CODE_VERSION validation (npm run validate)
├── bump-version.mjs            # Version bump: module.json, package.json, package-lock.json, version.js, CHANGELOG
├── check-foundry-version.mjs   # Newest published Foundry generation vs. compatibility.verified
├── dependabot-triage.mjs       # Decides which Dependabot PRs auto-merge
└── publish-foundry.mjs         # Foundry Package Release API announcement

.github/
├── dependabot.yml              # Dependabot config (actions + dev dependencies, blocked majors ignored)
└── workflows/
    ├── ci.yml                  # Lint, validate, test matrix, package smoke test (every runtime file)
    ├── release.yml             # One-trigger release: bump → tag → build → verify → publish
    ├── foundry-compat.yml      # Weekly watch: opens a PR when Foundry ships a new generation
    └── dependabot-auto-merge.yml # Daily triage of Dependabot PRs
```

### Class Diagram

```mermaid
graph TD
    Main["main.js<br/>hooks · settings · Actors-tab button"] --> Controller
    Controller["NPCTokenReplacerController<br/>validate → scan → plan → preview → overwrite → replace → report"]

    Controller --> CM["CompendiumManager<br/>detect sources + build index"]
    Controller --> TR["TokenReplacer<br/>collect tokens · replace on own scene"]
    Controller --> AI["ActorImporter<br/>world actors + D&D Beyond overwrite"]
    Controller --> PD["PreviewDialog<br/>dry-run preview"]
    Controller --> NM["NameMatcher"]
    Main --> SN["StartupNotices"]

    TR --> AI
    TR --> CD["CompendiumDocs<br/>document cache"]
    TR --> WR["WildcardResolver"]
    AI --> CD
    AI --> FM["FolderManager"]
    CM --> SD["SourceDetector<br/>tiers + priority"]
    NM -. late-bound .-> CM
    SN --> CM
    PD --> FC["FoundryCompat"]
    CS["compendium-selector.js"] --> FC
```

### Class Responsibilities

| Class | Responsibility | Key Methods |
|-------|---------------|-------------|
| **NPCTokenReplacerController** | Orchestrates one run and owns the run lock; defers `clearCache()` requested mid-run | `replaceNPCTokens()`, `validatePrerequisites()`, `computeMatches()`, `planActorOverwrites()`, `clearCache()`, `initialize()`, `getDebugAPI()` |
| **TokenReplacer** | Picks the tokens to process (all scenes or the selection, skipping already-replaced and in-combat tokens) and replaces each on its own scene | `getNPCTokensToProcess()`, `replaceToken()`, `sceneOf()`, `extractTokenProperties()`, `clearActorLookup()` |
| **ActorImporter** | Which world actor a replaced token uses: already imported → D&D Beyond actor overwritten in place → fresh import | `buildActorLookup()`, `resolveWorldActor()`, `findOverwriteTarget()`, `overwriteImportedActor()`, `getImportedActors()`, `clear()` |
| **CompendiumDocs** | Bounded FIFO cache of `pack.getDocument()` (max 100) | `load()`, `clear()` |
| **PreviewDialog** | The dry-run preview: token table (with scene), D&D Beyond actor table, skipped tokens, overwrite warning; timeout | `buildContent()` (pure), `confirm()` |
| **StartupNotices** | One-time notice for new official books; stale cached code warning | `notifyNewOfficialSources()`, `checkLoadedCodeVersion()` |
| **CompendiumManager** | Detects official compendiums, resolves the enabled set, builds the monster index and its maps | `detectWOTCCompendiums()`, `getEnabledCompendiums()`, `loadMonsterIndex()`, `getCompendiumPriority()`, `isOfficialSource()`, `clearCache()` |
| **SourceDetector** | Classifies a pack into a tier and derives its priority | `classify()`, `PRIORITY`, `TIER`, `OFFICIAL_WOTC_PACKAGES` |
| **NameMatcher** | Normalizes creature names and matches them in stages | `findMatch()`, `normalizeName()`, `selectBestMatch()` |
| **WildcardResolver** | Resolves wildcard token art (`specter-*.webp`) by HEAD probes | `resolve()`, `resolveWildcardVariants()`, `selectVariant()`, `clearCache()` |
| **FolderManager** | Finds or creates the import folder | `getOrCreateImportFolder()`, `getFolderPath()`, `clearCache()` |
| **FoundryCompat** | Feature-detected access to APIs that moved between generations | `confirmDialog()`, `supportsApplicationV2`, `toElement()` |
| **ProgressReporter** | Progress bars in notifications | `start()`, `update()`, `finish()` |
| **Logger** | Prefixed, level-gated logging | `log()`, `warn()`, `error()`, `debug()` |
| **TokenReplacerError** | Error tagged with the phase that failed (`import_failed`, `creation_failed`, `delete_failed`) | — |
| **CompendiumSelectorModel** / **buildCompendiumSelectorForm()** | Settings form logic and the AppV2 (else AppV1) shell | `getContext()`, `save()`, `attachModeListeners()` |

### Key Features by Component

**Compendium Detection** (`CompendiumManager` + `SourceDetector`): two deliberate layers.

1. **Whitelist** — `OFFICIAL_WOTC_PACKAGES`, the 14 packages Wizards of the Coast publishes on Foundry VTT. Exact, no false positives, trusted by default. Package-id prefixes (`dnd-`, `ddb-`) are **not** a signal: they also match third-party importers, homebrew and community adventures.
2. **Forward-looking signals** — these catch books released after this version, without a module update:
   - WotC/Foundry Gaming authorship **and** a protected premium package declaring the active system → `verified` tier, **trusted by default** like the whitelist. Authorship alone can be typed into any manifest; `protected` packages go through Foundry's premium distribution. The GM is notified once (`notifyNewOfficialSources`).
   - Authorship alone (`publisher`), premium content from other publishers (`premium`), or package ids in `additionalSources` (`manual`) → detected, listed in the picker and (for `publisher`) announced once, but only used under "Everything Detected" or an explicit selection.

**Priority System** (`SourceDetector.classify`): 4 tiers (Adventure > Expansion > Core > Fallback); within a tier the Monster Manual wins (`SourceDetector.bestiaryRank`, the DMG/PHB ship some incomplete creature actors), then compendium id. Known packages keep their curated priority; unknown packages are classified from what their module actually ships — an Adventure pack means adventure content, Scene packs mean a setting book, neither means a rulebook.

**Selection Modes** (`enabledCompendiums` setting): `default` = every official source (the shipped default), `core` = official SRD + rulebooks only (also the fallback when the setting is unreadable), `all` = everything detected including premium and manual sources, or an explicit list of pack collection ids.

**Name Matching** (`NameMatcher.findMatch`): Exact match → variant transforms (removes prefixes/suffixes) → partial word matching

**Token Replacement** (`TokenReplacer.replaceToken`): Handles wildcard token art paths (`*.webp`), resolves the world actor, creates tokens with preserved properties on the token's own scene (`tokenDoc.parent`, never `canvas.scene` — the preview is non-modal).

**Token scope** (`getNPCTokensToProcess`): the selected NPC tokens if any, otherwise NPC tokens on **every scene** of the world (`game.scenes`); no scene needs to be open. A world-wide run skips tokens this module already created (`flags.npc-token-replacer.replaced` — re-creating them would reset hit points and conditions) and tokens in an encounter (deleting a token removes its combatant); a selection forces them. Each token is mutated on its own scene (`sceneOf`), and the processed set is keyed by token **uuid** because token ids are only unique within a scene. A selection also scopes the D&D Beyond actor pass to the selected tokens' actors.

**One button, two passes** (`replaceNPCTokens`): `planActorOverwrites()` pairs every D&D Beyond Importer actor in the world with an official entry by **exact normalized name** (no variants — the overwrite is destructive); the single preview lists those and the scene's token matches; on confirm, actors are overwritten first, then tokens are replaced and reuse them. Placed tokens are independent copies of the prototype: overwriting an actor updates linked/unlinked token *stats* (unlinked via ActorDelta, keeping per-token overrides) but not their art/size — only token replacement does that.

**World actor resolution** (`ActorImporter.resolveWorldActor`), in order: an actor already imported from the same compendium entry → a D&D Beyond Importer actor with the same name, overwritten in place via `update(data, {diff: false, recursive: false})` keeping folder/ownership/sort and every non-D&D-Beyond flag (setting `overwriteImportedActors`, listed in the preview, skipped entirely if any compendium failed to load) → a fresh import into the module folder.

**Caches** (private static fields; every one is cleared by `NPCTokenReplacerController.clearCache()` or at the end of a run):
- `CompendiumManager.#wotcCompendiumsCache`, `#classifications`: detected packs and their tier/priority
- `CompendiumManager.#enabledPacksCache`: the resolved enabled set
- `CompendiumManager.#indexCache`, `#indexMap`, `#wordIndex`: monster index and its name/word maps (a partial index after a load error is served once, never cached); `#lastLoadErrors`
- `FolderManager.#importFolderCache`: import folder
- `WildcardResolver.#variantCache`: resolved wildcard paths (FIFO, max 200; partial network failures are not cached)
- `CompendiumDocs` cache: `pack.getDocument()` results (FIFO, max 100)
- `ActorImporter.#actorLookup` (per run): compendium uuid → world actor, from `flags.npc-token-replacer.sourceUuid`, then `_stats.compendiumSource`, then `flags.core.sourceId`
- `ActorImporter.#importedActors`, `#importedActorsByName` (per run): D&D Beyond Importer monsters (`npc` + `flags.ddbimporter.id`, checked **before** `compendiumSource`, which DDB actors always carry) not yet overwritten
- `TokenReplacer.#sequentialCounter`, `#variationMode` (per run)
- `NPCTokenReplacerController.#isProcessing`, `#clearPending`: run lock and deferred clear

### Foundry Integration Points

- `Hooks.once("init")`: Register settings
- `Hooks.once("ready")`: Compare `CODE_VERSION` with the installed manifest (`StartupNotices.checkLoadedCodeVersion`) and warn the GM to hard-reload if the browser runs cached older files; then, **GM only**, initialize the controller, notify once about new official books (`StartupNotices.notifyNewOfficialSources`, remembered in the hidden `notifiedSources` setting) and pre-cache the monster index
- `Hooks.on("renderActorDirectory")`: Add the replace button to the Actors tab footer — v13/v14 `DocumentDirectory` renders a `footer` part, and the hook passes the app `HTMLElement` (`hookEvents.renderApplicationV2`); it fires on every re-render, so the button is added once
- `window.NPCTokenReplacer`: Debug API exposed globally via `NPCTokenReplacerController.getDebugAPI()`

## 🧩 Key Patterns

**Version Compatibility**: Never branch on `game.version`. Foundry APIs that moved between generations are reached through `FoundryCompat`, which resolves the namespaced API first and only falls back to the deprecated global.

**Application Framework**: `buildCompendiumSelectorForm()` resolves its base class *at registration time*. A `class X extends FormApplication` declaration would evaluate the global at module load and break the whole module on a Foundry version that removed it (planned for v16).

**Settings Storage**: Compendium selection is stored as JSON string (`JSON.stringify`/`JSON.parse`) for reliability across Foundry versions.

**Wildcard Token Resolution**: Monster Manual 2024 uses wildcard patterns like `specter-*.webp`. The `WildcardResolver` class probes for numbered variants (1-5, 01-05, a-e) via HEAD requests and selects based on variation mode setting.

**Private Fields**: State lives in ES private fields (`#field`) — static for the namespace-like classes; `ProgressReporter` and `CompendiumSelectorModel` are the deliberate instance-based exceptions.

**Static Methods**: Most classes use static methods since they don't need instance state - this simplifies the API and avoids instantiation overhead.

**Blocklists over allowlists for forward compatibility**: `CompendiumManager.isCreatureEntry` excludes known non-creature actor types rather than listing the allowed ones, so an actor type introduced by a future system version is still indexed.

## 🐛 Console Debugging

```javascript
NPCTokenReplacer.replaceNPCTokens();      // Run replacement
NPCTokenReplacer.detectWOTCCompendiums(); // List detected compendiums
NPCTokenReplacer.getEnabledCompendiums(); // List enabled compendiums
NPCTokenReplacer.clearCache();            // Force index reload
NPCTokenReplacer.getNPCTokensFromScene(); // Get NPC tokens in the scene open on the canvas
NPCTokenReplacer.findInMonsterManual(name, index); // Find creature in index
NPCTokenReplacer.getOrCreateImportFolder(); // Get/create import folder
NPCTokenReplacer.getLastLoadErrors();     // Compendiums that failed to index
NPCTokenReplacer.debugEnabled = true;     // Verbose logging, including detection tiers
```

## ⚙️ Localization

All user-facing strings use `game.i18n` with keys from `lang/en.json` (mirrored in `lang/it.json`). New keys follow `NPC_REPLACER.<Category>.<Key>`; the older flat keys (`NPC_REPLACER.Button`, …) are kept so existing translations keep working. Keys must appear as complete string literals so the validator can check them; runtime-built keys (`NPC_REPLACER.Tier.${tier}`) are covered by a unit test.

## 🧩 Utility Functions

Standalone functions:
- `registerSettings()` (`main.js`): registers module settings during the init hook
- `registerActorDirectoryButton(app, html)` (`main.js`): adds the replace button to the bottom of the Actors sidebar tab (GM only)
- `escapeHtml(str)` (`lib/html.js`): escapes HTML special characters for dialogs and notifications

## ⚙️ Configuration Constants

```javascript
const MODULE_ID = "npc-token-replacer";           // Module identifier
const DEFAULT_HTTP_TIMEOUT_MS = 5000;             // HTTP timeout for HEAD requests
const OFFICIAL_WOTC_PACKAGES = [ /* 14 ids */ ];  // Authoritative whitelist
const KNOWN_MODULE_LABELS = {...};                // Human-readable book names
const OFFICIAL_AUTHOR_PATTERN = /wizards of the coast|foundry gaming/i;
const PRIORITY = { FALLBACK: 1, CORE: 2, EXPANSION: 3, ADVENTURE: 4 };
const TIER = { SYSTEM, OFFICIAL, VERIFIED, PUBLISHER, PREMIUM, MANUAL, NONE };
const KNOWN_PRIORITIES = {...};                   // Priorities for the whitelist
```

## 🧪 Quality Gate

```bash
npm run lint       # ESLint over scripts/, tools/ and tests/
npm run validate   # module.json, referenced files, i18n keys, template paths
npm test           # Vitest unit suite
npm run check      # All three, in order — run this before pushing
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ✨ Project Overview

NPC Token Replacer is a Foundry VTT module (v13 through v14+) for D&D 5e that replaces scene NPC tokens with official WotC compendium versions while preserving position, elevation, dimensions, and other token properties.

Official content is recognised in two layers: an **exact whitelist** of the packages Wizards of the Coast publishes on Foundry (trusted by default) plus **forward-looking signals** that surface books released after this version without trusting them silently. Every Foundry API that moved between generations is reached through `FoundryCompat`, which feature-detects instead of checking `game.version`.

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
5. **Coverage never regresses.** Currently 265 tests; a PR that lowers the
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
2. bump `module.json`, `package.json` and promote the CHANGELOG `[Unreleased]` section
3. validate the manifest against the exact version being shipped
4. commit `chore: release vX.Y.Z`, tag `vX.Y.Z`, push both
5. build and verify the ZIP (manifest version matches, required files present)
6. rewrite the standalone `module.json` download/manifest URLs for this release
7. create the GitHub release with both assets (`--prerelease` when the version has a hyphen)
8. announce the release to the Foundry package registry

Pushing a `vX.Y.Z` tag by hand runs the same pipeline from step 5, after
verifying the tag matches `module.json`.

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

**Modular OOP design**: Core orchestration in `scripts/main.js` (~1260 lines) with supporting classes extracted to `scripts/lib/`. No build system — plain JavaScript ES modules.

### File Structure

```
scripts/
├── main.js                     # FolderManager, CompendiumManager, TokenReplacer,
│                               # NPCTokenReplacerController,
│                               # registerSettings(), registerControlButton(), escapeHtml()
└── lib/
    ├── logger.js               # Logger class + MODULE_ID constant
    ├── foundry-compat.js       # FoundryCompat (feature-detected Foundry API access)
    ├── source-detector.js      # SourceDetector (official-content signals + priority)
    ├── compendium-selector.js  # Settings form: shared model + AppV2/AppV1 shells
    ├── name-matcher.js         # NameMatcher (multi-stage creature name matching)
    ├── wildcard-resolver.js    # WildcardResolver (HEAD-probe token art paths)
    └── progress-reporter.js    # ProgressReporter (v12/v13+ progress bar abstraction)

tools/
├── validate-manifest.mjs       # Manifest, i18n and template validation (npm run validate)
├── bump-version.mjs            # Version bump across module.json/package.json/CHANGELOG
├── check-foundry-version.mjs   # Newest published Foundry generation vs. compatibility.verified
└── publish-foundry.mjs         # Foundry Package Release API announcement

.github/workflows/
├── ci.yml                      # Lint, validate, test matrix, package smoke test
├── release.yml                 # One-trigger release: bump → tag → build → publish
└── foundry-compat.yml          # Weekly watch: opens a PR when Foundry ships a new generation
```

### Class Hierarchy Diagram

```mermaid
graph TD
    Controller["NPCTokenReplacerController<br/>facade: validate → scan → preview → replace → report"]

    Controller --> CM["CompendiumManager<br/>detect sources + build index"]
    Controller --> TR["TokenReplacer<br/>token operations"]
    Controller --> NM["NameMatcher<br/>multi-stage name matching"]
    Controller --> PR["ProgressReporter<br/>progress bars"]
    Controller --> FC

    CM --> SD["SourceDetector<br/>official-content signals + priority"]
    NM --> CM
    TR --> WR["WildcardResolver<br/>token art path resolution"]
    TR --> FM["FolderManager<br/>import folders"]
    PR --> FC

    CS["compendium-selector.js<br/>shared model + AppV2 / AppV1 shells"] --> FC
    CS --> CM

    FC["FoundryCompat<br/>feature-detected Foundry API access"] --> API(["Foundry VTT client API"])

    Logger["Logger<br/>prefixed, level-gated logging"] -.-> Controller
```

### Class Responsibilities

| Class | Responsibility | Key Methods |
|-------|---------------|-------------|
| **NPCTokenReplacerController** | Main facade that orchestrates token replacement workflow, validates prerequisites, and coordinates all operations | `replaceNPCTokens()`, `validatePrerequisites()`, `showPreviewDialog()`, `computeMatches()`, `clearCache()`, `initialize()`, `getDebugAPI()` |
| **CompendiumManager** | Detects WOTC compendiums, manages enabled compendiums, loads monster indexes, handles compendium priorities | `detectWOTCCompendiums()`, `getEnabledCompendiums()`, `loadMonsterIndex()`, `getCompendiumPriority()`, `clearCache()` |
| **TokenReplacer** | Handles token replacement operations, imports actors, creates new tokens with preserved properties | `replaceToken()`, `extractTokenProperties()`, `getNPCTokensToProcess()`, `getNPCTokensFromScene()`, `resetCounter()` |
| **NameMatcher** | Normalizes creature names and matches them to compendium entries using multi-stage matching | `findMatch()`, `normalizeName()`, `selectBestMatch()` |
| **WildcardResolver** | Resolves Monster Manual 2024 wildcard token paths (e.g., `specter-*.webp`) to actual files | `resolve()`, `resolveWildcardVariants()`, `selectVariant()`, `isWildcardPath()`, `clearCache()` |
| **FolderManager** | Manages Actor folders for compendium imports | `getOrCreateImportFolder()`, `getFolderPath()`, `clearCache()` |
| **Logger** | Provides centralized logging with module prefix | `log()`, `error()`, `warn()`, `debug()` |
| **ProgressReporter** | Unified progress bar abstraction for v12/v13 (duck-typed version detection) | `start()`, `update()`, `finish()` |
| **FoundryCompat** | Feature-detected access to Foundry APIs that moved between generations (Dialog/DialogV2, FormApplication/ApplicationV2, SceneNavigation, template loader) | `generation`, `DialogV2`, `LegacyDialog`, `supportsApplicationV2`, `confirmDialog()`, `toElement()` |
| **SourceDetector** | Recognises official D&D packages from signals and derives their priority dynamically | `classify()`, `PRIORITY`, `TIER`, `OFFICIAL_PREFIXES` |
| **CompendiumSelectorModel** | Framework-agnostic logic behind the settings form (context, save, mode toggling) | `getContext()`, `save()`, `attachModeListeners()` |
| **buildCompendiumSelectorForm()** | Factory returning an ApplicationV2 shell when available, else the legacy FormApplication shell | — |

### Key Features by Component

**Compendium Detection** (`CompendiumManager` + `SourceDetector`): two deliberate layers.

1. **Whitelist** — `OFFICIAL_WOTC_PACKAGES`, the 11 packages Wizards of the Coast publishes on Foundry VTT. Exact, no false positives, trusted by default. Package-id prefixes (`dnd-`, `ddb-`) are **not** a signal: they also match third-party importers, homebrew and community adventures.
2. **Forward-looking signals** — WotC/Foundry Gaming authorship (`publisher` tier) or premium content declaring the active system (`premium` tier), plus package ids the GM lists in `additionalSources` (`manual` tier). These catch books released after this version. They are detected, logged and listed in the picker, but only used when the GM selects "Everything Detected" — never trusted silently.

**Priority System** (`SourceDetector.classify`): 4 tiers (Adventure > Expansion > Core > Fallback). Known packages keep their curated priority; unknown packages are classified from what their module actually ships — an Adventure pack means adventure content, Scene packs mean a setting book, neither means a rulebook.

**Selection Modes** (`enabledCompendiums` setting): `default` = every official source (the shipped default), `core` = SRD + rulebooks only, `all` = everything detected including premium and manual sources, or an explicit list of pack collection ids.

**Name Matching** (`NameMatcher.findMatch`): Exact match → variant transforms (removes prefixes/suffixes) → partial word matching

**Token Replacement** (`TokenReplacer.replaceToken`): Handles wildcard token art paths (`*.webp`), resolves the world actor, creates tokens with preserved properties on the token's own scene (`tokenDoc.parent`, never `canvas.scene` — the preview is non-modal).

**World actor resolution** (`#getOrImportWorldActor`), in order: an actor already imported from the same compendium entry → a D&D Beyond Importer actor with the same name, overwritten in place via `update(data, {diff: false, recursive: false})` keeping folder/ownership/sort (setting `overwriteImportedActors`, listed in the preview) → a fresh import into the module folder.

**Caches** (class private static fields):
- `CompendiumManager.#indexCache`: Combined monster index from all enabled compendiums
- `CompendiumManager.#wotcCompendiumsCache`: Detected WotC compendiums
- `FolderManager.#importFolderCache`: Actor folder for imports
- `WildcardResolver.#variantCache`: Resolved wildcard paths
- `TokenReplacer.#actorLookup`: Session-scoped UUID→world Actor map (prevents duplicate imports); keyed by `flags.npc-token-replacer.sourceUuid`, then `_stats.compendiumSource`
- `TokenReplacer.#importedActorsByName`: Session-scoped name→world Actor map of D&D Beyond Importer monsters (`npc` + `flags.ddbimporter.id`) not yet overwritten
- `TokenReplacer.#compendiumDocCache`: LRU cache for `pack.getDocument()` results (max 100)
- `NPCTokenReplacerController.#isProcessing`: Execution lock
- `TokenReplacer.#sequentialCounter`: Token variant counter
- `CompendiumManager.#classifications`: packCollection -> `SourceDetector` classification (tier + priority)

### Foundry Integration Points

- `Hooks.once("init")`: Register settings
- `Hooks.once("ready")`: Initialize controller, notify the GM once about new official-looking books (`notifyNewOfficialSources`, remembered in the hidden `notifiedSources` setting), pre-cache monster index
- `Hooks.on("getSceneControlButtons")`: Add toolbar button (handles both v12 array and v13 object formats)
- `window.NPCTokenReplacer`: Debug API exposed globally via `NPCTokenReplacerController.getDebugAPI()`

## 🧩 Key Patterns

**Version Compatibility**: Never branch on `game.version`. Foundry APIs that moved between generations are reached through `FoundryCompat`, which resolves the namespaced API first and only falls back to the deprecated global. `registerControlButton` handles both the v12 array-based controls (`onClick`) and the v13+ object-based controls (`onChange`) — attaching both callbacks makes v13 fire the action twice.

**Application Framework**: `buildCompendiumSelectorForm()` resolves its base class *at registration time*. A `class X extends FormApplication` declaration would evaluate the global at module load and break the whole module on a Foundry version that removed it (planned for v16).

**Settings Storage**: Compendium selection is stored as JSON string (`JSON.stringify`/`JSON.parse`) for reliability across Foundry versions.

**Wildcard Token Resolution**: Monster Manual 2024 uses wildcard patterns like `specter-*.webp`. The `WildcardResolver` class probes for numbered variants (1-5, 01-05, a-e) via HEAD requests and selects based on variation mode setting.

**Private Fields**: All classes use ES6 private static fields (`#field`) for internal state and caching, preventing external access and ensuring encapsulation.

**Static Methods**: Most classes use static methods since they don't need instance state - this simplifies the API and avoids instantiation overhead.

**Blocklists over allowlists for forward compatibility**: `CompendiumManager.isCreatureEntry` excludes known non-creature actor types rather than listing the allowed ones, so an actor type introduced by a future system version is still indexed.

## 🐛 Console Debugging

```javascript
NPCTokenReplacer.replaceNPCTokens();      // Run replacement
NPCTokenReplacer.detectWOTCCompendiums(); // List detected compendiums
NPCTokenReplacer.getEnabledCompendiums(); // List enabled compendiums
NPCTokenReplacer.clearCache();            // Force index reload
NPCTokenReplacer.getNPCTokensFromScene(); // Get NPC tokens in current scene
NPCTokenReplacer.findInMonsterManual(name, index); // Find creature in index
NPCTokenReplacer.getOrCreateImportFolder(); // Get/create import folder
NPCTokenReplacer.getLastLoadErrors();     // Compendiums that failed to index
NPCTokenReplacer.debugEnabled = true;     // Verbose logging, including detection tiers
```

## ⚙️ Localization

All user-facing strings use `game.i18n.localize()` with keys from `lang/en.json`. Pattern: `NPC_REPLACER.<Category>.<Key>`.

## 🧩 Utility Functions

In addition to classes, three standalone utility functions remain:
- `registerSettings()`: Registers module settings during init hook
- `registerControlButton(controls)`: Adds the replace button to token controls
- `escapeHtml(str)`: Escapes HTML special characters for safe display

## ⚙️ Configuration Constants

```javascript
const MODULE_ID = "npc-token-replacer";           // Module identifier
const DEFAULT_HTTP_TIMEOUT_MS = 5000;             // HTTP timeout for HEAD requests
const OFFICIAL_WOTC_PACKAGES = [ /* 11 ids */ ];  // Authoritative whitelist
const KNOWN_MODULE_LABELS = {...};                // Human-readable book names
const OFFICIAL_AUTHOR_PATTERN = /wizards of the coast|foundry gaming/i;
const PRIORITY = { FALLBACK: 1, CORE: 2, EXPANSION: 3, ADVENTURE: 4 };
const TIER = { SYSTEM, OFFICIAL, PUBLISHER, PREMIUM, MANUAL, NONE };
const KNOWN_PRIORITIES = {...};                   // Priorities for the whitelist
const WOTC_MODULE_PREFIXES = ["dnd-", "dnd5e"];   // DEPRECATED since 1.6.0, unused
```

## 🧪 Quality Gate

```bash
npm run lint       # ESLint over scripts/, tools/ and tests/
npm run validate   # module.json, referenced files, i18n keys, template paths
npm test           # Vitest unit suite
npm run check      # All three, in order — run this before pushing
```

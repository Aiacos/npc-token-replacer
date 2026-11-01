# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Ties between books of the same priority picked the Dungeon Master's Guide over the Monster Manual.** Both are core books (priority 2) and the tie was broken alphabetically by compendium id, so `dnd-dungeon-masters-guide` won all 32 creatures the two books share. Some DMG copies are incomplete — in a live world "Animated Broom" was imported from the DMG with no actions at all. At equal priority the Monster Manual (the bestiary) now wins; higher-priority adventure and expansion books still beat it.
- Tests: 318 → 320.

## [1.8.7] - 2026-10-31

A methodical review of the whole module (runtime, architecture, tests, docs and
pipeline — four independent reviews, every finding verified before acting).

### Fixed
- **A world-wide run re-created tokens it had already replaced.** Since the button covers every scene, each click deleted and re-created every NPC token in the world, resetting hit points and conditions. Tokens the module creates are now tagged and skipped by later world-wide runs; selecting them still forces a replacement.
- **Tokens in an encounter were deleted with their combatant.** A world-wide run now leaves them alone (select them to force it).
- **A selection still overwrote every D&D Beyond actor in the world.** With tokens selected, the actor pass is limited to the actors behind them.
- **Saving a setting while the preview was open wiped the run's state**, so every token re-imported its actor. `clearCache()` during a run is now deferred to the end of the run.
- **"Core Rulebooks + SRD Only" could read non-official content.** It (and the fallback used when the setting cannot be read) filtered by priority alone; premium, publisher-only and manual sources without Adventure/Scene packs classify as CORE. It now requires an official source, and the settings form shows the same fallback.
- **"New official book enabled" was announced for books the GM's mode did not use.** It is now announced as enabled only when it is actually in use, otherwise as waiting.
- **Overwriting a D&D Beyond actor erased other modules' flags** and its sheet choice. Only the D&D Beyond Importer flags are dropped now.
- **Custom compendium selection could save booleans instead of pack ids** if Foundry's form data reports a checkbox group as booleans; the ticked ids are read from the form itself.
- **Players' clients indexed every compendium at startup** for nothing; only the GM does now.
- **An unexpected error in a run vanished into the console.** The GM now gets a notification; the run lock is still released.
- Pack labels and creature names are escaped in notifications.
- The README's name-matching examples were wrong ("Orc War Chief" never matched); they are now verified against the matcher and say that variants apply only without an exact entry.
- Error messages for an unreadable compendium setting named the wrong fallback.
- **The release commit left `scripts/lib/version.js` behind.** The Release workflow committed only `module.json`, `package.json` and `CHANGELOG.md`, so tag `v1.8.6` records `CODE_VERSION` 1.8.5 while its `module.json` says 1.8.6. The published 1.8.6 ZIP is correct (it is built after the bump and was verified to announce 1.8.6); only the repository was out of step. The workflow now commits `version.js` too, and the repository is realigned.
- `package-lock.json` still said 1.7.3: `bump-version` now updates it and the release commit includes it.

### Changed
- **Refactoring** — `main.js` from 1570 to ~750 lines, behaviour unchanged, each step behind the full test suite: the D&D Beyond / world-actor logic moved to `ActorImporter`, the compendium document cache to `CompendiumDocs`, the preview to `PreviewDialog` (with a pure `buildContent` and one shared table builder), the startup notices to `StartupNotices`, and `FolderManager`, `CompendiumManager`, `TokenReplacerError` and `escapeHtml` to their own files. Dead code and test-only pass-through getters were removed (`isProcessing`, `getSequentialCounter`, the deprecated `WOTC_MODULE_PREFIXES`, six `CompendiumManager` aliases of `SourceDetector`); priority lookups now use the detection cache instead of reclassifying inside a sort.
- **CI** smoke test checks every tracked runtime file in the package; `dependabot-auto-merge` uses actions v7 and one failed merge no longer stops the rest.
- **Validator** counts any complete `NPC_REPLACER.*` literal as a used key (keys also flow through helpers now); a missing key is still an error.
- README: reverse-proxy "Cache Assets" troubleshooting, dnd5e version actually verified, corrected v13 row and core-mode description. `CLAUDE.md` and `docs/` describe the current structure. `package.json` declares the MIT licence.
- Machine-local `.claude_settings.json` and `.auto-claude-security.json` are no longer tracked.
- Tests: 298 → 318 (the deprecated-constant test was removed with the constant). New: end-to-end run across two scenes with a real D&D Beyond actor, the run lock, matching on the real index, creature-type filtering, tier translations, and the run-safety cases above.

### Removed
- `MIGRATION_V13.md`: entirely superseded (it listed the 1.5.0 ApplicationV2 migration as future work); `docs/COMPATIBILITY.md` covers the current state.

## [1.8.6] - 2026-10-31

### Added
- **Stale-code warning.** After an update the browser can keep running cached module files while Foundry already reports the new version, so the module half-works on old code — the replace button missing from the Actors tab and D&D Beyond actors imported instead of overwritten were both traced to this in a live world. The code now carries its own version (`scripts/lib/version.js`); at `ready` it is compared with the installed manifest and, if they differ, the GM gets a permanent warning naming both versions and telling them to reload with Ctrl+Shift+R. The console also logs the running code version at `init`. README troubleshooting explains how to check by hand.

### Changed
- **Release safety:** `bump-version` updates `CODE_VERSION` together with `module.json`; the manifest validator fails if they differ; the release ZIP check now verifies **every** tracked script, language file, template and stylesheet is packaged (it checked four hard-coded files) and that the packaged `CODE_VERSION` matches the release.
- **The button now replaces NPC tokens on every scene of the world**, not only the scene open on the canvas. Each token is replaced on its own scene; no scene needs to be open. Selecting tokens still narrows the run to those tokens. The preview gains a **Scene** column and counts the scenes involved. Tokens are tracked by uuid, since token ids are only unique within a scene. The "No active scene" check and its message were removed.
- Tests: 287 → 298.

## [1.8.5] - 2026-10-31

### Added
- **One button also updates every D&D Beyond Importer actor in the world.** Pressing Replace NPC Tokens now pairs every DDB actor in the world — not only those used on the current scene — with its official version by **exact name** (no variants: the overwrite is destructive), lists them in a separate section of the same preview (with the ones that have no official version, which stay unchanged), and on confirm overwrites them in place before replacing the scene's tokens, which then reuse them. Works with an empty scene. One failing actor never stops the rest; the result is reported. If any compendium failed to load, the actor pass is skipped with a warning (an overwrite is permanent, so it must not be matched against an incomplete index); tokens are still replaced.
- **New official books are trusted without a module update.** A package authored by Wizards of the Coast / Foundry Gaming **and** distributed as protected premium content for the active system is a new `verified` tier ("Official (detected)"), used by the default mode like the whitelist; the GM is notified once that it was enabled. Authorship alone (any manifest can claim it) stays opt-in.
- Docs explain how overwriting an actor affects tokens already placed on other scenes (stats follow via the actor link / ActorDelta; art and size do not).

### Changed
- **The replace button moved from the token toolbar to the bottom of the Actors sidebar tab** (GM only), added through the documented `renderActorDirectory` hook into the `footer` part of v13/v14 `DocumentDirectory`. The scene-control registration (`registerControlButton`, which handled the v12 array and v13 object control formats) and its 5 tests were removed with it; 6 tests cover the new placement.
- Tests: 272 → 287.

## [1.8.1] - 2026-10-31

### Added
- **One-time notification for new official books.** A book released after this version (Wizards of the Coast / Foundry Gaming authorship, not yet in the known list) was only reported in the browser console, so a GM had no way to learn it existed but was unused. The GM now gets a persistent notification naming each such book once per world, pointing to the compendium picker. Books already in use, whitelisted books and non-GM users are skipped; the list of announced books lives in a hidden world setting (`notifiedSources`), and an unreadable list keeps the notice quiet rather than repeating it on every load. Module titles are escaped by Foundry (`escape: true`) because they come from third-party manifests.

### Fixed
- **D&D Beyond Importer actors were never overwritten (1.8.0 regression in practice).** DDB Importer brings monsters into the world with `game.actors.importFromCompendium` from its own DDB compendium, so real DDB actors carry a `_stats.compendiumSource`. The actor lookup checked that field first and filed them as "already imported", so the overwrite never triggered and replacement silently reused the DDB actor. DDB actors are now recognised before `compendiumSource` is considered; a test reproduces a DDB actor imported from DDB's compendium.
- **Three official books were ignored by the default mode.** The Wizards of the Coast creator page on Foundry now lists 14 packages; the whitelist had 11. Added **Ravenloft: The Horrors Within** (`dnd-ravenloft-horrors-within`, adventure tier), **Arcana Unleashed: Deadfall** (`dnd-deadfall`, adventure tier) and **Arcana Unleashed** (`dnd-arcana-unleashed`, expansion tier). They were detected as "looks official" but only used under "Everything Detected"; they are now trusted by default.
- **The compendium list in the picker could not be scrolled** outside "Custom Selection". It was made read-only with `pointer-events: none`, which also swallowed the mouse wheel; the checkboxes are now disabled instead, so the list scrolls in every mode (and can no longer be toggled from the keyboard while read-only). A test fails if a rule on the list itself blocks pointer events again.
- The README claimed newly installed books are "picked up on their own" by the default mode; only books in the known list are. The docs now describe the actual behaviour and the new notification.
- `tools/validate-manifest.mjs` now recognises i18n keys passed to `ui.notifications.*` with `localize: true`, so a missing translation there fails validation instead of passing silently.

### Changed
- Tests: 257 → 272.

## [1.8.0] - 2026-10-31

### Added
- **D&D Beyond Importer imports are overwritten in place instead of duplicated.** When a creature already exists in the world as a D&D Beyond Importer monster (an `npc` carrying `flags.ddbimporter.id`, the importer's own test), replacing a token now overwrites that actor with the official compendium data — same id, folder, ownership and sort, so every token and link pointing at it follows — rather than importing a second copy into the module's folder. Uses `update(data, {diff: false, recursive: false})` so DDB items are replaced, not merged with the official ones. An actor already imported from the same compendium entry still wins, same-named homebrew actors are never touched, and overwritten actors are tagged (`flags.npc-token-replacer.sourceUuid`) so later runs reuse them.
- **The preview lists every actor it will overwrite**, with a warning summary, before anything changes.
- **Setting "Overwrite D&D Beyond Imports"** (world, default on). An unreadable setting falls back to *not* overwriting.
- **`TODO.md` and `SECURITY.md`**, as required by the constitution. GitHub private vulnerability reporting is now enabled for the repository.
- **Macro recipes** in both READMEs: a one-line macro for the full workflow and one to switch compendium selection.

### Fixed
- **The "Configure compendiums" settings button opened nothing on Foundry v13/v14.** `compendium-selector-body.hbs` rendered three top-level elements, and ApplicationV2's `HandlebarsApplicationMixin` requires every `PARTS` template to render exactly one root element, so `render()` threw before any window appeared. The part is now wrapped in a single `<section>`, and a test fails if any part template has more than one root.
- **Replacements could land on the wrong scene.** The preview dialog is non-modal; switching scenes before confirming made every token skip silently, and switching during the run created tokens on the new scene while leaving the originals. All token mutations now target the token's own scene.
- **The import folder was created at the root instead of inside an existing monster folder** — `Folder.create` was given `parent`, which is not a schema field; it is `folder`.
- **A pack that failed to index stayed missing until reload.** A partial index is now used for that run but not cached, so the next run retries.
- **"Additional Compendium Sources" needed a page reload** to take effect; changing it now clears the detection cache.
- **Short words were ignored in partial name matching**, so "Giant Hen" could become "Giant Rat" and a bare "Giant" matched "Giant Rat". Short words (other than numbering and filler words) must now agree.
- **A wildcard probe that partly failed on the network was cached**, hiding the missing variants for the session; it is now retried.
- **A wildcard path with no directory** (`specter-*.webp`) was probed at the server root (`/specter-1.webp`).
- **The progress bar double-counted tokens whose old copy could not be deleted** (it could show "5/4").
- The English README still described package-id prefixes (`dnd-`) as a detection signal; they have not been one since 1.6.0.

### Changed
- **Constitution in `CLAUDE.md` expanded to fifteen principles**: architecture-before-implementation, an explicit pre-commit gate, plugin/skill use, project ledgers (`TODO.md`, `SECURITY.md`, `CHANGELOG.md`) and scheduled repository cleanup join the existing rules; the icon legend gains 🔐 Security.
- Tests: 232 → 257.
- **`.planning/` brought current.** The planning workspace was last updated on 2026-03-06 and still described milestone v1.4: two milestones had shipped since without touching it, and the `codebase/` analyses cited line numbers in a `main.js` that has since been refactored from ~2000 lines to 1220 across 8 files. `STATE.md`, `PROJECT.md` and `ROADMAP.md` now describe v1.7.3; the seven `codebase/` documents were rewritten against the current source; `MILESTONES.md` and `RETROSPECTIVE.md` gained entries for v1.5–v1.6 and v1.7 rather than having their historical v1.4 entries edited.


## [1.7.3] - 2026-08-30

### Changed
- **ESLint upgraded to 10.9.1.** Verified against all 22 breaking changes: none apply — the project already uses flat config, does not extend `eslint:recommended`, has no `eslint-env` comments, does not use the `radix` or `func-names` rules, and authors no custom rules. Installed and linted clean before merging.
- **Dependabot now ignores three major upgrades that are blocked upstream**, with the reasoning recorded in `.github/dependabot.yml` and `docs/DEVELOPMENT.md`: `vitest >=4` and `@vitest/coverage-v8 >=4` (npm refuses the install — `@rayners/foundry-test-utils@1.2.2`, the latest release, declares `peer vitest: ^3.1.0`), and `jsdom >=28` (outside the declared peer range, and it would raise the Node floor above the Node 20 CI job). Minor and patch updates inside the allowed majors still flow.


## [1.7.2] - 2026-08-30

### Added
- **Italian README** (`README.it.md`), a full translation of the user-facing documentation, cross-linked with the English one. The project previously shipped an Italian UI translation but no Italian documentation.
- **Foundry submission process documented** in both READMEs (`Listing the module on foundryvtt.com`) and in `docs/DEVELOPMENT.md`: submit → manual review → copy the release token → store it as a repository secret, plus what the review checks.
- **Installation chapter now states that the module is not in Foundry's package browser** and points at the manifest URL as the recommended route.
- **Dependabot auto-merge** (`.github/workflows/dependabot-auto-merge.yml`): a daily sweep merges patch and minor dependency updates whose checks are green and labels everything else `needs-review`. Majors are never merged automatically — `release.yml` and `foundry-compat.yml` are not exercised by pull-request CI, so a green PR does not prove that releasing still works. The classification is a pure function in `tools/dependabot-triage.mjs` with 16 unit tests.
- **Two new validator checks**: Handlebars partials referenced from templates must exist, and the translated README must keep the same chapter icon sequence as the English one (a language-independent way to catch a chapter added to one file only).

### Changed
- **GitHub Actions updated to v7** (`checkout`, `setup-node`, `upload-artifact`). Verified against the release notes of every intermediate major: the only real breaking change — checkout refusing to check out fork PRs under `pull_request_target` / `workflow_run` — does not apply, since neither trigger is used, and `persist-credentials` still defaults to `true`, which the release and compatibility workflows depend on for pushing.
- **`build.sh` and `build.bat` package every `README*.md`**, so translations ship with the module instead of only the English README.
- **Dependabot groups minor and patch updates only.** `patterns: ["*"]` with no `update-types` filter had mixed three majors with one patch into a single PR, so the safe part could not be taken without the risky part.

### Fixed
- **Foundry package registry announcement was skipped on every tag-triggered release.** The step was guarded by `inputs.publish_to_registry != false`, and on a `push` event `inputs` is empty — GitHub coerces `""` to `false`, so the condition evaluated false and the step never ran. Only the `workflow_dispatch` path may opt out now.
- **`tools/bump-version.mjs` could break a release halfway through.** A version equal to the current one produced a duplicate CHANGELOG heading and then failed on an empty commit, after `module.json` had already been rewritten. It now refuses a no-op bump and an unknown bump type, and changelog promotion is idempotent.
- **The `FOUNDRY_PACKAGE_TOKEN` guide skipped the step that matters.** It described copying the token from the package edit page, but that page only exists for an already-listed package — `https://foundryvtt.com/packages/npc-token-replacer` returns 404. The guide now starts from submission and approval.
- **README contradicted itself on the minimum Foundry version**, claiming "verified on v12, v13 and v14" in Features while Requirements said 13 or higher.
- **A paragraph about dynamic classification appeared twice** in the supported-content chapter, and the sentence introducing the priority tables was separated from them by an unrelated paragraph.

## [1.7.1] - 2026-08-30

### Fixed
- **Foundry package registry announcement was skipped on every tag-triggered release.** The step was guarded by `inputs.publish_to_registry != false`, and on a `push` event `inputs` is empty — GitHub coerces `""` to `false`, so the condition evaluated false and the step never ran. Only the `workflow_dispatch` path may opt out now.
- **`tools/bump-version.mjs` could break a release halfway through.** Passing a version equal to the current one produced a duplicate CHANGELOG heading and then failed on an empty commit, after `module.json` had already been rewritten. The bump now refuses a no-op version and an unknown bump type, and changelog promotion is idempotent.

### Added
- Unit tests for the release tooling (`tests/tools/bump-version.test.js`), covering the bump arithmetic, the no-op guard and changelog promotion.


## [1.7.0] - 2026-08-30

This release merges the long-lived `develop` line into `main`. It keeps the
strict Wizards of the Coast whitelist introduced in 1.6.0 and adds a detection
layer around it, a version-agnostic compatibility layer, and the security and
reliability fixes that had accumulated on `develop` without ever reaching a
published release.

### Security
- **Path traversal in wildcard token resolution**: probe URLs are validated before the HEAD request, so a crafted token path can no longer reach outside the expected asset directory.
- **XSS in progress bar labels**: creature names are HTML-escaped before being rendered into progress messages.
- **Token data allowlist**: token creation copies an explicit list of fields from the compendium prototype instead of spreading arbitrary data.
- **jQuery removed**: the last DOM interactions using jQuery were rewritten with vanilla DOM.

### Added
- **Forward-looking source detection** on top of the 1.6.0 whitelist. A package authored by Wizards of the Coast / Foundry Gaming, or premium content declaring the dnd5e system, is now detected as `publisher` / `premium` tier: logged with a warning that names the package, listed in the compendium picker, and usable by switching to **Everything Detected**. A newly released official book is therefore never silently ignored — and never silently trusted either.
- **`FoundryCompat`** (`scripts/lib/foundry-compat.js`): feature-detected access to every Foundry API that moved between generations — `DialogV2`/`Dialog`, `ApplicationV2`/`FormApplication`, `SceneNavigation`, the Handlebars template loader, `foundry.utils.mergeObject`. Namespaced APIs resolve first, so deprecated-global warnings are never triggered.
- **ApplicationV2 settings form**: the compendium picker renders as an `ApplicationV2` when available and falls back to `FormApplication` otherwise, both driven by one shared model. It also finally has a **Save button** — the previous form had no submit control.
- **Dynamic priority classification** for sources outside the whitelist: an Adventure compendium means adventure content (4), Scene compendiums mean a setting book (3), neither means a rulebook (2).
- **`core` selection mode** (SRD + rulebooks only) and the **Additional Compendium Sources** setting for package ids the automatic signals cannot recognise.
- **Dedicated stylesheet** (`styles/npc-token-replacer.css`), replacing the inline styles previously emitted from `main.js`.
- **Tooling**: `tools/validate-manifest.mjs` (manifest, referenced files, i18n keys, template and partial paths, translation parity), `tools/bump-version.mjs`, `tools/check-foundry-version.mjs`, `tools/publish-foundry.mjs`; npm scripts `validate` and `check`.
- **CI/CD**: lint + validation + tests on a Node 20/22 matrix, coverage artifact, and a package smoke test asserting every manifest-referenced file is inside the ZIP. A one-trigger Release workflow (bump → validate → tag → build → verify → GitHub release → Foundry package registry). A weekly Foundry compatibility watch that opens a PR when a new generation ships. Dependabot for actions and dev dependencies.
- **Documentation**: `docs/COMPATIBILITY.md`, `docs/DEVELOPMENT.md`, and a Constitution of non-negotiable principles in `CLAUDE.md`.
- **57 new unit tests** covering source detection, the compatibility layer and the settings form (208 total).

### Changed
- **Italian translation completed**: `lang/it.json` was missing 19 keys and carried 8 that no longer exist. Both language files are now in parity, and the manifest validator warns when they drift again.
- **Only creature entries are indexed**: `character`, `group` and `vehicle` compendium entries are skipped. The filter is a blocklist, so actor types added by future system versions are still indexed.
- **Scene control registration**: v13+ object-format controls use `onChange`, v12 array-format controls use `onClick` — attaching both made v13 run the replacement twice.
- **Compendium checkboxes are keyed by pack id** rather than list position, so a change in detection order can no longer shift a saved custom selection.
- **Corrupt settings fall back conservatively** to the core-rulebook set.
- **`compatibility.verified` raised to 14.** No `compatibility.maximum` is declared, and the validator now fails the build if one is added.
- **`module.json` declares `flags.hotReload`** for live reloading of styles, templates and language files during development.

### Fixed
- **Module load could break on a future Foundry release**: the settings form extended the `FormApplication` global at module-evaluation time, so removing that global (announced for v16) would have failed the entire module import, not just the settings dialog. The class is now built by a factory at registration time.
- **Dialog timeout left the window open**: the timeout resolved the promise but never dismissed the dialog.
- **Lock release race condition**: `clearActorLookup()` now runs before the processing lock is released.
- **Wildcard 404 cache miss**: empty results are cached, preventing dozens of redundant HEAD requests per duplicate creature.
- **Infinite loop guard** in `FolderManager.getFolderPath` for circular folder references.
- **Disposition dead write**: `disposition` was listed in both the compendium and preserved property lists, so the compendium value was silently discarded.

### Removed
- `eslint.config.mjs`, a second dead ESLint configuration.
- 12 unused i18n keys.
- `fix-todos/` session state is no longer tracked.


## [1.6.0] - 2026-04-24

### Changed (BREAKING)

- **Strict whitelist of official Wizards of the Coast packages.** The module
  now recognises **only the 11 premium packages published by WotC on Foundry
  VTT** (see [Foundry VTT creator page](https://foundryvtt.com/creators/wizards-of-the-coast/)).
  Auto-discovery is no longer prefix-based.
  - Whitelisted package IDs:
    `dnd5e`, `dnd-monster-manual`, `dnd-players-handbook`,
    `dnd-dungeon-masters-guide`, `dnd-forge-artificer`, `dnd-tashas-cauldron`,
    `dnd-phandelver-below`, `dnd-tomb-annihilation`, `dnd-adventures-faerun`,
    `dnd-heroes-faerun`, `dnd-heroes-borderlands`.
  - Removed non-WotC legacy books (Volo's Guide, Mordenkainen's Tome of Foes,
    Monsters of the Multiverse, Fizban's, Mythic Odysseys of Theros, Eberron:
    Rising from the Last War, Explorer's Guide to Wildemount, Van Richten's,
    Spelljammer: Light of Xaryxis) — these are **not** published by WotC on
    Foundry.
  - Removed non-WotC adventures (Curse of Strahd, Descent into Avernus,
    Icewind Dale, Ghosts of Saltmarsh, Candlekeep Mysteries, Wild Beyond the
    Witchlight, Strixhaven, Golden Vault, Netherdeep, Spelljammer: Adventures
    in Space, Radiant Citadel, Dragonlance, Planescape, Vecna, Infinite
    Staircase, Book of Many Things).
  - Removed `ddb-` (DDB-Importer) prefix — DDB-Importer is a third-party
    community module, not a WotC package.
- **`CompendiumManager.detectWOTCCompendiums()`** now uses
  `OFFICIAL_WOTC_PACKAGES.includes(packageName)` instead of prefix matching.
  Non-whitelisted `dnd-*` or `ddb-*` compendiums are no longer auto-detected.
- **`CompendiumManager.getCompendiumPriority()`** fall-through changed: unknown
  `dnd-*` packages now return priority 1 (fallback) instead of 4 (adventure).

### Added

- **`CompendiumManager.OFFICIAL_WOTC_PACKAGES`** — new frozen static getter
  exposing the authoritative 11-package whitelist.

### Deprecated

- **`CompendiumManager.WOTC_MODULE_PREFIXES`** — kept for backward compatibility
  but no longer used by detection logic. Will be removed in a future major
  release. Consumers should migrate to `OFFICIAL_WOTC_PACKAGES`.

### Migration notes

If your world relied on auto-detection of non-WotC `dnd-*` or `ddb-*`
compendiums, you will need to either (a) enable those compendiums via an
explicit pack-ID setting, or (b) fork the module and extend
`OFFICIAL_WOTC_PACKAGES` locally.

## [1.5.1] - 2026-04-24

### Fixed

- ESLint configuration consolidated (removed duplicate `eslint.config.mjs`); `lint` / `lint:fix` npm scripts added so CI quality gate passes cleanly.
- Cleared unused imports in `progress-reporter.js`, `error-handling.test.js`, `wildcard-resolver.test.js`, and `dry-run-preview.test.js`.

## [1.5.0] - 2025-05-XX

### Added
- **Expanded official D&D 5e manual support**: `CompendiumManager.#COMPENDIUM_PRIORITIES` now
  explicitly covers 37 official WotC module IDs across four priority tiers:
  - *Priority 1 – FALLBACK*: SRD (`dnd5e`), Tasha's Cauldron, Volo's Guide to Monsters,
    Mordenkainen's Tome of Foes, Monsters of the Multiverse (+ alias), Fizban's Treasury of
    Dragons, Mythic Odysseys of Theros, Eberron: Rising from the Last War, Explorer's Guide
    to Wildemount, Van Richten's Guide to Ravenloft, Spelljammer: Light of Xaryxis
  - *Priority 2 – CORE*: Monster Manual 2024, Player's Handbook 2024, Dungeon Master's Guide 2024
  - *Priority 3 – EXPANSION*: Forge of the Artificer; placeholder comments for future 2024/2025
    sourcebooks (Planescape, Spelljammer rework, Greyhawk)
  - *Priority 4 – ADVENTURE*: 19 adventure modules from Tomb of Annihilation to Planescape:
    Adventures in the Multiverse
- **`KNOWN_MODULE_LABELS`** static map — human-readable names for all known module IDs, used
  in logs and future UI improvements.
- **`ddb-` prefix** added to `WOTC_MODULE_PREFIXES` for DDB-Importer compendium auto-discovery.
- **Italian localization** (`lang/it.json`) — full translation of all UI strings.
- **CI/CD workflows** (`.github/workflows/ci.yml` and `release.yml`):
  - `ci.yml`: runs on push/PR to main & develop; `npm ci` → `npm test` → optional lint
  - `release.yml`: stable releases from `main`, pre-release RC from `develop`; auto-bumps
    patch if tag exists; builds ZIP; creates GitHub Release with ZIP + module.json as assets
    (The Forge compatible via `manifest` URL)
- **`MIGRATION_V13.md`**: checklist of deprecated Foundry APIs with fix status.

### Changed
- **Compatibility**: `minimum` bumped from `12` → `13`; `verified` bumped to `14`;
  `maximum` removed for forward-compatibility.
- **dnd5e system relationship**: added `compatibility.minimum: "4.0.0"`.
- **`Dialog.confirm`** now feature-detects `foundry.applications.api.DialogV2` (Foundry v13+)
  and falls back to legacy `Dialog.confirm` — no behaviour change on v13/v14.
- **`package.json`**: version aligned to `1.5.0`; added `foundry` section
  (`minimum: "13"`, `verified: "14"`).

## [1.4.1] - 2025-03-07

### Added
- **Configurable dialog timeout**: New "Preview Dialog Timeout" setting (1-30 minutes) controls how long the preview dialog stays open before auto-closing
- **Reverse word index**: O(1) lookup for Stage 3 partial name matching, significantly faster for large monster indexes
- **Compendium document cache**: Avoids repeated `getDocument()` calls during batch replacements
- **New unit tests**: Added test suites for FolderManager, registerControlButton, and TokenReplacer.replaceToken

### Changed
- **Parallel compendium loading**: Monster indexes are now loaded in parallel via `Promise.allSettled` instead of sequentially
- **Immutable caches**: All cached arrays are now frozen with `Object.freeze` to prevent accidental mutation
- **Structured errors**: New `TokenReplacerError` class replaces fragile string-matching for failure classification
- **CSS extraction**: Moved inline styles from preview dialog and templates to dedicated CSS classes
- **Token properties**: `extractTokenProperties` now uses a `PRESERVED_PROPERTIES` constant instead of hardcoded property list
- **Actor link preservation**: Token replacement now preserves `actorLink` from prototype token data

### Fixed
- Dialog timeout and notification timing issues resolved
- Wildcard resolver no longer permanently caches failed network probes
- Execution lock bug in `NPCTokenReplacerController` fixed
- `FolderManager.getFolderPath` now handles null folder input gracefully
- Fixed missing `await` in `computeMatches` test
- i18n key corrections for compendium priority labels

### Security
- Resolved npm audit vulnerabilities in dependencies
- Added `_bmad/` directory to `.gitignore`

## [1.4.0] - 2025-01-XX

### Changed
- **Complete OOP refactoring** of the codebase from procedural/mixed architecture to proper class-based design
- Reorganized ~2000 lines of code into well-defined classes with single responsibilities:
  - `NPCTokenReplacerController` - Main facade orchestrating all operations
  - `CompendiumManager` - Detects WOTC compendiums and manages monster indexes
  - `TokenReplacer` - Handles token replacement operations and actor imports
  - `NameMatcher` - Normalizes creature names and matches to compendium entries
  - `WildcardResolver` - Resolves Monster Manual 2024 wildcard token paths
  - `FolderManager` - Manages Actor folders for compendium imports
  - `Logger` - Centralized logging with module prefix
  - `CompendiumSelectorForm` - Settings UI for compendium selection
- Improved encapsulation using ES6 private static fields (`#field`) for internal state
- Enhanced JSDoc documentation for all classes and methods
- Updated CLAUDE.md with comprehensive architecture documentation and class diagrams
- Updated README.md with architecture section

### Fixed
- Improved error handling in `getEnabledCompendiums()` to preserve error context
- Added graceful handling for `_stats.compendiumSource` on older actor documents
- Increased HTTP timeout for wildcard path resolution from 3000ms to 5000ms for slow connections

### Technical
- All classes use static methods where instance state is not needed
- Caches moved to private static class fields for better encapsulation
- Preserved `window.NPCTokenReplacer` debug API for backward compatibility

## [1.3.0] - 2024-XX-XX

### Added
- Support for selected tokens: Replace only selected tokens instead of all scene tokens
- Confirmation dialog now shows separate counts for selected vs all tokens

### Changed
- Improved user workflow when specific tokens are selected

## [1.2.1] - 2024-XX-XX

### Fixed
- Corrected priority label from "SRD" to "FALLBACK" in settings UI

## [1.2.0] - 2024-XX-XX

### Changed
- Default compendium selection now includes only Core + Fallback compendiums
- Improved default experience for users without adventure modules

## [1.1.3] - 2024-XX-XX

### Fixed
- Moved Tasha's Cauldron of Everything to fallback priority level
- Fixed settings persistence across sessions

## [1.1.2] - 2024-XX-XX

### Fixed
- Implemented proper 4-tier priority system (Adventure > Expansion > Core > Fallback)
- Fixed priority conflicts when same creature exists in multiple compendiums

## [1.1.1] - 2024-XX-XX

### Fixed
- Bug fixes and stability improvements

## [1.1.0] - 2024-XX-XX

### Added
- Token variation modes (none, sequential, random) for creatures with multiple art variants
- Wildcard token art resolution for Monster Manual 2024 (e.g., `specter-*.webp`)
- Support for numbered variants (1-5, 01-05, a-e)

### Changed
- Improved compendium detection for WotC content

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- Automatic detection of WOTC D&D compendiums
- Token replacement with compendium versions preserving position, elevation, dimensions
- Multi-stage name matching (exact, variant transforms, partial word)
- Compendium selector for choosing which sources to use
- Support for Foundry VTT v12 and v13
- Localization support (English)

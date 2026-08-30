# 🔄 Development Guide

Everything needed to work on, validate and release NPC Token Replacer.

## 📦 Local setup

The module has **no build step** — it is plain ES modules loaded by Foundry.

1. Symlink or copy the repository into `Data/modules/npc-token-replacer/`
2. Enable the module in a D&D 5e world
3. Edit `scripts/**`, then refresh the browser (F5)

`module.json` declares `flags.hotReload`, so edits to `styles/`, `templates/`
and `lang/` are applied live without a refresh.

Foundry v13 or newer is required to run the module. Node 20 or 22 is required for the tooling (dev-only; the shipped module has no
runtime dependencies).

```bash
npm ci
```

## 🧪 Quality gate

```bash
npm run lint       # ESLint over scripts/, tools/ and tests/
npm run validate   # module.json, referenced files, i18n keys, template paths
npm test           # Vitest unit suite
npm run check      # all three, in order — run before pushing
```

### What `npm run validate` checks

[`tools/validate-manifest.mjs`](../tools/validate-manifest.mjs) fails the build when:

- a required manifest field is missing, or the version is not semver
- `compatibility.minimum` is newer than `compatibility.verified`
- **`compatibility.maximum` is set** — it would block future Foundry generations
- the `download` URL does not reference the current version
- a file referenced by `esmodules`, `styles` or `languages` does not exist
- a language file is not valid JSON
- an i18n key is used in source but missing from `lang/en.json`
- a template path referenced from source does not exist
- a Handlebars partial referenced from a template does not exist

Translation drift (a non-English file missing or over-declaring keys) is
reported as a warning, so translations can lag behind the code without blocking
a release.

Unused i18n keys are reported as warnings rather than errors, so translations
can stay ahead of the code.

### 🧪 Testing conventions

- Framework: Vitest with jsdom and `@rayners/foundry-test-utils`
- Mocks must **execute predicates**, never return canned data:
  `game.packs.filter = vi.fn(pred => mockPacks.filter(pred))`
- Clear every static cache the test touches in `beforeEach`
- Anything routed through `FoundryCompat` needs a test with the modern API
  present **and** absent — see `tests/lib/foundry-compat.test.js`

```bash
npm run test:watch      # watch mode
npm run test:coverage   # coverage report into coverage/
```

## 📦 Building

```bash
bash build.sh      # Linux/macOS
build.bat          # Windows
```

The script reads the module id, version and repository URL from `module.json`,
copies the known module directories (`scripts`, `lang`, `styles`, `templates`,
`assets`, `packs`, `icons`, `images`, `fonts`) plus `README`/`LICENSE`/
`CHANGELOG`, and writes `releases/{id}-v{version}.zip` with the download URL
already baked into the packaged manifest.

`releases/` is build output and is gitignored — never edit it by hand.

## 🔄 CI/CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | push to `main`/`develop`, every PR, manual | Lint, validate and test on Node 20 and 22; coverage artifact; package smoke test that asserts every manifest-referenced file made it into the ZIP |
| `release.yml` | manual dispatch, or a `v*` tag | The full release pipeline (below) |
| `foundry-compat.yml` | weekly cron, manual | Compares the newest published Foundry generation with `compatibility.verified` and opens a bump PR when it is behind |
| `dependabot.yml` | weekly | Opens update PRs for workflow actions and dev dependencies |
| `dependabot-auto-merge.yml` | daily cron, manual | Merges patch/minor Dependabot PRs whose checks are green; labels everything else `needs-review` |

### Releasing

**Actions → Release → Run workflow**, choose `patch`, `minor`, `major`, or an
explicit `x.y.z`. The workflow then:

1. runs lint and the unit suite
2. bumps `module.json`, `package.json` and promotes the CHANGELOG
   `[Unreleased]` section to the new version
3. validates the manifest **against the version being shipped**
4. commits `chore: release vX.Y.Z`, tags it, pushes both
5. builds the ZIP and verifies it (packaged version matches, required files present)
6. rewrites the standalone `module.json` download/manifest URLs for this release
7. creates the GitHub release with both assets — `--prerelease` when the version
   contains a hyphen, `--latest` otherwise
8. announces the release to the Foundry package registry

Pushing a `vX.Y.Z` tag by hand runs the same pipeline from step 5, after
checking the tag matches `module.json`.

### Dependency updates

Dependabot groups **minor and patch** updates into a single low-risk PR per
ecosystem. **Major** updates fall outside the group and arrive as individual PRs.

`dependabot-auto-merge.yml` sweeps once a day and merges only what is safe:

| Condition | Outcome |
|-----------|---------|
| patch or minor, mergeable, all checks green | merged automatically |
| any major in the PR (including inside a group) | held, labelled `needs-review` |
| checks not green, conflicts, or an unparseable title | held, labelled `needs-review` |

Majors are deliberately not automated: a major action bump can change runtime
defaults, and **`release.yml` and `foundry-compat.yml` are never exercised by
pull-request CI** — a green PR is not proof that releasing still works.

The classification lives in `tools/dependabot-triage.mjs` and is unit-tested;
run it against the live queue at any time with:

```bash
gh pr list --author app/dependabot --state open \
  --json number,title,body,mergeable,statusCheckRollup > prs.json
node tools/dependabot-triage.mjs prs.json
```

### Repository secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `GITHUB_TOKEN` | provided automatically | Create releases, push tags, open compatibility PRs |
| `FOUNDRY_PACKAGE_TOKEN` | optional | Announce releases on the Foundry package registry. Absent, the step logs a skip instead of failing. See below. |

#### Getting `FOUNDRY_PACKAGE_TOKEN`

The token proves to foundryvtt.com that you own the package. Without it a
release still reaches GitHub and the manifest URL still serves it — but the
module's entry in Foundry's package browser keeps showing the previous version.

It is **per package**, not per account, and it is created for you: there is
nothing to generate, only to copy.

1. Sign in to [foundryvtt.com](https://foundryvtt.com/).
2. Open the package edit page:
   `https://foundryvtt.com/packages/npc-token-replacer/edit`
   (also reachable from **Profile → Packages**, then **Edit** on the package —
   or the **Edit** button on the package's own page).
3. Scroll to the bottom. Just above the **Save Package** button is a field
   labelled **Package Release Token**. Click the field to copy it.
4. Store it as a repository secret — run this in your own terminal so the value
   is never echoed into a shell history or a transcript:

   ```bash
   gh secret set FOUNDRY_PACKAGE_TOKEN
   ```

   Paste the token at the prompt.

That is the whole setup. From the next release on, the pipeline announces itself.

**Security**: this token can edit your package programmatically. Never commit it,
never paste it into an issue, a PR or a chat. If it leaks, the same page has a
**Refresh** button that revokes the current token and issues a new one — then
re-run `gh secret set FOUNDRY_PACKAGE_TOKEN` with the new value.

**Verifying without publishing**: the release workflow sends a `dry-run` request
for pre-release versions (any version containing a hyphen, e.g. `1.8.0-rc.1`).
The API validates the payload and answers *"Dry run completed successfully"*
without saving anything.

Pre-releases are sent to the registry as a **dry run**, so an `-rc` build is
validated without being published.

## 🧩 Adding a new capability

| Task | Where |
|------|-------|
| A Foundry API that moved between generations | add an accessor to `scripts/lib/foundry-compat.js`, plus tests for both paths |
| A newly published official WotC package | add its id to `OFFICIAL_WOTC_PACKAGES` and a label to `KNOWN_MODULE_LABELS` in `scripts/lib/source-detector.js` |
| A new signal for recognising content | `scripts/lib/source-detector.js` |
| A new module setting | `registerSettings()` in `scripts/main.js`, plus keys in `lang/en.json` |
| A new field in the settings form | `templates/compendium-selector-body.hbs` (shared by both shells) and `CompendiumSelectorModel` |
| A token property to preserve or adopt | `TokenReplacer.PRESERVED_PROPERTIES` / `#COMPENDIUM_TOKEN_FIELDS` |

## 🐛 Debugging in a live world

```javascript
NPCTokenReplacer.debugEnabled = true;      // verbose logs, including detection tiers
NPCTokenReplacer.detectWOTCCompendiums();  // what was detected, and why
NPCTokenReplacer.getEnabledCompendiums();  // what the current mode resolves to
NPCTokenReplacer.getLastLoadErrors();      // compendiums that failed to index
NPCTokenReplacer.clearCache();             // force a full re-detect and re-index
```

Detection logs the tier and priority behind every decision, so a
misclassification can be diagnosed from the console alone.

# 🛡️ Foundry Compatibility Policy

How this module stays working across Foundry VTT generations, and what to do
when a new one ships.

## 🛡️ Support matrix

| Foundry | Status | What changes for this module |
|---------|--------|------------------------------|
| v12 | Minimum supported | Scene controls are an **array**, tools fire `onClick`. `Dialog` / `FormApplication` / `SceneNavigation` are globals. Progress uses `SceneNavigation.displayProgressBar()`. |
| v13 | Supported | Scene controls are an **object**, tools fire `onChange`. AppV1 classes move to `foundry.appv1.api.*` and warn on global access. Progress uses `ui.notifications.info(label, { progress: true })`. |
| v14 | **Verified** (current stable) | AppV1 classes still present but deprecated. `ApplicationV2` / `DialogV2` are the supported path. |
| v15+ | Expected to work | No `compatibility.maximum` is declared, and every relocated API is feature-detected. |
| v16 | Watch item | Foundry has announced removal of the AppV1 classes (`Application`, `Dialog`, `FormApplication`, `DocumentSheet`). This module already prefers the V2 path, so removal should be a no-op. |

## 🛡️ The rule: detect features, never versions

`game.version` may be **logged**. It must never drive behaviour.

```js
// wrong — breaks on the next generation
if (game.version.startsWith("13")) { /* ... */ }

// right — works on any generation that has either API
const DialogV2 = foundry?.applications?.api?.DialogV2;
```

All of this lives in [`scripts/lib/foundry-compat.js`](../scripts/lib/foundry-compat.js).
Every accessor resolves the **namespaced** API first and only falls back to the
deprecated global, so Foundry's own compatibility warnings stay quiet.

| Accessor | Modern source | Fallback |
|----------|---------------|----------|
| `FoundryCompat.ApplicationV2` | `foundry.applications.api.ApplicationV2` | none |
| `FoundryCompat.DialogV2` | `foundry.applications.api.DialogV2` | none |
| `FoundryCompat.LegacyDialog` | `foundry.appv1.api.Dialog` | `globalThis.Dialog` |
| `FoundryCompat.LegacyFormApplication` | `foundry.appv1.api.FormApplication` | `globalThis.FormApplication` |
| `FoundryCompat.SceneNavigation` | `foundry.applications.ui.SceneNavigation` | `globalThis.SceneNavigation` |
| `FoundryCompat.loadTemplates` | `foundry.applications.handlebars.loadTemplates` | `globalThis.loadTemplates` |
| `FoundryCompat.mergeObject` | `foundry.utils.mergeObject` | `globalThis.mergeObject` |

## 🛡️ Why the settings form is built by a factory

```js
// This evaluates FormApplication at MODULE LOAD. On a Foundry release that
// removed the global, the entire module fails to import — not just the form.
class CompendiumSelectorForm extends FormApplication { /* ... */ }
```

`buildCompendiumSelectorForm()` resolves the base class when settings are
registered instead, and returns `null` (with an error in the log) if no
application framework is available. The module keeps working; only the
settings dialog is missing.

The same reasoning applies to the preview dialog, which goes through
`FoundryCompat.confirmDialog()` and returns both the pending answer and a
`close()` handle so the timeout can dismiss the dialog on either API.

## 🛡️ Actors tab button

The replace button sits in the footer of the Actors sidebar tab. v13/v14
`DocumentDirectory` declares `header`, `directory` and `footer` parts, and the
`renderActorDirectory` hook (`hookEvents.renderApplicationV2`) passes the
application's `HTMLElement`. The hook fires on every re-render, so
`registerActorDirectoryButton` adds the button only once; if a future layout
drops the footer part, it appends its own footer so the button stays at the
bottom.

## 🛡️ Forward-compatible data handling

- **Actor types use a blocklist.** `CompendiumManager.isCreatureEntry` skips
  `character`, `group` and `vehicle`; any type a future system version adds is
  still indexed rather than silently dropped.
- **Source detection is layered.** An exact whitelist of the Wizards of the
  Coast packages is trusted by default; a book released after this version is
  trusted when it is both WotC-authored and a protected premium package for the
  active system, and surfaced as opt-in on authorship alone. Package-id prefixes are never a
  signal. See [`scripts/lib/source-detector.js`](../scripts/lib/source-detector.js).
- **`compatibility.maximum` is never set.** The manifest validator fails the
  build if it is, because it would lock the module out of future generations.

## 🛡️ When Foundry ships a new generation

The `foundry-compat.yml` workflow runs weekly, compares the newest published
generation against `compatibility.verified`, and opens a pull request bumping it.
That PR carries a manual smoke-test checklist:

- [ ] the replace button appears at the bottom of the Actors tab and runs
- [ ] the compendium selector opens, lists sources and saves
- [ ] the preview dialog confirms, cancels and times out
- [ ] the progress bar renders during a replacement
- [ ] wildcard token art still resolves

If an API did move, add the new lookup to `FoundryCompat` (namespaced first,
old path as fallback) and add a test with the API present *and* absent — never
a version check.

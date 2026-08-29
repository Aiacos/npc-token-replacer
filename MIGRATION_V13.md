# Migration Checklist — Foundry VTT v13+ API Compatibility

This document tracks deprecated/changed APIs in Foundry VTT v13 and v14 that affect
`npc-token-replacer`, with the current status of each item.

> **Module status**: fully functional on v13 and v14.
> All breaking fixes have been applied. Items marked *Future Work* are structural
> refactors that do not break functionality but should be addressed in a future major version.

---

## Checklist

### ✅ `Dialog` → `DialogV2`

| Status | Detail |
|--------|--------|
| **FIXED** (v1.5.0) | `scripts/main.js` line ~1083: `Dialog.confirm()` now uses feature detection. |

**Fix applied**: The call site uses `foundry?.applications?.api?.DialogV2` when available
(Foundry v13+) and falls back to the legacy `Dialog.confirm()` on older versions.
The module therefore works on v13 *and* retains v12 backward compatibility if needed.

```js
// BEFORE (v12 legacy)
Dialog.confirm(dialogOpts);

// AFTER (v1.5.0 — feature-detected)
const DialogV2 = foundry?.applications?.api?.DialogV2;
if (DialogV2) {
  DialogV2.confirm({ window: { title }, content, yes: { callback }, no: { callback } });
} else {
  Dialog.confirm(dialogOpts);
}
```

---

### ⚠️ `FormApplication` → `ApplicationV2` (Future Work)

| Status | Detail |
|--------|--------|
| **FUTURE WORK** | `CompendiumSelectorForm extends FormApplication` (~line 1447). |

`FormApplication` is deprecated in v13 in favour of `foundry.applications.api.ApplicationV2`
(or `HandlebarsApplicationMixin(ApplicationV2)`). The legacy class still works in v13 and v14
(via a compatibility shim), so this is **not breaking** right now.

**Recommended migration** (next major version):

```js
// Replace:
class CompendiumSelectorForm extends FormApplication { ... }

// With:
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
class CompendiumSelectorForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "npc-replacer-compendium-selector",
    window: { title: "..." },
    form: { handler: CompendiumSelectorForm.#onSubmit, closeOnSubmit: true }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/compendium-selector.html` } };
  // ...
}
```

This is a significant structural refactor — defer to v2.0.0.

---

### ✅ `loadTemplates` global — Not used

| Status | Detail |
|--------|--------|
| **N/A** | No `loadTemplates()` calls found in `scripts/main.js`. Not applicable. |

---

### ✅ `getProperty` / `setProperty` / `hasProperty` globals — Not used

| Status | Detail |
|--------|--------|
| **N/A** | No bare `getProperty`/`setProperty`/`hasProperty` calls detected. Not applicable. |

The codebase already uses `foundry.utils.mergeObject()` (correctly namespaced), so no
changes needed here.

---

### ✅ `mergeObject` global — Already namespaced

| Status | Detail |
|--------|--------|
| **CLEAN** | All `mergeObject` usage is already via `foundry.utils.mergeObject()`. |

---

## Summary

| API | Status | Version fixed |
|-----|--------|---------------|
| `Dialog.confirm` | ✅ Fixed — feature-detected DialogV2 | v1.5.0 |
| `FormApplication` | ⚠️ Future Work (not breaking on v13/v14) | v2.0.0 |
| `loadTemplates` | ✅ N/A — not used | — |
| `getProperty` | ✅ N/A — not used | — |
| `setProperty` | ✅ N/A — not used | — |
| `mergeObject` (global) | ✅ N/A — already `foundry.utils` | — |

---

## References

- [Foundry v13 API Migration Guide](https://foundryvtt.com/article/v13-migration/)
- [ApplicationV2 docs](https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html)
- [DialogV2 docs](https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html)

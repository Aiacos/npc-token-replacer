# Architecture

**Analysis Date:** 2026-08-30

## Pattern Overview

A facade over static, namespace-like classes, with a compatibility layer between
the module and the Foundry client API. Nothing is instantiated except
`ProgressReporter` (which needs per-run state) and the settings-form model.

## Layers

```
NPCTokenReplacerController          facade: validate → scan → preview → replace → report
        │
        ├── CompendiumManager       detect sources, build the creature index, priorities
        │        └── SourceDetector whitelist + signals, dynamic priority classification
        ├── TokenReplacer           import actors, create tokens, delete originals
        │        ├── WildcardResolver   token art path resolution
        │        └── FolderManager      import folder resolution
        ├── NameMatcher             three-stage creature name matching
        └── ProgressReporter        progress bars
                 │
        FoundryCompat               every relocated Foundry API, feature-detected
                 │
        Foundry VTT client API
```

`compendium-selector.js` sits beside the controller: one model plus two shells
(ApplicationV2 and legacy FormApplication) chosen at registration time.

## Data Flow

1. `ready` hook → detect sources → pre-cache the creature index
2. Toolbar button → `replaceNPCTokens()`
3. Validate prerequisites (GM, active scene, at least one source)
4. Collect NPC tokens: selection if any, otherwise the whole scene
5. `computeMatches()` — match every token name against the index, yielding to the
   UI every 10 iterations
6. Preview dialog through `FoundryCompat.confirmDialog()`, with a timeout
7. Per token: load the compendium document → import or reuse the world actor →
   resolve wildcard art → create the new token → delete the old one
8. Report: replaced, not found, import failures, creation failures, delete failures

## Key Abstractions

| Abstraction | Why it exists |
|-------------|---------------|
| **`FoundryCompat`** | Foundry relocates APIs every generation. Resolving them by shape, namespace first, means a new generation needs no code change — and removing the AppV1 globals in v16 degrades to the V2 path instead of breaking module import. |
| **`SourceDetector` two-layer model** | An exact whitelist gives zero false positives for known content; authorship and premium signals catch books released after this version. Whitelist is trusted, signals are surfaced and opt-in. |
| **Priority tiers** | Adventure > Expansion > Core > Fallback decides which compendium wins when several ship the same creature. Packages outside the whitelist are classified from what their module actually ships. |
| **`TokenReplacerError` with a `phase`** | Failure classification without matching message strings. |
| **Settings-form factory** | Resolves the base class at registration, not at module evaluation. |

## Entry Points

| Hook | Action |
|------|--------|
| `init` | Register settings, preload the picker templates |
| `ready` | Initialize the controller, pre-cache the index, expose `window.NPCTokenReplacer` |
| `getSceneControlButtons` | Add the toolbar button — `onChange` on v13+, `onClick` on the v12 array format |

## Error Handling

Fail loudly internally, degrade gracefully in the UI. Typed errors carry the
phase; the user gets one localized summary notification rather than one per
token. Reading configuration never widens scope on failure: a corrupt setting
falls back to the conservative core set.

## Cross-Cutting Concerns

- **Caching** — compendium index, detected sources, classifications, wildcard
  variants (FIFO, 200), compendium documents (LRU, 100), import folder, actor
  lookup. All cleared through `clearCache()`.
- **Logging** — `Logger` with a module prefix and a debug gate. Detection logs the
  tier and priority behind every decision, so a misclassification is diagnosable
  from the console alone.
- **Localization** — every user-facing string goes through `game.i18n`; CI fails
  on a key used in source but missing from `lang/en.json`.
- **Forward compatibility** — feature detection over version checks, blocklists
  over allowlists for data classification, no `compatibility.maximum`.

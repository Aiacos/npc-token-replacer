/**
 * Project-specific Foundry VTT mock extensions
 *
 * Extends @rayners/foundry-test-utils with mocks for globals that the
 * library does not provide but scripts/main.js requires.
 *
 * Provided by foundry-test-utils (verified working):
 *   game (settings, i18n, user, actors, modules, system, version)
 *   ui (notifications.info, .warn, .error)
 *   canvas (scene with createEmbeddedDocuments, deleteEmbeddedDocuments)
 *   Hooks (on, once, off, call, callAll)
 *   Dialog (confirm, prompt, render, close)
 *   FormApplication (base class)
 *   Folder (create, createDocuments)
 *   Actor (create, createDocuments)
 *   foundry.utils (mergeObject, duplicate, randomID)
 *   CONFIG, CONST
 *   jQuery ($)
 *
 * Missing from foundry-test-utils  | Used by           | Phase needed
 * -------------------------------- | ----------------- | -----------
 * game.packs (.filter, .get)       | CompendiumManager | Phase 3
 * CompendiumCollection             | Type annotations  | Phase 3
 * TokenDocument                    | TokenReplacer     | Phase 3
 * FilePicker                       | WildcardResolver  | Phase 3
 * canvas.tokens (.controlled)      | TokenReplacer     | Phase 3
 * SceneNavigation                  | Phase 5 (progress)| Phase 5
 */

import { vi } from "vitest";

// game.packs -- Collection-like interface that CompendiumManager expects.
// Phase 2/3 will populate with actual mock data; for now provide the shape.
if (!globalThis.game.packs) {
  globalThis.game.packs = {
    get: vi.fn(),
    filter: vi.fn(() => []),
    forEach: vi.fn(),
    size: 0
  };
}

// CompendiumCollection -- referenced for type checks in main.js
if (typeof globalThis.CompendiumCollection === "undefined") {
  globalThis.CompendiumCollection = class MockCompendiumCollection {};
}

// TokenDocument -- used by TokenReplacer for token operations
if (typeof globalThis.TokenDocument === "undefined") {
  globalThis.TokenDocument = class MockTokenDocument {};
}

// SceneNavigation -- used by ProgressReporter v12 fallback path
if (typeof globalThis.SceneNavigation === "undefined") {
  globalThis.SceneNavigation = {
    displayProgressBar: vi.fn()
  };
}

// FilePicker -- used by WildcardResolver for wildcard path probing
if (typeof globalThis.FilePicker === "undefined") {
  globalThis.FilePicker = {
    browse: vi.fn().mockResolvedValue({ files: [] })
  };
}

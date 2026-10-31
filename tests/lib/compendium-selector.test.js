import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { buildCompendiumSelectorForm, CompendiumSelectorModel, MODES } from "../../scripts/lib/compendium-selector.js";

/**
 * Compendium selector tests.
 *
 * The picker exists in two shells (ApplicationV2 and the legacy
 * FormApplication) over one shared model, so the model is tested directly and
 * the factory is tested for picking the right shell.
 */

const pack = (collection, label, packageName) => ({ collection, metadata: { label, packageName } });

const corePack = pack("dnd-monster-manual.monsters", "Monster Manual", "dnd-monster-manual");
const adventurePack = pack("dnd-phandelver-below.monsters", "Phandelver", "dnd-phandelver-below");
const premiumPack = pack("third-party.monsters", "Third Party Bestiary", "third-party");

const compendiumManager = {
  detectWOTCCompendiums: () => [corePack, adventurePack, premiumPack],
  getCompendiumPriority: p => ({ "dnd-monster-manual.monsters": 2, "dnd-phandelver-below.monsters": 4 }[p.collection] ?? 1),
  getSourceTier: p => (p === premiumPack ? "premium" : "official"),
  isOfficialSource: p => p !== premiumPack
};

let originalFoundry;
let onSaved;
let model;

beforeEach(() => {
  originalFoundry = globalThis.foundry;
  onSaved = vi.fn();
  model = new CompendiumSelectorModel({ compendiumManager, onSaved });
  globalThis.game.settings.get = vi.fn().mockReturnValue('["default"]');
  globalThis.game.settings.set = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.foundry = originalFoundry;
  vi.restoreAllMocks();
});

describe("CompendiumSelectorModel", () => {

  describe("getContext", () => {

    it('ticks every official source in "default" mode, but not premium content', () => {
      const context = model.getContext();
      expect(context.mode).toBe("default");
      expect(context.compendiums.find(c => c.id === corePack.collection).enabled).toBe(true);
      expect(context.compendiums.find(c => c.id === adventurePack.collection).enabled).toBe(true);
      expect(context.compendiums.find(c => c.id === premiumPack.collection).enabled).toBe(false);
    });

    it('ticks only priority 1-2 sources in "core" mode', () => {
      globalThis.game.settings.get = vi.fn().mockReturnValue('["core"]');
      const context = model.getContext();
      expect(context.mode).toBe("core");
      expect(context.compendiums.find(c => c.id === corePack.collection).enabled).toBe(true);
      expect(context.compendiums.find(c => c.id === adventurePack.collection).enabled).toBe(false);
    });

    it('ticks everything in "all" mode, premium included', () => {
      globalThis.game.settings.get = vi.fn().mockReturnValue('["all"]');
      const context = model.getContext();
      expect(context.compendiums.every(c => c.enabled)).toBe(true);
    });

    it("reports custom mode and ticks exactly the stored pack ids", () => {
      globalThis.game.settings.get = vi.fn().mockReturnValue(`["${adventurePack.collection}"]`);
      const context = model.getContext();
      expect(context.mode).toBe("custom");
      expect(context.compendiums.filter(c => c.enabled).map(c => c.id)).toEqual([adventurePack.collection]);
    });

    // Mirrors the runtime fallback (core): saving the form must not widen scope
    it("falls back to the core mode when the stored value is corrupt", () => {
      globalThis.game.settings.get = vi.fn().mockReturnValue("{not json");
      expect(model.getContext().mode).toBe("core");
    });

    it("exposes the source tier for every listed compendium", () => {
      const context = model.getContext();
      expect(context.compendiums.find(c => c.id === premiumPack.collection).tier).toBe("premium");
    });

  });

  describe("save", () => {

    it("stores a named mode as a single-entry array", async () => {
      await model.save({ mode: "core" });
      expect(game.settings.set).toHaveBeenCalledWith(
        "npc-token-replacer", "enabledCompendiums", JSON.stringify(["core"])
      );
      expect(onSaved).toHaveBeenCalled();
    });

    it("stores the checked pack ids in custom mode", async () => {
      await model.save({ mode: "custom", packs: [corePack.collection, adventurePack.collection] });
      expect(game.settings.set).toHaveBeenCalledWith(
        "npc-token-replacer", "enabledCompendiums",
        JSON.stringify([corePack.collection, adventurePack.collection])
      );
    });

    it("accepts a single checked box arriving as a bare string", async () => {
      await model.save({ mode: "custom", packs: corePack.collection });
      expect(game.settings.set).toHaveBeenCalledWith(
        "npc-token-replacer", "enabledCompendiums", JSON.stringify([corePack.collection])
      );
    });

    it("warns and reverts to default when custom mode selects nothing", async () => {
      await model.save({ mode: "custom", packs: [] });
      expect(ui.notifications.warn).toHaveBeenCalled();
      expect(game.settings.set).toHaveBeenCalledWith(
        "npc-token-replacer", "enabledCompendiums", JSON.stringify(["default"])
      );
    });

    it("rejects an unknown mode rather than storing it", async () => {
      await model.save({ mode: "sneaky" });
      expect(game.settings.set).toHaveBeenCalledWith(
        "npc-token-replacer", "enabledCompendiums", JSON.stringify(["default"])
      );
    });

    it("reports a failed write instead of throwing", async () => {
      globalThis.game.settings.set = vi.fn().mockRejectedValue(new Error("no permission"));
      await expect(model.save({ mode: "all" })).resolves.toBeUndefined();
      expect(ui.notifications.error).toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

  });

  describe("attachModeListeners", () => {

    const buildForm = checkedValue => {
      const root = document.createElement("div");
      root.innerHTML = `
        <input type="radio" name="mode" value="default">
        <input type="radio" name="mode" value="custom">
        <div id="compendium-list"><input type="checkbox" name="packs" value="a"></div>`;
      root.querySelector(`input[value="${checkedValue}"]`).checked = true;
      return root;
    };

    it("greys out the list when a non-custom mode is selected", () => {
      const root = buildForm("default");
      CompendiumSelectorModel.attachModeListeners(root);
      expect(root.querySelector("#compendium-list").classList.contains("disabled")).toBe(true);
    });

    it("enables the list when custom is picked", () => {
      const root = buildForm("custom");
      CompendiumSelectorModel.attachModeListeners(root);
      expect(root.querySelector("#compendium-list").classList.contains("disabled")).toBe(false);
    });

    it("reacts to switching modes", () => {
      const root = buildForm("default");
      CompendiumSelectorModel.attachModeListeners(root);
      const custom = root.querySelector('input[value="custom"]');
      custom.checked = true;
      custom.dispatchEvent(new Event("change"));
      expect(root.querySelector("#compendium-list").classList.contains("disabled")).toBe(false);
    });

    // The list must stay scrollable outside custom mode, so it is made read-only
    // by disabling the checkboxes, not by swallowing pointer events.
    it("makes the checkboxes read-only outside custom mode, and editable in it", () => {
      const root = buildForm("default");
      CompendiumSelectorModel.attachModeListeners(root);
      const box = root.querySelector('input[name="packs"]');
      expect(box.disabled).toBe(true);

      const custom = root.querySelector('input[value="custom"]');
      custom.checked = true;
      custom.dispatchEvent(new Event("change"));
      expect(box.disabled).toBe(false);
    });

    it("never blocks pointer events on the list itself (it would stop wheel scrolling)", () => {
      const css = readFileSync(resolve(process.cwd(), "styles/npc-token-replacer.css"), "utf8");
      const rules = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)]
        // Rules that target the list element itself (enabled or disabled), not its items
        .filter(([, selector]) => selector.split(",").some(part => /\.compendium-list(\.disabled)?\s*$/.test(part.trim())));
      expect(rules.length).toBeGreaterThan(0);
      for (const [, , body] of rules) expect(body).not.toMatch(/pointer-events\s*:\s*none/);
    });

    it("does nothing when the list is absent", () => {
      expect(() => CompendiumSelectorModel.attachModeListeners(document.createElement("div"))).not.toThrow();
    });

  });

  it("exposes the four selection modes in display order", () => {
    expect(MODES).toEqual(["default", "core", "all", "custom"]);
  });

});

describe("buildCompendiumSelectorForm", () => {

  it("builds an ApplicationV2 shell when the modern API is present", () => {
    class FakeApplicationV2 {
      static DEFAULT_OPTIONS = {};
      async _prepareContext() { return {}; }
      _onRender() {}
    }
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: FakeApplicationV2,
          HandlebarsApplicationMixin: Base => class extends Base {}
        }
      }
    };

    const FormClass = buildCompendiumSelectorForm({ compendiumManager, onSaved: vi.fn() });
    expect(FormClass.prototype).toBeInstanceOf(FakeApplicationV2);
    expect(FormClass.DEFAULT_OPTIONS.tag).toBe("form");
    expect(FormClass.PARTS.body.template).toContain("compendium-selector-body.hbs");
    expect(FormClass.PARTS.footer.template).toContain("compendium-selector-footer.hbs");
  });

  // HandlebarsApplicationMixin (v13/v14) throws during render when a PART
  // template has more than one top-level element, so the settings button
  // silently opens nothing. Mustache tags are stripped before parsing because
  // only the element structure matters here.
  it("every ApplicationV2 part template renders a single root element", () => {
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: class { static DEFAULT_OPTIONS = {}; },
          HandlebarsApplicationMixin: Base => class extends Base {}
        }
      }
    };
    const FormClass = buildCompendiumSelectorForm({ compendiumManager, onSaved: vi.fn() });

    for (const [partId, { template }] of Object.entries(FormClass.PARTS)) {
      const file = template.replace(/^modules\/npc-token-replacer\//, "");
      const markup = readFileSync(resolve(process.cwd(), file), "utf8")
        .replace(/\{\{[^}]*\}\}/g, "");
      const holder = document.createElement("template");
      holder.innerHTML = markup;
      expect(holder.content.children.length, `part "${partId}"`).toBe(1);
    }
  });

  // FormDataExtended may report checkbox groups as booleans; the checked values
  // are read from the form element itself so a custom selection always saves ids
  it("saves the checked pack ids from the form element in custom mode", async () => {
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: class { static DEFAULT_OPTIONS = {}; async _prepareContext() { return {}; } _onRender() {} },
          HandlebarsApplicationMixin: Base => class extends Base {}
        }
      }
    };
    const form = document.createElement("form");
    form.innerHTML = `
      <input type="radio" name="mode" value="custom" checked>
      <input type="checkbox" name="packs" value="dnd5e.monsters" checked>
      <input type="checkbox" name="packs" value="dnd-monster-manual.actors">
      <input type="checkbox" name="packs" value="dnd-tomb-annihilation.actors" checked>`;

    const FormClass = buildCompendiumSelectorForm({ compendiumManager, onSaved });
    await FormClass.DEFAULT_OPTIONS.form.handler(new Event("submit"), form, { object: { mode: "custom", packs: [true, false, true] } });

    expect(game.settings.set).toHaveBeenCalledWith(
      "npc-token-replacer", "enabledCompendiums", JSON.stringify(["dnd5e.monsters", "dnd-tomb-annihilation.actors"])
    );
  });

  it("routes the ApplicationV2 form handler into the shared model", async () => {
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: class { static DEFAULT_OPTIONS = {}; async _prepareContext() { return {}; } _onRender() {} },
          HandlebarsApplicationMixin: Base => class extends Base {}
        }
      }
    };

    const FormClass = buildCompendiumSelectorForm({ compendiumManager, onSaved });
    await FormClass.DEFAULT_OPTIONS.form.handler(new Event("submit"), null, { object: { mode: "all" } });
    expect(game.settings.set).toHaveBeenCalledWith(
      "npc-token-replacer", "enabledCompendiums", JSON.stringify(["all"])
    );
  });

  it("falls back to the legacy FormApplication shell on v12", () => {
    class FakeFormApplication {
      static get defaultOptions() { return {}; }
      activateListeners() {}
    }
    globalThis.foundry = { utils: { mergeObject: (a, b) => ({ ...a, ...b }) } };
    globalThis.FormApplication = FakeFormApplication;

    const FormClass = buildCompendiumSelectorForm({ compendiumManager, onSaved: vi.fn() });
    expect(FormClass.prototype).toBeInstanceOf(FakeFormApplication);
    expect(FormClass.defaultOptions.template).toContain("compendium-selector.html");
  });

});

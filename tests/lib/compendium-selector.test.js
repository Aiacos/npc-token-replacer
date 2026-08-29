import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

    it("falls back to the default mode when the stored value is corrupt", () => {
      globalThis.game.settings.get = vi.fn().mockReturnValue("{not json");
      expect(model.getContext().mode).toBe("default");
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
        <div id="compendium-list"></div>`;
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

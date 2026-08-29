import { Logger, MODULE_ID } from "./logger.js";
import { FoundryCompat } from "./foundry-compat.js";
import { SourceDetector } from "./source-detector.js";

const BODY_TEMPLATE = `modules/${MODULE_ID}/templates/compendium-selector-body.hbs`;
const FOOTER_TEMPLATE = `modules/${MODULE_ID}/templates/compendium-selector-footer.hbs`;
const LEGACY_TEMPLATE = `modules/${MODULE_ID}/templates/compendium-selector.html`;

/** Templates that must be preloaded so the AppV1 wrapper can use them as partials. */
const TEMPLATE_PATHS = Object.freeze([BODY_TEMPLATE, FOOTER_TEMPLATE, LEGACY_TEMPLATE]);

/**
 * Selection modes, in the order they appear in the form.
 * "default" reads every official source, "core" restricts to SRD + rulebooks.
 */
const MODES = Object.freeze(["default", "core", "all", "custom"]);

/**
 * Shared, application-framework-agnostic logic for the compendium picker.
 * Both the ApplicationV2 and the legacy FormApplication shells delegate here,
 * so the behaviour cannot drift between the two code paths.
 */
class CompendiumSelectorModel {
  #compendiumManager;
  #onSaved;

  constructor({ compendiumManager, onSaved }) {
    this.#compendiumManager = compendiumManager;
    this.#onSaved = onSaved;
  }

  /** Current selection, normalised to one of MODES. */
  #readMode() {
    let ids;
    try {
      const raw = game.settings.get(MODULE_ID, "enabledCompendiums");
      ids = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      Logger.warn(`Error parsing enabledCompendiums in form (${error.name}: ${error.message}), displaying default selection`);
      ids = ["default"];
    }

    if (!Array.isArray(ids) || ids.length === 0) return { mode: "default", ids: [] };
    for (const mode of MODES) {
      if (mode !== "custom" && ids.includes(mode)) return { mode, ids };
    }
    return { mode: "custom", ids };
  }

  /** Render context shared by both form implementations. */
  getContext() {
    const allPacks = this.#compendiumManager.detectWOTCCompendiums();
    const { mode, ids } = this.#readMode();
    const selected = mode === "custom" ? new Set(ids) : null;

    return {
      mode,
      compendiums: allPacks.map(pack => {
        const priority = this.#compendiumManager.getCompendiumPriority(pack);
        const tier = this.#compendiumManager.getSourceTier(pack);
        const isOfficial = this.#compendiumManager.isOfficialSource(pack);
        return {
          id: pack.collection,
          name: pack.metadata.label,
          module: SourceDetector.KNOWN_MODULE_LABELS[pack.metadata.packageName] ?? pack.metadata.packageName,
          priority,
          priorityLabel: SourceDetector.PRIORITY_LABELS[priority] || "UNKNOWN",
          tier,
          tierLabel: game.i18n.localize(`NPC_REPLACER.Tier.${tier}`),
          enabled: mode === "all"
            || (mode === "default" && isOfficial)
            || (mode === "core" && priority <= SourceDetector.PRIORITY.CORE)
            || (selected?.has(pack.collection) ?? false),
          isCoreFallback: priority <= SourceDetector.PRIORITY.CORE
        };
      })
    };
  }

  /** Checked pack ids from submitted form data, tolerating the single-value shape. */
  static #checkedPacks(formData) {
    const raw = formData?.packs;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return [raw].filter(Boolean);
  }

  /**
   * Persist the submitted selection.
   * @param {object} formData Plain object of form values
   */
  async save(formData) {
    const mode = MODES.includes(formData?.mode) ? formData.mode : "default";

    let enabled;
    if (mode === "custom") {
      enabled = CompendiumSelectorModel.#checkedPacks(formData);
      if (enabled.length === 0) {
        ui.notifications.warn(game.i18n.localize("NPC_REPLACER.NoCompendium"));
        enabled = ["default"];
      }
    } else {
      enabled = [mode];
    }

    Logger.log("Saving enabledCompendiums:", enabled);

    try {
      await game.settings.set(MODULE_ID, "enabledCompendiums", JSON.stringify(enabled));
      this.#onSaved?.();
      ui.notifications.info(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Saved"));
    } catch (error) {
      Logger.error(`Failed to save compendium settings (${error.name}: ${error.message})`);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.SaveError"));
    }
  }

  /** Grey out the pack list unless "custom" is selected. Works on a plain element. */
  static attachModeListeners(root) {
    const el = FoundryCompat.toElement(root);
    const list = el?.querySelector("#compendium-list");
    if (!el || !list) return;

    const sync = value => list.classList.toggle("disabled", value !== "custom");
    el.querySelectorAll('input[name="mode"]').forEach(radio => {
      radio.addEventListener("change", event => sync(event.target.value));
    });
    sync(el.querySelector('input[name="mode"]:checked')?.value);
  }
}

/**
 * Build the settings form class for whichever application framework this
 * client provides. Resolved lazily at registration time so that removing the
 * AppV1 globals in a future Foundry generation cannot break module loading.
 *
 * @param {object} deps
 * @param {object} deps.compendiumManager Provides detection and priority lookups
 * @param {Function} deps.onSaved Invoked after a successful save (cache invalidation)
 * @returns {Function} A class suitable for `game.settings.registerMenu`
 */
function buildCompendiumSelectorForm({ compendiumManager, onSaved }) {
  const model = new CompendiumSelectorModel({ compendiumManager, onSaved });

  if (FoundryCompat.supportsApplicationV2) {
    const { ApplicationV2, HandlebarsApplicationMixin } = FoundryCompat;

    return class CompendiumSelectorApplication extends HandlebarsApplicationMixin(ApplicationV2) {
      static DEFAULT_OPTIONS = {
        id: "npc-replacer-compendium-selector",
        tag: "form",
        classes: ["npc-token-replacer", "compendium-selector", "standard-form"],
        window: {
          title: "NPC_REPLACER.Settings.CompendiumSelector.Title",
          icon: "fas fa-book",
          contentClasses: ["standard-form"]
        },
        position: { width: 520, height: "auto" },
        form: {
          handler: (event, form, formData) => model.save(formData?.object ?? formData),
          closeOnSubmit: true
        }
      };

      static PARTS = {
        body: { template: BODY_TEMPLATE },
        footer: { template: FOOTER_TEMPLATE }
      };

      async _prepareContext(options) {
        return Object.assign(await super._prepareContext(options), model.getContext());
      }

      _onRender(context, options) {
        super._onRender(context, options);
        CompendiumSelectorModel.attachModeListeners(this.element);
      }
    };
  }

  const LegacyFormApplication = FoundryCompat.LegacyFormApplication;
  if (!LegacyFormApplication) {
    Logger.error("No application framework available — the compendium selector cannot be registered");
    return null;
  }

  Logger.debug("ApplicationV2 unavailable — using the legacy FormApplication shell");

  return class CompendiumSelectorForm extends LegacyFormApplication {
    static get defaultOptions() {
      return FoundryCompat.mergeObject(super.defaultOptions, {
        id: "npc-replacer-compendium-selector",
        title: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Title"),
        template: LEGACY_TEMPLATE,
        classes: ["npc-token-replacer", "compendium-selector"],
        width: 520,
        height: "auto",
        closeOnSubmit: true
      });
    }

    getData() {
      return model.getContext();
    }

    activateListeners(html) {
      super.activateListeners(html);
      CompendiumSelectorModel.attachModeListeners(html);
    }

    async _updateObject(event, formData) {
      await model.save(formData);
    }
  };
}

/** Preload the picker templates so the legacy wrapper can use them as partials. */
async function preloadSelectorTemplates() {
  const loader = FoundryCompat.loadTemplates;
  if (!loader) return;
  try {
    await loader(TEMPLATE_PATHS);
  } catch (error) {
    Logger.warn(`Failed to preload compendium selector templates: ${error.message}`);
  }
}

export { buildCompendiumSelectorForm, preloadSelectorTemplates, CompendiumSelectorModel, MODES, TEMPLATE_PATHS };

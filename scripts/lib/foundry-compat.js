import { Logger } from "./logger.js";

/**
 * Version-agnostic access to the Foundry VTT client API.
 *
 * Every accessor resolves the modern namespaced API first and only falls back
 * to a deprecated global when the namespace is missing. Nothing branches on
 * `game.version`, so a future generation that keeps the namespaced API works
 * with no code change, and a generation that finally removes the AppV1 globals
 * (scheduled for v16) degrades to the V2 path on its own.
 *
 * Reading a deprecated global logs a compatibility warning in Foundry, which is
 * why the namespaced lookup always comes first.
 */
class FoundryCompat {
  /**
   * Foundry generation number (12, 13, 14, ...).
   * Diagnostics and logging only — never branch behaviour on this.
   * @returns {number} 0 when the version cannot be determined
   */
  static get generation() {
    const raw = globalThis.game?.release?.generation ?? globalThis.game?.version ?? "";
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** @returns {typeof globalThis.foundry|undefined} */
  static get #ns() {
    return globalThis.foundry;
  }

  /** ApplicationV2 base class (v12+), or null when unavailable. */
  static get ApplicationV2() {
    return FoundryCompat.#ns?.applications?.api?.ApplicationV2 ?? null;
  }

  /** HandlebarsApplicationMixin (v12+), or null when unavailable. */
  static get HandlebarsApplicationMixin() {
    return FoundryCompat.#ns?.applications?.api?.HandlebarsApplicationMixin ?? null;
  }

  /** DialogV2 class (v12+), or null when unavailable. */
  static get DialogV2() {
    return FoundryCompat.#ns?.applications?.api?.DialogV2 ?? null;
  }

  /** Legacy AppV1 Dialog — namespaced in v13+, global in v12. Null once removed. */
  static get LegacyDialog() {
    return FoundryCompat.#ns?.appv1?.api?.Dialog ?? globalThis.Dialog ?? null;
  }

  /** Legacy AppV1 FormApplication — namespaced in v13+, global in v12. */
  static get LegacyFormApplication() {
    return FoundryCompat.#ns?.appv1?.api?.FormApplication ?? globalThis.FormApplication ?? null;
  }

  /** SceneNavigation — namespaced in v13+, global in v12. Used for the v12 progress bar. */
  static get SceneNavigation() {
    return FoundryCompat.#ns?.applications?.ui?.SceneNavigation ?? globalThis.SceneNavigation ?? null;
  }

  /** Handlebars template loader — namespaced in v13+, global in v12. */
  static get loadTemplates() {
    return FoundryCompat.#ns?.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates ?? null;
  }

  /** `foundry.utils.mergeObject`, with the v12 global as fallback. */
  static get mergeObject() {
    return FoundryCompat.#ns?.utils?.mergeObject ?? globalThis.mergeObject ?? null;
  }

  /** True when the ApplicationV2 settings-form path can be used. */
  static get supportsApplicationV2() {
    return Boolean(FoundryCompat.ApplicationV2 && FoundryCompat.HandlebarsApplicationMixin);
  }

  /**
   * Normalise the argument a render/activateListeners callback receives.
   * v12 hands over a jQuery object, v13+ an HTMLElement.
   * @param {HTMLElement|object} html
   * @returns {HTMLElement|null}
   */
  static toElement(html) {
    if (!html) return null;
    if (html instanceof globalThis.HTMLElement) return html;
    return html[0] ?? html ?? null;
  }

  /**
   * Show a yes/no confirmation dialog on whichever dialog API this client has.
   *
   * Returns the pending answer plus a handle to dismiss the dialog, so callers
   * can implement their own timeout without racing a detached promise.
   *
   * @param {object} options
   * @param {string} options.title        Window title
   * @param {string} options.content      HTML body
   * @param {string} options.yesLabel     Confirm button label
   * @param {string} options.noLabel      Cancel button label
   * @param {boolean} [options.yesDisabled=false] Render the confirm button unusable
   * @returns {{answer: Promise<boolean>, close: () => void}}
   */
  static confirmDialog({ title, content, yesLabel, noLabel, yesDisabled = false }) {
    const DialogV2 = FoundryCompat.DialogV2;
    if (DialogV2) return FoundryCompat.#confirmWithDialogV2({ DialogV2, title, content, yesLabel, noLabel, yesDisabled });

    const LegacyDialog = FoundryCompat.LegacyDialog;
    if (LegacyDialog) return FoundryCompat.#confirmWithLegacyDialog({ LegacyDialog, title, content, yesLabel, noLabel, yesDisabled });

    Logger.error("No dialog API available on this Foundry version — cancelling operation");
    return { answer: Promise.resolve(false), close: () => {} };
  }

  static #confirmWithDialogV2({ DialogV2, title, content, yesLabel, noLabel, yesDisabled }) {
    let instance = null;
    const answer = DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "yes",
          icon: "fas fa-check",
          label: yesLabel,
          disabled: yesDisabled,
          callback: () => true
        },
        {
          action: "no",
          icon: "fas fa-times",
          label: noLabel,
          default: true,
          callback: () => false
        }
      ],
      rejectClose: false
    }).then(result => result === true);

    // DialogV2.wait() does not hand back the instance; the render hook does.
    const hookId = globalThis.Hooks?.on?.("renderDialogV2", app => {
      if (app?.options?.window?.title === title) instance = app;
    });
    answer.finally(() => globalThis.Hooks?.off?.("renderDialogV2", hookId));

    return { answer, close: () => { try { instance?.close(); } catch { /* already closed */ } } };
  }

  static #confirmWithLegacyDialog({ LegacyDialog, title, content, yesLabel, noLabel, yesDisabled }) {
    let instance = null;
    const answer = new Promise(resolve => {
      const options = {
        title,
        content,
        buttons: {
          yes: { icon: '<i class="fas fa-check"></i>', label: yesLabel, callback: () => resolve(true) },
          no: { icon: '<i class="fas fa-times"></i>', label: noLabel, callback: () => resolve(false) }
        },
        default: "no",
        close: () => resolve(false)
      };

      if (yesDisabled) {
        options.render = html => {
          const el = FoundryCompat.toElement(html);
          el?.querySelectorAll('.yes, [data-button="yes"], [data-action="yes"]')
            .forEach(button => { button.disabled = true; });
        };
      }

      instance = new LegacyDialog(options);
      instance.render(true);
    });

    return { answer, close: () => { try { instance?.close(); } catch { /* already closed */ } } };
  }
}

export { FoundryCompat };

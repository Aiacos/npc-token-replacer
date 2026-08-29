import { Logger } from "./logger.js";
import { FoundryCompat } from "./foundry-compat.js";

/**
 * Unified progress bar for Foundry VTT v12/v13.
 * v13+: ui.notifications.info({ progress: true }); v12: SceneNavigation.displayProgressBar().
 * Uses duck-typing for version detection per project convention, so a future
 * generation keeps whichever API it still exposes.
 */
class ProgressReporter {
  #notification = null;
  #total = 0;

  static #isV13ProgressAvailable() {
    return typeof ui.notifications?.update === "function";
  }

  /** Bound v12 progress bar function, or null when the API is gone. */
  static #legacyBar() {
    const nav = FoundryCompat.SceneNavigation;
    if (typeof nav?.displayProgressBar !== "function") return null;
    return nav.displayProgressBar.bind(nav);
  }

  start(total, label) {
    this.#total = total;
    if (total <= 0) return;

    try {
      if (ProgressReporter.#isV13ProgressAvailable()) {
        this.#notification = ui.notifications.info(label, { progress: true });
      } else {
        ProgressReporter.#legacyBar()?.({ label, pct: 0 });
      }
    } catch (error) {
      Logger.debug(`Progress bar start failed: ${error.message}`);
    }
  }

  update(current, label) {
    if (this.#total === 0) return;
    const pct = Math.min(current / this.#total, 1);

    try {
      if (this.#notification) {
        this.#notification.update({ pct, message: label });
      } else {
        ProgressReporter.#legacyBar()?.({ label, pct: Math.round(pct * 100) });
      }
    } catch (error) {
      Logger.debug(`Progress bar update failed: ${error.message}`);
    }
  }

  finish() {
    try {
      if (this.#notification) {
        this.#notification.update({ pct: 1.0 });
        this.#notification = null;
      } else {
        ProgressReporter.#legacyBar()?.({ label: "", pct: 100 });
      }
    } catch (error) {
      Logger.debug(`Progress bar finish failed: ${error.message}`);
      this.#notification = null;
    }
    this.#total = 0;
  }
}

export { ProgressReporter };

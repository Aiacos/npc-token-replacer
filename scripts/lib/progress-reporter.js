import { Logger } from "./logger.js";

/**
 * ProgressReporter - Unified progress bar abstraction for Foundry VTT v12/v13
 *
 * Handles the different progress APIs:
 * - v13: ui.notifications.info() with { progress: true } returning updatable notification
 * - v12: SceneNavigation.displayProgressBar() with integer 0-100 pct
 *
 * Uses duck-typing (typeof ui.notifications.update) for version detection,
 * not game.version checks, per project convention.
 *
 * @class
 */
class ProgressReporter {
  /** @type {object|null} v13 notification object with .update() method */
  #notification = null;

  /** @type {number} Total items to process */
  #total = 0;

  /**
   * Detect whether the v13 progress notification API is available
   * @returns {boolean}
   */
  static #isV13ProgressAvailable() {
    return typeof ui.notifications?.update === "function";
  }

  /**
   * Begin progress tracking
   * @param {number} total - Total number of items to process
   * @param {string} label - Label to display on the progress bar
   */
  start(total, label) {
    this.#total = total;
    if (total <= 0) return;

    try {
      if (ProgressReporter.#isV13ProgressAvailable()) {
        this.#notification = ui.notifications.info(label, { progress: true });
      } else if (typeof SceneNavigation?.displayProgressBar === "function") {
        SceneNavigation.displayProgressBar({ label, pct: 0 });
      }
    } catch (error) {
      Logger.debug(`Progress bar start failed: ${error.message}`);
    }
  }

  /**
   * Update progress
   * @param {number} current - Current item number
   * @param {string} label - Label to display on the progress bar
   */
  update(current, label) {
    if (this.#total === 0) return;
    const pct = Math.min(current / this.#total, 1);

    try {
      if (this.#notification) {
        this.#notification.update({ pct, message: label });
      } else if (typeof SceneNavigation?.displayProgressBar === "function") {
        SceneNavigation.displayProgressBar({ label, pct: Math.round(pct * 100) });
      }
    } catch (error) {
      Logger.debug(`Progress bar update failed: ${error.message}`);
    }
  }

  /**
   * Finish progress tracking, set to 100%
   */
  finish() {
    try {
      if (this.#notification) {
        this.#notification.update({ pct: 1.0 });
        this.#notification = null;
      } else if (typeof SceneNavigation?.displayProgressBar === "function") {
        SceneNavigation.displayProgressBar({ label: "", pct: 100 });
      }
    } catch (error) {
      Logger.debug(`Progress bar finish failed: ${error.message}`);
      this.#notification = null;
    }
    this.#total = 0;
  }
}

export { ProgressReporter };

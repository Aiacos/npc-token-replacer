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

    if (ProgressReporter.#isV13ProgressAvailable()) {
      this.#notification = ui.notifications.info(label, { progress: true });
    } else {
      SceneNavigation.displayProgressBar({ label, pct: 0 });
    }
  }

  /**
   * Update progress
   * @param {number} current - Current item number
   * @param {string} label - Label to display on the progress bar
   */
  update(current, label) {
    if (this.#total === 0) return; // No active progress session
    const pct = Math.min(current / this.#total, 1);

    if (this.#notification) {
      this.#notification.update({ pct, message: label });
    } else {
      SceneNavigation.displayProgressBar({ label, pct: Math.round(pct * 100) });
    }
  }

  /**
   * Finish progress tracking, set to 100%
   */
  finish() {
    if (this.#notification) {
      this.#notification.update({ pct: 1.0 });
      this.#notification = null;
    } else {
      SceneNavigation.displayProgressBar({ label: "", pct: 100 });
    }
    this.#total = 0;
  }
}

export { ProgressReporter };

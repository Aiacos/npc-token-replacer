/**
 * ProgressReporter - Unified progress bar abstraction for Foundry VTT v12/v13
 *
 * Handles the different progress APIs:
 * - v13: ui.notifications.info() with { progress: true } returning updatable notification
 * - v12: SceneNavigation.displayProgressBar() with integer 0-100 pct
 *
 * @class
 */
class ProgressReporter {
  /**
   * Begin progress tracking
   * @param {number} total - Total number of items to process
   * @param {string} label - Label to display on the progress bar
   */
  start(total, label) {
    throw new Error("Not implemented");
  }

  /**
   * Update progress
   * @param {number} current - Current item number
   * @param {string} label - Label to display on the progress bar
   */
  update(current, label) {
    throw new Error("Not implemented");
  }

  /**
   * Finish progress tracking, set to 100%
   */
  finish() {
    throw new Error("Not implemented");
  }
}

export { ProgressReporter };

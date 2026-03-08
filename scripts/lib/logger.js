const MODULE_ID = "npc-token-replacer";

/** Centralized logging with module prefix. */
class Logger {
  static #MODULE_PREFIX = MODULE_ID;
  static get MODULE_PREFIX() { return Logger.#MODULE_PREFIX; }

  /** Gate expensive debug calls in hot paths by checking this first. */
  static #debugEnabled = false;
  static get debugEnabled() { return Logger.#debugEnabled; }
  static set debugEnabled(value) { Logger.#debugEnabled = !!value; }

  static log(message, data = null) {
    if (data !== null && data !== undefined) {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  static error(message, error = null) {
    if (error !== null && error !== undefined) {
      console.error(`${Logger.#MODULE_PREFIX} | ${message}`, error);
    } else {
      console.error(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  static warn(message, data = null) {
    if (data !== null && data !== undefined) {
      console.warn(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.warn(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  /** Only logs when debugEnabled is true. */
  static debug(message, data = null) {
    if (!Logger.#debugEnabled) return;
    if (data !== null && data !== undefined) {
      console.debug(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.debug(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }
}

export { Logger, MODULE_ID };

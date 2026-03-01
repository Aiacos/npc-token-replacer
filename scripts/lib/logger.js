/**
 * The unique identifier for this module
 * Used for settings registration, hook identification, and logging
 * @type {string}
 * @constant
 */
const MODULE_ID = "npc-token-replacer";

/**
 * Logger utility class for consistent logging with module prefix
 * Provides centralized logging functionality with automatic module ID prefixing
 * @class
 */
class Logger {
  /**
   * The module ID used as prefix for all log messages
   * @type {string}
   * @static
   * @readonly
   */
  static #MODULE_PREFIX = MODULE_ID;
  static get MODULE_PREFIX() {
    return Logger.#MODULE_PREFIX;
  }

  /**
   * Whether debug logging is enabled — gate expensive debug calls in hot paths
   * @type {boolean}
   * @static
   */
  static #debugEnabled = false;
  static get debugEnabled() {
    return Logger.#debugEnabled;
  }
  static set debugEnabled(value) {
    Logger.#debugEnabled = !!value;
  }

  /**
   * Log an informational message with the module prefix
   * @param {string} message - The message to log
   * @param {any} [data=null] - Optional data to log alongside the message
   * @returns {void}
   * @static
   * @example
   * Logger.log("Module initialized");
   * Logger.log("Found creatures", { count: 5, names: ["Goblin", "Orc"] });
   */
  static log(message, data = null) {
    if (data !== null && data !== undefined) {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.log(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  /**
   * Log an error message with the module prefix
   * @param {string} message - The error message describing what went wrong
   * @param {Error|any} [error=null] - The error object or additional error context
   * @returns {void}
   * @static
   * @example
   * Logger.error("Failed to load compendium", new Error("Network timeout"));
   * Logger.error("Invalid token data", { tokenId: "abc123", reason: "missing actor" });
   */
  static error(message, error = null) {
    if (error !== null && error !== undefined) {
      console.error(`${Logger.#MODULE_PREFIX} | ${message}`, error);
    } else {
      console.error(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  /**
   * Log a warning message with the module prefix
   * @param {string} message - The warning message
   * @param {any} [data=null] - Optional data to log alongside the warning
   * @returns {void}
   * @static
   * @example
   * Logger.warn("Deprecated function called", { function: "getMonsterManualPack" });
   */
  static warn(message, data = null) {
    if (data !== null && data !== undefined) {
      console.warn(`${Logger.#MODULE_PREFIX} | ${message}`, data);
    } else {
      console.warn(`${Logger.#MODULE_PREFIX} | ${message}`);
    }
  }

  /**
   * Log a debug message with the module prefix (only in development)
   * @param {string} message - The debug message
   * @param {any} [data=null] - Optional data to log alongside the debug message
   * @returns {void}
   * @static
   * @example
   * Logger.debug("Processing token", { name: "Goblin", id: "token123" });
   */
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

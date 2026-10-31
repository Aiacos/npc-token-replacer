/** Error with phase indicator ("import_failed", "creation_failed", "delete_failed"). */
class TokenReplacerError extends Error {
  constructor(message, phase) {
    super(message);
    this.name = "TokenReplacerError";
    this.phase = phase;
  }
}

export { TokenReplacerError };

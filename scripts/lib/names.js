/**
 * Lowercase, strip punctuation, normalize whitespace (Unicode-safe). Hyphens
 * become spaces so "Half-Orc" and "Half Orc" compare equal. A leaf module so
 * every name-related module can share one normalization without import cycles.
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

export { normalizeName };

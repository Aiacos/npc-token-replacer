/** HTML-escape a value for safe interpolation into dialog and notification markup. */
const HTML_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
});
const HTML_ESCAPE_PATTERN = /[&<>"']/g;

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(HTML_ESCAPE_PATTERN, char => HTML_ESCAPES[char]);
}

export { escapeHtml };

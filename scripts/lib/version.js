/**
 * Version of the code in this file tree. tools/bump-version.mjs keeps it equal
 * to module.json, and tools/validate-manifest.mjs fails the release if they
 * differ. At runtime it is compared with the installed manifest: a mismatch
 * means the browser is running cached files from an older release.
 */
export const CODE_VERSION = "1.8.5";

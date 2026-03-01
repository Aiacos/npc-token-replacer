/**
 * Cache-clearing beforeEach template
 *
 * This file is a REFERENCE TEMPLATE -- it is NOT auto-executed by Vitest.
 * Each test file should import and adapt this pattern for the classes it tests.
 *
 * Usage: Copy the relevant beforeEach block into your test file and
 * uncomment only the clearCache() calls for classes your test exercises.
 *
 * Available cache-clearing methods (from scripts/main.js):
 *
 *   CompendiumManager.clearCache()
 *     Clears: #indexCache (combined monster index from all compendiums)
 *             #wotcCompendiumsCache (detected WotC compendiums list)
 *
 *   FolderManager.clearCache()
 *     Clears: #importFolderCache (Actor folder for compendium imports)
 *
 *   WildcardResolver.clearCache()
 *     Clears: #variantCache (resolved wildcard token paths)
 *
 *   TokenReplacer.resetCounter()
 *     Resets: #sequentialCounter (token variant counter)
 *
 * Example:
 *
 *   import { CompendiumManager } from "../../scripts/lib/compendium-manager.js";
 *   import { WildcardResolver } from "../../scripts/lib/wildcard-resolver.js";
 *
 *   beforeEach(() => {
 *     CompendiumManager.clearCache();
 *     WildcardResolver.clearCache();
 *   });
 */

/**
 * Template function demonstrating the cache-clearing pattern.
 * Import this in test files that need a starting point.
 *
 * @param {object} classes - Object with class references to clear
 * @param {object} [classes.CompendiumManager] - Has .clearCache()
 * @param {object} [classes.FolderManager] - Has .clearCache()
 * @param {object} [classes.WildcardResolver] - Has .clearCache()
 * @param {object} [classes.TokenReplacer] - Has .resetCounter()
 */
export function clearAllCaches(classes = {}) {
  if (classes.CompendiumManager) classes.CompendiumManager.clearCache();
  if (classes.FolderManager) classes.FolderManager.clearCache();
  if (classes.WildcardResolver) classes.WildcardResolver.clearCache();
  if (classes.TokenReplacer) classes.TokenReplacer.resetCounter();
}

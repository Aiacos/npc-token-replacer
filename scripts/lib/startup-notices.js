import { Logger, MODULE_ID } from "./logger.js";
import { SourceDetector } from "./source-detector.js";
import { CompendiumManager } from "./compendium-manager.js";
import { CODE_VERSION } from "./version.js";

/**
 * Notices shown once the world is ready, unrelated to the replace workflow:
 * new official books found, and a browser running cached older module code.
 */
class StartupNotices {
  /**
   * Tell the GM, once per book, about official-looking content (WotC / Foundry
   * Gaming authorship) that is not in the whitelist and not in use. Such books
   * are never trusted silently, so without this the GM would only learn about
   * them from the console.
   */
  static async notifyNewOfficialSources() {
    if (!game.user?.isGM) return;

    let notified;
    try {
      const raw = game.settings.get(MODULE_ID, "notifiedSources");
      notified = new Set(typeof raw === "string" ? JSON.parse(raw || "[]") : raw ?? []);
    } catch (error) {
      // Unreadable state would mean a notice on every load; stay quiet instead
      Logger.debug(`notifiedSources unavailable, skipping new-source notice: ${error.message}`);
      return;
    }

    const inUse = new Set(CompendiumManager.getEnabledCompendiums().map(pack => pack.collection));
    // packageName -> label, one entry per book. Verified books are already used;
    // publisher-only books wait for the GM to opt in.
    const enabled = new Map();
    const waiting = new Map();
    for (const pack of CompendiumManager.detectWOTCCompendiums()) {
      const tier = CompendiumManager.getSourceTier(pack);
      const packageName = pack.metadata.packageName;
      if (notified.has(packageName)) continue;
      if (tier === SourceDetector.TIER.VERIFIED && inUse.has(pack.collection)) {
        enabled.set(packageName, CompendiumManager.getSourceLabel(pack));
      } else if ((tier === SourceDetector.TIER.VERIFIED || tier === SourceDetector.TIER.PUBLISHER) && !inUse.has(pack.collection)) {
        waiting.set(packageName, CompendiumManager.getSourceLabel(pack));
      }
    }

    if (enabled.size === 0 && waiting.size === 0) return;

    // Titles come from third-party manifests: Foundry escapes format values
    const options = books => ({
      localize: true, format: { names: [...books.values()].join(", ") }, escape: true, permanent: true
    });
    if (enabled.size > 0) ui.notifications.info("NPC_REPLACER.NewOfficialSourcesEnabled", options(enabled));
    if (waiting.size > 0) ui.notifications.info("NPC_REPLACER.NewOfficialSources", options(waiting));

    try {
      await game.settings.set(MODULE_ID, "notifiedSources",
        JSON.stringify([...notified, ...enabled.keys(), ...waiting.keys()]));
    } catch (error) {
      Logger.warn(`Could not remember notified sources, the notice may repeat: ${error.message}`);
    }
  }

  /**
   * Compare the running code with the installed manifest. After an update the
   * browser can keep serving cached module files while module.json is already
   * new, so the module half-works on old code; tell the GM to hard-reload.
   * @returns {boolean} true when they match
   */
  static checkLoadedCodeVersion() {
    const installed = game.modules.get(MODULE_ID)?.version;
    if (!installed || installed === CODE_VERSION) return true;
    Logger.warn(`Installed version ${installed} but the browser is running code ${CODE_VERSION} — cached files; hard-reload the page`);
    if (game.user?.isGM) {
      ui.notifications.warn("NPC_REPLACER.StaleCode", {
        localize: true,
        format: { installed, running: CODE_VERSION },
        permanent: true
      });
    }
    return false;
  }
}

export { StartupNotices };

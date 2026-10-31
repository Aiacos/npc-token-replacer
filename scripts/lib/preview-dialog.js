import { Logger, MODULE_ID } from "./logger.js";
import { FoundryCompat } from "./foundry-compat.js";
import { escapeHtml } from "./html.js";

const NO_SKIPS = Object.freeze({ replaced: 0, inCombat: 0 });
const DEFAULT_TIMEOUT_MINUTES = 5;

/**
 * The mandatory dry-run preview (Constitution III.3): lists every token that
 * will be replaced, every D&D Beyond actor that will be overwritten or left
 * unchanged, and what was skipped, before anything changes.
 */
class PreviewDialog {
  /** Localized, HTML-escaped text. */
  static #text(key, data) {
    return escapeHtml(data ? game.i18n.format(key, data) : game.i18n.localize(key));
  }

  static #table(headerKeys, rows) {
    const headers = headerKeys.map(key => `<th>${PreviewDialog.#text(key)}</th>`).join("");
    return `
      <div class="npc-replacer-preview-table-container">
        <table class="npc-replacer-preview-table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>`;
  }

  static #noMatchCell(key) {
    return `<td class="npc-replacer-no-match">${PreviewDialog.#text(key)}</td><td>&mdash;</td>`;
  }

  /**
   * Build the dialog body. Pure: no dialog, no settings.
   * @param {{tokenDoc, scene?, creatureName, match, overwrite?}[]} matchResults
   * @param {{actor, match}[]} actorPlan
   * @param {{replaced: number, inCombat: number}} skipped
   * @returns {{content: string, actionable: boolean}} actionable is false when nothing would change
   */
  static buildContent(matchResults, actorPlan = [], skipped = NO_SKIPS) {
    const matched = matchResults.filter(r => r.match !== null);
    const unmatched = matchResults.filter(r => r.match === null);
    const plannedActors = actorPlan.filter(p => p.match);

    const tokenRows = [...matched, ...unmatched].map(result => {
      const cells = [`<td>${escapeHtml(result.creatureName)}</td>`, `<td>${escapeHtml(result.scene?.name ?? "")}</td>`];
      if (!result.match) return `<tr>${cells.join("")}${PreviewDialog.#noMatchCell("NPC_REPLACER.PreviewNoMatch")}</tr>`;
      const overwriteNote = result.overwrite
        ? `<br><small class="npc-replacer-overwrite">${PreviewDialog.#text("NPC_REPLACER.PreviewOverwrites", { name: result.overwrite.name })}</small>`
        : "";
      return `<tr>${cells.join("")}<td>${escapeHtml(result.match.entry.name)}${overwriteNote}</td><td>${escapeHtml(result.match.pack.metadata.label)}</td></tr>`;
    });

    const actorRows = actorPlan.map(({ actor, match }) => match
      ? `<tr><td>${escapeHtml(actor.name)}</td><td>${escapeHtml(match.entry.name)}</td><td>${escapeHtml(match.pack.metadata.label)}</td></tr>`
      : `<tr><td>${escapeHtml(actor.name)}</td>${PreviewDialog.#noMatchCell("NPC_REPLACER.PreviewActorUnchanged")}</tr>`);

    // One actor can back many tokens, and appear in both lists; count each overwrite once
    const overwriteCount = new Set([
      ...matched.filter(r => r.overwrite).map(r => r.overwrite.id),
      ...plannedActors.map(p => p.actor.id)
    ]).size;

    const sections = [];
    if (overwriteCount > 0) {
      sections.push(`<p class="npc-replacer-overwrite-summary"><i class="fas fa-triangle-exclamation"></i> ${PreviewDialog.#text("NPC_REPLACER.PreviewOverwriteSummary", { count: overwriteCount })}</p>`);
    }
    if (skipped.replaced || skipped.inCombat) {
      sections.push(`<p class="hint">${PreviewDialog.#text("NPC_REPLACER.TokensSkipped", skipped)}</p>`);
    }
    // With no tokens to replace the button only updates actors: no token table
    if (matchResults.length > 0) {
      const scenes = new Set(matchResults.map(r => r.scene?.id)).size;
      sections.push(`<p>${PreviewDialog.#text("NPC_REPLACER.PreviewSummary", { scenes, matched: matched.length, total: matchResults.length })}</p>`);
      sections.push(PreviewDialog.#table(
        ["NPC_REPLACER.PreviewColToken", "NPC_REPLACER.PreviewColScene", "NPC_REPLACER.PreviewColMatch", "NPC_REPLACER.PreviewColSource"],
        tokenRows));
    }
    if (actorPlan.length > 0) {
      sections.push(`<h4>${PreviewDialog.#text("NPC_REPLACER.PreviewActorsTitle")}</h4>`);
      sections.push(PreviewDialog.#table(
        ["NPC_REPLACER.PreviewColActor", "NPC_REPLACER.PreviewColMatch", "NPC_REPLACER.PreviewColSource"],
        actorRows));
    }

    return { content: sections.join("\n"), actionable: matched.length > 0 || plannedActors.length > 0 };
  }

  static #timeoutMs() {
    let minutes = DEFAULT_TIMEOUT_MINUTES;
    try {
      const value = game.settings.get(MODULE_ID, "dialogTimeout");
      if (Number.isFinite(value) && value > 0) minutes = value;
    } catch (error) {
      Logger.debug(`dialogTimeout setting not available, using default ${minutes}min: ${error.message}`);
    }
    return minutes * 60 * 1000;
  }

  /**
   * Show the preview and wait for the GM. Resolves false on cancel or when the
   * dialog times out (it is non-modal and would otherwise hold the run lock).
   * @returns {Promise<boolean>}
   */
  static async confirm(matchResults, actorPlan = [], skipped = NO_SKIPS) {
    const { content, actionable } = PreviewDialog.buildContent(matchResults, actorPlan, skipped);

    let timeoutId;
    const { answer, close } = FoundryCompat.confirmDialog({
      title: game.i18n.localize("NPC_REPLACER.PreviewTitle"),
      content,
      yesLabel: game.i18n.localize("NPC_REPLACER.ConfirmYes"),
      noLabel: game.i18n.localize("NPC_REPLACER.ConfirmNo"),
      // Nothing would change: the confirm button stays unusable
      yesDisabled: !actionable
    });

    try {
      const timeoutPromise = new Promise(resolve => {
        timeoutId = setTimeout(() => {
          ui.notifications.warn(game.i18n.localize("NPC_REPLACER.DialogTimeout"));
          close();
          resolve(false);
        }, PreviewDialog.#timeoutMs());
      });
      return await Promise.race([answer, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export { PreviewDialog };

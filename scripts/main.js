/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official D&D compendium versions
 */

import { Logger, MODULE_ID } from "./lib/logger.js";
import { WildcardResolver } from "./lib/wildcard-resolver.js";
import { NameMatcher } from "./lib/name-matcher.js";
import { ProgressReporter } from "./lib/progress-reporter.js";
import { FoundryCompat } from "./lib/foundry-compat.js";
import { SourceDetector } from "./lib/source-detector.js";
import { buildCompendiumSelectorForm, preloadSelectorTemplates } from "./lib/compendium-selector.js";
import { CODE_VERSION } from "./lib/version.js";
import { TokenReplacerError } from "./lib/errors.js";
import { escapeHtml } from "./lib/html.js";
import { FolderManager } from "./lib/folder-manager.js";
import { CompendiumManager } from "./lib/compendium-manager.js";
import { CompendiumDocs } from "./lib/compendium-docs.js";
import { ActorImporter } from "./lib/actor-importer.js";

/**
 * Handles token replacement: extract properties, import actors, create new tokens.
 */
class TokenReplacer {
  static #sequentialCounter = 0;
  static #variationMode = null;
  /** Reset the per-run state: actor lookup, compendium documents, variation mode. */
  static clearActorLookup() {
    ActorImporter.clear();
    CompendiumDocs.clear();
    TokenReplacer.#variationMode = null;
    Logger.debug("Run state cleared (actor lookup, compendium documents, variation mode)");
  }

  // TODO [MEDIUM] Compatibility: allowlist silently drops properties added in new Foundry versions.
  // Missing now: flags (module data), light, sight, detectionModes, bar1, bar2.
  // Consider inverting to a blocklist of properties to OVERRIDE from compendium instead,
  // so unknown properties are preserved by default. Trade-off: blocklist risks keeping stale data.
  /** Token properties preserved during replacement */
  static #PRESERVED_PROPERTIES = Object.freeze([
    "x", "y", "elevation", "width", "height",
    "hidden", "rotation", "disposition", "locked", "alpha"
  ]);
  static get PRESERVED_PROPERTIES() { return TokenReplacer.#PRESERVED_PROPERTIES; }

  static resetCounter() {
    TokenReplacer.#sequentialCounter = 0;
    Logger.debug("TokenReplacer sequential counter reset");
  }

  static extractTokenProperties(tokenDoc) {
    const props = {};
    for (const prop of TokenReplacer.PRESERVED_PROPERTIES) {
      props[prop] = tokenDoc[prop];
    }
    return props;
  }

  static #isNPCToken(tokenDoc) {
    return tokenDoc.actor?.type === "npc";
  }

  /**
   * Get NPC tokens: the selected ones if any, otherwise every NPC token on every
   * scene of the world. Each token is later replaced on its own scene
   * (sceneOf), so scenes that are not open are handled too.
   */
  static getNPCTokensToProcess() {
    const none = { replaced: 0, inCombat: 0 };
    const selectedTokens = canvas?.tokens?.controlled ?? [];

    if (selectedTokens.length > 0) {
      const selectedNPCs = selectedTokens
        .map(token => token.document)
        .filter(TokenReplacer.#isNPCToken);

      if (selectedNPCs.length > 0) {
        Logger.log(`Using ${selectedNPCs.length} selected NPC token(s) out of ${selectedTokens.length} selected`);
        return { tokens: selectedNPCs, isSelection: true, skipped: none };
      }

      Logger.log("Selected tokens contain no NPCs");
      return { tokens: [], isSelection: true, skipped: none };
    }

    // A world-wide run leaves alone tokens this module already created (re-creating
    // them would reset hit points and conditions) and tokens in an encounter
    // (deleting a token removes its combatant). Selecting them forces a run.
    const inCombat = new Set();
    for (const combat of game.combats?.contents ?? []) {
      for (const combatant of combat.combatants?.contents ?? []) inCombat.add(`${combatant.sceneId}.${combatant.tokenId}`);
    }
    const skipped = { replaced: 0, inCombat: 0 };
    const npcTokens = [];
    for (const scene of game.scenes?.contents ?? []) {
      for (const token of scene.tokens.contents) {
        // actorId first: reading .actor builds a synthetic actor for unlinked tokens
        if (!token.actorId || !TokenReplacer.#isNPCToken(token)) continue;
        if (token.flags?.[MODULE_ID]?.replaced) skipped.replaced++;
        else if (inCombat.has(`${scene.id}.${token.id}`)) skipped.inCombat++;
        else npcTokens.push(token);
      }
    }
    if (skipped.replaced || skipped.inCombat) {
      Logger.log(`Skipped ${skipped.replaced} already-replaced token(s) and ${skipped.inCombat} in an encounter`);
    }
    return { tokens: npcTokens, isSelection: false, skipped };
  }

  /** Convenience: get all scene NPC tokens (ignores selection). */
  static getNPCTokensFromScene() {
    if (!canvas.scene) return [];
    return canvas.scene.tokens.contents.filter(TokenReplacer.#isNPCToken);
  }

  /** Resolve wildcard texture path (e.g. "specter-*.webp") to an actual file. */
  static async #resolveWildcardTexture(prototypeToken, compendiumActor, creatureName) {
    const originalPath = prototypeToken.texture.src;
    Logger.log(`Detected wildcard pattern in token path: ${originalPath}`);

    if (!TokenReplacer.#variationMode) {
      try {
        TokenReplacer.#variationMode = game.settings.get(MODULE_ID, "tokenVariationMode");
      } catch (error) {
        Logger.warn(`Failed to read tokenVariationMode setting, using "sequential": ${error.message}`);
        TokenReplacer.#variationMode = "sequential";
      }
      Logger.log(`Token variation mode: ${TokenReplacer.#variationMode}`);
    }
    const variationMode = TokenReplacer.#variationMode;

    const currentIndex = TokenReplacer.#sequentialCounter;
    const result = await WildcardResolver.resolve(
      originalPath,
      variationMode,
      currentIndex,
      compendiumActor.img // Use actor portrait as fallback
    );

    if (variationMode === "sequential" && result.nextIndex > currentIndex) {
      TokenReplacer.#sequentialCounter = result.nextIndex;
    }

    if (result.resolvedPath === "icons/svg/mystery-man.svg") {
      Logger.warn(`No token art variants found for "${creatureName}" — using placeholder`);
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.WildcardFallback", { name: escapeHtml(creatureName) }));
    } else {
      Logger.log(`Resolved wildcard for ${creatureName}: ${result.resolvedPath}`);
    }
    prototypeToken.texture.src = result.resolvedPath;
  }

  /** Compendium token properties to adopt (visual/behavioral identity). */
  static #COMPENDIUM_TOKEN_FIELDS = Object.freeze([
    "name", "texture", "scale", "tint",
    "displayName", "displayBars",
    "lockRotation"
  ]);

  /** Merge compendium token identity with preserved properties from original. */
  static #prepareNewTokenData(prototypeToken, originalProps, worldActorId, compendiumUuid) {
    const newData = {};
    for (const prop of TokenReplacer.#COMPENDIUM_TOKEN_FIELDS) {
      if (prop in prototypeToken) newData[prop] = prototypeToken[prop];
    }
    for (const prop of TokenReplacer.PRESERVED_PROPERTIES) {
      newData[prop] = originalProps[prop];
    }
    newData.actorId = worldActorId;
    newData.actorLink = prototypeToken.actorLink ?? false;
    // Lets a later world-wide run recognise tokens it already replaced
    newData.flags = { [MODULE_ID]: { replaced: true, sourceUuid: compendiumUuid } };
    return newData;
  }

  /**
   * The scene that owns a token. The preview dialog is non-modal, so the GM can
   * switch scenes between scan and confirm; mutating `canvas.scene` would then
   * write to the wrong scene. Falls back to the viewed scene only for token
   * stand-ins that carry no parent.
   */
  static sceneOf(tokenDoc) {
    return tokenDoc.parent ?? canvas.scene;
  }

  /**
   * Replace a single token with its compendium version.
   * Imports actor if needed, resolves wildcards, creates new token, deletes old.
   * @throws {TokenReplacerError} with phase "import_failed", "creation_failed", or "delete_failed"
   */
  static async replaceToken(tokenDoc, compendiumEntry, pack) {
    const originalProps = TokenReplacer.extractTokenProperties(tokenDoc);
    const originalName = tokenDoc.name;

    Logger.log(`Replacing token "${originalName}" with "${compendiumEntry.name}"`);

    let compendiumActor;
    try {
      compendiumActor = await CompendiumDocs.load(compendiumEntry, pack);
    } catch (error) {
      throw new TokenReplacerError(`Failed to load "${compendiumEntry.name}" from compendium: ${error.message}`, "import_failed");
    }

    let worldActor;
    try {
      worldActor = await ActorImporter.resolveWorldActor(compendiumActor, compendiumEntry, pack);
    } catch (error) {
      throw new TokenReplacerError(`Failed to import "${compendiumEntry.name}": ${error.message}`, "import_failed");
    }

    // Always use COMPENDIUM actor's prototypeToken — world actor may have stale token art
    const prototypeToken = compendiumActor.prototypeToken.toObject();
    Logger.log(`Using token image from compendium: ${prototypeToken.texture?.src || "default"}`);

    if (WildcardResolver.isWildcardPath(prototypeToken.texture?.src)) {
      await TokenReplacer.#resolveWildcardTexture(prototypeToken, compendiumActor, compendiumEntry.name);
    }

    const newTokenData = TokenReplacer.#prepareNewTokenData(prototypeToken, originalProps, worldActor.id, compendiumActor.uuid);
    const scene = TokenReplacer.sceneOf(tokenDoc);

    // Create new token first, then delete old — avoids data loss if creation fails
    let newToken;
    try {
      const createdTokens = await scene.createEmbeddedDocuments("Token", [newTokenData]);
      newToken = createdTokens[0];
      if (!newToken) {
        throw new Error("createEmbeddedDocuments returned empty result");
      }
    } catch (error) {
      throw new TokenReplacerError(`Failed to create token for "${compendiumEntry.name}": ${error.message}`, "creation_failed");
    }

    try {
      if (!scene.tokens.has(tokenDoc.id)) {
        Logger.warn(`Token "${originalName}" was already removed — skipping delete`);
      } else {
        await scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);
      }
    } catch (deleteError) {
      Logger.error(`Created new token but failed to delete old "${originalName}" — duplicate may exist`, deleteError);
      throw new TokenReplacerError(
        `delete_failed: new token created but old "${originalName}" could not be removed`,
        "delete_failed"
      );
    }

    Logger.log(`Successfully replaced "${originalName}" with "${compendiumEntry.name}"`);

    return newToken;
  }
}

/**
 * Main facade: orchestrates compendium detection, name matching, and token replacement.
 */
class NPCTokenReplacerController {
  static #isProcessing = false;
  static #clearPending = false;

  /** Check GM status, active scene, and compendium availability. */
  static validatePrerequisites() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("NPC_REPLACER.GMOnly"));
      return false;
    }

    const wotcPacks = CompendiumManager.detectWOTCCompendiums();
    if (wotcPacks.length === 0) {
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoModule"));
      return false;
    }

    return true;
  }

  /** Show 3-column preview dialog (Token | Match | Source). Returns true if user confirms. */
  static async showPreviewDialog(matchResults, actorPlan = [], skipped = { replaced: 0, inCombat: 0 }) {
    const matched = matchResults.filter(r => r.match !== null);
    const unmatched = matchResults.filter(r => r.match === null);
    const sorted = [...matched, ...unmatched];

    const noMatchText = escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewNoMatch"));

    const rows = [];
    for (const result of sorted) {
      if (result.match) {
        const overwriteNote = result.overwrite
          ? `<br><small class="npc-replacer-overwrite">${escapeHtml(game.i18n.format("NPC_REPLACER.PreviewOverwrites", { name: result.overwrite.name }))}</small>`
          : "";
        rows.push(`<tr>
          <td>${escapeHtml(result.creatureName)}</td>
          <td>${escapeHtml(TokenReplacer.sceneOf(result.tokenDoc)?.name ?? "")}</td>
          <td>${escapeHtml(result.match.entry.name)}${overwriteNote}</td>
          <td>${escapeHtml(result.match.pack.metadata.label)}</td>
        </tr>`);
      } else {
        rows.push(`<tr>
          <td>${escapeHtml(result.creatureName)}</td>
          <td>${escapeHtml(TokenReplacer.sceneOf(result.tokenDoc)?.name ?? "")}</td>
          <td class="npc-replacer-no-match">${noMatchText}</td>
          <td>&mdash;</td>
        </tr>`);
      }
    }
    const rowsHtml = rows.join("");

    const sceneCount = new Set(matchResults.map(r => TokenReplacer.sceneOf(r.tokenDoc)?.id)).size;
    const summary = escapeHtml(game.i18n.format("NPC_REPLACER.PreviewSummary", {
      scenes: sceneCount,
      matched: matched.length,
      total: matchResults.length
    }));

    // One actor can back many tokens, and appear in both lists; count each overwrite once
    const plannedActors = actorPlan.filter(p => p.match);
    const overwriteCount = new Set([
      ...matched.filter(r => r.overwrite).map(r => r.overwrite.id),
      ...plannedActors.map(p => p.actor.id)
    ]).size;
    const overwriteSummary = overwriteCount > 0
      ? `<p class="npc-replacer-overwrite-summary"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(game.i18n.format("NPC_REPLACER.PreviewOverwriteSummary", { count: overwriteCount }))}</p>`
      : "";

    const actorRows = actorPlan.map(({ actor, match }) => match
      ? `<tr><td>${escapeHtml(actor.name)}</td><td>${escapeHtml(match.entry.name)}</td><td>${escapeHtml(match.pack.metadata.label)}</td></tr>`
      : `<tr><td>${escapeHtml(actor.name)}</td><td class="npc-replacer-no-match">${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewActorUnchanged"))}</td><td>&mdash;</td></tr>`
    ).join("");
    const actorSection = actorPlan.length === 0 ? "" : `
      <h4>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewActorsTitle"))}</h4>
      <div class="npc-replacer-preview-table-container">
        <table class="npc-replacer-preview-table">
          <thead>
            <tr>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColActor"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColMatch"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColSource"))}</th>
            </tr>
          </thead>
          <tbody>${actorRows}</tbody>
        </table>
      </div>`;

    // With an empty scene the button only updates actors: skip the token table
    const tokenSection = matchResults.length === 0 ? "" : `
      <p>${summary}</p>
      <div class="npc-replacer-preview-table-container">
        <table class="npc-replacer-preview-table">
          <thead>
            <tr>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColToken"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColScene"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColMatch"))}</th>
              <th>${escapeHtml(game.i18n.localize("NPC_REPLACER.PreviewColSource"))}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;

    const skippedNote = skipped.replaced || skipped.inCombat
      ? `<p class="hint">${escapeHtml(game.i18n.format("NPC_REPLACER.TokensSkipped", skipped))}</p>`
      : "";

    const content = `
      ${overwriteSummary}
      ${skippedNote}
      ${tokenSection}
      ${actorSection}`;

    let dialogTimeoutMinutes = 5;
    try {
      const value = game.settings.get(MODULE_ID, "dialogTimeout");
      if (Number.isFinite(value) && value > 0) dialogTimeoutMinutes = value;
    } catch (error) {
      Logger.debug(`dialogTimeout setting not available, using default ${dialogTimeoutMinutes}min: ${error.message}`);
    }
    const DIALOG_TIMEOUT_MS = dialogTimeoutMinutes * 60 * 1000;

    let timeoutId;
    const { answer, close } = FoundryCompat.confirmDialog({
      title: game.i18n.localize("NPC_REPLACER.PreviewTitle"),
      content,
      yesLabel: game.i18n.localize("NPC_REPLACER.ConfirmYes"),
      noLabel: game.i18n.localize("NPC_REPLACER.ConfirmNo"),
      // Nothing to replace: the confirm button stays unusable
      yesDisabled: matched.length === 0 && plannedActors.length === 0
    });

    try {
      const timeoutPromise = new Promise(resolve => {
        timeoutId = setTimeout(() => {
          ui.notifications.warn(game.i18n.localize("NPC_REPLACER.DialogTimeout"));
          close();
          resolve(false);
        }, DIALOG_TIMEOUT_MS);
      });

      return await Promise.race([answer, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Display result notifications and log replacement summary. */
  static #reportResults(replaced, notFound, importFailed, creationFailed, deleteFailed = []) {
    const totalErrors = importFailed.length + creationFailed.length;
    if (replaced > 0 && totalErrors === 0 && notFound.length === 0 && deleteFailed.length === 0) {
      ui.notifications.info(game.i18n.format("NPC_REPLACER.Complete", { count: replaced }));
    }

    if (notFound.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.NotFoundCount", { count: notFound.length }));
      Logger.log("Creatures not found in compendiums:", notFound);
    }

    if (deleteFailed.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.DeleteFailedCount", { count: deleteFailed.length }));
      Logger.log("Delete failures (duplicates may exist):", deleteFailed);
    }

    if (totalErrors > 0) {
      ui.notifications.error(game.i18n.format("NPC_REPLACER.SummaryPartialFailure", {
        replaced,
        noMatch: notFound.length,
        importFailed: importFailed.length,
        creationFailed: creationFailed.length
      }));
      if (importFailed.length > 0) Logger.log("Import failures:", importFailed);
      if (creationFailed.length > 0) Logger.log("Creation failures:", creationFailed);
    }

    Logger.log(`Replacement complete: ${replaced} replaced, ${notFound.length} not found, ${importFailed.length} import failures, ${creationFailed.length} creation failures, ${deleteFailed.length} delete failures`);
  }

  /**
   * Pair every D&D Beyond actor in the world with its official version, by
   * exact normalized name only: overwriting is destructive, so a variant
   * ("Goblin Warrior" -> "Goblin") is never applied to a whole actor.
   * @param {Set<string>|null} scopeActorIds when the GM selected tokens, only their actors
   * @returns {{actor: Actor, match: {entry, pack}|null}[]} unmatched actors are kept, for the preview
   */
  static planActorOverwrites(scopeActorIds = null) {
    if (!ActorImporter.overwriteAllowed()) return [];
    // An overwrite tags the actor as official for good; against an index that is
    // missing a pack it could lock in a lower-priority version. Tokens are only
    // replaced, so they still run.
    if (CompendiumManager.getLastLoadErrors().length > 0) {
      ui.notifications.warn(game.i18n.localize("NPC_REPLACER.ActorsSkippedLoadError"));
      return [];
    }
    const indexMap = CompendiumManager.getIndexMap();
    return ActorImporter.getImportedActors()
      .filter(actor => !scopeActorIds || scopeActorIds.has(actor.id))
      .map(actor => ({
        actor,
        match: NameMatcher.selectBestMatch(indexMap?.get(NameMatcher.normalizeName(actor.name)) ?? [])
      }));
  }

  /** Overwrite every planned actor; one failure never stops the rest. */
  static async #overwritePlannedActors(plan) {
    const toOverwrite = plan.filter(p => p.match);
    const result = { overwritten: 0, failed: [] };
    if (toOverwrite.length === 0) return result;

    const progress = new ProgressReporter();
    progress.start(toOverwrite.length, game.i18n.localize("NPC_REPLACER.ProgressActors"));
    try {
      for (let i = 0; i < toOverwrite.length; i++) {
        const { actor, match } = toOverwrite[i];
        try {
          await ActorImporter.overwriteImportedActor(actor, match.entry, match.pack);
          result.overwritten++;
        } catch (error) {
          Logger.error(`Could not overwrite D&D Beyond actor "${actor.name}"`, error);
          result.failed.push(actor.name);
        }
        progress.update(i + 1, game.i18n.format("NPC_REPLACER.ProgressUpdate", {
          current: i + 1, total: toOverwrite.length, name: escapeHtml(actor.name)
        }));
        if (i % 10 === 9) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      progress.finish();
    }

    if (result.overwritten > 0) {
      ui.notifications.info(game.i18n.format("NPC_REPLACER.ActorsOverwritten", { count: result.overwritten }));
    }
    if (result.failed.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.ActorsOverwriteFailed", { count: result.failed.length }));
    }
    return result;
  }

  /** Main entry: validate → scan → preview → replace → report. */
  static async replaceNPCTokens() {
    if (NPCTokenReplacerController.#isProcessing) {
      Logger.log("Already processing tokens, ignoring duplicate call");
      ui.notifications.warn(game.i18n.localize("NPC_REPLACER.AlreadyProcessing"));
      return;
    }
    NPCTokenReplacerController.#isProcessing = true;

    try {
      if (!NPCTokenReplacerController.validatePrerequisites()) {
        return;
      }

      const enabledPacks = CompendiumManager.getEnabledCompendiums();
      if (enabledPacks.length === 0) {
        ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
        return;
      }

      const index = await CompendiumManager.loadMonsterIndex();

      if (index.length === 0) {
        ui.notifications.error(game.i18n.localize("NPC_REPLACER.IndexEmpty"));
        return;
      }

      const { tokens: npcTokens, isSelection, skipped = { replaced: 0, inCombat: 0 } } = TokenReplacer.getNPCTokensToProcess();

      // Built before matching so the preview can list actors that will be overwritten
      ActorImporter.buildActorLookup();
      // The same button also brings D&D Beyond actors up to date: every one in the
      // world, or only those behind the selected tokens
      const scope = isSelection ? new Set(npcTokens.map(token => token.actorId)) : null;
      const actorPlan = NPCTokenReplacerController.planActorOverwrites(scope);

      if (npcTokens.length === 0 && !actorPlan.some(p => p.match)) {
        if (skipped.replaced || skipped.inCombat) {
          ui.notifications.info(game.i18n.format("NPC_REPLACER.TokensSkipped", skipped));
        } else if (isSelection) {
          ui.notifications.info(game.i18n.localize("NPC_REPLACER.NoSelectedNPCs"));
        } else {
          ui.notifications.info(game.i18n.localize("NPC_REPLACER.NoTokens"));
        }
        return;
      }

      const sourceDesc = isSelection ? "selected" : "in scene";
      Logger.log(`Found ${npcTokens.length} NPC tokens ${sourceDesc}, ${actorPlan.length} D&D Beyond actor(s) in the world`);

      let matchResults = [];
      if (npcTokens.length > 0) {
        const scanProgress = new ProgressReporter();
        try {
          matchResults = await NPCTokenReplacerController.computeMatches(npcTokens, index, scanProgress);
        } finally {
          scanProgress.finish();
        }
      }

      const confirmed = await NPCTokenReplacerController.showPreviewDialog(matchResults, actorPlan, skipped);
      if (!confirmed) {
        Logger.log("Token replacement cancelled by user");
        return;
      }

      // Actors first: scene tokens then find them already official and reuse them
      await NPCTokenReplacerController.#overwritePlannedActors(actorPlan);
      if (matchResults.length === 0) return;

      TokenReplacer.resetCounter();

      const toReplace = matchResults.filter(r => r.match !== null);
      const notFoundNames = matchResults.filter(r => r.match === null).map(r => r.creatureName);

      // TODO [MEDIUM] Performance: token processing loop is fully sequential — 2N socket round-trips.
      // Split into parallel resolve phase (getDocument, import, wildcard) + batched mutation phase
      // (single deleteEmbeddedDocuments + createEmbeddedDocuments call for all tokens).
      let replaced = 0;
      const importFailed = [];
      const creationFailed = [];
      const deleteFailed = [];
      const processedIds = new Set();

      const progress = new ProgressReporter();
      progress.start(toReplace.length, game.i18n.format("NPC_REPLACER.ProgressStart", { count: toReplace.length }));

      try {
        for (const result of toReplace) {
          const { tokenDoc, creatureName } = result;

          // Token ids are only unique within a scene; the uuid includes the scene
          const tokenKey = tokenDoc.uuid ?? tokenDoc.id;
          if (processedIds.has(tokenKey)) {
            Logger.log(`Skipping already processed token: ${tokenDoc.name}`);
            continue;
          }

          if (!TokenReplacer.sceneOf(tokenDoc)?.tokens.has(tokenDoc.id)) {
            Logger.log(`Token "${tokenDoc.name}" no longer exists, skipping`);
            continue;
          }

          processedIds.add(tokenKey);

          try {
            await TokenReplacer.replaceToken(tokenDoc, result.match.entry, result.match.pack);
            replaced++;
          } catch (error) {
            const status = error instanceof TokenReplacerError ? error.phase : "creation_failed";
            Logger.error(`Error replacing token ${tokenDoc.name} (${status})`, error);
            if (status === "import_failed") {
              importFailed.push(creatureName);
            } else if (status === "delete_failed") {
              deleteFailed.push(creatureName);
              replaced++; // New token was created successfully despite delete failure
            } else {
              creationFailed.push(creatureName);
            }
          }

          // delete_failed tokens are already counted in `replaced`
          const processed = replaced + importFailed.length + creationFailed.length;
          progress.update(processed,
            game.i18n.format("NPC_REPLACER.ProgressUpdate", {
              current: processed,
              total: toReplace.length,
              name: escapeHtml(tokenDoc.name)
            }));
        }
      } finally {
        progress.finish();
      }

      NPCTokenReplacerController.#reportResults(replaced, notFoundNames, importFailed, creationFailed, deleteFailed);
    } catch (error) {
      // A rejected click handler would vanish into the console; the GM must know
      Logger.error("Token replacement failed unexpectedly", error);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorUnexpected"));
    } finally {
      TokenReplacer.clearActorLookup();
      NPCTokenReplacerController.#isProcessing = false;
      if (NPCTokenReplacerController.#clearPending) {
        NPCTokenReplacerController.#clearPending = false;
        NPCTokenReplacerController.clearCache();
      }
    }
  }

  /**
   * Clear every cache. While a run is in progress (the non-modal preview can be
   * open for minutes, and saving a setting calls this) the clear is deferred to
   * the end of the run, or the run would lose its actor lookup and index.
   */
  static clearCache() {
    if (NPCTokenReplacerController.#isProcessing) {
      NPCTokenReplacerController.#clearPending = true;
      Logger.log("Cache clear deferred until the running replacement finishes");
      return;
    }
    CompendiumManager.clearCache();
    FolderManager.clearCache();
    WildcardResolver.clearCache();
    TokenReplacer.clearActorLookup();
    Logger.log("All caches cleared");
  }

  /** Scan phase: match each token against the index (dry-run for preview). */
  static async computeMatches(tokens, index, progress) {
    progress.start(tokens.length, game.i18n.localize("NPC_REPLACER.PreviewScanning"));

    const results = [];
    for (let i = 0; i < tokens.length; i++) {
      const tokenDoc = tokens[i];
      const creatureName = tokenDoc.actor?.name || tokenDoc.name;
      const match = NameMatcher.findMatch(creatureName, index);
      const overwrite = match ? ActorImporter.findOverwriteTarget(match.entry, match.pack) : null;
      results.push({ tokenDoc, creatureName, match, overwrite });

      progress.update(i + 1, game.i18n.format("NPC_REPLACER.ProgressUpdate", {
        current: i + 1,
        total: tokens.length,
        name: escapeHtml(tokenDoc.name)
      }));

      if (i % 10 === 9) await new Promise(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /** Detect compendiums and pre-cache monster index. Called from ready hook. */
  static async initialize() {
    Logger.log("NPC Token Replacer is ready");
    // Only the GM can replace tokens; players would index thousands of entries for nothing
    if (!game.user?.isGM) return;

    // Detect available WOTC compendiums
    const wotcPacks = CompendiumManager.detectWOTCCompendiums();

    await NPCTokenReplacerController.notifyNewOfficialSources();

    if (wotcPacks.length === 0) {
      Logger.log("No official D&D compendiums found. Install official D&D content for this module to work.");
    } else {
      Logger.log(`Found ${wotcPacks.length} official D&D compendium(s)`);

      try {
        await CompendiumManager.loadMonsterIndex();
        Logger.log("Monster index pre-cached successfully");
      } catch (error) {
        Logger.error("Failed to pre-cache monster index", error);
        ui.notifications.warn(game.i18n.localize("NPC_REPLACER.ErrorIndexLoad"));
      }
    }
  }

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

  /** Build the window.NPCTokenReplacer debug API object. */
  static getDebugAPI() {
    return {
      replaceNPCTokens: () => NPCTokenReplacerController.replaceNPCTokens(),
      getMonsterManualPack: () => {
        const packs = CompendiumManager.getEnabledCompendiums();
        return packs.length > 0 ? packs[0] : null;
      },
      getNPCTokensFromScene: () => TokenReplacer.getNPCTokensFromScene(),
      findInMonsterManual: (name, index) => NameMatcher.findMatch(name, index),
      getOrCreateImportFolder: () => FolderManager.getOrCreateImportFolder(),
      detectWOTCCompendiums: () => CompendiumManager.detectWOTCCompendiums(),
      getEnabledCompendiums: () => CompendiumManager.getEnabledCompendiums(),
      clearCache: () => NPCTokenReplacerController.clearCache(),
      getLastLoadErrors: () => CompendiumManager.getLastLoadErrors(),
      get debugEnabled() { return Logger.debugEnabled; },
      set debugEnabled(v) { Logger.debugEnabled = v; }
    };
  }
}

/** Register all module settings (called during init hook). */
function registerSettings() {
  game.settings.register(MODULE_ID, "tokenVariationMode", {
    name: game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      "none": game.i18n.localize("NPC_REPLACER.Settings.VariationMode.None"),
      "sequential": game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Sequential"),
      "random": game.i18n.localize("NPC_REPLACER.Settings.VariationMode.Random")
    },
    default: "sequential"
  });

  game.settings.register(MODULE_ID, "enabledCompendiums", {
    name: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Hint"),
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify(["default"])
  });

  game.settings.register(MODULE_ID, "dialogTimeout", {
    name: game.i18n.localize("NPC_REPLACER.Settings.DialogTimeout.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.DialogTimeout.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 5
  });

  game.settings.register(MODULE_ID, "httpTimeout", {
    name: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.HttpTimeout.Hint"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 5
  });

  // Books already announced by notifyNewOfficialSources, so each is announced once
  game.settings.register(MODULE_ID, "notifiedSources", {
    scope: "world",
    config: false,
    type: String,
    default: "[]"
  });

  // Actors already imported by D&D Beyond Importer are overwritten in place
  // rather than duplicated; the GM can opt out.
  game.settings.register(MODULE_ID, "overwriteImportedActors", {
    name: game.i18n.localize("NPC_REPLACER.Settings.OverwriteImportedActors.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.OverwriteImportedActors.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Escape hatch: content the automatic signals cannot recognise (e.g. a future
  // official release under an unexpected package id) can be added by hand.
  game.settings.register(MODULE_ID, "additionalSources", {
    name: game.i18n.localize("NPC_REPLACER.Settings.AdditionalSources.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.AdditionalSources.Hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
    // Detection is cached; without this the override only applies after F5
    onChange: () => NPCTokenReplacerController.clearCache()
  });

  const SelectorForm = buildCompendiumSelectorForm({
    compendiumManager: CompendiumManager,
    onSaved: () => NPCTokenReplacerController.clearCache()
  });

  if (SelectorForm) {
    game.settings.registerMenu(MODULE_ID, "compendiumSelector", {
      name: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Name"),
      label: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Label"),
      hint: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Hint"),
      icon: "fas fa-book",
      type: SelectorForm,
      restricted: true
    });
  }
}

/**
 * Put the replace button at the bottom of the Actors sidebar tab (GM only).
 * v13/v14 DocumentDirectory renders a `footer` part; renderActorDirectory
 * passes the application's HTMLElement (hookEvents.renderApplicationV2), and
 * fires again on every re-render, so the button is added only once.
 */
function registerActorDirectoryButton(app, html) {
  if (!game.user?.isGM) return;
  const element = FoundryCompat.toElement(html);
  if (!element || element.querySelector("button.npc-replacer-run")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "npc-replacer-run";
  const icon = document.createElement("i");
  icon.className = "fas fa-sync-alt";
  icon.setAttribute("inert", "");
  button.append(icon, ` ${game.i18n.localize("NPC_REPLACER.Button")}`);
  button.addEventListener("click", () => NPCTokenReplacerController.replaceNPCTokens());

  const footer = element.querySelector('.directory-footer, [data-application-part="footer"]');
  if (footer) {
    footer.append(button);
  } else {
    // No footer part (layout changed): still keep the button at the bottom
    const wrapper = document.createElement("footer");
    wrapper.className = "directory-footer npc-replacer-footer";
    wrapper.append(button);
    element.append(wrapper);
  }
}

Hooks.once("init", () => {
  Logger.log(`Initializing NPC Token Replacer v${CODE_VERSION} (Foundry generation ${FoundryCompat.generation || "unknown"})`);
  registerSettings();
  preloadSelectorTemplates();
});

Hooks.once("ready", async () => {
  NPCTokenReplacerController.checkLoadedCodeVersion();
  try {
    await NPCTokenReplacerController.initialize();
  } catch (error) {
    Logger.error("Failed to initialize NPC Token Replacer", error);
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorInitFailed"));
  }

  window.NPCTokenReplacer = NPCTokenReplacerController.getDebugAPI();
});

Hooks.on("renderActorDirectory", registerActorDirectoryButton);

// Named exports for testing
export { TokenReplacer, NPCTokenReplacerController, registerActorDirectoryButton, registerSettings };

import { Logger, MODULE_ID } from "./logger.js";
import { NameMatcher } from "./name-matcher.js";
import { FolderManager } from "./folder-manager.js";
import { CompendiumDocs } from "./compendium-docs.js";
import { TokenReplacerError } from "./errors.js";

/**
 * Resolves the world Actor a replaced token points at, and owns the D&D Beyond
 * Importer overwrite: which world actors were imported from which compendium
 * entry, which DDB actors can be overwritten, and the in-place overwrite.
 * State is per run; clear() resets it.
 */
class ActorImporter {
  /** Session-scoped Map: compendium UUID -> world Actor */
  static #actorLookup = null;
  /** normalizedName -> world actor imported by D&D Beyond Importer, not yet overwritten. */
  static #importedActorsByName = null;
  /** Flag scopes written by D&D Beyond Importer, dropped when an actor is overwritten. */
  static #DDB_FLAG_SCOPES = Object.freeze(["ddbimporter", "monsterMunch"]);
  /** Every D&D Beyond Importer actor not yet overwritten, in world order. */
  static #importedActors = null;
  // An actor counts as already imported from a compendium entry through, in order:
  // this module's own tag (survives a core rename of compendiumSource), the v12+
  // _stats.compendiumSource, or the pre-v12 flags.core.sourceId.
  static buildActorLookup() {
    ActorImporter.#actorLookup = new Map();
    ActorImporter.#importedActorsByName = new Map();
    ActorImporter.#importedActors = [];
    for (const a of game.actors) {
      // Our own tag wins: the actor was already overwritten (it survives even if
      // core stops writing compendiumSource)
      const ownSource = a.flags?.[MODULE_ID]?.sourceUuid;
      if (ownSource) {
        ActorImporter.#actorLookup.set(ownSource, a);
      } else if (ActorImporter.isDdbImportedActor(a)) {
        // Checked before compendiumSource: DDB Importer brings monsters into the
        // world via importFromCompendium(<its own DDB compendium>), so real DDB
        // actors always carry one and would otherwise look already-official
        ActorImporter.#importedActors.push(a);
        const key = NameMatcher.normalizeName(a.name);
        if (!ActorImporter.#importedActorsByName.has(key)) ActorImporter.#importedActorsByName.set(key, a);
      } else {
        const uuid = a._stats?.compendiumSource || a.flags?.core?.sourceId;
        if (uuid) ActorImporter.#actorLookup.set(uuid, a);
      }
    }
    Logger.debug(`Built actor lookup Map with ${ActorImporter.#actorLookup.size} entries, ${ActorImporter.#importedActorsByName.size} D&D Beyond imports`);
  }

  /**
   * True for monsters created by D&D Beyond Importer. Mirrors the importer's own
   * test (ddb-importer src/muncher/tools.ts): an "npc" carrying flags.ddbimporter.id.
   */
  static isDdbImportedActor(actor) {
    return actor?.type === "npc" && actor.flags?.ddbimporter?.id !== undefined;
  }

  /** Whether the GM allows overwriting imported actors. Unreadable means no — it is destructive. */
  static overwriteAllowed() {
    try {
      return game.settings.get(MODULE_ID, "overwriteImportedActors") === true;
    } catch (error) {
      Logger.debug(`overwriteImportedActors unavailable, not overwriting: ${error.message}`);
      return false;
    }
  }

  /**
   * The D&D Beyond import that replacing with this compendium entry would
   * overwrite, or null. An actor already imported from the same entry wins,
   * so a world never gets both overwritten and re-imported.
   * Requires buildActorLookup() to have run.
   */
  static findOverwriteTarget(compendiumEntry, pack) {
    if (!ActorImporter.#importedActorsByName || !ActorImporter.overwriteAllowed()) return null;
    const uuid = compendiumEntry.uuid ?? `Compendium.${pack.collection}.Actor.${compendiumEntry._id}`;
    if (ActorImporter.#actorLookup?.has(uuid)) return null;
    const target = ActorImporter.#importedActorsByName.get(NameMatcher.normalizeName(compendiumEntry.name));
    // The lookup outlives the non-modal preview; skip actors deleted meanwhile
    return target && game.actors.has(target.id) ? target : null;
  }

  /**
   * Replace an existing world actor's data with the compendium version, keeping
   * where it lives and who owns it. recursive:false replaces inner objects and
   * embedded collections explicitly (DatabaseUpdateOperation, v13/v14) instead
   * of merging DDB items with the official ones.
   */
  static async #overwriteActor(target, compendiumActor) {
    const data = game.actors.fromCompendium(compendiumActor);
    delete data._id;
    data.folder = target.folder?.id ?? null;
    data.ownership = target.ownership;
    data.sort = target.sort;
    // Drop the D&D Beyond Importer flags (the actor no longer is a DDB import),
    // keep every other module's flags and the sheet choice
    const kept = { ...(target.flags ?? {}) };
    for (const key of ActorImporter.#DDB_FLAG_SCOPES) delete kept[key];
    data.flags = { ...kept, ...(data.flags ?? {}), [MODULE_ID]: { sourceUuid: compendiumActor.uuid } };
    await target.update(data, { diff: false, recursive: false });
    return target;
  }

  /** D&D Beyond Importer actors not yet overwritten. Requires buildActorLookup(). */
  static getImportedActors() {
    return [...(ActorImporter.#importedActors ?? [])];
  }

  /** Remember an overwrite so neither path overwrites or imports it again this session. */
  static #recordOverwrite(target, compendiumActor) {
    ActorImporter.#importedActors = ActorImporter.#importedActors?.filter(a => a !== target) ?? null;
    for (const [key, actor] of ActorImporter.#importedActorsByName ?? []) {
      if (actor === target) ActorImporter.#importedActorsByName.delete(key);
    }
    ActorImporter.#actorLookup?.set(compendiumActor.uuid, target);
  }

  /**
   * Overwrite one D&D Beyond actor in place with a compendium entry (the
   * world-wide pass of the replace button). Requires buildActorLookup().
   * @throws {TokenReplacerError} phase "import_failed"
   */
  static async overwriteImportedActor(actor, compendiumEntry, pack) {
    try {
      const compendiumActor = await CompendiumDocs.load(compendiumEntry, pack);
      await ActorImporter.#overwriteActor(actor, compendiumActor);
      ActorImporter.#recordOverwrite(actor, compendiumActor);
      Logger.log(`Overwrote D&D Beyond actor "${actor.name}" (id: ${actor.id}) in place from ${pack.metadata.label}`);
      return actor;
    } catch (error) {
      throw new TokenReplacerError(`Failed to overwrite "${actor.name}": ${error.message}`, "import_failed");
    }
  }

  /**
   * World actor for a compendium entry, in order: one already imported from it,
   * a D&D Beyond Importer actor of the same name overwritten in place (when
   * allowed), or a fresh import into the module folder.
   */
  static async resolveWorldActor(compendiumActor, compendiumEntry, pack) {
    let worldActor = ActorImporter.#actorLookup?.get(compendiumActor.uuid) || null;

    // Guard against stale cached references (actor deleted between sessions)
    if (worldActor && !game.actors.has(worldActor.id)) {
      Logger.warn(`Cached actor "${worldActor.name}" (id: ${worldActor.id}) no longer exists in game.actors, will re-import`);
      ActorImporter.#actorLookup.delete(compendiumActor.uuid);
      worldActor = null;
    }

    if (worldActor) {
      Logger.log(`Using existing imported actor "${worldActor.name}"`);
      return worldActor;
    }

    const target = ActorImporter.findOverwriteTarget(compendiumEntry, pack);
    if (target) {
      await ActorImporter.#overwriteActor(target, compendiumActor);
      ActorImporter.#recordOverwrite(target, compendiumActor);
      Logger.log(`Overwrote D&D Beyond actor "${target.name}" (id: ${target.id}) in place with "${compendiumActor.name}" from ${pack.metadata.label}`);
      return target;
    }

    const importFolder = await FolderManager.getOrCreateImportFolder();
    if (!importFolder) {
      Logger.warn(`Import folder unavailable — actor "${compendiumActor.name}" will be imported to the root folder`);
    }
    const updateData = importFolder ? { folder: importFolder.id } : {};
    worldActor = await game.actors.importFromCompendium(pack, compendiumEntry._id, updateData);

    if (!worldActor) {
      throw new Error(`Failed to import actor "${compendiumActor.name}" from compendium`);
    }

    if (ActorImporter.#actorLookup) {
      ActorImporter.#actorLookup.set(compendiumActor.uuid, worldActor);
    }

    Logger.log(`Imported actor "${compendiumActor.name}" from compendium into folder "${importFolder?.name || "root"}"`);
    return worldActor;
  }

  /** Reset the per-run lookups. */
  static clear() {
    ActorImporter.#actorLookup = null;
    ActorImporter.#importedActorsByName = null;
    ActorImporter.#importedActors = null;
  }
}

export { ActorImporter };

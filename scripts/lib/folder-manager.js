import { Logger } from "./logger.js";

/** Manages Actor folders for compendium imports. */
class FolderManager {
  static #importFolderCache = null;

  static get FOLDER_NAME() { return "MonsterManual"; }
  static get FOLDER_COLOR() { return "#7a1010"; }

  /** Patterns for identifying monster-related Actor folders as import parents */
  static #MONSTER_FOLDER_PATTERNS = Object.freeze([
    Object.freeze({ pattern: /monster/i, name: "monster" }),
    Object.freeze({ pattern: /creature/i, name: "creature" }),
    Object.freeze({ pattern: /npc/i, name: "npc" }),
    Object.freeze({ pattern: /bestiary/i, name: "bestiary" }),
    Object.freeze({ pattern: /enemy/i, name: "enemy" }),
    Object.freeze({ pattern: /enemies/i, name: "enemies" })
  ]);
  static get MONSTER_FOLDER_PATTERNS() {
    return FolderManager.#MONSTER_FOLDER_PATTERNS;
  }

  /** Build full folder path string like "/Parent/Child/Folder" */
  static getFolderPath(folder) {
    if (!folder) return "";
    const parts = [folder.name];
    let parent = folder.folder;
    let depth = 0;
    while (parent && depth < 10) {
      parts.unshift(parent.name);
      parent = parent.folder;
      depth++;
    }
    return `/${parts.join("/")}`;
  }

  /**
   * Get or create the Actor folder for Monster Manual imports.
   * Looks for existing monster folders, creates a subfolder if needed. Cached.
   * @returns {Promise<Folder|null>} The import folder, or null on failure
   */
  static async getOrCreateImportFolder() {
    if (FolderManager.#importFolderCache && game.folders.has(FolderManager.#importFolderCache.id)) {
      return FolderManager.#importFolderCache;
    }

    Logger.log("Scanning Actor folders for import destination...");

    // Single pass — gather all Actor folders once and reuse for all searches
    const actorFolders = game.folders.filter(f => f.type === "Actor");
    Logger.log(`Found ${actorFolders.length} Actor folders in world`);

    // Log all existing folders (debug level)
    if (actorFolders.length > 0) {
      Logger.debug("Existing Actor folders:");
      actorFolders.forEach(f => {
        Logger.debug(`  - ${FolderManager.getFolderPath(f)} (id: ${f.id})`);
      });
    }

    // Check if our folder already exists (search local array, not game.folders)
    let folder = actorFolders.find(f => f.name === FolderManager.FOLDER_NAME);

    if (folder) {
      Logger.log(`Found existing folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    }
    Logger.debug(`Folder "${FolderManager.FOLDER_NAME}" not found`);

    // Look for existing monster-related folders to use as parent
    let parentFolder = null;
    for (const { pattern } of FolderManager.MONSTER_FOLDER_PATTERNS) {
      const match = actorFolders.find(f => pattern.test(f.name) && !f.folder);
      if (match) {
        parentFolder = match;
        Logger.debug(`  Selected top-level folder: ${FolderManager.getFolderPath(parentFolder)}`);
        break;
      }
    }

    // Create the folder name based on parent
    let folderName = FolderManager.FOLDER_NAME;
    if (parentFolder) {
      folderName = `${parentFolder.name} - ${FolderManager.FOLDER_NAME}`;
      Logger.log(`Will create folder "${folderName}" inside "${parentFolder.name}"`);
    } else {
      Logger.log(`No monster folder found, will create "${folderName}" at root level`);
    }

    // Check if this combined name already exists (search local array)
    folder = actorFolders.find(f => f.name === folderName);

    if (folder) {
      Logger.log(`Found existing folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    }

    // Create the new folder
    Logger.log(`Creating new folder: "${folderName}"...`);
    try {
      folder = await Folder.create({
        name: folderName,
        type: "Actor",
        // Folder documents store their parent in `folder`; `parent` is not a schema field
        folder: parentFolder?.id ?? null,
        color: FolderManager.FOLDER_COLOR
      });
      Logger.log(`Created new folder: ${FolderManager.getFolderPath(folder)}`);
      FolderManager.#importFolderCache = folder;
      return folder;
    } catch (error) {
      Logger.error("Failed to create import folder", error);
      ui.notifications.error(game.i18n.localize("NPC_REPLACER.ErrorFolderCreate"));
      return null;
    }
  }

  static clearCache() {
    FolderManager.#importFolderCache = null;
    Logger.debug("FolderManager cache cleared");
  }
}

export { FolderManager };

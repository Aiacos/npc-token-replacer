/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official Monster Manual 2024 versions
 */

const MODULE_ID = "npc-token-replacer";
const MONSTER_MANUAL_MODULE = "dnd-monster-manual";

// Cache for the monster index
let monsterIndexCache = null;

// Cache for the import folder
let importFolderCache = null;

// Lock to prevent double execution
let isProcessing = false;

/**
 * Log a message with the module prefix
 * @param {string} message - The message to log
 * @param {any} data - Optional data to log
 */
function log(message, data = null) {
  if (data) {
    console.log(`${MODULE_ID} | ${message}`, data);
  } else {
    console.log(`${MODULE_ID} | ${message}`);
  }
}

/**
 * Log an error with the module prefix
 * @param {string} message - The error message
 * @param {Error} error - The error object
 */
function logError(message, error) {
  console.error(`${MODULE_ID} | ${message}`, error);
}

/**
 * Get the Monster Manual compendium pack
 * @returns {CompendiumCollection|null} The compendium pack or null if not found
 */
function getMonsterManualPack() {
  // Try to find the Actor compendium from the Monster Manual module
  const pack = game.packs.find(p =>
    p.metadata.packageName === MONSTER_MANUAL_MODULE &&
    p.documentName === "Actor"
  );

  if (!pack) {
    // Try alternative pack names
    const alternativeNames = [
      `${MONSTER_MANUAL_MODULE}.monsters`,
      `${MONSTER_MANUAL_MODULE}.monster-manual`,
      `${MONSTER_MANUAL_MODULE}.actors`
    ];

    for (const packName of alternativeNames) {
      const altPack = game.packs.get(packName);
      if (altPack) {
        log(`Found Monster Manual pack: ${packName}`);
        return altPack;
      }
    }

    log("Available packs from Monster Manual module:",
      game.packs.filter(p => p.metadata.packageName === MONSTER_MANUAL_MODULE).map(p => p.collection)
    );

    return null;
  }

  log(`Found Monster Manual pack: ${pack.collection}`);
  return pack;
}

/**
 * Load the monster index from the compendium
 * @param {CompendiumCollection} pack - The compendium pack
 * @param {boolean} forceReload - Force reload even if cached
 * @returns {Promise<Collection>} The compendium index
 */
async function loadMonsterIndex(pack, forceReload = false) {
  if (monsterIndexCache && !forceReload) {
    return monsterIndexCache;
  }

  log("Loading monster index from compendium...");
  await pack.getIndex({ fields: ["name", "type"] });
  monsterIndexCache = pack.index;
  log(`Loaded ${monsterIndexCache.size} entries from Monster Manual`);

  return monsterIndexCache;
}

/**
 * Get the full path of a folder (including parent folders)
 * @param {Folder} folder - The folder to get the path for
 * @returns {string} The full path
 */
function getFolderPath(folder) {
  const parts = [folder.name];
  let parent = folder.folder;
  while (parent) {
    parts.unshift(parent.name);
    parent = parent.folder;
  }
  return "/" + parts.join("/");
}

/**
 * Get or create the folder for Monster Manual imports
 * Looks for existing monster folders and creates a subfolder with "MonsterManual" suffix
 * @returns {Promise<Folder|null>} The folder to use for imports
 */
async function getOrCreateImportFolder() {
  // Return cached folder if available and still exists
  if (importFolderCache && game.folders.has(importFolderCache.id)) {
    return importFolderCache;
  }

  const FOLDER_NAME = "MonsterManual";

  log("Scanning Actor folders for import destination...");

  // Get all Actor folders for logging
  const actorFolders = game.folders.filter(f => f.type === "Actor");
  log(`Found ${actorFolders.length} Actor folders in world`);

  // Log all existing folders
  if (actorFolders.length > 0) {
    log("Existing Actor folders:");
    actorFolders.forEach(f => {
      const path = getFolderPath(f);
      log(`  - ${path} (id: ${f.id})`);
    });
  }

  // Check if our folder already exists
  log(`Searching for existing "${FOLDER_NAME}" folder...`);
  let folder = game.folders.find(f =>
    f.type === "Actor" &&
    f.name === FOLDER_NAME
  );

  if (folder) {
    log(`Found existing folder: ${getFolderPath(folder)}`);
    importFolderCache = folder;
    return folder;
  }
  log(`Folder "${FOLDER_NAME}" not found`);

  // Look for existing monster-related folders to use as parent
  const monsterFolderPatterns = [
    { pattern: /monster/i, name: "monster" },
    { pattern: /creature/i, name: "creature" },
    { pattern: /npc/i, name: "npc" },
    { pattern: /bestiary/i, name: "bestiary" },
    { pattern: /enemy/i, name: "enemy" },
    { pattern: /enemies/i, name: "enemies" }
  ];

  log("Searching for monster-related parent folder...");
  let parentFolder = null;
  for (const { pattern, name } of monsterFolderPatterns) {
    log(`  Checking pattern: "${name}"...`);
    const matchingFolders = game.folders.filter(f =>
      f.type === "Actor" &&
      pattern.test(f.name)
    );

    if (matchingFolders.length > 0) {
      log(`    Found ${matchingFolders.length} matching folder(s):`);
      matchingFolders.forEach(f => {
        log(`      - ${getFolderPath(f)}${f.folder ? "" : " (top-level)"}`);
      });

      // Prefer top-level folders
      parentFolder = matchingFolders.find(f => !f.folder);
      if (parentFolder) {
        log(`  Selected top-level folder: ${getFolderPath(parentFolder)}`);
        break;
      }
    } else {
      log(`    No folders matching "${name}"`);
    }
  }

  // Create the folder name based on parent
  let folderName = FOLDER_NAME;
  if (parentFolder) {
    folderName = `${parentFolder.name} - ${FOLDER_NAME}`;
    log(`Will create folder "${folderName}" inside "${parentFolder.name}"`);
  } else {
    log(`No monster folder found, will create "${folderName}" at root level`);
  }

  // Check if this combined name already exists
  log(`Checking if "${folderName}" already exists...`);
  folder = game.folders.find(f =>
    f.type === "Actor" &&
    f.name === folderName
  );

  if (folder) {
    log(`Found existing folder: ${getFolderPath(folder)}`);
    importFolderCache = folder;
    return folder;
  }

  // Create the new folder
  log(`Creating new folder: "${folderName}"...`);
  try {
    folder = await Folder.create({
      name: folderName,
      type: "Actor",
      parent: parentFolder?.id || null,
      color: "#7a1010" // Dark red for monsters
    });
    log(`Created new folder: ${getFolderPath(folder)}`);
    importFolderCache = folder;
    return folder;
  } catch (error) {
    logError("Failed to create import folder", error);
    return null;
  }
}

/**
 * Get all NPC tokens from the current scene
 * @returns {TokenDocument[]} Array of NPC token documents
 */
function getNPCTokensFromScene() {
  if (!canvas.scene) {
    return [];
  }

  const tokens = canvas.scene.tokens.contents;

  // Filter only NPC tokens
  return tokens.filter(tokenDoc => {
    const actor = tokenDoc.actor;
    if (!actor) return false;

    // In dnd5e system, NPCs have type "npc"
    return actor.type === "npc";
  });
}

/**
 * Extract token properties that need to be preserved
 * @param {TokenDocument} tokenDoc - The token document
 * @returns {Object} Object containing properties to preserve
 */
function extractTokenProperties(tokenDoc) {
  return {
    x: tokenDoc.x,
    y: tokenDoc.y,
    elevation: tokenDoc.elevation,
    width: tokenDoc.width,
    height: tokenDoc.height,
    hidden: tokenDoc.hidden,
    rotation: tokenDoc.rotation,
    disposition: tokenDoc.disposition,
    locked: tokenDoc.locked,
    alpha: tokenDoc.alpha
  };
}

/**
 * Normalize a creature name for matching
 * @param {string} name - The creature name
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ');   // Normalize whitespace
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - The string to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Find a creature in the Monster Manual index
 * @param {string} creatureName - The creature name to search for
 * @param {Collection} index - The compendium index
 * @returns {Object|null} The matching entry or null
 */
function findInMonsterManual(creatureName, index) {
  const normalizedSearch = normalizeName(creatureName);

  if (!normalizedSearch) {
    log(`Empty creature name provided`);
    return null;
  }

  // Exact match first
  let match = index.find(e => normalizeName(e.name) === normalizedSearch);
  if (match) {
    log(`Exact match found: "${creatureName}" -> "${match.name}"`);
    return match;
  }

  // Try without common suffixes/prefixes (only check variants that differ from original)
  const variantTransforms = [
    name => name.replace(/^(young|adult|ancient|elder|greater|lesser)\s+/i, ''),
    name => name.replace(/\s+(warrior|guard|scout|champion|leader|chief|captain|shaman|berserker)$/i, ''),
    name => name.replace(/^(young|adult|ancient|elder|greater|lesser)\s+/i, '')
                .replace(/\s+(warrior|guard|scout|champion|leader|chief|captain|shaman|berserker)$/i, ''),
  ];

  for (const transform of variantTransforms) {
    const variant = transform(normalizedSearch);
    // Only check if variant is different from original
    if (variant !== normalizedSearch && variant.length > 0) {
      match = index.find(e => normalizeName(e.name) === variant);
      if (match) {
        log(`Variant match found: "${creatureName}" -> "${match.name}"`);
        return match;
      }
    }
  }

  // Partial match - but only for names with 4+ characters to avoid false positives
  // Also require word boundary matching to prevent "Rat" matching "Pirate"
  const MIN_PARTIAL_LENGTH = 4;
  if (normalizedSearch.length >= MIN_PARTIAL_LENGTH) {
    match = index.find(e => {
      const entryName = normalizeName(e.name);
      if (entryName.length < MIN_PARTIAL_LENGTH) return false;

      // Check if one name starts with the other (word boundary)
      const searchWords = normalizedSearch.split(' ');
      const entryWords = entryName.split(' ');

      // Check if the main creature type matches (usually first or last word)
      return searchWords.some(sw => entryWords.includes(sw) && sw.length >= MIN_PARTIAL_LENGTH) ||
             entryWords.some(ew => searchWords.includes(ew) && ew.length >= MIN_PARTIAL_LENGTH);
    });

    if (match) {
      log(`Partial match found: "${creatureName}" -> "${match.name}"`);
      return match;
    }
  }

  log(`No match found for: "${creatureName}"`);
  return null;
}

/**
 * Replace a single token with the Monster Manual version
 * @param {TokenDocument} tokenDoc - The token document to replace
 * @param {Object} compendiumEntry - The matching compendium entry
 * @param {CompendiumCollection} pack - The compendium pack
 * @returns {Promise<TokenDocument>} The new token document
 */
async function replaceToken(tokenDoc, compendiumEntry, pack) {
  // Save original properties
  const originalProps = extractTokenProperties(tokenDoc);
  const originalName = tokenDoc.name;

  log(`Replacing token "${originalName}" with "${compendiumEntry.name}"`);

  // Get the full actor document from the compendium
  const compendiumActor = await pack.getDocument(compendiumEntry._id);

  // Check if we already have this actor imported (by name and source)
  // This avoids creating duplicate actors in the world
  let worldActor = game.actors.find(a => {
    if (a.name !== compendiumActor.name) return false;

    // Check _stats.compendiumSource first (v12+ preferred method, avoids deprecation warning)
    const compendiumSource = a._stats?.compendiumSource;
    if (compendiumSource === compendiumActor.uuid) return true;

    // Fallback: check flags.core.sourceId for older imports (may trigger deprecation warning in v12+)
    // Only check if _stats.compendiumSource is not set
    if (!compendiumSource) {
      try {
        const sourceId = a.flags?.core?.sourceId;
        if (sourceId === compendiumActor.uuid) return true;
      } catch (e) {
        // Ignore errors from flag access
      }
    }

    return false;
  });

  if (!worldActor) {
    // Get or create the import folder
    const importFolder = await getOrCreateImportFolder();

    // Import the actor from compendium using the standard Foundry API
    // Pass the folder ID in the updateData parameter
    const updateData = importFolder ? { folder: importFolder.id } : {};
    worldActor = await game.actors.importFromCompendium(pack, compendiumEntry._id, updateData);
    if (!worldActor) {
      throw new Error(`Failed to import actor "${compendiumActor.name}" from compendium`);
    }
    log(`Imported actor "${compendiumActor.name}" from compendium into folder "${importFolder?.name || 'root'}"`);
  } else {
    log(`Using existing imported actor "${worldActor.name}"`);
  }

  // IMPORTANT: Always use the COMPENDIUM actor's prototypeToken to get the correct Monster Manual 2024 token image
  // The world actor might have been imported from a different source (old SRD) with different token art
  const prototypeToken = compendiumActor.prototypeToken.toObject();
  log(`Using token image from compendium: ${prototypeToken.texture?.src || 'default'}`);

  // Prepare new token data, merging prototype with original properties
  const newTokenData = {
    ...prototypeToken,
    x: originalProps.x,
    y: originalProps.y,
    elevation: originalProps.elevation,
    width: originalProps.width,
    height: originalProps.height,
    hidden: originalProps.hidden,
    rotation: originalProps.rotation,
    disposition: originalProps.disposition,
    locked: originalProps.locked,
    alpha: originalProps.alpha,
    actorId: worldActor.id,
    actorLink: false
  };

  // Delete the old token
  await canvas.scene.deleteEmbeddedDocuments("Token", [tokenDoc.id]);

  // Create the new token
  const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", [newTokenData]);
  const newToken = createdTokens[0];

  if (!newToken) {
    throw new Error(`Failed to create new token for "${compendiumEntry.name}"`);
  }

  log(`Successfully replaced "${originalName}" with "${compendiumEntry.name}"`);

  return newToken;
}

/**
 * Show a confirmation dialog before replacing tokens
 * @param {TokenDocument[]} tokens - The tokens to replace
 * @returns {Promise<boolean>} Whether to proceed
 */
async function showConfirmationDialog(tokens) {
  const tokenList = tokens
    .map(t => `<li>${escapeHtml(t.actor?.name || t.name)}</li>`)
    .join('');

  const content = `
    <p>${game.i18n.format("NPC_REPLACER.ConfirmContent", { count: tokens.length })}</p>
    <ul style="max-height: 200px; overflow-y: auto; margin: 10px 0;">
      ${tokenList}
    </ul>
    <p><strong>${game.i18n.localize("NPC_REPLACER.ConfirmProceed")}</strong></p>
  `;

  return Dialog.confirm({
    title: game.i18n.localize("NPC_REPLACER.ConfirmTitle"),
    content: content,
    yes: () => true,
    no: () => false,
    defaultYes: false
  });
}

/**
 * Validate all prerequisites before running the replacement
 * @returns {boolean} Whether all prerequisites are met
 */
function validatePrerequisites() {
  // Check if user is GM
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("NPC_REPLACER.GMOnly"));
    return false;
  }

  // Check if there's an active scene
  if (!canvas.scene) {
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoScene"));
    return false;
  }

  // Check if Monster Manual module is active
  const monsterModule = game.modules.get(MONSTER_MANUAL_MODULE);
  if (!monsterModule?.active) {
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoModule"));
    return false;
  }

  return true;
}

/**
 * Main function to replace all NPC tokens in the scene
 */
async function replaceNPCTokens() {
  // Prevent double execution
  if (isProcessing) {
    log("Already processing tokens, ignoring duplicate call");
    return;
  }

  // Validate prerequisites
  if (!validatePrerequisites()) {
    return;
  }

  // Get the Monster Manual compendium
  const pack = getMonsterManualPack();
  if (!pack) {
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
    return;
  }

  // Load the monster index
  const index = await loadMonsterIndex(pack);

  // Get NPC tokens from the scene - store IDs to track which ones we've processed
  const npcTokens = getNPCTokensFromScene();
  if (npcTokens.length === 0) {
    ui.notifications.info(game.i18n.localize("NPC_REPLACER.NoTokens"));
    return;
  }

  log(`Found ${npcTokens.length} NPC tokens in scene`);

  // Show confirmation dialog
  const confirmed = await showConfirmationDialog(npcTokens);
  if (!confirmed) {
    log("Token replacement cancelled by user");
    return;
  }

  // Set processing lock AFTER confirmation (so user can cancel and retry)
  isProcessing = true;

  // Track results
  let replaced = 0;
  const notFound = [];
  const errors = [];
  const processedIds = new Set(); // Track processed token IDs to avoid duplicates

  // Show progress notification
  ui.notifications.info(game.i18n.format("NPC_REPLACER.Processing", { count: npcTokens.length }));

  try {
    // Process each token
    for (const tokenDoc of npcTokens) {
      // Skip if already processed (handles duplicate entries)
      if (processedIds.has(tokenDoc.id)) {
        log(`Skipping already processed token: ${tokenDoc.name}`);
        continue;
      }

      // Check if token still exists in scene BEFORE processing
      if (!canvas.scene.tokens.has(tokenDoc.id)) {
        log(`Token "${tokenDoc.name}" no longer exists, skipping`);
        continue;
      }

      processedIds.add(tokenDoc.id);

      try {
        const creatureName = tokenDoc.actor?.name || tokenDoc.name;
        const match = findInMonsterManual(creatureName, index);

        if (match) {
          await replaceToken(tokenDoc, match, pack);
          replaced++;
        } else {
          notFound.push(creatureName);
        }
      } catch (error) {
        logError(`Error replacing token ${tokenDoc.name}`, error);
        errors.push(tokenDoc.name);
      }
    }

    // Report results
    if (replaced > 0) {
      ui.notifications.info(game.i18n.format("NPC_REPLACER.Complete", { count: replaced }));
    }

    if (notFound.length > 0) {
      ui.notifications.warn(game.i18n.format("NPC_REPLACER.NotFoundCount", { count: notFound.length }));
      log("Creatures not found in Monster Manual:", notFound);
    }

    if (errors.length > 0) {
      ui.notifications.error(game.i18n.format("NPC_REPLACER.ErrorCount", { count: errors.length }));
      log("Errors occurred with tokens:", errors);
    }

    log(`Replacement complete: ${replaced} replaced, ${notFound.length} not found, ${errors.length} errors`);
  } finally {
    // Always release the lock
    isProcessing = false;
  }
}

/**
 * Register the control button in the token controls
 */
function registerControlButton(controls) {
  const toolConfig = {
    name: "npcReplacer",
    title: game.i18n.localize("NPC_REPLACER.Button"),
    icon: "fas fa-sync-alt",
    button: true,
    visible: game.user.isGM,
    onClick: () => replaceNPCTokens()
    // Note: Do NOT add onChange - it causes double execution with onClick
  };

  // Foundry v13+ uses object structure
  if (controls.tokens && typeof controls.tokens === "object" && !Array.isArray(controls.tokens)) {
    controls.tokens.tools.npcReplacer = toolConfig;
  } else if (Array.isArray(controls)) {
    // Foundry v12 and earlier uses array structure
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls && Array.isArray(tokenControls.tools)) {
      tokenControls.tools.push(toolConfig);
    }
  }
}

/**
 * Initialize the module
 */
Hooks.once("init", () => {
  log("Initializing NPC Token Replacer");
});

/**
 * Module ready hook
 */
Hooks.once("ready", () => {
  log("NPC Token Replacer is ready");

  // Verify Monster Manual module is available
  const monsterModule = game.modules.get(MONSTER_MANUAL_MODULE);
  if (!monsterModule) {
    log("Warning: Monster Manual 2024 module not found. Install it for this module to work.");
  } else if (!monsterModule.active) {
    log("Warning: Monster Manual 2024 module is installed but not active.");
  } else {
    log("Monster Manual 2024 module detected and active");

    // Pre-cache the monster index (async, non-blocking)
    const pack = getMonsterManualPack();
    if (pack) {
      loadMonsterIndex(pack)
        .then(() => {
          log("Monster index pre-cached successfully");
        })
        .catch(error => {
          logError("Failed to pre-cache monster index", error);
        });
    }
  }
});

/**
 * Register control button hook
 */
Hooks.on("getSceneControlButtons", registerControlButton);

// Export for debugging in console
window.NPCTokenReplacer = {
  replaceNPCTokens,
  getMonsterManualPack,
  getNPCTokensFromScene,
  findInMonsterManual,
  getOrCreateImportFolder,
  clearCache: () => {
    monsterIndexCache = null;
    importFolderCache = null;
  }
};

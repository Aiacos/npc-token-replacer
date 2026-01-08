/**
 * NPC Token Replacer
 * A Foundry VTT module that replaces NPC tokens with official D&D compendium versions
 */

const MODULE_ID = "npc-token-replacer";

// Known official WOTC module prefixes for auto-detection
const WOTC_MODULE_PREFIXES = ["dnd-", "dnd5e"];

// Compendium priority levels (higher = preferred)
// Priority 1: SRD (lowest - fallback)
// Priority 2: Monster Manual (medium - core monsters)
// Priority 3: Adventures and expansions (highest - most specific)
const COMPENDIUM_PRIORITIES = {
  "dnd5e": 1,                    // SRD - lowest priority
  "dnd-monster-manual": 2,       // Monster Manual - medium priority
  // All other dnd- modules get priority 3 (adventures/expansions)
};

// Cache for the combined monster index from all selected compendiums
let monsterIndexCache = null;

// Cache for detected WOTC compendiums
let wotcCompendiumsCache = null;

// Cache for the import folder
let importFolderCache = null;

// Lock to prevent double execution
let isProcessing = false;

// Sequential counter for token variations (reset each replacement session)
let sequentialVariantCounter = 0;

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
 * Get the priority of a compendium pack
 * Higher priority = preferred when multiple matches exist
 * @param {CompendiumCollection} pack - The compendium pack
 * @returns {number} Priority level (1=lowest, 3=highest)
 */
function getCompendiumPriority(pack) {
  const packageName = pack.metadata.packageName || "";

  // Check if we have a specific priority defined
  if (COMPENDIUM_PRIORITIES.hasOwnProperty(packageName)) {
    return COMPENDIUM_PRIORITIES[packageName];
  }

  // Default: all other dnd- modules get highest priority (adventures/expansions)
  if (packageName.startsWith("dnd-")) {
    return 3;
  }

  // Fallback for unknown packages
  return 1;
}

/**
 * Detect all available WOTC Actor compendiums
 * @returns {CompendiumCollection[]} Array of WOTC compendium packs with Actor documents
 */
function detectWOTCCompendiums() {
  if (wotcCompendiumsCache) {
    return wotcCompendiumsCache;
  }

  log("Detecting official D&D compendiums...");

  const wotcPacks = game.packs.filter(pack => {
    // Only Actor compendiums
    if (pack.documentName !== "Actor") return false;

    // Check if package name starts with known WOTC prefixes
    const packageName = pack.metadata.packageName || "";
    const isWotc = WOTC_MODULE_PREFIXES.some(prefix => packageName.startsWith(prefix));

    return isWotc;
  });

  log(`Found ${wotcPacks.length} official D&D Actor compendiums:`);
  wotcPacks.forEach(pack => {
    const priority = getCompendiumPriority(pack);
    const priorityLabel = priority === 3 ? "HIGH" : priority === 2 ? "MEDIUM" : "LOW";
    log(`  - ${pack.collection} (${pack.metadata.label}) [package: ${pack.metadata.packageName}, priority: ${priorityLabel}]`);
  });

  wotcCompendiumsCache = wotcPacks;
  return wotcPacks;
}

/**
 * Get the list of enabled compendiums based on settings
 * @returns {CompendiumCollection[]} Array of enabled compendium packs
 */
function getEnabledCompendiums() {
  const allPacks = detectWOTCCompendiums();
  const enabledPackIds = game.settings.get(MODULE_ID, "enabledCompendiums");

  // If no specific selection, use all available
  if (!enabledPackIds || enabledPackIds.length === 0 || enabledPackIds.includes("all")) {
    return allPacks;
  }

  return allPacks.filter(pack => enabledPackIds.includes(pack.collection));
}

/**
 * Register module settings
 */
function registerSettings() {
  // Token variation mode setting
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

  // Enabled compendiums setting (stored as array of pack IDs)
  game.settings.register(MODULE_ID, "enabledCompendiums", {
    name: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Name"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.EnabledCompendiums.Hint"),
    scope: "world",
    config: false, // We'll use a custom form for this
    type: Array,
    default: ["all"]
  });

  // Register the settings menu for compendium selection
  game.settings.registerMenu(MODULE_ID, "compendiumSelector", {
    name: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Name"),
    label: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Label"),
    hint: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Hint"),
    icon: "fas fa-book",
    type: CompendiumSelectorForm,
    restricted: true
  });
}

/**
 * Custom form for selecting which compendiums to use
 */
class CompendiumSelectorForm extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "npc-replacer-compendium-selector",
      title: game.i18n.localize("NPC_REPLACER.Settings.CompendiumSelector.Title"),
      template: `modules/${MODULE_ID}/templates/compendium-selector.html`,
      width: 500,
      height: "auto",
      closeOnSubmit: true
    });
  }

  getData() {
    const allPacks = detectWOTCCompendiums();
    const enabledPackIds = game.settings.get(MODULE_ID, "enabledCompendiums");
    const useAll = !enabledPackIds || enabledPackIds.length === 0 || enabledPackIds.includes("all");

    return {
      useAll: useAll,
      compendiums: allPacks.map(pack => ({
        id: pack.collection,
        name: pack.metadata.label,
        module: pack.metadata.packageName,
        enabled: useAll || enabledPackIds.includes(pack.collection)
      }))
    };
  }

  async _updateObject(event, formData) {
    const useAll = formData.useAll;

    if (useAll) {
      await game.settings.set(MODULE_ID, "enabledCompendiums", ["all"]);
    } else {
      // Collect all checked compendiums
      const enabled = [];
      for (const [key, value] of Object.entries(formData)) {
        if (key.startsWith("compendium-") && value) {
          enabled.push(key.replace("compendium-", ""));
        }
      }
      await game.settings.set(MODULE_ID, "enabledCompendiums", enabled);
    }

    // Clear cache to reload with new settings
    monsterIndexCache = null;
    log("Compendium settings updated, cache cleared");
  }
}

/**
 * Get the Monster Manual compendium pack (legacy, for backwards compatibility)
 * @returns {CompendiumCollection|null} The first enabled compendium pack or null if none found
 * @deprecated Use getEnabledCompendiums() instead
 */
function getMonsterManualPack() {
  const packs = getEnabledCompendiums();
  return packs.length > 0 ? packs[0] : null;
}

/**
 * Load the combined monster index from all enabled compendiums
 * @param {boolean} forceReload - Force reload even if cached
 * @returns {Promise<Array>} Array of {entry, pack} objects
 */
async function loadMonsterIndex(forceReload = false) {
  if (monsterIndexCache && !forceReload) {
    return monsterIndexCache;
  }

  const enabledPacks = getEnabledCompendiums();

  if (enabledPacks.length === 0) {
    log("No enabled compendiums found");
    return [];
  }

  log(`Loading monster index from ${enabledPacks.length} compendium(s)...`);

  const combinedIndex = [];

  // Sort packs by priority for logging (highest first)
  const sortedPacks = [...enabledPacks].sort((a, b) => getCompendiumPriority(b) - getCompendiumPriority(a));

  for (const pack of sortedPacks) {
    try {
      await pack.getIndex({ fields: ["name", "type"] });
      const priority = getCompendiumPriority(pack);
      const priorityLabel = priority === 3 ? "HIGH" : priority === 2 ? "MEDIUM" : "LOW";
      const packEntries = pack.index.contents.map(entry => ({
        entry: entry,
        pack: pack
      }));
      combinedIndex.push(...packEntries);
      log(`  [${priorityLabel}] Loaded ${pack.index.size} entries from ${pack.metadata.label}`);
    } catch (error) {
      logError(`Failed to load index from ${pack.collection}`, error);
    }
  }

  log(`Total: ${combinedIndex.length} entries from all compendiums`);
  log("Priority order: Adventures/Expansions (HIGH) > Monster Manual (MEDIUM) > SRD (LOW)");
  monsterIndexCache = combinedIndex;

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
 * Select the best match from a list of matches based on compendium priority
 * @param {Array} matches - Array of {entry, pack} objects
 * @returns {Object|null} The best match or null if empty
 */
function selectBestMatch(matches) {
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Log all matches before sorting for debugging
  log(`  Found ${matches.length} matches across compendiums:`);
  matches.forEach(m => {
    const pkgName = m.pack.metadata.packageName || "unknown";
    const priority = getCompendiumPriority(m.pack);
    log(`    - ${m.entry.name} from "${m.pack.metadata.label}" (package: ${pkgName}, priority: ${priority})`);
  });

  // Sort by priority (highest first) and return the best
  matches.sort((a, b) => getCompendiumPriority(b.pack) - getCompendiumPriority(a.pack));

  const best = matches[0];
  log(`  Selected: ${best.pack.metadata.label} (priority ${getCompendiumPriority(best.pack)})`);

  return best;
}

/**
 * Find a creature in the combined compendium index
 * Prioritizes matches from adventures/expansions > Monster Manual > SRD
 * @param {string} creatureName - The creature name to search for
 * @param {Array} index - Array of {entry, pack} objects from loadMonsterIndex()
 * @returns {Object|null} Object with {entry, pack} or null if not found
 */
function findInMonsterManual(creatureName, index) {
  const normalizedSearch = normalizeName(creatureName);

  if (!normalizedSearch) {
    log(`Empty creature name provided`);
    return null;
  }

  // Exact match first - find ALL exact matches and select best by priority
  let matches = index.filter(item => normalizeName(item.entry.name) === normalizedSearch);
  if (matches.length > 0) {
    const match = selectBestMatch(matches);
    log(`Exact match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${getCompendiumPriority(match.pack)})`);
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
      matches = index.filter(item => normalizeName(item.entry.name) === variant);
      if (matches.length > 0) {
        const match = selectBestMatch(matches);
        log(`Variant match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${getCompendiumPriority(match.pack)})`);
        return match;
      }
    }
  }

  // Partial match - but only for names with 4+ characters to avoid false positives
  // Also require word boundary matching to prevent "Rat" matching "Pirate"
  const MIN_PARTIAL_LENGTH = 4;
  if (normalizedSearch.length >= MIN_PARTIAL_LENGTH) {
    matches = index.filter(item => {
      const entryName = normalizeName(item.entry.name);
      if (entryName.length < MIN_PARTIAL_LENGTH) return false;

      // Check if one name starts with the other (word boundary)
      const searchWords = normalizedSearch.split(' ');
      const entryWords = entryName.split(' ');

      // Check if the main creature type matches (usually first or last word)
      return searchWords.some(sw => entryWords.includes(sw) && sw.length >= MIN_PARTIAL_LENGTH) ||
             entryWords.some(ew => searchWords.includes(ew) && ew.length >= MIN_PARTIAL_LENGTH);
    });

    if (matches.length > 0) {
      const match = selectBestMatch(matches);
      log(`Partial match found: "${creatureName}" -> "${match.entry.name}" (${match.pack.metadata.label}, priority ${getCompendiumPriority(match.pack)})`);
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

  // WORKAROUND: Handle wildcard patterns in token texture paths
  // The Monster Manual 2024 module uses patterns like "specter-*.webp" for randomized tokens
  // Foundry cannot load these directly, so we need to resolve or use a fallback
  if (prototypeToken.texture?.src && prototypeToken.texture.src.includes('*')) {
    const originalPath = prototypeToken.texture.src;
    log(`Detected wildcard pattern in token path: ${originalPath}`);

    // Get the variation mode setting
    const variationMode = game.settings.get(MODULE_ID, "tokenVariationMode");
    log(`Token variation mode: ${variationMode}`);

    // Find all available variants
    const availableVariants = [];
    let resolvedPath = null;

    try {
      // Extract the directory and pattern
      const lastSlash = originalPath.lastIndexOf('/');
      const directory = originalPath.substring(0, lastSlash);
      const filePattern = originalPath.substring(lastSlash + 1);
      const baseName = filePattern.replace('*', '').replace('.webp', '').replace('.png', '').replace('.jpg', '');

      // Try common numbered variants (1, 2, 3, etc.)
      const extensions = ['.webp', '.png', '.jpg'];
      const variants = ['1', '2', '3', '4', '5', '01', '02', '03', '04', '05', 'a', 'b', 'c', 'd', 'e', ''];

      for (const variant of variants) {
        for (const ext of extensions) {
          const testPath = `${directory}/${baseName}${variant}${ext}`;
          // Check if the file exists by trying to fetch it
          try {
            const response = await fetch(testPath, { method: 'HEAD' });
            if (response.ok) {
              availableVariants.push(testPath);
            }
          } catch (e) {
            // File doesn't exist, try next
          }
        }
      }

      log(`Found ${availableVariants.length} token variants for ${compendiumEntry.name}`);

      // Select variant based on mode
      if (availableVariants.length > 0) {
        switch (variationMode) {
          case "none":
            // Always use the first variant
            resolvedPath = availableVariants[0];
            log(`Using first variant (none mode): ${resolvedPath}`);
            break;

          case "random":
            // Pick a random variant
            const randomIndex = Math.floor(Math.random() * availableVariants.length);
            resolvedPath = availableVariants[randomIndex];
            log(`Using random variant (${randomIndex + 1}/${availableVariants.length}): ${resolvedPath}`);
            break;

          case "sequential":
          default:
            // Use variants in sequence
            const seqIndex = sequentialVariantCounter % availableVariants.length;
            resolvedPath = availableVariants[seqIndex];
            sequentialVariantCounter++;
            log(`Using sequential variant (${seqIndex + 1}/${availableVariants.length}): ${resolvedPath}`);
            break;
        }
      }
    } catch (e) {
      logError("Error trying to resolve wildcard path", e);
    }

    // If we couldn't resolve, use the actor's portrait as fallback
    if (!resolvedPath) {
      const portraitPath = compendiumActor.img;
      if (portraitPath && !portraitPath.includes('*')) {
        resolvedPath = portraitPath;
        log(`Using actor portrait as fallback: ${resolvedPath}`);
      } else {
        // Last resort: use mystery man token
        resolvedPath = 'icons/svg/mystery-man.svg';
        log(`Using default mystery-man token as last resort`);
      }
    }

    prototypeToken.texture.src = resolvedPath;
  }

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

  // Check if any WOTC modules with Actor compendiums are active
  const wotcPacks = detectWOTCCompendiums();
  if (wotcPacks.length === 0) {
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

  // Check if any compendiums are available
  const enabledPacks = getEnabledCompendiums();
  if (enabledPacks.length === 0) {
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
    return;
  }

  // Load the combined monster index from all enabled compendiums
  const index = await loadMonsterIndex();

  if (index.length === 0) {
    ui.notifications.error(game.i18n.localize("NPC_REPLACER.NoCompendium"));
    return;
  }

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

  // Reset sequential counter for this replacement session
  sequentialVariantCounter = 0;

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
          // match is {entry, pack} - pass the entry and its source pack
          await replaceToken(tokenDoc, match.entry, match.pack);
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
  registerSettings();
});

/**
 * Module ready hook
 */
Hooks.once("ready", () => {
  log("NPC Token Replacer is ready");

  // Detect available WOTC compendiums
  const wotcPacks = detectWOTCCompendiums();

  if (wotcPacks.length === 0) {
    log("Warning: No official D&D compendiums found. Install official D&D content for this module to work.");
  } else {
    log(`Found ${wotcPacks.length} official D&D compendium(s)`);

    // Pre-cache the monster index (async, non-blocking)
    loadMonsterIndex()
      .then(() => {
        log("Monster index pre-cached successfully");
      })
      .catch(error => {
        logError("Failed to pre-cache monster index", error);
      });
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
  detectWOTCCompendiums,
  getEnabledCompendiums,
  clearCache: () => {
    monsterIndexCache = null;
    importFolderCache = null;
    wotcCompendiumsCache = null;
  }
};

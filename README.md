# NPC Token Replacer

A Foundry VTT module that automatically replaces NPC tokens in your scene with official D&D compendium versions, preserving their position, elevation, dimensions, and visibility.

## Features

- **One-Click Replacement**: Adds a button to the Token Controls toolbar for easy access
- **Automatic Compendium Detection**: Automatically detects all installed official D&D content (Monster Manual, Adventures, etc.)
- **Multi-Compendium Support**: Search across multiple official D&D compendiums simultaneously
- **Smart Priority System**: Prefers adventure/expansion creatures over Monster Manual over SRD
- **Configurable Compendium Selection**: Choose which compendiums to use via settings
- **Preserves Token Properties**: Maintains position, elevation, dimensions, visibility, rotation, and disposition
- **Confirmation Dialog**: Shows a list of tokens to be replaced before proceeding
- **Detailed Logging**: Provides console logs for debugging and tracking
- **Smart Name Matching**: Handles variations in creature names (e.g., "Goblin Warrior" matches "Goblin")
- **Token Variation Mode**: Choose how to handle multiple token art variations (None/Sequential/Random)
- **Folder Organization**: Automatically organizes imported monsters into folders

## Supported Official D&D Content

The module automatically detects and supports all official Wizards of the Coast content for Foundry VTT:

| Module ID | Content | Priority |
|-----------|---------|----------|
| `dnd-phandelver-below` | Phandelver and Below: The Shattered Obelisk | 4-ADVENTURE |
| `dnd-tomb-annihilation` | Tomb of Annihilation | 4-ADVENTURE |
| `dnd-adventures-faerun` | Forgotten Realms: Adventures in Faerun | 4-ADVENTURE |
| `dnd-heroes-faerun` | Forgotten Realms: Heroes of Faerun | 4-ADVENTURE |
| `dnd-heroes-borderlands` | Heroes of the Borderlands | 4-ADVENTURE |
| `dnd-forge-artificer` | Eberron: Forge of the Artificer | 3-EXPANSION |
| `dnd-monster-manual` | Monster Manual (2024) | 2-CORE |
| `dnd-players-handbook` | Player's Handbook (2024) | 2-CORE |
| `dnd-dungeon-masters-guide` | Dungeon Master's Guide (2024) | 2-CORE |
| `dnd-tashas-cauldron` | Tasha's Cauldron of Everything | 1-FALLBACK |
| `dnd5e` | D&D 5e System SRD Monsters | 1-FALLBACK |

### Compendium Priority System

When the same creature exists in multiple compendiums, the module uses a 4-tier priority system to select the best match:

1. **Priority 4 - ADVENTURE**: Creatures from adventure modules (Phandelver, Tomb of Annihilation, etc.) are preferred as they have adventure-specific versions
2. **Priority 3 - EXPANSION**: Expansion books (Forge of Artificer) provide updated or variant creatures
3. **Priority 2 - CORE**: Core rulebooks (Monster Manual, PHB, DMG) provide the standard creature stats
4. **Priority 1 - FALLBACK**: SRD and Tasha's Cauldron content as fallback options

This ensures you always get the best available token art and creature data!

New official content is automatically detected - no module updates required!

## Requirements

- **Foundry VTT**: Version 12 or higher (verified on v13)
- **System**: D&D 5th Edition (dnd5e)
- **Official D&D Content**: At least one official D&D module with Actor compendiums (e.g., Monster Manual 2024)

## Installation

### Method 1: Manual Installation

1. Download the latest release from this repository
2. Extract the contents to your Foundry VTT modules folder:
   - Windows: `%localappdata%/FoundryVTT/Data/modules/`
   - macOS: `~/Library/Application Support/FoundryVTT/Data/modules/`
   - Linux: `~/.local/share/FoundryVTT/Data/modules/`
3. Rename the extracted folder to `npc-token-replacer`
4. Restart Foundry VTT
5. Enable the module in your world's module settings

### Method 2: Manifest URL

1. In Foundry VTT, go to **Add-on Modules** tab
2. Click **Install Module**
3. Paste the manifest URL in the **Manifest URL** field:
   ```
   https://github.com/Aiacos/npc-token-replacer/releases/latest/download/module.json
   ```
4. Click **Install**
5. Enable the module in your world's module settings

## Usage

1. Open a scene with NPC tokens placed on it
2. Select the **Token Controls** layer (the person icon in the left toolbar)
3. **Optional**: Select specific tokens to replace only those (if no tokens selected, all scene NPCs will be processed)
4. Click the **Replace NPC Tokens** button (sync icon)
5. A confirmation dialog will appear showing the NPC tokens that will be replaced
6. Click **Replace Tokens** to proceed or **Cancel** to abort
7. The module will:
   - Search all enabled compendiums for matching creatures
   - Delete the original tokens
   - Create new tokens from the compendium with the original position, elevation, size, and visibility
8. A notification will show the results

### Selection Mode

- **With selected tokens**: Only the selected NPC tokens will be replaced
- **Without selection**: All NPC tokens in the scene will be replaced

## Token Properties Preserved

When replacing tokens, the following properties are preserved from the original token:

| Property | Description |
|----------|-------------|
| Position (x, y) | Exact grid position |
| Elevation | Vertical elevation value |
| Dimensions (width, height) | Token size in grid cells |
| Hidden | Visibility state (hidden/visible) |
| Rotation | Token rotation angle |
| Disposition | Hostile, Neutral, or Friendly |
| Locked | Whether the token is locked |
| Alpha | Token opacity |

## Module Settings

Access the module settings via **Game Settings** > **Configure Settings** > **Module Settings** > **NPC Token Replacer**.

| Setting | Options | Description |
|---------|---------|-------------|
| Token Variation Mode | None, Sequential, Random | How to select token art when multiple variations are available |
| Configure Compendiums | Button | Opens dialog to select which compendiums to use |

### Token Variation Mode

Some creatures have multiple token art variations. This setting controls how the module selects which variation to use:

- **None**: Always use the first available variation
- **Sequential** (default): Cycle through variations in order. If you have 5 Goblins in a scene, they'll get variations 1, 2, 3, 4, 5 (or wrap around if fewer variations exist)
- **Random**: Randomly select a variation for each token

### Compendium Selection

The module offers three compendium selection modes:

| Mode | Description |
|------|-------------|
| **Core + Fallback Only** (Default) | Uses only SRD, Tasha's, Monster Manual, PHB, and DMG. Best for standard games. |
| **All Compendiums** | Uses all installed official D&D compendiums including adventures and expansions. |
| **Custom Selection** | Manually select which compendiums to use. |

To configure:
1. Open Module Settings
2. Click **Configure Compendiums**
3. Select your preferred mode
4. If using Custom Selection, check the specific compendiums you want
5. Click Save

## Name Matching

The module uses intelligent name matching to find creatures in the compendiums:

1. **Exact Match**: First tries to find an exact name match
2. **Variant Matching**: Removes common prefixes/suffixes:
   - Prefixes: "Young", "Adult", "Ancient", "Elder", "Greater", "Lesser"
   - Suffixes: "Warrior", "Guard", "Scout", "Champion", "Leader", "Chief", "Captain", "Shaman", "Berserker"
3. **Partial Match**: Checks if names share significant words (4+ characters)

### Examples

| Scene Token | Compendium Match |
|-------------|------------------|
| "Goblin" | "Goblin" |
| "Goblin Warrior" | "Goblin" |
| "Young Red Dragon" | "Red Dragon" |
| "Orc War Chief" | "Orc" |

## Console Commands

For debugging or manual control, you can use these commands in the browser console (F12):

```javascript
// Run the token replacement manually
NPCTokenReplacer.replaceNPCTokens();

// Get all detected WOTC compendiums
NPCTokenReplacer.detectWOTCCompendiums();

// Get currently enabled compendiums
NPCTokenReplacer.getEnabledCompendiums();

// Get all NPC tokens in the current scene
NPCTokenReplacer.getNPCTokensFromScene();

// Clear the cached monster index (forces reload)
NPCTokenReplacer.clearCache();
```

## Troubleshooting

### "No official D&D compendiums found"

Make sure you have installed and enabled at least one official D&D module with Actor compendiums (e.g., Monster Manual 2024, Phandelver and Below, etc.).

### "No compendiums available for token replacement"

The module couldn't find any enabled compendiums. Check:
1. You have official D&D content installed
2. The compendiums are enabled in the module settings
3. Check the console (F12) for detected compendiums

### Tokens not being matched

Check the console log for details on which creatures weren't found. The matching algorithm tries to be flexible, but some custom or homebrew creatures may not have equivalents in the official compendiums.

### Some tokens show errors

If specific tokens fail to replace, check the console for error details. Common causes:
- Corrupted token data
- Missing actor references
- Permission issues

## Compatibility

- **Foundry VTT v12**: Supported (array-based controls)
- **Foundry VTT v13**: Verified (object-based controls)
- **D&D 5e System**: Required

## Known Limitations

- Only works with NPC-type actors (not characters or vehicles)
- Requires at least one official D&D module with Actor compendiums
- Custom/homebrew creatures without official compendium equivalents will be skipped
- Token art from the compendium will replace any custom token art

## Architecture

The module follows an object-oriented design with well-defined classes, each with a single responsibility. All logic is contained in `scripts/main.js` as plain JavaScript ES modules (no build system required).

### Class Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      NPCTokenReplacerController                 │
│              (Main Facade - orchestrates all operations)        │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ uses
                               ▼
    ┌──────────────────────────┼───────────────────────────┐
    │                          │                           │
    ▼                          ▼                           ▼
┌────────────────┐   ┌─────────────────┐   ┌────────────────────┐
│ CompendiumManager │ │  TokenReplacer   │ │   NameMatcher       │
│ (compendiums)     │ │ (token ops)      │ │ (name matching)     │
└────────────────┘   └─────────────────┘   └────────────────────┘
    │                          │
    │                          │ uses
    │                          ▼
    │                 ┌─────────────────┐
    │                 │ WildcardResolver │
    │                 │ (path resolution)│
    │                 └─────────────────┘
    │                          │
    │                          │ uses
    │                          ▼
    │                 ┌─────────────────┐
    │                 │  FolderManager   │
    │                 │ (import folders) │
    │                 └─────────────────┘
    │                          │
    └──────────────────────────┼───────────────────────────┐
                               │                           │
                               ▼                           ▼
                        ┌────────────┐           ┌─────────────────────┐
                        │   Logger   │           │ CompendiumSelectorForm│
                        │ (logging)  │           │ (settings UI)        │
                        └────────────┘           └─────────────────────┘
```

### Class Responsibilities

| Class | Purpose |
|-------|---------|
| **NPCTokenReplacerController** | Main facade that orchestrates the token replacement workflow, validates prerequisites, and coordinates all operations |
| **CompendiumManager** | Detects WotC compendiums, manages enabled compendiums, loads monster indexes, and handles compendium priorities |
| **TokenReplacer** | Handles token replacement operations, imports actors to world, and creates new tokens with preserved properties |
| **NameMatcher** | Normalizes creature names and matches them to compendium entries using multi-stage matching algorithms |
| **WildcardResolver** | Resolves Monster Manual 2024 wildcard token paths (e.g., `specter-*.webp`) to actual image files |
| **FolderManager** | Manages Actor folders for organizing compendium imports |
| **Logger** | Provides centralized logging with consistent module prefix formatting |
| **CompendiumSelectorForm** | Foundry FormApplication subclass for the compendium selection settings UI |

### Design Patterns

- **Facade Pattern**: `NPCTokenReplacerController` provides a simplified interface to the complex subsystem of classes
- **Static Methods**: Most classes use static methods since they don't require instance state
- **Private Fields**: ES6 private static fields (`#field`) ensure encapsulation and prevent external access to internal state
- **Caching**: Multiple classes implement caching for performance (compendium indexes, folder references, wildcard paths)

### Foundry Integration

The module integrates with Foundry VTT through these hooks:

- `Hooks.once("init")`: Registers module settings
- `Hooks.once("ready")`: Initializes the controller and pre-caches monster indexes
- `Hooks.on("getSceneControlButtons")`: Adds the toolbar button (handles both v12 and v13 API formats)

A global debug API is exposed via `window.NPCTokenReplacer` for console access.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This module is released under the MIT License.

## Credits

- Developed for use with Foundry Virtual Tabletop
- Official D&D content is owned by Wizards of the Coast

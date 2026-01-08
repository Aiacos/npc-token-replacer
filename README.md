# NPC Token Replacer

A Foundry VTT module that automatically replaces NPC tokens in your scene with the official Monster Manual D&D 2024 versions, preserving their position, elevation, dimensions, and visibility.

## Features

- **One-Click Replacement**: Adds a button to the Token Controls toolbar for easy access
- **Automatic Matching**: Intelligently matches NPC names with Monster Manual entries
- **Preserves Token Properties**: Maintains position, elevation, dimensions, visibility, rotation, and disposition
- **Confirmation Dialog**: Shows a list of tokens to be replaced before proceeding
- **Detailed Logging**: Provides console logs for debugging and tracking
- **Smart Name Matching**: Handles variations in creature names (e.g., "Goblin Warrior" matches "Goblin")

## Requirements

- **Foundry VTT**: Version 12 or higher (verified on v13)
- **System**: D&D 5th Edition (dnd5e)
- **Required Module**: [D&D Monster Manual 2024](https://foundryvtt.com/packages/dnd-monster-manual) - The official Monster Manual compendium module

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
   https://raw.githubusercontent.com/YOUR_USERNAME/npc-token-replacer/main/module.json
   ```
4. Click **Install**
5. Enable the module in your world's module settings

## Usage

1. Open a scene with NPC tokens placed on it
2. Select the **Token Controls** layer (the person icon in the left toolbar)
3. Click the **Replace NPC Tokens** button (sync icon)
4. A confirmation dialog will appear showing all NPC tokens that will be replaced
5. Click **Replace Tokens** to proceed or **Cancel** to abort
6. The module will:
   - Find matching creatures in the Monster Manual 2024 compendium
   - Delete the original tokens
   - Create new tokens from the compendium with the original position, elevation, size, and visibility
7. A notification will show the results

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

## Name Matching

The module uses intelligent name matching to find creatures in the Monster Manual:

1. **Exact Match**: First tries to find an exact name match
2. **Variant Matching**: Removes common prefixes/suffixes:
   - Prefixes: "Young", "Adult", "Ancient", "Elder"
   - Suffixes: "Warrior", "Guard", "Scout", "Champion", "Leader", "Chief"
3. **Partial Match**: Checks if names contain each other

### Examples

| Scene Token | Monster Manual Match |
|-------------|---------------------|
| "Goblin" | "Goblin" |
| "Goblin Warrior" | "Goblin" |
| "Young Red Dragon" | "Red Dragon" |
| "Orc War Chief" | "Orc" |

## Console Commands

For debugging or manual control, you can use these commands in the browser console (F12):

```javascript
// Run the token replacement manually
NPCTokenReplacer.replaceNPCTokens();

// Get the Monster Manual compendium pack
NPCTokenReplacer.getMonsterManualPack();

// Get all NPC tokens in the current scene
NPCTokenReplacer.getNPCTokensFromScene();

// Search for a creature in the monster index
const pack = NPCTokenReplacer.getMonsterManualPack();
const index = await pack.getIndex();
NPCTokenReplacer.findInMonsterManual("Goblin", index);

// Clear the cached monster index (forces reload)
NPCTokenReplacer.clearCache();
```

## Troubleshooting

### "Monster Manual 2024 module is required but not active"

Make sure you have installed and enabled the official Monster Manual 2024 module from Foundry VTT.

### "Monster Manual compendium not found"

The module couldn't locate the monster compendium. Check the console (F12) for available pack names and report the issue.

### Tokens not being matched

Check the console log for details on which creatures weren't found. The matching algorithm tries to be flexible, but some custom or homebrew creatures may not have equivalents in the Monster Manual.

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
- Requires the official Monster Manual 2024 module
- Custom/homebrew creatures without Monster Manual equivalents will be skipped
- Token art from the Monster Manual will replace any custom token art

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This module is released under the MIT License.

## Credits

- Developed for use with Foundry Virtual Tabletop
- Monster Manual 2024 content is owned by Wizards of the Coast

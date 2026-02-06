#!/bin/bash
#
# Build script for NPC Token Replacer Foundry VTT module
# Creates a distributable ZIP package in the releases/ folder
#

set -e  # Exit on error

# Colors for output (disabled if not a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Script directory (where the script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  NPC Token Replacer - Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check for required files
echo -e "${BLUE}[1/6]${NC} Checking required files..."

if [ ! -f "module.json" ]; then
    echo -e "${RED}ERROR: module.json not found!${NC}"
    exit 1
fi

# Extract version from module.json
VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' module.json | sed 's/.*"\([^"]*\)"$/\1/')

if [ -z "$VERSION" ]; then
    echo -e "${RED}ERROR: Could not extract version from module.json${NC}"
    exit 1
fi

echo -e "  Found version: ${GREEN}${VERSION}${NC}"

# Module ID
MODULE_ID="npc-token-replacer"

# Output file name
OUTPUT_FILE="${MODULE_ID}-v${VERSION}.zip"

# Files to include in the package
REQUIRED_FILES=("module.json" "README.md")
REQUIRED_DIRS=("scripts" "templates" "lang")
OPTIONAL_FILES=("LICENSE")

# Check required files
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}ERROR: Required file '$file' not found!${NC}"
        exit 1
    fi
done

# Check required directories
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo -e "${RED}ERROR: Required directory '$dir' not found!${NC}"
        exit 1
    fi
done

echo -e "  All required files present ${GREEN}OK${NC}"

# Create releases directory if it doesn't exist
echo -e "${BLUE}[2/6]${NC} Creating releases directory..."
mkdir -p releases
echo -e "  ${GREEN}OK${NC}"

# Create temp directory
echo -e "${BLUE}[3/6]${NC} Creating temporary staging directory..."
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT
echo -e "  ${GREEN}OK${NC}"

# Copy files to temp directory
echo -e "${BLUE}[4/6]${NC} Staging files for packaging..."

# Copy required files
for file in "${REQUIRED_FILES[@]}"; do
    cp "$file" "$TEMP_DIR/"
    echo -e "  Copied: $file"
done

# Copy required directories
for dir in "${REQUIRED_DIRS[@]}"; do
    cp -r "$dir" "$TEMP_DIR/"
    echo -e "  Copied: $dir/"
done

# Copy optional files if they exist
for file in "${OPTIONAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$TEMP_DIR/"
        echo -e "  Copied: $file"
    else
        echo -e "  ${YELLOW}Warning: Optional file '$file' not found (skipping)${NC}"
    fi
done

# Update download URL in the staged module.json
echo -e "${BLUE}[5/6]${NC} Updating module.json download URL..."

# Build the new download URL
NEW_DOWNLOAD_URL="https://github.com/Aiacos/${MODULE_ID}/releases/download/v${VERSION}/${OUTPUT_FILE}"

# Use sed to replace the download URL
# This handles the format: "download": "..."
sed -i.bak "s|\"download\"[[:space:]]*:[[:space:]]*\"[^\"]*\"|\"download\": \"${NEW_DOWNLOAD_URL}\"|" "$TEMP_DIR/module.json"
rm -f "$TEMP_DIR/module.json.bak"

echo -e "  Download URL set to: ${GREEN}${NEW_DOWNLOAD_URL}${NC}"

# Create the ZIP file
echo -e "${BLUE}[6/6]${NC} Creating ZIP archive..."

# Remove existing release file if it exists
if [ -f "releases/${OUTPUT_FILE}" ]; then
    rm "releases/${OUTPUT_FILE}"
    echo -e "  Removed existing: releases/${OUTPUT_FILE}"
fi

# Create ZIP from temp directory (files at root level, no containing folder)
# Use absolute path for output to avoid path issues
OUTPUT_PATH="$SCRIPT_DIR/releases/${OUTPUT_FILE}"
(cd "$TEMP_DIR" && zip -r -q "$OUTPUT_PATH" .)

echo -e "  ${GREEN}OK${NC}"

# Verify the ZIP was created
if [ -f "releases/${OUTPUT_FILE}" ]; then
    ZIP_SIZE=$(ls -lh "releases/${OUTPUT_FILE}" | awk '{print $5}')
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Build Successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  Output: ${BLUE}releases/${OUTPUT_FILE}${NC}"
    echo -e "  Size:   ${BLUE}${ZIP_SIZE}${NC}"
    echo ""
    echo -e "  ZIP Contents:"
    unzip -l "releases/${OUTPUT_FILE}" | tail -n +4 | head -n -2 | while read line; do
        echo -e "    $line"
    done
    echo ""
else
    echo -e "${RED}ERROR: Failed to create ZIP file${NC}"
    exit 1
fi

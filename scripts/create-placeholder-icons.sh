#!/bin/bash

# Helper script to create placeholder icons for the Chrome extension
# This creates simple colored squares as temporary icons until proper ones are designed

set -e

ICON_DIR="../extension/icons"
COLOR="#238636"  # GitHub green

echo "Creating placeholder icons for Chrome extension..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "Error: ImageMagick is not installed."
    echo "Please install it first:"
    echo "  - macOS: brew install imagemagick"
    echo "  - Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "  - Windows: Download from https://imagemagick.org/script/download.php"
    exit 1
fi

# Create icons directory if it doesn't exist
mkdir -p "$ICON_DIR"

# Create 16x16 icon
echo "Creating icon16.png..."
convert -size 16x16 xc:"$COLOR" \
    -gravity center \
    -pointsize 10 \
    -fill white \
    -annotate +0+0 "AI" \
    "$ICON_DIR/icon16.png"

# Create 32x32 icon
echo "Creating icon32.png..."
convert -size 32x32 xc:"$COLOR" \
    -gravity center \
    -pointsize 20 \
    -fill white \
    -annotate +0+0 "AI" \
    "$ICON_DIR/icon32.png"

# Create 48x48 icon
echo "Creating icon48.png..."
convert -size 48x48 xc:"$COLOR" \
    -gravity center \
    -pointsize 30 \
    -fill white \
    -annotate +0+0 "AI" \
    "$ICON_DIR/icon48.png"

# Create 128x128 icon
echo "Creating icon128.png..."
convert -size 128x128 xc:"$COLOR" \
    -gravity center \
    -pointsize 80 \
    -fill white \
    -annotate +0+0 "AI" \
    "$ICON_DIR/icon128.png"

echo "✓ Placeholder icons created successfully!"
echo "Icons saved to: $ICON_DIR"
echo ""
echo "Note: These are simple placeholders. For a production extension,"
echo "consider creating proper icon designs. See extension/icons/README.md"

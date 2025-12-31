# Extension Icons

This folder should contain the extension icons in the following sizes:

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon32.png` - 32x32 pixels (toolbar icon @2x)
- `icon48.png` - 48x48 pixels (extension management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Creating Icons

### Quick Option: Use an Icon Generator

1. Visit https://www.favicon-generator.org/ or similar
2. Upload a base image (512x512 recommended)
3. Generate all sizes
4. Download and place in this folder

### Design Guidelines

- Use a simple, recognizable symbol (e.g., code brackets, AI brain, review checkmark)
- Make it work on both light and dark backgrounds
- Keep it simple - icons are small
- Use GitHub's color scheme for consistency:
  - Primary: #238636 (green)
  - Accent: #1f6feb (blue)
  - Background: White or transparent

### Recommended Design

A simple design that works well:
- An AI brain icon or robot head
- Combined with code symbols (< >, { })
- Or a checkmark/review badge
- Green/blue color scheme matching GitHub

### Manual Creation

Using any image editor (Photoshop, Figma, Inkscape, etc.):

1. Create 512x512 base image with transparent background
2. Export at required sizes:
   - 16x16
   - 32x32
   - 48x48
   - 128x128
3. Save as PNG with transparency
4. Place files in this directory

### Placeholder for Testing

For development/testing, you can use simple colored squares:

```bash
# Using ImageMagick (if installed)
convert -size 16x16 xc:#238636 icon16.png
convert -size 32x32 xc:#238636 icon32.png
convert -size 48x48 xc:#238636 icon48.png
convert -size 128x128 xc:#238636 icon128.png
```

Or create them manually in any image editor.

## Current Status

⚠️ **Icons not included in repository** - You need to add them before the extension will work properly.

The manifest.json references these files, so Chrome will show an error if they're missing.
# PWA Icons

This directory should contain PWA icons in the following sizes:

## Required Icons

- `icon-72x72.png` - 72×72 pixels
- `icon-96x96.png` - 96×96 pixels
- `icon-128x128.png` - 128×128 pixels
- `icon-144x144.png` - 144×144 pixels
- `icon-152x152.png` - 152×152 pixels
- `icon-192x192.png` - 192×192 pixels (maskable for Android)
- `icon-384x384.png` - 384×384 pixels
- `icon-512x512.png` - 512×512 pixels (maskable for Android)

## Design Guidelines

- Use a lock or shield icon to represent privacy/security
- Primary color: #2563eb (blue) matching the app theme
- Ensure icons follow "maskable icon" guidelines for proper display on Android
- Background should be #1a1a1a (dark) or transparent

## How to Generate

You can use tools like:
- **ImageMagick**: `convert source.svg -resize 192x192 icon-192x192.png`
- **Online tools**: https://www.pwabuilder.com/ or https://realfavicongenerator.net/
- **Figma/Sketch**: Export at 2x resolution for crisp icons

## Temporary Fallback

For development, you can copy the vite.svg as a placeholder:
```bash
# Install ImageMagick if needed
# Then generate icons from SVG
for size in 72 96 128 144 152 192 384 512; do
  convert ../vite.svg -resize ${size}x${size} icon-${size}x${size}.png
done
```

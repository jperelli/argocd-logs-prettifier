#!/usr/bin/env bash
# Renders extension/icons/*.png from assets/logo.svg (needs ImageMagick).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p extension/icons
for size in 16 32 48 128; do
  convert -background none -density $((size * 8)) assets/logo.svg -resize "${size}x${size}" "extension/icons/icon${size}.png"
done
echo "icons rendered"

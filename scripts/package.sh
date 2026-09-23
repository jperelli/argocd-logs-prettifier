#!/usr/bin/env bash
# Builds the zip to upload to the Chrome Web Store developer dashboard.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./extension/manifest.json').version")
pkg_version=$(node -p "require('./package.json').version")
if [ "$version" != "$pkg_version" ]; then
  echo "version mismatch: manifest.json=$version package.json=$pkg_version" >&2
  exit 1
fi

node test/parser.test.js
mkdir -p dist
out="dist/argocd-jsonl-log-viewer-$version.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x '.*' '*~')
echo "built $out"
unzip -l "$out"

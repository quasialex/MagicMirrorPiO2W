#!/usr/bin/env bash
set -euo pipefail

MM_DIR="${MM_DIR:-$HOME/MagicMirror}"
REPO_RAW_BASE="https://raw.githubusercontent.com/quasialex/MagicMirrorPiO2W/master/pio2w-dashboard"

echo "Installing MagicMirror Pi Zero 2 W dashboard profile..."
echo "MagicMirror directory: $MM_DIR"

if [ ! -d "$MM_DIR" ]; then
  echo "ERROR: MagicMirror directory not found: $MM_DIR"
  echo "Install MagicMirror first, then rerun this script."
  exit 1
fi

mkdir -p "$MM_DIR/config"
mkdir -p "$MM_DIR/modules"

echo "Downloading dashboard config files..."
curl -fsSL "$REPO_RAW_BASE/config/custom.css" -o "$MM_DIR/config/custom.css"
curl -fsSL "$REPO_RAW_BASE/config/basepath.js" -o "$MM_DIR/config/basepath.js"

if [ ! -f "$MM_DIR/config/config.js" ]; then
  echo "No config.js found. Installing template config.js..."
  curl -fsSL "$REPO_RAW_BASE/config/config.js" -o "$MM_DIR/config/config.js"
else
  echo "Existing config.js found. Leaving it untouched."
  echo "Template is available at: $MM_DIR/config/config.js"
  curl -fsSL "$REPO_RAW_BASE/config/config.js" -o "$MM_DIR/config/config.js"
fi

echo "Downloading dashboard modules..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 https://github.com/quasialex/MagicMirrorPiO2W.git "$TMP_DIR/repo"

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='package-lock.json' \
  "$TMP_DIR/repo/pio2w-dashboard/modules/" "$MM_DIR/modules/"

echo "Installing module dependencies where needed..."
find "$MM_DIR/modules" -maxdepth 2 -name package.json -not -path "*/node_modules/*" -print0 |
  while IFS= read -r -d '' package_file; do
    module_dir="$(dirname "$package_file")"
    echo "Installing dependencies in $module_dir"
    (
      cd "$module_dir"
      npm install --omit=dev
    )
  done

echo "Checking config syntax..."
cd "$MM_DIR"
node --check config/config.js

echo "Dashboard profile installed."
echo "Review/edit: $MM_DIR/config/config.js"
echo "Then restart MagicMirror with: pm2 restart MagicMirror"

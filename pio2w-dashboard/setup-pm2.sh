#!/usr/bin/env bash
# Register a working MagicMirror launcher without deleting any existing PM2 process.
set -Eeuo pipefail
MM_DIR="${MM_DIR:-$HOME/MagicMirror}"
[[ -f "$MM_DIR/installers/mm.sh" ]] || { echo "Launcher not found: $MM_DIR/installers/mm.sh" >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is missing.' >&2; exit 1; }
if ! command -v pm2 >/dev/null; then
  echo 'Installing PM2...'
  sudo npm install -g pm2
fi
if pm2 describe MagicMirror >/dev/null 2>&1; then
  echo 'MagicMirror is already registered with PM2; registration left unchanged.'
  echo 'Check with: pm2 describe MagicMirror'
else
  (cd "$MM_DIR" && pm2 start "$MM_DIR/installers/mm.sh" --name MagicMirror --interpreter bash --cwd "$MM_DIR")
  pm2 save
  echo 'MagicMirror registered and saved in PM2.'
fi
echo 'If PM2 does not already start at boot, run: pm2 startup'
echo 'Follow its printed startup command, then run: pm2 save'
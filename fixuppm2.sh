#!/usr/bin/env bash
# Compatibility wrapper for the current, non-destructive PM2 setup.
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/pio2w-dashboard/setup-pm2.sh" ]]; then
  exec bash "$SCRIPT_DIR/pio2w-dashboard/setup-pm2.sh" "$@"
fi
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
curl -fsSL https://raw.githubusercontent.com/quasialex/MagicMirrorPiO2W/master/pio2w-dashboard/setup-pm2.sh -o "$TMP"
bash "$TMP" "$@"

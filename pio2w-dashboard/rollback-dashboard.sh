#!/usr/bin/env bash
# Restore dashboard profile files recorded by the most recent installer run.
set -Eeuo pipefail
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/magicmirror-pio2w"
[[ -f "$STATE_DIR/last-backup" ]] || { echo 'No dashboard installer backup found.' >&2; exit 1; }
BACKUP="$(cat "$STATE_DIR/last-backup")"
[[ -d "$BACKUP/files" && -f "$BACKUP/manifest.tsv" && -f "$BACKUP/mm-dir" ]] || { echo 'Backup incomplete.' >&2; exit 1; }
MM_DIR="$(cat "$BACKUP/mm-dir")"
[[ -f "$MM_DIR/package.json" ]] || { echo "MagicMirror directory missing: $MM_DIR" >&2; exit 1; }
[[ -t 0 ]] && { read -r -p "Restore profile files in $MM_DIR? [y/N]: " answer || true; [[ "${answer,,}" == y || "${answer,,}" == yes ]] || exit 0; }
while IFS=$'\t' read -r action rel; do
  case "$rel" in
    config/config.js|config/custom.css|config/basepath.js) ;;
    *) echo "Unexpected backup path: $rel" >&2; exit 1 ;;
  esac
  case "$action" in
    restore) cp -p -- "$BACKUP/files/$rel" "$MM_DIR/$rel" ;;
    remove) rm -f -- "$MM_DIR/$rel" ;;
    *) echo "Invalid backup operation: $action" >&2; exit 1 ;;
  esac
done < "$BACKUP/manifest.tsv"
rm -f -- "$STATE_DIR/last-backup"
echo 'Dashboard config and styling restored. Added modules were left installed.'
echo 'Restart if needed: pm2 restart MagicMirror'
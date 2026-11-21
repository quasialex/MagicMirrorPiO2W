#!/usr/bin/env bash
# Install the seven-inch MagicMirror dashboard without deleting other modules or settings.
set -Eeuo pipefail

MM_DIR="${MM_DIR:-$HOME/MagicMirror}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/magicmirror-pio2w"
DRY_RUN=0
YES=0
REPLACE_CONFIG=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) YES=1 ;;
    --replace-config) REPLACE_CONFIG=1 ;;
    --help|-h)
      echo 'Usage: install-dashboard.sh [--dry-run] [--yes] [--replace-config]'
      echo 'Override MagicMirror location with MM_DIR=/path/to/MagicMirror'
      exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
[[ -f "$MM_DIR/package.json" ]] || { echo "MagicMirror not found at $MM_DIR" >&2; exit 1; }

if (( DRY_RUN )); then
  echo "DRY RUN: install the 7-inch dashboard profile into $MM_DIR"
  echo 'Existing config.js: preserved unless --replace-config is selected.'
  echo 'Existing modules: preserved. No --delete or PM2 changes.'
  echo 'Optional settings: calendar URLs, weather location/coordinates, Uptime Kuma.'
  echo 'SpotifyTouch: optional separate companion installation after MagicMirror starts.'
  exit 0
fi

if [[ ! -t 0 ]] && (( ! YES )); then
  echo 'Interactive input required. Use --dry-run or --yes with defaults for unattended setup.' >&2
  exit 2
fi

command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }
command -v node >/dev/null || { echo 'node is required' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required' >&2; exit 1; }
PROFILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR=""
if [[ ! -f "$PROFILE_DIR/config/config.js" || ! -d "$PROFILE_DIR/modules" ]]; then
  command -v git >/dev/null || { echo 'git is required for remote installation' >&2; exit 1; }
  TMP_DIR="$(mktemp -d)"
  git clone -q --depth 1 https://github.com/quasialex/MagicMirrorPiO2W.git "$TMP_DIR/repo"
  PROFILE_DIR="$TMP_DIR/repo/pio2w-dashboard"
fi
trap '[[ -z "${TMP_DIR:-}" ]] || rm -rf -- "$TMP_DIR"' EXIT

ask_yes() {
  local answer
  if (( YES )) || [[ ! -t 0 ]]; then return 1; fi
  read -r -p "$1 [y/N]: " answer || true
  [[ "${answer,,}" == y || "${answer,,}" == yes ]]
}

CONFIG_ACTION='create'
if [[ -f "$MM_DIR/config/config.js" ]]; then
  CONFIG_ACTION='keep'
  if (( REPLACE_CONFIG )); then
    CONFIG_ACTION='replace'
  elif ask_yes 'Existing config.js found. Back up and replace it with this dashboard profile?'; then
    CONFIG_ACTION='replace'
  fi
fi

WEATHER_NAME='' WEATHER_LAT='' WEATHER_LON=''
CALENDAR_ICLOUD='' CALENDAR_GOOGLE='' CALENDAR_HOLIDAYS=''
KUMA_URL='' KUMA_PAGE='home' KUMA_ROWS='Server,Nextcloud,Network,Website'
if [[ "$CONFIG_ACTION" != keep ]]; then
  if ask_yes 'Set up local weather?'; then
    read -r -p 'Location name (e.g. London): ' WEATHER_NAME
    read -r -p 'Latitude (e.g. 51.5074): ' WEATHER_LAT
    read -r -p 'Longitude (e.g. -0.1278): ' WEATHER_LON
  fi
  if ask_yes 'Add calendar feeds (ICS URLs)?'; then
    read -r -p 'iCloud calendar URL (optional): ' CALENDAR_ICLOUD
    read -r -p 'Google calendar URL (optional): ' CALENDAR_GOOGLE
    read -r -p 'Holiday calendar URL (optional): ' CALENDAR_HOLIDAYS
  fi
  if ask_yes 'Connect an Uptime Kuma status page?'; then
    read -r -p 'Uptime Kuma URL (e.g. http://server:3001): ' KUMA_URL
    read -r -p 'Status page slug [home]: ' KUMA_PAGE
    KUMA_PAGE="${KUMA_PAGE:-home}"
    read -r -p 'Status row names [Server,Nextcloud,Network,Website]: ' KUMA_ROWS
    KUMA_ROWS="${KUMA_ROWS:-Server,Nextcloud,Network,Website}"
  fi
fi

printf '\nDashboard installation plan:\n'
printf '  MagicMirror: %s\n  Config: %s\n  Other modules: preserve existing\n  Styling: install with backup\n' "$MM_DIR" "$CONFIG_ACTION"
if (( ! YES )) && [[ -t 0 ]]; then
  read -r -p 'Apply? [y/N]: ' answer || true
  [[ "${answer,,}" == y || "${answer,,}" == yes ]] || { echo 'Cancelled'; exit 0; }
fi

BACKUP="$STATE_DIR/backups/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$BACKUP/files"
chmod 700 "$BACKUP" "$BACKUP/files"
printf '%s\n' "$MM_DIR" > "$BACKUP/mm-dir"
: > "$BACKUP/manifest.tsv"
backup_file() {
  local rel="$1" dst="$MM_DIR/$rel"
  mkdir -p "$BACKUP/files/$(dirname "$rel")"
  if [[ -f "$dst" ]]; then
    cp -p -- "$dst" "$BACKUP/files/$rel"
    printf 'restore\t%s\n' "$rel" >> "$BACKUP/manifest.tsv"
  else
    printf 'remove\t%s\n' "$rel" >> "$BACKUP/manifest.tsv"
  fi
}
install_file() {
  local source="$1" rel="$2"
  backup_file "$rel"
  mkdir -p "$MM_DIR/$(dirname "$rel")"
  cp -- "$source" "$MM_DIR/$rel"
}

mkdir -p "$MM_DIR/config" "$MM_DIR/modules"
if [[ "$CONFIG_ACTION" != keep ]]; then
  # Personal calendar feeds and network endpoints stay in the user's local config,
  # never in the public template or GitHub repository.
  export WEATHER_NAME WEATHER_LAT WEATHER_LON CALENDAR_ICLOUD CALENDAR_GOOGLE CALENDAR_HOLIDAYS KUMA_URL KUMA_PAGE KUMA_ROWS
  GENERATED="$BACKUP/generated-config.js"
  python3 - "$PROFILE_DIR/config/config.js" "$GENERATED" <<'PY'
import json, os, pathlib, re, sys, urllib.parse
src = pathlib.Path(sys.argv[1]).read_text()
def url(value):
    value = value.strip()
    if value.startswith('webcal://'):
        value = 'https://' + value[len('webcal://'):]
    if value and urllib.parse.urlparse(value).scheme not in ('http', 'https'):
        raise SystemExit('Calendar/Kuma URLs must use HTTP(S)')
    return value
lat, lon, name = (os.environ.get(k, '').strip() for k in ('WEATHER_LAT', 'WEATHER_LON', 'WEATHER_NAME'))
if lat or lon or name:
    try:
        latitude, longitude = float(lat), float(lon)
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180 and name): raise ValueError
    except ValueError:
        raise SystemExit('Weather requires a name, latitude (-90..90) and longitude (-180..180)')
else:
    latitude = longitude = None
settings = {
  'weather': {'name': name, 'lat': latitude, 'lon': longitude},
  'calendars': {key: url(os.environ.get(k, '')) for key, k in [
     ('icloud', 'CALENDAR_ICLOUD'), ('google', 'CALENDAR_GOOGLE'), ('holidays', 'CALENDAR_HOLIDAYS')]},
  'kuma': {'url': url(os.environ.get('KUMA_URL', '')), 'statusPage': os.environ.get('KUMA_PAGE', 'home'),
           'rows': [s.strip() for s in os.environ.get('KUMA_ROWS', '').split(',') if s.strip()]}
}
block = '/* DASHBOARD_SETTINGS_BEGIN */\nconst dashboardSettings = ' + json.dumps(settings, ensure_ascii=False, indent=2) + ';\n/* DASHBOARD_SETTINGS_END */'
src, count = re.subn(r'/\* DASHBOARD_SETTINGS_BEGIN \*/.*?/\* DASHBOARD_SETTINGS_END \*/', lambda m: block, src, flags=re.S)
if count != 1: raise SystemExit('Profile template missing dashboard settings marker')
pathlib.Path(sys.argv[2]).write_text(src)
PY
  node --check "$GENERATED"
  install_file "$GENERATED" 'config/config.js'
  chmod 600 "$MM_DIR/config/config.js"
fi
for name in custom.css basepath.js; do
  install_file "$PROFILE_DIR/config/$name" "config/$name"
done

# Install only missing dashboard modules. Never delete or overwrite unrelated modules.
new_modules=()
for src in "$PROFILE_DIR"/modules/*; do
  [[ -d "$src" ]] || continue
  name="$(basename "$src")"
  target="$MM_DIR/modules/$name"
  if [[ -e "$target" ]]; then
    echo "Keeping existing module: $name"
    continue
  fi
  cp -a -- "$src" "$target"
  new_modules+=("$name")
  if [[ -f "$target/package.json" ]]; then
    (cd "$target" && npm install --omit=dev --ignore-scripts --no-audit --no-fund)
  fi
done
printf '%s\n' "${new_modules[@]}" > "$BACKUP/new-modules.txt"
node --check "$MM_DIR/config/config.js"
mkdir -p "$STATE_DIR"
printf '%s\n' "$BACKUP" > "$STATE_DIR/last-backup"
echo "Dashboard installed. Backup: $BACKUP"
echo "Review: $MM_DIR/config/config.js"
echo 'For MagicMirror companion Spotify, install SpotifyTouch separately after MagicMirror is running:'
echo '  https://github.com/quasialex/SpotifyTouch'
echo 'To rollback profile files: bash pio2w-dashboard/rollback-dashboard.sh'
echo 'Restart the mirror after reviewing: pm2 restart MagicMirror'
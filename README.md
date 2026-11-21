# MagicMirrorPiO2W

**MagicMirror² on a Raspberry Pi Zero 2 W with a 7-inch SpotPear touchscreen.** A compact dashboard with touch navigation between home, calendar, weather, BBC news and Uptime Kuma status pages. Originally built for a Pi Zero 2 W running Debian 13 / labwc. Other screens and Pi models may require layout adjustments.

**Spotify is optional.** To switch between MagicMirror and a Spotify touchscreen, install the independent [SpotifyTouch](https://github.com/quasialex/SpotifyTouch) companion after MagicMirror is working. SpotifyTouch provides its own Ubuntu backend and Pi kiosk setup wizard; there is no need to enter Spotify settings here.

## 1. Install MagicMirror²

If you have not installed MagicMirror yet, follow the [official MagicMirror installation guide](https://docs.magicmirror.builders/getting-started/installation.html) or use this repository's older `raspberry.sh` installation helper:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/quasialex/MagicMirrorPiO2W/master/raspberry.sh)"
```

> The older `raspberry.sh` installer has broader system requirements and behavior; review it before running on an existing system. **Never run it to update an already-working MagicMirror.**

## 2. Install the 7-inch dashboard profile

Run these commands on the **Pi** after MagicMirror is installed:

```bash
git clone https://github.com/quasialex/MagicMirrorPiO2W.git
cd MagicMirrorPiO2W
bash pio2w-dashboard/install-dashboard.sh
```

The installer asks whether to configure **weather** (location name, latitude and longitude), **calendars** (optional iCloud, Google or holiday ICS URLs) and an **Uptime Kuma** status page (URL, slug, row names). Leave an optional feature empty to leave that panel out. It stores your private values in the local MagicMirror configuration, not in GitHub.

**Existing configuration:** the installer preserves an existing `~/MagicMirror/config/config.js` unless you explicitly agree to replace it. It backs up config/CSS changes and never deletes unrelated MagicMirror modules. If you're already using a custom dashboard, start with the dry run instead:

```bash
bash pio2w-dashboard/install-dashboard.sh --dry-run
```

For another MagicMirror installation path, prefix the command with `MM_DIR=/path/to/MagicMirror`.

After installation, review `~/MagicMirror/config/config.js`, then restart your existing MagicMirror process (for example `pm2 restart MagicMirror`). To undo profile config/CSS changes:

```bash
bash pio2w-dashboard/rollback-dashboard.sh
```

## 3. Optional: SpotifyTouch companion

On a separate **x86-64 Ubuntu host**, install the [SpotifyTouch backend](https://github.com/quasialex/SpotifyTouch):

```bash
git clone https://github.com/quasialex/SpotifyTouch.git
cd SpotifyTouch
bash scripts/install-ubuntu.sh
```

Then on the **Pi**, run the SpotifyTouch Pi installer and choose **2 — MagicMirror companion**:

```bash
git clone https://github.com/quasialex/SpotifyTouch.git
cd SpotifyTouch
bash scripts/install-pi.sh
```

That wizard asks for the Ubuntu host once, an SSH username and (optionally) a Bluetooth speaker. It installs the Spotify launcher, persistent kiosk, SSH tunnel and on-demand audio without copying SpotifyTouch into this repository. Full instructions and caveats are in the [SpotifyTouch README](https://github.com/quasialex/SpotifyTouch#readme).

## Useful commands

```bash
pm2 status                  # MagicMirror process (if using PM2)
pm2 restart MagicMirror    # Restart an existing MagicMirror process
node --check ~/MagicMirror/config/config.js
```

If MagicMirror isn't registered with PM2 yet, `bash pio2w-dashboard/setup-pm2.sh` can register the current launcher without replacing an existing process. To enable startup at boot, follow the command printed by `pm2 startup`, then run `pm2 save`.

For upgrades to core MagicMirror, use the project's [official update instructions](https://docs.magicmirror.builders/getting-started/upgrade-guide.html) or review this repo's `upgrade-script.sh` separately. The dashboard installer does not upgrade the core application.

## Credits

MagicMirror² is maintained by [MagicMirrorOrg](https://github.com/MagicMirrorOrg/MagicMirror). Earlier installation scripts in this repository were based on [sdetweil/MagicMirror_scripts](https://github.com/sdetweil/MagicMirror_scripts). SpotifyTouch is maintained separately.
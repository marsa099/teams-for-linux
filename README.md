# marsa099 fork — vimNav & NixOS workflow

This fork adds **Vimium-style keyboard navigation** to teams-for-linux and is wired into a NixOS-based workflow on this machine. The original upstream README is preserved unchanged below.

## What's new

`app/browser/tools/vimNav.js` — a renderer-side keyboard layer:

| Key | Action |
|---|---|
| `f` | Hint mode — overlay labels appear on every clickable element. Type the label to click. |
| `j` `k` `h` `l` | Scroll within the focused container. |
| `d` `u` | Half-page down/up. |
| `gg` `G` | Top / bottom. |
| `i` | Focus the message composer. |
| `Esc` | Blur the active input (exit composer) or cancel hint mode. |

Vim keys pass through transparently when an input or contenteditable is focused, so typing messages is unaffected. Toggle with `vimNavEnabled: true` in `~/.config/teams-for-linux/config.json`.

## NixOS integration on this machine

The fork is packaged as a real Nix derivation via overlay — same shape as the nixpkgs `teams-for-linux` package, just rebuilt from this repo's `main` branch. Both versions are installed side by side:

| Binary | What it is |
|---|---|
| `teams-for-linux` | This fork (default for Super+T) |
| `teams-for-linux-stock` | Upstream nixpkgs build, untouched |

**Files involved:**

- `~/.config/nixos/flake.nix` — `teams-for-linux-fork` flake input pointing at `github:marsa099/teams-for-linux/main`
- `~/.config/nixos/modules/teams-fork.nix` — overlay that builds the fork via `buildNpmPackage` and exposes both binaries
- `~/.scripts/teams-launcher` — two-line launcher that picks fork or stock based on a flag file
- `~/.scripts/teams-fork` — toggle + deploy helper
- `~/.config/niri/config.kdl` — Mod+T routes through `teams-launcher`

## Daily workflow — pushing changes to the running app

```bash
# 1. Edit code in this repo
cd ~/repos/teams-for-linux
# ...edit files in app/...

# 2. Iterate locally without rebuilding NixOS (optional)
#    Builds and runs from app.asar with the cached Electron:
npm run pack
nix shell nixpkgs#electron_41 -c bash -c \
  'exec -a teams-for-linux electron dist/linux-unpacked/resources/app.asar'

# 3. Commit & deploy to the system
git add app/...
git commit -m "Adds <thing>"
teams-fork deploy
```

`teams-fork deploy` does in order:
1. Pushes `main` to `origin` (your fork repo on GitHub).
2. `nix flake lock --update-input teams-for-linux-fork` — bumps the lock file to your new commit.
3. `sudo nixos-rebuild switch --flake ~/.config/nixos#nixos` — rebuilds and activates.

The first time you run a NixOS rebuild after a `package-lock.json` change, the build will fail with a hash mismatch. Recompute it with:

```bash
nix-shell -p prefetch-npm-deps --run \
  "prefetch-npm-deps ~/repos/teams-for-linux/package-lock.json"
```

Paste the new hash into `npmDepsHash` in `~/.config/nixos/modules/teams-fork.nix`, commit, and re-run `teams-fork deploy`. Most commits don't change `package-lock.json`, so this is rare.

## Switching between fork and stock

```bash
teams-fork           # status: which is active + pinned commit + drift warning
teams-fork off       # next Super+T launches stock teams-for-linux-stock
teams-fork on        # back to fork
```

The toggle is a flag file (`~/.config/teams-launcher/use-stock`) read by the launcher. No rebuild needed — both binaries are already on PATH after `nixos-rebuild switch`. If the fork ever breaks, `teams-fork off` is your immediate escape hatch.

## Setting this up on a fresh NixOS machine

1. Clone this repo somewhere (`~/repos/teams-for-linux` matches the helper scripts).
2. Make sure your flake has the `teams-for-linux-fork` input and `modules/teams-fork.nix` is imported.
3. Copy `~/.scripts/teams-launcher` and `~/.scripts/teams-fork` (they're under the dotfiles repo).
4. `sudo nixos-rebuild switch --flake ~/.config/nixos#nixos`.
5. Bind your launcher key to `~/.scripts/teams-launcher`.

## Rebasing on upstream

```bash
git fetch upstream
git rebase upstream/main
git push --force-with-lease origin main   # only the fork remote
teams-fork deploy
```

Conflicts are only expected in this README's top section. The actual code change is one self-contained file (`app/browser/tools/vimNav.js`) plus three small wires (`preload.js` modules array, `config/index.js` default flag, `tools/README.md` doc entry).

## Troubleshooting

**Fork didn't end up on PATH after rebuild.** Most likely a `bin/teams-for-linux` collision in `buildEnv` between fork and stock. The overlay renames the stock binary to `teams-for-linux-stock` to avoid this — confirm `which teams-for-linux teams-for-linux-stock` returns both.

**Slow startup vs nixpkgs version.** The Nix-built fork uses an `app.asar` archive (same as upstream package), so startup parity should be near-identical. If it feels slower, you may have stale state — `teams-fork deploy` will rebuild.

**`npm run pack` for local iteration.** This is for the dev loop only. The system's `teams-for-linux` always comes from the Nix derivation, not from `dist/linux-unpacked/`.

---

_Below is the upstream README, unchanged from `IsmaelMartinez/teams-for-linux`._

# Teams for Linux

[![Matrix Space](https://img.shields.io/matrix/teams-for-linux-space%3Amatrix.org?server_fqdn=matrix.org&label=Matrix%20Space)](https://matrix.to/#/#teams-for-linux-space:matrix.org "Matrix Space")
![](https://img.shields.io/github/release/IsmaelMartinez/teams-for-linux.svg?style=flat)
![](https://img.shields.io/github/downloads/IsmaelMartinez/teams-for-linux/total.svg?style=flat)
![Build & Release](https://github.com/IsmaelMartinez/teams-for-linux/workflows/Build%20&%20Release/badge.svg)
![](https://img.shields.io/librariesio/github/IsmaelMartinez/teams-for-linux)
[![Known Vulnerabilities](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux/badge.svg?targetFile=package.json)](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=IsmaelMartinez_teams-for-linux&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=IsmaelMartinez_teams-for-linux)

**Unofficial Microsoft Teams client for Linux** — a native desktop app that wraps the Teams web version with enhanced Linux integration.

✅ **System notifications**  
✅ **System tray integration** (badge support varies by desktop environment)  
✅ **Custom backgrounds & themes**  
✅ **Screen sharing support**  
✅ **Multiple account profiles**  

> [!NOTE]
> This is an independent project, not affiliated with Microsoft. Some features are limited by the Teams web app.

## Sponsor

### Recall.ai — API for Meeting Recording and Transcription
> If you're looking for a meeting recording API, consider checking out [Recall.ai](https://www.recall.ai/product/microsoft-teams-recording-api?utm_source=github&utm_medium=sponsorship&utm_campaign=ismaelmartinez-teams-for-linux), an API that records and transcribes Zoom, Google Meet, Microsoft Teams, in-person meetings, and more.

_This sponsorship helps support the ongoing development of teams-for-linux._

## Installation

### Package Repositories

We have dedicated Debian/DEB and RHEL/Fedora/RPM repositories at https://teamsforlinux.de hosted with :heart: by [Nils Büchner](https://github.com/nbuechner). Please follow the installation instructions there.

### Distribution Packages

[![AUR: teams-for-linux](https://img.shields.io/badge/AUR-teams--for--linux-blue.svg)](https://aur.archlinux.org/packages/teams-for-linux)
[![Pacstall: teams-for-linux-deb](https://img.shields.io/badge/Pacstall-teams--for--linux--deb-00958C)](https://github.com/pacstall/pacstall-programs/tree/master/packages/teams-for-linux-deb)
[![Vylen Linux: teams-for-linux](https://img.shields.io/badge/Vylen_Linux-teams--for--linux-green)](https://vylen.gitlab.io/packages/#teams-for-linux)  
[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/teams-for-linux)
<a href='https://flathub.org/apps/details/com.github.IsmaelMartinez.teams_for_linux'><img width='170' alt='Download on Flathub' src='https://flathub.org/assets/badges/flathub-badge-en.png'/></a>

### Manual Download

Download from [GitHub Releases](https://github.com/IsmaelMartinez/teams-for-linux/releases) — available as AppImage, deb, rpm, snap, tar.gz (plus Windows/macOS builds).

> [!TIP]
> For AppImage files, use [`AppImageLauncher`](https://github.com/TheAssassin/AppImageLauncher) for better desktop integration.

## Quick Start

1. **Install** using your preferred method above
2. **Launch** with `teams-for-linux` 
3. **Configure** by creating `~/.config/teams-for-linux/config.json` if needed

## Documentation

📖 **[Complete Documentation](https://ismaelmartinez.github.io/teams-for-linux/)** — Enhanced documentation with search, mobile optimization, and comprehensive guides

| Topic | Description |
|-------|-------------|
| **[Installation Guide](https://ismaelmartinez.github.io/teams-for-linux/installation)** | Package repositories and installation methods |
| **[Configuration Guide](https://ismaelmartinez.github.io/teams-for-linux/configuration)** | Complete setup and configuration options |
| **[Troubleshooting](https://ismaelmartinez.github.io/teams-for-linux/troubleshooting)** | Common issues and solutions |
| **[Multiple Profiles](https://ismaelmartinez.github.io/teams-for-linux/multiple-instances)** | Running work & personal accounts |
| **[Custom Backgrounds](https://ismaelmartinez.github.io/teams-for-linux/custom-backgrounds)** | Video call backgrounds setup |
| **[Contributing](https://ismaelmartinez.github.io/teams-for-linux/contributing)** | Development setup and contribution guidelines |
| **[Privacy & Data Protection](https://ismaelmartinez.github.io/teams-for-linux/privacy)** | What personal data the app does and does not handle |

## Project Activity

![Alt](https://repobeats.axiom.co/api/embed/e63dcc8b154ee5f4490674818df091c243b041b7.svg "Repobeats analytics image")

## Support & Community

- 💬 **Chat**: Join our [Matrix Space](https://matrix.to/#/#teams-for-linux-space:matrix.org)
- 🐛 **Issues**: [Report bugs](https://github.com/IsmaelMartinez/teams-for-linux/issues)
- 🤝 **Contributing**: See [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Security & Sandboxing

Electron's contextIsolation and sandbox features are disabled to enable Teams DOM access functionality. For enhanced security, use system-level sandboxing:

**Available options**:
- **Flatpak**: Built-in isolation via Flathub
- **Snap packages**: Application confinement with auto-updates
- **Firejail**: Use this [script](https://codeberg.org/lars_uffmann/teams-for-linux-jailed) for manual sandboxing
- **AppArmor/SELinux**: Most Linux distributions include these by default

System-level sandboxing provides better isolation than Electron's built-in features while preserving full functionality.

## Advanced Usage

## History

Read about the history of this project in the [`HISTORY.md`](HISTORY.md) file.

## License

**GPL-3.0** — See [`LICENSE.md`](LICENSE.md)

Icons from [Icon Duck](https://iconduck.com/sets/hugeicons-essential-free-icons) (CC BY 4.0)

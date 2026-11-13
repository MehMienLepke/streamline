# Streamline

A local-first personal dashboard that lives in a single HTML file.
Links, action buttons, Dutch radio, to-dos, rich notes with reminders and a
batch image cropper — arranged on a snap-to-grid canvas across multiple pages.

**Nothing you create ever leaves your computer.** Your dashboards are stored in
a plain-text settings file (`*.streamline.json`) next to the HTML file, with a
backup copy in your browser. A Content Security Policy blocks every outgoing
request except reading this repository for updates and widgets.

> The interface is in Dutch. Full instructions: [LEESMIJ.md](LEESMIJ.md).

## Quick start

1. Download this repository (**Code → Download ZIP**) and unzip it.
2. Open `streamline.html` in Chrome or Edge.
3. Pick the same folder when asked — your settings file is created there.
4. Click the gear (top right) to add widgets, drag them around and lock them.

## Features

- Multiple pages, horizontal or vertical page menu (icons, labels or both)
- Snap-to-grid layout; every item can be moved, resized, copied and locked
- Light, dark and four more themes, or compose your own
- Several settings files per folder; copy widgets, boxes or whole pages between them
- Team workspace in a shared (e.g. OneDrive) folder: end-to-end encrypted with a team
  password (AES-256-GCM, PBKDF2), shared task list with assignees, Outlook mail
  drag-and-drop including body and attachments, per-member files so syncing never conflicts
- One-click updates from GitHub that never touch your own data
- Add your own widgets via `widgets/registry.json` (see `widgets/klok.js`)
- Optional browser extension (`helper-extensie/`) that lets action buttons type,
  click and fill in fields on the sites they open

## Development

Sources live in `src/`. Run `python build.py` to rebuild `streamline.html`
and `version.json`.

## License

MIT — see [LICENSE](LICENSE).

# TimeDock V2.0

TimeDock is a Manifest V3 Chrome extension that runs inside the Side Panel and provides a compact timezone command center for distributed work.

## What changed in V2.0

- Refreshed side-panel UI with a hero summary, dashboard/converter/settings tabs, and a stronger visual system
- Upgraded timezone cards with rollover labels, GMT offsets, and work-hour status chips
- Rebuilt the overlap section with a visual timeline strip and richer shared-window summaries
- Polished the converter with card-based outputs and copy-ready templates for quick sharing
- Kept the extension local-first with `chrome.storage.local` persistence and zero external API dependencies

## Load locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Click the extension icon to open TimeDock in the side panel

## Files

- `manifest.json` — MV3 config and permissions
- `background.js` — side panel action behavior
- `sidepanel.html` — V2.0 side-panel structure
- `styles.css` — visual system, layout, timeline, and compact mode styling
- `sidepanel.js` — timezone rendering, conversion, overlap, tabs, and settings persistence

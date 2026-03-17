# TimeDock (MVP)

TimeDock is a Manifest V3 Chrome Side Panel extension for quick cross-timezone scheduling.

## Features
- Persistent Side Panel opener from toolbar action.
- Saved timezone cards with current time, rollover label, and work-hours status.
- Quick converter from a source timezone to all saved timezones.
- One-click copy templates for short and detailed meeting formats.
- Overlap strip (home vs client timezone) using each zone's working hours.
- Local settings persistence in `chrome.storage.local`.
- Robust timezone add flow:
  - aliases (`PST`, `EST`, `UTC`, etc.)
  - case-insensitive IANA matching (`europe/london` -> `Europe/London`)
  - Enter key support and duplicate/error feedback.

## Load locally
1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Click the extension icon to open TimeDock in the side panel.

## Files
- `manifest.json` — MV3 config + permissions.
- `background.js` — panel open-on-action behavior.
- `sidepanel.html` — app layout.
- `styles.css` — visual styling and compact mode.
- `sidepanel.js` — state, storage, conversion, overlap, timezone management.

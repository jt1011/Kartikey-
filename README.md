# TimeDock (MVP)

TimeDock is a Manifest V3 Chrome extension that runs inside the Side Panel and provides:

- Saved timezone cards
- Quick time conversion from one source timezone to all saved zones
- Basic overlap strip between home and client schedules
- Alias helper support (`PST`, `EST`, `UTC`, etc.)
- Local-first settings persisted in `chrome.storage.local`

## Load locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Click the extension icon to open TimeDock in the side panel

## Files

- `manifest.json` — MV3 config and permissions
- `background.js` — side panel action behavior
- `sidepanel.html` — UI structure
- `styles.css` — panel styling and compact mode
- `sidepanel.js` — timezone rendering, conversion, overlap, settings persistence

# Performity — Agency Overview Tool

A client-side SaaS dashboard for Catalys. Upload your **Agency Overview** Excel
workbook and it builds a live portfolio dashboard — brands, channel breakdowns,
weekly scrum, alerts, and team rollups. Everything runs in the browser; **no
server and no data leaves the machine.**

## Run locally

The app loads its `.jsx` view files at runtime (via Babel), so it must be served
over HTTP — opening `Performity.html` directly with `file://` will not work.

```bash
cd performity
python3 -m http.server 8000
# then open http://localhost:8000/Performity.html
```

Or use any static server (`npx serve`, VS Code Live Server, etc.).

## Use it

1. Open the app → you get the **Upload** screen.
2. Drop in `Catalys_Agency_Overview_2026.xlsx` (or click to browse).
3. The dashboard renders. Parsed data is cached in `localStorage`, so it
   survives a refresh.
4. **New upload** (top-right) clears the cache and lets you load a different file.
5. `?demo=1` in the URL auto-loads the bundled sample dataset — handy for a quick
   look or a shareable demo link.

## Expected Excel format

The parser reads the standard Agency Overview workbook:

| Sheet | Drives |
|-------|--------|
| `1. Summary` | Brand summary table + the "Month on Month — by brand" section |
| One sheet per brand (weekly scrum) | Channel breakdown + weekly scrum grid |
| `Brand & TL Index` | Team-lead assignments |
| `Playbook & Insights` | Playbook entries (optional) |

Sheets named `2. QoQ`, `Week Calendar`, `All DRR`, `Helper` are ignored — every
other tab is treated as a brand sheet. Brand names are matched across sheets
fuzzily (e.g. `New Age Diamond` ↔ `New Age Diamond India`).

## How it works

- `parser.js` — `PerformityParser.parse(workbook)` turns a SheetJS workbook into
  `window.AGENCY`, `window.WEEKLY`, `window.WEEKLY_META`. Pure browser JS, no
  build step. Validated against the hand-derived golden dataset (`data.js` /
  `weekly-data.js`).
- `model.jsx` — `window.buildModel()` derives brands, alerts, and team rollups.
- `Performity.html` — upload screen, localStorage persistence, and the dashboard
  shell. `data.js` / `weekly-data.js` remain only as the optional sample dataset.

## Hosting

Because it's fully static, push to git and deploy free on GitHub Pages, Netlify,
or Vercel — no backend required.

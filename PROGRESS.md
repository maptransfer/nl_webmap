# Progress Log

## How to resume

Read this file and `CLAUDE.md` in full before doing anything else — they
are the source of truth, not this conversation's history. Once read, the
next prompt should be as short as: *"Read CLAUDE.md and PROGRESS.md, then
let's do \<next thing\>."*

## Status

**v1 built and verified, pushed to GitHub.**
Repo: https://github.com/maptransfer/nl_webmap (public — transferred from
personal account `TheGeoTheo` to the `maptransfer` org; public and served
live via GitHub Pages)
Commits: `d059dca` (initial data), `3bdff42` (frontend build) — both predate
the atomic-commit convention below; every commit from here forward follows
it.

## Build & test commands

- **Serve locally:** `serve.bat` (Windows, uses the OSGeo4W-bundled Python)
  or `python serve_range.py 8000` from any Python 3. Then open
  `http://localhost:8000/`.
- **Why not `python -m http.server`:** it ignores the `Range` header;
  PMTiles needs real range-request support or the vector data never loads.
  Full reasoning in `README.md`.
- **Range pre-flight check** (run before trusting anything else):
  ```
  curl -sD - -o /dev/null -H "Range: bytes=0-15" http://localhost:8000/data/neue-luebecker.pmtiles
  ```
  Must return `206 Partial Content` with `Content-Range: bytes 0-15/1823852`.
- **No automated test suite exists.** Verification so far is manual +
  headless-browser (see "Completed" below). Neither Node/Playwright nor
  `chromium-cli` are installed on this machine; the one-off verification
  script used the Chrome DevTools Protocol directly via Python +
  `websocket-client` (`pip install websocket-client` into the OSGeo4W
  Python), launching `chrome.exe --headless=new --remote-debugging-port=...
  --remote-allow-origins=*` and driving it over the CDP WebSocket. That
  script lived in the session scratchpad, not the repo — if a real test
  suite is wanted later, this is the pattern to build from.
  **Gotcha hit:** CDP's `Runtime.evaluate` persists top-level `const`/`let`
  declarations across separate calls in the same execution context —
  reusing a variable name in a later eval throws `SyntaxError: already
  declared`, silently no-opping that eval. Wrap each eval in an IIFE
  (`(() => { ... })()`) to avoid it.

## Architecture decisions

- **`js/layers.js` is the single source of truth** for the map style,
  legend, and popup grouping — not a static `style.json`. Two of the fills
  need runtime-generated `fill-pattern` images (QGIS's `f_diagonal` hatch
  and `dense5` stipple have no MapLibre built-in), so JS was in the loop
  regardless; one config avoids the legend/style/popup drifting apart.
- **MapLibre GL JS pinned at 5.24.0** — the newest release whose `dist/`
  still ships a UMD bundle (`maplibre-gl.js`) for a plain `<script src>`
  setup. 6.x is ESM-chunk-only.
- **Everything vendored** (`vendor/`) — MapLibre, pmtiles, Open Sans glyph
  PBFs. No CDN, no npm (Node isn't installed on this machine anyway); works
  fully offline and stays host-agnostic.
- **`we_ansicht` dropped from v1.** It's `nullSymbol` in QGIS — labels were
  its only output, and every field in them is already in the `we` popup for
  the same 119 entities. Config preserved, commented, in `js/layers.js`.
- **Default view: Ahrensburg.** The data spans two disjoint towns ~40 km
  apart; Ahrensburg holds 88% of it (105/119 Wirtschaftseinheiten). A view
  fitted to the combined bbox lands on empty countryside.
- **Bookmarks precomputed to WGS84**, not parsed client-side.
  `tools/bookmarks_to_js.py` converts the QGIS bookmark export (EPSG:25832)
  into `js/bookmarks.js` ahead of time — avoids vendoring a
  reprojection library for a conversion that only needs doing once.

## Completed

- Repo init + `.gitignore` — excludes `scripts/` (holds a plaintext DB
  password in `export_pgis_layers.bat`) and `data/*.fgb` (regenerable).
  Verified: `git status` showed neither staged before the first commit.
- Vendored MapLibre 5.24.0, pmtiles 4.5.0, Open Sans glyph PBFs via
  `tools/fetch_vendor.ps1`. Verified: byte counts matched expectations
  exactly (e.g. `maplibre-gl.js` = 1,056,837 bytes), fontstack directories
  confirmed present in the extracted release zip before copying.
- Range-capable dev server (`serve_range.py` + `serve.bat`) — discovered
  and fixed the plain-`http.server` blocker before writing any map code.
  Verified: pre-flight `curl` check returned `206` with a correct
  `Content-Range`, and a deliberate past-EOF probe returned `416` as
  `pmtiles.js` expects.
- Style/legend/popup config (`js/layers.js`, `js/legend.js`, `js/patterns.js`)
  translating all 7 QMLs (6 rendered, `we_ansicht` dropped) — hatch/stipple
  via canvas-generated `fill-pattern` images, meter-based widths/sizes via
  `["exponential", 2]` zoom ramps (exact reproduction of QGIS's
  `RenderMetersInMapUnits`, derived from the data's latitude).
  Verified: screenshots via the CDP driver showed the pink hatched `we`
  fill, purple stippled `gebaeude_ansicht`, translucent yellow
  `flurstuecke`, and grey Grundbuch outlines all rendering together
  correctly at a zoomed-in sub-area.
- `we` popup (grouped: stats grid, collapsible sections, pipe-list
  splitting, Flurstückskennzeichen decoding) + 3 simpler popups + a
  multi-hit picker for overlapping layers (`js/popups.js`, `js/fields.js`).
  Verified via CDP: clicked a real WiE polygon, confirmed all fields
  populate correctly against known data (`we_id=244`, Schäferweg 25/27,
  Baujahr 1964); confirmed the multi-hit "Weitere Objekte hier" switch
  correctly re-renders to the Flurstück popup.
- Hover highlight via `feature-state` + `promoteId` on a real business key
  per layer (not the per-tile-synthesized `mvt_id`, which would only
  highlight one fragment of a polygon clipped across a tile boundary).
  Verified: cyan outline followed the cursor and covered the whole polygon.
- Bookmark navigation (13 QGIS bookmarks → `js/bookmarks.js`, sidebar
  picker grouped by town). Verified: clicking a sub-area bookmark flew to
  the correct extent; clicking "Ratzeburg" landed at the right coordinates.
- **Verification pass found and fixed 3 real bugs** before anything was
  documented as finished:
  1. `js/popups.js` — a stale variable reference (`liegenschaftRowsFinal`
     instead of the renamed `liegenschaftRows`) crashed the `we` popup on
     every click. Caught via a CDP exception trace.
  2. `js/app.js` — MapLibre's popup accessibility focus handling was
     auto-scrolling the popup's `.popup` div ~54px on open, hiding the
     header band. Fixed by forcing `scrollTop = 0` in a
     `requestAnimationFrame` callback after render. Caught by comparing a
     screenshot against a direct DOM query (`getBoundingClientRect`) that
     didn't match.
  3. `css/app.css` — `.toast { display: flex }` had equal CSS specificity
     to the browser's default `[hidden] { display: none }`; as an author
     rule it won the cascade tie, so the intro toast's `hidden` attribute
     never actually hid it. Fixed with an explicit `.toast[hidden] {
     display: none }` override. Caught by tracing `toast.hidden` through
     the interaction sequence and finding it correctly `true` while the
     element stayed visible on screen.
- `CLAUDE.md` corrections: the `flurstuecke` QML is a plain single-symbol
  fill, not categorized on `we_id_primaer` as originally assumed; the bbox
  spans two disjoint towns, not one contiguous "Lübeck area"; `npx serve`
  removed as a suggestion (Node isn't installed, and it wouldn't have
  worked as documented without the Range-server fix anyway).
- `README.md` — run instructions, layer list, vendoring, re-tiling pointer,
  production basemap note.

## Known issues / blockers

- **DB password in `scripts/export_pgis_layers.bat` needs rotating.** The
  file is gitignored (never committed), but it's sat in plaintext on disk —
  treat it as exposed. Not something I can do; needs the user to rotate it
  on the DB side.
- **OSM raster basemap is dev-only.** `tile.openstreetmap.org` is under a
  usage policy that doesn't cover production traffic — swap the `tiles:`
  URL in `js/app.js` (one line) before any real deployment.
- **No automated regression test suite.** Verification has been manual +
  one-off CDP scripting per session; nothing runs in CI. Worth building out
  if this project grows past occasional AI-assisted sessions.

## Next steps

None requested yet. v1 is feature-complete against the original brief in
`CLAUDE.md` (all in-scope layers styled, legend, toggles, popups, hover) —
awaiting review or a specific next ask.

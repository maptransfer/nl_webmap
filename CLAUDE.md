# Neue Lübecker – PostGIS Web Map

## Goal
Interactive web map for client **Neue Lübecker**, built from a finished, static
`data/neue-luebecker.pmtiles` file (7 layers, already exported and packed —
see pipeline below) plus QML styling files. Fully static frontend, hostable
anywhere later (local dev now, Cloudflare/S3/Pages/etc. eventually), zero
runtime dependency on the database.

## Workflow

Ground rules for how this project gets built, session to session:

- **Verify before documenting.** A feature isn't "done" in `PROGRESS.md` or
  a commit message until it's been run, not just written. For this project
  that means serving via `serve.bat` and exercising it in a real browser,
  or driving it headlessly (this session used the Chrome DevTools Protocol
  directly via Python + `websocket-client`, since neither Node/Playwright
  nor `chromium-cli` are available on this machine — see `PROGRESS.md` for
  the pattern). A clean console and the expected DOM/network state are the
  bar, not "the code looks right." This caught 3 real bugs in v1 that a
  read-through would have missed.
- **`PROGRESS.md` is the source of truth across sessions.** Update it at
  the end of every iteration: what changed, why, what's still open. If it
  disagrees with conversation memory, the file wins — re-read it rather
  than trusting recall, especially at the start of a new session.
- **One small piece at a time.** Plan → implement → verify → update
  `PROGRESS.md` → `git commit`. Don't batch unrelated changes into one
  commit; each commit should be revertible on its own.
- **Write `PROGRESS.md` for a cold read.** No "as discussed above" — every
  entry should stand on its own to a session that has never seen the
  conversation that produced it. The intended way to resume work in a new
  thread is literally: *"Read CLAUDE.md and PROGRESS.md, then let's do
  \<next thing\>."*
- **Fresh thread after each committed iteration.** Once a piece is
  committed and `PROGRESS.md` reflects it, prefer starting a new
  conversation over continuing a long one for the next piece.

## Project folder structure
```
nl_webmap/
├── CLAUDE.md
├── data/
│   └── neue-luebecker.pmtiles      (all 7 layers)
├── qml/
│   ├── mv_we.qml
│   ├── v_adressen.qml
│   ├── v_grundbuch_ansicht.qml
│   ├── v_we_ansicht.qml
│   ├── v_gebaeude_ansicht.qml
│   ├── v_flst_grundbuchblaetter.qml
│   └── v_flurstuecke.qml
└── scripts/                         (export pipeline, not part of frontend build)
```

## Stack
- **Data**: `data/neue-luebecker.pmtiles` — single PMTiles file, 7 named vector layers
- **Styling source**: `qml/*.qml` — one QGIS style file per layer. **Important:**
  QML filenames carry the original source view names (with `v_`/`mv_` prefixes),
  which do NOT match the clean layer names inside the PMTiles file (those had
  the `demo.` schema prefix stripped and were renamed via `-nln` during export
  — see mapping table below). Match them up by the table, not by filename
  similarity alone.
- **Tiling format**: PMTiles (single static file, HTTP range requests, no tile server)
- **Frontend**: Plain HTML/JS/CSS — no build step, no framework. Keep it simple and portable.
- **Map library**: MapLibre GL JS + `pmtiles` protocol plugin
- **Basemap**: OSM standard raster/vector basemap
- **CRS**: tiles are EPSG:3857 (Web Mercator, standard for all web tiles) — this
  is automatic/required by the format, not something to configure in the frontend.

## First steps: analyze before building anything
Before writing any frontend code:
1. **Inspect `data/neue-luebecker.pmtiles`** (e.g. via `ogrinfo -al -so`, or the
   GDAL PMTiles driver) to confirm, per layer: actual attribute fields/types,
   geometry type as stored, realistic zoom range/feature density. The field
   lists below are from the source export and should still be accurate, but
   confirm rather than assume — e.g. `aktualitaet` was silently converted from
   DateTime to string during tiling.
2. **Read each corresponding QML file in `qml/`** and translate its renderer
   (categorized/graduated/rule-based/single-symbol) into the equivalent
   MapLibre GL style JSON — match colors, class breaks, and field references
   as closely as possible. Cross-check that the field the QML renderer
   classifies on (e.g. `we_id_primaer` for `flurstuecke`) actually exists in
   the tiled attributes confirmed in step 1.

## Layers in the PMTiles file
All 7 layers share the same overall bbox (roughly 10.208,53.654 –
10.788,53.701) — but that bbox is **not one contiguous area**. It spans two
disjoint towns, **Ahrensburg** (~10.21°E, 105 of 119 Wirtschaftseinheiten)
and **Ratzeburg** (~10.79°E, 14), about 40 km apart with nothing mapped in
between. A view fitted to the combined bbox lands on empty countryside at a
zoom where nothing is legible — the frontend defaults to Ahrensburg and
offers both towns (plus 11 QGIS-bookmarked sub-areas, see
`bookmarks/ahrensburg_ratzeburg.xml`) as navigation targets instead of
fitting the full extent. Feature counts below are **source feature counts**
(from the `.fgb` exports pre-tiling) — the PMTiles file itself will report
higher counts when inspected because polygons are clipped per-tile; that's
expected, not duplicated data.

| Layer (in .pmtiles) | QML file (in qml/) | Source view | Features | Geometry | Notes |
|---|---|---|---|---|---|
| `we` | `mv_we.qml` | `demo.mv_we` (materialized view) | 119 | polygon-ish | Wohneinheiten. May go stale if `mv_we` isn't refreshed — ask client about refresh cadence (pg_cron?) if data looks outdated later. |
| `adressen` | `v_adressen.qml` | `demo.v_adressen`, filtered `match_typ IS NOT NULL` | 272 (16 NULL-geometry rows skipped on export) | Multi Point | Address points. |
| `grundbuch_ansicht` | `v_grundbuch_ansicht.qml` | `demo.v_grundbuch_ansicht`, no filter | 64 | polygon | |
| `we_ansicht` | `v_we_ansicht.qml` | `demo.v_we_ansicht` | 119 | polygon | Same count as `we` — alternate view of same entities. |
| `gebaeude_ansicht` | `v_gebaeude_ansicht.qml` | `demo.v_gebaeude_ansicht`, filtered on `alkis_oid NOT IN (...)` (excludes buildings already matched via SAP address) | 174 | Multi Polygon | Has `alkis_oid`, `aktualitaet` (date, stored as string in tiles), `funktion`, `nutzungsbezeichnung`. |
| `flst_grundbuchblaetter` | `v_flst_grundbuchblaetter.qml` | `demo.v_flst_grundbuchblaetter` | 64 | polygon | Same count as `grundbuch_ansicht` — alternate view of same entities. |
| `flurstuecke` | `v_flurstuecke.qml` | `demo.v_flurstuecke`, filtered `grundbuch_info != ' / '` | 118 | Multi Polygon | Has `we_id_primaer` (NULL on ~half the rows). **Correction:** the QML renderer is a plain `singleSymbol` — a single yellow fill at 50% opacity, uncategorized. No QML in this project uses a categorized/graduated/rule-based renderer (all 7 are `singleSymbol` or `nullSymbol`) — verified directly against the QML files, not assumed. |

## Features (v1)
- Render all layers styled to match QGIS symbology (from `qml/`)
- **Legend** reflecting each layer's classification/colors
- **Layer toggle** (show/hide per layer)
- **Click popups** showing attribute info (not hover — avoids flicker on
  polygons, works on touch/mobile, standard pattern for multi-layer maps)
- Optional later: hover *highlight* (outline only, no popup) as a cheap enhancement

## Explicitly out of scope for this project
- The PostGIS→PMTiles export pipeline (already done, see below — not part of
  this build unless the data needs re-exporting)
- Any live database connection from the frontend
- Deployment/hosting decisions — build assuming local static serving; must
  remain host-agnostic (portable to Cloudflare, S3, GitHub Pages, etc.
  without code changes)

## Frontend implementation notes (v1, built)
- **Plain `python -m http.server` does not work for local serving.** PMTiles
  needs HTTP range requests; Python's built-in server ignores `Range` and
  answers with the full file, which the pmtiles client treats as a fatal
  error. Use `serve.bat` / `serve_range.py` (a small stdlib server with real
  Range support) instead — see `README.md`.
- `we_ansicht` (`v_we_ansicht.qml`) is **not rendered**. It's `nullSymbol` in
  QGIS, so its multi-line pink-boxed labels were its only output, and every
  field in them is already in the `we` popup for the same 119 entities.
  Config preserved, commented, in `js/layers.js`.
- MapLibre GL JS is pinned at **5.24.0**, the newest release whose `dist/`
  still ships a UMD bundle (`maplibre-gl.js`) for plain `<script src>` use —
  later majors are ESM-chunk-only.
- Styling lives in `js/layers.js` as a declarative config, not a static
  `style.json` — it drives the map style, legend, and popup grouping from
  one source, since two of the fills need runtime-generated `fill-pattern`
  images (QGIS's `f_diagonal` hatch and `dense5` stipple have no MapLibre
  built-in equivalent) that a static JSON file can't produce anyway.

## Data pipeline (context only, already executed — not part of this build)
DB is directly reachable (no SSH tunnel needed for this client). Pipeline used:

1. **Export each view/matview to FlatGeobuf, reprojected to EPSG:4326:**
   ```
   ogr2ogr -f FlatGeobuf <name>.fgb -t_srs EPSG:4326 [-where "..."] [-skipfailures] "PG:host=... port=... dbname=... user=... password=..." demo.<view_name>
   ```
2. **Combine all 7 `.fgb` files into one PMTiles via a VRT** (GDAL's native
   PMTiles writer, added in GDAL 3.8 — no tippecanoe/Docker needed).
   `combine.vrt` maps each `.fgb` to a clean target layer name (`we`,
   `adressen`, etc.), stripping the `demo.` schema prefix. Single export:
   ```
   ogr2ogr -f PMTiles neue-luebecker.pmtiles -t_srs EPSG:3857 -dsco MINZOOM=10 -dsco MAXZOOM=20 combine.vrt
   ```
   (Note: `ogr2ogr -f PMTiles -update -append` does **not** work for adding
   layers across separate invocations — only the VRT single-call approach
   successfully produced all 7 layers.)
3. Verified via `ogrinfo -al -so neue-luebecker.pmtiles`.

Re-run this pipeline (steps 1–2) if source data changes; the frontend just
needs the resulting `.pmtiles` file swapped in.

## Future possibility (not this build)
Could later move from static PMTiles to a live PostGIS-backed tile server
(pg_tileserv or Martin) if data starts changing frequently enough that
re-export lag matters. Frontend migration would be small — same MapLibre
setup, just repoint the vector source URL from the local file to a tile
server endpoint.

# Neue Lübecker – PostGIS Web Map

## Goal
Interactive web map for client **Neue Lübecker**, built from a finished, static
`data/neue-luebecker.pmtiles` file (7 layers, already exported and packed —
see pipeline below) plus QML styling files. Fully static frontend, hostable
anywhere later (local dev now, Cloudflare/S3/Pages/etc. eventually), zero
runtime dependency on the database.

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
All 7 layers share the same overall extent (Lübeck area, bbox roughly
10.208,53.654 – 10.788,53.701). Feature counts below are **source feature
counts** (from the `.fgb` exports pre-tiling) — the PMTiles file itself will
report higher counts when inspected because polygons are clipped per-tile;
that's expected, not duplicated data.

| Layer (in .pmtiles) | QML file (in qml/) | Source view | Features | Geometry | Notes |
|---|---|---|---|---|---|
| `we` | `mv_we.qml` | `demo.mv_we` (materialized view) | 119 | polygon-ish | Wohneinheiten. May go stale if `mv_we` isn't refreshed — ask client about refresh cadence (pg_cron?) if data looks outdated later. |
| `adressen` | `v_adressen.qml` | `demo.v_adressen`, filtered `match_typ IS NOT NULL` | 272 (16 NULL-geometry rows skipped on export) | Multi Point | Address points. |
| `grundbuch_ansicht` | `v_grundbuch_ansicht.qml` | `demo.v_grundbuch_ansicht`, no filter | 64 | polygon | |
| `we_ansicht` | `v_we_ansicht.qml` | `demo.v_we_ansicht` | 119 | polygon | Same count as `we` — alternate view of same entities. |
| `gebaeude_ansicht` | `v_gebaeude_ansicht.qml` | `demo.v_gebaeude_ansicht`, filtered on `alkis_oid NOT IN (...)` (excludes buildings already matched via SAP address) | 174 | Multi Polygon | Has `alkis_oid`, `aktualitaet` (date, stored as string in tiles), `funktion`, `nutzungsbezeichnung`. |
| `flst_grundbuchblaetter` | `v_flst_grundbuchblaetter.qml` | `demo.v_flst_grundbuchblaetter` | 64 | polygon | Same count as `grundbuch_ansicht` — alternate view of same entities. |
| `flurstuecke` | `v_flurstuecke.qml` | `demo.v_flurstuecke`, filtered `grundbuch_info != ' / '` | 118 | Multi Polygon | Has `we_id_primaer` — QGIS styling was categorized on this field. |

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
- Deployment/hosting decisions — build assuming local static serving
  (e.g. `npx serve` or `python -m http.server`); must remain host-agnostic
  (portable to Cloudflare, S3, GitHub Pages, etc. without code changes)

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

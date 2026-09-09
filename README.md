# Neue Lübecker – Liegenschaftsübersicht

Static web map over `data/neue-luebecker.pmtiles` (7 vector layers exported
from PostGIS, 6 of them rendered — see below). Plain HTML/JS/CSS, no build
step, no framework. Runs from any static host.

## Running it locally

**A plain `python -m http.server` will not work.** PMTiles uses HTTP range
requests, and Python's built-in server ignores the `Range` header — it
answers every request with the full 1.74 MB file, which the pmtiles client
treats as a fatal error. Use the included Range-capable server instead:

```
serve.bat
```

(Windows, uses the OSGeo4W-bundled Python at `C:\OSGeo4W\apps\Python312`.)
Any Python 3 works the same way from elsewhere:

```
python serve_range.py 8000
```

Then open **http://localhost:8000/**. Opening `index.html` directly via
`file://` also cannot work, for the same range-request reason.

## Layers rendered (6 of 7)

**`we` is the only queryable layer.** Clicking it opens the grouped
Bestandspopup; hovering it outlines the polygon and turns the cursor into a
pointer. The other five are display layers — they render and can be toggled,
but they answer no click and give no hover feedback, so a click that lands on
a building or a parcel still reports the Wirtschaftseinheit it belongs to.
The sidebar splits them into "Abfrageebene" and "Darstellungsebenen" to say
so up front.

| Layer | Style | Queryable |
|---|---|---|
| `we` (Wirtschaftseinheiten) | pink fill + diagonal hatch, dark outline | **yes** — the grouped popup |
| `gebaeude_ansicht` | mauve fill + stipple, dark outline | no — display only |
| `flurstuecke` | translucent yellow fill, grey outline | no — display only |
| `grundbuch_ansicht` | outline only (no fill), thick grey line | no — display only |
| `flst_grundbuchblaetter` | label only (`Blatt: …`), from zoom 16 | no — display only |
| `adressen` | label only (house numbers, bold red) | no — display only |

One flag controls this: `queryable: true` on the `we` entry in
`js/layers.js`. It feeds `hitLayerIds()`, which both the click and the hover
handler in `js/app.js` query against, so popup, highlight and cursor stay in
step. The popup bodies for Gebäude, Flurstück and Grundbuch are still in
`js/popups.js` (unreachable while only `we` is queryable) — making one of
those layers queryable again is that flag plus, for the thin-line Grundbuch
layer, uncommenting its wide `hit` part.

`we_ansicht` (a 7th layer in the source tileset) is **deliberately not
rendered**: it is `nullSymbol` in QGIS, so its labels were its only output —
a multi-line block in a pink box QGIS-style, which has no MapLibre
equivalent. Every field it would show is already in the `we` popup above,
for the same 119 entities. Its config stays in `js/layers.js`, commented
out, with the verified colours and scale-limit arithmetic preserved, in
case it needs restoring later.

Every colour, width and zoom limit in `js/layers.js` was translated from the
QML files in `qml/` — see the comment on each layer entry for its source
file. `qml/` stays in the repo as that provenance; if the client's QGIS
styling changes, `js/layers.js` is the one place to update it.

## Two towns, one map

The data covers **Ahrensburg** (105 of 119 Wirtschaftseinheiten, 88%) and
**Ratzeburg** (14), about 40 km apart with nothing in between — the map
opens on Ahrensburg for that reason. The sidebar's "Standorte" section is
generated from `bookmarks/ahrensburg_ratzeburg.xml`, a QGIS spatial-bookmark
export with 13 bookmarks (2 towns + 11 sub-areas), converted to WGS84 by:

```
python tools/bookmarks_to_js.py bookmarks/ahrensburg_ratzeburg.xml js/bookmarks.js
```

`js/bookmarks.js` is **generated** — don't hand-edit it. Re-run the command
above after re-exporting bookmarks from QGIS. The per-town WE counts
(`WE_COUNTS` in `tools/bookmarks_to_js.py`) are hardcoded from the source
data and need updating by hand if the data changes materially.

## Search

The search bar (top centre of the map) finds a Wirtschaftseinheit by its
WiE-Nr., its Bezeichnung, or its old Aktenzeichen (Alt-Az), tagging each
result with which field matched, and jumps to it: fits the WiE's own bounds
(capped at z17), pulses its outline, activates the containing Untergebiet
in the sidebar, and opens its popup. Like `js/bookmarks.js`, it runs off a
**generated** index — the frontend has no way to read the source `.fgb`
files, and the tiles only expose features in loaded tiles, so a global
search needs this precomputed:

```
python tools/we_index.py data/we.fgb js/we_index.js
```

`js/we_index.js` is generated — don't hand-edit it. Re-run the command
above after re-exporting `we.fgb`; the generator hard-fails on a feature
count other than 119, a duplicate WiE-Nr., a NULL geometry or an empty
Bezeichnung, so a data problem is a loud error here rather than a silently
stale index.

## Vendored libraries

Everything the page needs is in `vendor/` — no CDN, no npm, works fully
offline. Fetched with:

```
powershell -File tools\fetch_vendor.ps1
```

Pinned versions: **maplibre-gl 5.24.0** (the newest release that still ships
a UMD bundle — later majors dropped `dist/maplibre-gl.js` for ESM-only
chunks, which a plain `<script src>` setup can't use), **pmtiles 4.5.0**,
and glyph PBFs for **Open Sans Regular + Bold** from the `openmaptiles/fonts`
v2.0 release (needed because label rendering requires glyphs, and an OSM
*raster* basemap supplies none).

## Re-tiling the source data

Out of scope for this frontend, but if the PostGIS data changes:
`scripts/` holds the export pipeline (`export_pgis_layers.bat`,
`pmtiles_creator.bat`) — **gitignored**, since `export_pgis_layers.bat`
contains a database password. Run it locally, then drop the resulting
`data/neue-luebecker.pmtiles` in place; nothing else needs to change.

## Deploying

**Live at <https://maptransfer.github.io/nl_webmap/>** — GitHub Pages, built
from `master` at the repo root, so a deploy is just:

```
git push origin master
```

There is no build step and no CI gate between a push and the public site, so
check locally with `serve.bat` first. **See `DEPLOYMENT.md`** for the full
picture: what is and isn't published, why relative paths matter on a project
subpath, cache behaviour, how to publish refreshed data, the three `curl`
commands that verify a deploy, and the accepted deviations (public dataset,
OSM basemap).

# Progress Log

## How to resume

Read this file and `CLAUDE.md` in full before doing anything else — they
are the source of truth, not this conversation's history. Once read, the
next prompt should be as short as: *"Read CLAUDE.md and PROGRESS.md, then
let's do \<next thing\>."*

## Status

**v1 built and verified, deployed. Full ServiceCenter/Standort/Untergebiet
nav tree added 2026-09-07, sidebar/basemap polish pass and a committed
verification harness (`tools/verify.py`) added 2026-09-08** (see the dated
entries under "Completed").
Repo: https://github.com/maptransfer/nl_webmap (public — transferred from
personal account `TheGeoTheo` to the `maptransfer` org)
**Live: https://maptransfer.github.io/nl_webmap/** — GitHub Pages, built
from `master` at the repo root, no Actions workflow, so `git push` *is* the
deploy. Operational detail in `DEPLOYMENT.md`.
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
- **Automated verification: `tools/verify.py`** (Windows launcher:
  `tools/verify.bat`). A committed, reusable Chrome-DevTools-Protocol driver —
  the pattern every prior session hand-wrote as a scratchpad throwaway (see
  the git history before 2026-09-08 for what that looked like) is now a small
  registry of independent, named checks:
  ```
  tools\verify.bat                    # all checks vs http://localhost:8000/
  tools\verify.bat --list             # names + one-line descriptions
  tools\verify.bat wie_popup_opens    # run a subset, by name
  tools\verify.bat --url https://maptransfer.github.io/nl_webmap/
  ```
  Requires `websocket-client` in the interpreter that runs it (already present
  in the OSGeo4W Python — `pip install websocket-client` on any other Python 3
  that lacks it) and Chrome installed locally. Auto-starts `serve_range.py` on
  a free-looking `localhost` port and tears it down afterward if nothing was
  already listening; leaves an already-running server alone. Exit code `0`
  all passed, `1` a check failed (gates a commit), `2` the harness itself
  couldn't run (no Chrome, WebGL unavailable, unknown check name, ...).
  **Scope, deliberately:** four checks — `map_loads`, `console_clean`,
  `layer_checkboxes_toggle`, `wie_popup_opens` — chosen because they're the
  *stable* half of the manual regression sweep the last two sessions each ran
  by hand (see those dated entries below: "the 6 legend checkboxes still flip
  their style layers' visibility", "the `we` popup still opens on click...").
  A `sidebar_tree_structure` check was designed and deliberately **not**
  added: the sidebar was the highest-churn part of the UI in both of those
  sessions, so a check mirroring its exact shape would have needed editing in
  the same session that changed the feature — duplicated work, not a
  regression guard. Other candidates considered and dropped for the same
  "no bug has occurred yet" reason: `config_invariants`, `dom_ids_unique`,
  `glyphs_load`, `no_cdn_requests`, `import_completeness`, `default_view`,
  `area_navigation`, `queryable_scope`. Add one of these — or a new one — the
  next time a bug in that area actually happens; the registry is one
  `@check(...)`-decorated function away from an addition that touches nothing
  else. **These four are a regression floor, not full coverage** — a new
  feature still needs its own verification, and a green *live* run verifies
  the last pushed commit, not necessarily the working tree.
  Expectations are derived at runtime by dynamically importing the app's own
  `js/layers.js` / `js/bookmarks.js` / `js/fields.js` inside the browser
  (confirmed viable on both `localhost` and the live Pages origin — neither
  sends a CSP header, both serve `.js` with a JS MIME type), so adding or
  removing a layer moves the expectations with it; nothing about layer count,
  checkbox ids, or field names is hardcoded in the Python.
  **Verified this session:** ran clean 4/4 against a manually-started
  `serve.bat`, again via its own server auto-start/teardown, and again
  against `https://maptransfer.github.io/nl_webmap/`. Proved it can actually
  fail (not just always print PASS): a scratch `raster-opacity` edit was
  caught by `map_loads` with a readable diff message, and renaming the `cb-`
  checkbox-id prefix was caught by `layer_checkboxes_toggle` *and* by the
  implicit console-error assertion every check gets for free (the id-mismatch
  crashed `renderLegend` with a real `TypeError`) — both scratch edits
  reverted before committing.
  **Gotchas retired inside the tool** (comments at the point they're handled,
  so a future check doesn't rediscover them): CDP's `Runtime.evaluate`
  persists top-level `const`/`let` across calls in one execution context —
  `Page.js()` always wraps in an async IIFE, making the
  `SyntaxError: already declared` failure structurally impossible rather than
  a rule to remember. `map.queryRenderedFeatures(point, {layers})` needs
  `point` as an `[x, y]` **array** — a plain `{x, y}` object is silently read
  as the *options* argument, making every layer look hit everywhere; every
  call in the tool uses an array. The first-load `#hint-toast` overlays the
  lower map and swallows synthetic clicks — `Page.goto()` dismisses it once
  the page is ready, before any check runs. `/favicon.ico` 404s on every load
  (the project ships none) and is filtered out rather than asserted absent,
  since some headless configurations skip the fetch entirely.
  **Gotchas found writing the tool (2026-09-08, this machine):** Chrome ≥137
  refuses the software WebGL fallback in headless mode without
  `--enable-unsafe-swiftshader` — without it MapLibre's context creation
  fails, `map.on('load')` never fires, and every check times out with no
  explanation; the tool's readiness gate pre-flights this explicitly.
  `Input.dispatchMouseEvent` needs `clickCount: 1` on *both*
  `mousePressed`/`mouseReleased`, or Chrome dispatches mousedown/mouseup with
  no synthesized `click`, so MapLibre's click handler silently never runs.
  The favicon 404 arrives as a `Log.entryAdded` (source `network`), **not** a
  `Runtime.consoleAPICalled` — a console-API-only collector never sees it at
  all, so the documented filter above would have looked like dead code; the
  tool enables and collects from the `Log` domain too. Chrome on this machine
  was already running, and a plain `chrome.exe --version` silently relayed to
  it instead of executing standalone — a distinct `--user-data-dir` per run
  avoids that handoff.

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
- **One layer is queryable, and one flag says which.** `queryable: true` on
  the `we` entry in `js/layers.js` is the single switch. `hitLayerIds()`
  filters on it, and both `wireHover()` and `wireClicks()` in `js/app.js`
  query against that one list — so popup, hover highlight and pointer cursor
  can never disagree about what is clickable. The earlier `interactive` flag
  was dropped: it conflated "has a visible symbol" with "has a popup", which
  is exactly the ambiguity this change had to resolve. Where the legend
  needed the "has a visible symbol" half (printing "nur Beschriftung"), it is
  now derived from the parts (`parts.every(p => p.type === 'symbol')`) rather
  than carried as a second flag.
- **Bookmarks precomputed to WGS84**, not parsed client-side.
  `tools/bookmarks_to_js.py` converts the QGIS bookmark export (EPSG:25832)
  into `js/bookmarks.js` ahead of time — avoids vendoring a
  reprojection library for a conversion that only needs doing once.
- **`js/areas.js` (hand-written) holds the client's full org structure**
  (4 ServiceCenter → 36 Standorte), separate from `js/bookmarks.js`
  (generated, WGS84 bounds for the 2 imported towns + their 11 sub-areas).
  A Standort's `town` field, if present, is resolved against
  `TOWNS[].name` in `bookmarks.js` — that's the entire "is this area
  imported" mechanism, no separate hand-maintained flag. Importing a new
  area is then: add its QGIS bookmark, re-run `bookmarks_to_js.py`, add
  `town: '<Name>'` to the matching Standort in `areas.js`. Untergebiete are
  not restated in `areas.js`; they come only from `bookmarks.js`'s
  `subAreas`, so a Standort with no bookmark can't show Untergebiete (no
  such case exists today).
- **WiE ≠ Wohnungen — never mix the two counts in the UI.** One
  Wirtschaftseinheit can hold several apartments. The client's reference
  material gives Wohnungen totals per Standort/ServiceCenter; the map only
  knows WiE counts for the 2 imported towns. Rather than fabricate or imply
  a Wohnungen figure for unimported areas, the nav tree shows **no number
  at all** on unimported Standorte — just a grey chip with the name.

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

### 2026-09-07 — only `we` is queryable

**Why:** v1 made four layers clickable (`we`, `gebaeude_ansicht`,
`grundbuch_ansicht`, `flurstuecke`). Only the Wirtschaftseinheit is the
object of interest; the rest are context. With four live hit targets and
`gebaeude_ansicht` sitting *above* `we` in hit order, a click on a building
opened the Gebäude popup instead of the WiE it belongs to, and the cyan hover
outline on every polygon implied all of them were clickable.

**What changed:**
- `js/layers.js` — `interactive`/`primary` replaced by `queryable: true` on
  `we` alone. Removed the `highlight` block from the three display-only
  polygon layers (three `hl-*` style layers gone) and commented out
  `grundbuch_ansicht`'s zero-opacity wide `hit` part, which only existed to
  make its thin border easier to click.
- `js/app.js` — no logic change, only comments: both handlers already read
  `hitLayerIds(LAYERS)`, so restricting that function restricted popup,
  hover highlight and cursor in one go.
- `js/legend.js` — the flat layer list became two headed groups,
  "Abfrageebene" (the `we` row, accent left border + a red "Klick für
  Details" pill) and "Darstellungsebenen · nur Anzeige" (the other five, in
  map-stack order). Row markup factored into a local `rowHtml()`. `metaLine()`
  appends "nur Darstellung" for non-queryable layers.
- `index.html` — `#layer-list` changed from `<ul>` to `<div>` (it now holds
  one `<ul>` per group), plus a one-sentence hint under the "Ebenen" heading.
- `css/app.css` — `.layer-group`, `.layer-group-head`, `.layer-row--primary`,
  `.layer-note`, `.section-hint`; `.layer-list` took over the list reset from
  `#layer-list`.
- **Popups for the other three layers were deliberately kept** in
  `js/popups.js` (`gebaeudeBody`, `flurstueckBody`, `grundbuchBody`, their
  `BODY_BUILDERS`/`HIT_TITLES` entries and the `LABELS` blocks in
  `js/fields.js`). They are unreachable by design, not by accident — a
  comment above `BODY_BUILDERS` says so. Re-enabling a layer is the
  `queryable` flag, not a rewritten popup. The multi-hit "Weitere Objekte
  hier" picker is still live: overlapping WiE polygons can return several
  features from one click.

**Verified** (22/22 assertions, headless Chrome over CDP, script in the
session scratchpad — not committed):
- A click on a Flurstück/Gebäude opens the **WiE** popup (`WiE 1952`, 6 stat
  tiles) with **no** "Weitere Objekte hier" picker — in v1 this same click
  opened the Gebäude/Flurstück popup.
- Clicking a WiE still opens the full grouped popup (`WiE 0329`, all 4
  sections, header not scrolled off).
- Cursor is `pointer` only over `we`; hover `feature-state` is set on `we`
  features and on zero features of the other three layers.
- Style contains `hl-we` and no other `hl-*`; no `grundbuch_ansicht-hit`.
- All six checkboxes still flip every style layer they own (4/1/1/3/1/2 ids).
- With `we` hidden, clicking a bare Gebäude/Flurstück gives no popup and no
  pointer — the cleanest available proof of inertness, since **every**
  Gebäude and Flurstück polygon in this dataset lies inside a WiE polygon
  (6248 candidate points checked across 12 views found no point that is on a
  display-only layer and off every WiE). Re-showing `we` restores the popup.
- Sidebar: two groups, 1 + 5 rows, the "Klick für Details" note on the `we`
  row only. Console clean apart from the pre-existing favicon 404.

### 2026-09-07 — deployment documented against the live site

`DEPLOYMENT.md` and `DEPLOYMENT-GITHUB-PAGES.md` were pre-decision
brainstorming docs (option tables for Cloudflare/S3/Azure/Pages, repo-
visibility trade-offs) written before GitHub Pages was actually set up.
Both were untracked and never committed. Replaced by a single
`DEPLOYMENT.md` describing what is running; the GitHub Pages one was
deleted.

Every fact in the new doc was checked against the live site, not recalled:
- `gh api repos/maptransfer/nl_webmap/pages` → `build_type: legacy`,
  `source: {branch: master, path: /}`, `https_enforced: true`, `cname: null`,
  repo `visibility: public`. No `.github/workflows` exists, so a plain
  `git push` to `master` is the entire deploy.
- Live range check returned `206` with
  `Content-Range: bytes 0-15/1823852` and `Cache-Control: max-age=600`.
- The site is the **repo root**: `qml/mv_we.qml` and `CLAUDE.md` return 200
  live, while `scripts/export_pgis_layers.bat` returns 404 (gitignored, holds
  the DB password). Worth knowing before adding files to the repo.
- `vendor/maplibre-gl.js` returns 200 at exactly 1,056,837 bytes — checked
  specifically because GitHub's legacy build runs Jekyll, whose defaults
  exclude a `vendor/` directory. It is served correctly today; an empty
  `.nojekyll` would remove the reliance on that and is noted in
  `DEPLOYMENT.md` as optional hardening (not added — no problem to fix yet).

`README.md`'s "Deploying" section, which described generic static hosting,
now names the live URL and the one-line deploy and points at `DEPLOYMENT.md`
for the rest. `CLAUDE.md`'s out-of-scope note was corrected: hosting is
decided, though host-agnosticism is still a property worth keeping.

### 2026-09-07 — full ServiceCenter/Standort/Untergebiet nav tree (sales-demo framing)

**Why:** the map is going into a sales pitch to Neue Lübecker. Only 2 of
their 36 Standorte are imported (Ahrensburg, Ratzeburg), but the sidebar
previously showed only those two — reading as "this is the whole product"
rather than "here's your portfolio, 2 areas live, the rest is a switch to
flip". The client supplied their full org structure
(`servicecenter_structure.json` + a reference graphic showing Wohnungen
counts per Standort/ServiceCenter) as the target hierarchy.

**What changed:**
- **New `js/areas.js`** — hand-written 4 ServiceCenter → 36 Standort
  structure (spelling/order from the client JSON). See the architecture-
  decisions entry above for the `town`-as-import-flag mechanism.
- **New `js/util.js`** — `esc()` moved out of `js/legend.js` (now imported,
  no behaviour change) and a new `slug()` (umlaut-aware) for stable DOM ids,
  since Untergebiet/Standort names contain spaces, `/`, `:`, umlauts.
- **`js/app.js`**: `initViewPicker()` → `initAreaPicker()`, rewritten to
  render the 3-level tree (`.sc-group` → `.standort-list`/`.pending` →
  `.ug-list`). Opening view changed from the whole Ahrensburg town to its
  first Untergebiet (Schäferweg), resolved via `DEFAULT_VIEW` in `areas.js`
  through `resolveDefaultBounds()` (falls back town → `COMBINED_BOUNDS`).
  Delegated click wiring generalized to work at both the ServiceCenter and
  Standort-chevron level (`[aria-controls]` → toggle) and across both
  Standort and Untergebiet rows (`[data-bounds]` → fly + set `.is-active`);
  clicking a Standort name also auto-expands its Untergebiete
  (`data-expand` attribute ties the two together in one click).
- **Unimported Standorte render as inert grey chips** (`<li class="chip">`,
  no `data-bounds`, no button, not focusable) grouped under a "noch nicht
  importiert" label inside their ServiceCenter — not as 34 dead full-width
  rows.
- **Demo framing note** at the top of the tree, all numbers computed from
  `areas.js`/`bookmarks.js` (never hardcoded): "Demo: 2 von 36 Standorten
  erfasst (119 Wirtschaftseinheiten). Grau: noch nicht importiert."
- `css/app.css` — old `.view-group`/`.view-group-head`/`.town-btn`/
  `.view-sub-list` rules replaced with `.sc-*`, `.standort-*`, `.ug-list`,
  `.pending`, `.chip*`, `.is-active`; chevron rotate-on-expand generalized to
  `[aria-expanded="true"] .chev` (was scoped to one class).
- `index.html` — first-load toast reworded around "Demo-Datenstand" instead
  of "Zwei Standorte"; `#view-list` comment updated.
- Ratzeburg **kept its 4 Untergebiete** from the bookmarks even though the
  client JSON lists none under it — user decision, since dropping them would
  have thrown away working navigation.

**Verified** (headless Chrome over CDP, `serve_range.py`; script + driver
in the session scratchpad, not committed):
- Opening view is Schäferweg (not the Ahrensburg town extent): map bounds
  matched the sub-area's bookmark exactly, zoom ≈16.1.
- Structure: 4 `.sc-group`; `sc-cnt` read `1 von 8` / `0 von 7` / `1 von 7`
  / `0 von 14`; 34 `.chip` elements; 2 `.standort-btn[data-bounds]`; 11
  `.ug-list button[data-bounds]` (7 Ahrensburg + 4 Ratzeburg); demo note text
  matched the computed numbers exactly.
- Chips confirmed inert: none carries `data-bounds`, none is a `<button>`,
  every one has `tabIndex -1`; clicking one left `map.getCenter()`/
  `getZoom()` byte-identical and logged nothing.
- Navigation: clicking the Ratzeburg Standort row flew to the Ratzeburg
  town bounds *and* auto-expanded its Untergebiete (`chevExpanded: "true"`,
  `ugHidden: false`); clicking an Untergebiet ("Rondeel") flew to its
  bookmark bounds and moved `.is-active` there (exactly one active element
  at a time, confirmed via `document.querySelectorAll('.is-active').length
  === 1`).
- Toggling: `.sc-head` click flips `aria-expanded` and its panel's
  `hidden`; `.chev-wrap` likewise.
- No collateral damage: the `we` popup still opens on click (`WiE 0244`,
  Schäferweg 25-27, 6 stat tiles, no multi-hit picker); the 6 legend
  checkboxes still flip their style layers' `visibility` (spot-checked
  `we-fill` through none→visible→none).
- Responsive: at 1280px wide, the chip block wraps to 2 rows with no
  horizontal scroll on `#sidebar-body`; at 800px the sidebar still
  auto-collapses under the existing 900px breakpoint (unrelated to this
  change, confirmed not broken).

### 2026-09-08 — sidebar/basemap polish pass (post-review of the nav tree)

**Why:** reviewing the 2026-09-07 nav tree ahead of the sales pitch surfaced
five rough edges: the OSM basemap competed visually with the thematic fills;
ServiceCenter Lübeck (the second imported group, holding Ratzeburg) sat below
an entirely empty ServiceCenter and opened expanded alongside Ahrensburg;
empty ServiceCenter groups looked exactly as interactive as the ones with
data; the "Alle erfassten Standorte" button flew to `COMBINED_BOUNDS`, the
same empty-countryside view the project's default-view decision exists to
avoid; and the "Klick für Details" pill on the WiE row duplicated the
`.section-hint` sentence already above the layer list.

**What changed:**
- `js/app.js` — the initial style's `layers` array gained an explicit white
  `background` layer plus `paint: { 'raster-opacity': 0.5 }` on
  `basemap-osm`, so the raster fades to a defined colour rather than an
  unset canvas/`#map` background.
- `js/areas.js` — `ServiceCenter Lübeck` moved from index 2 to index 1 (now
  Ahrensburg → Lübeck → Elmshorn → Schwerin), so the two data-carrying groups
  are adjacent. Standort order/spelling *within* each group is still
  verbatim from the client JSON; only the group order deviates, noted in a
  file comment.
- `js/app.js` `initAreaPicker()` — `scHasData` (interactive at all) and
  `scIsDefault` (starts expanded, `imported.some(r => r.standort.town ===
  DEFAULT_VIEW.town)`) split apart, where before one flag drove both. Only
  the ServiceCenter holding `DEFAULT_VIEW`'s town starts expanded now, so
  Lübeck renders collapsed-but-expandable instead of open alongside
  Ahrensburg.
- `js/app.js` `initAreaPicker()` — a ServiceCenter with `scHasData === false`
  (Elmshorn, Schwerin) now renders as a single inert `<div class="sc-head
  sc-head--empty">` row: no `<button>`, no chevron, no `aria-controls`/
  `aria-expanded`, no `sc-body` at all — same "missing attribute = inert"
  pattern the `.chip` rows already used for `data-bounds`. Its Standort names
  are not rendered anywhere (per explicit decision — chips stayed only for
  the two *mixed* groups, Ahrensburg/Lübeck, where the demo note's "grau:
  noch nicht importiert" still needs something on screen to point at).
  `css/app.css` gained `.sc-head--empty` (muted colour, no hover, default
  cursor); it inherits `.sc-head`'s flex layout otherwise.
- `js/app.js`/`css/app.css` — the "Alle erfassten Standorte" button removed
  (it flew to `COMBINED_BOUNDS`, landing on empty countryside — exactly the
  view `resolveDefaultBounds()` exists to avoid as a *default*, so leaving it
  reachable by a click was a trap in a live demo). `COMBINED_BOUNDS` stays
  imported — `resolveDefaultBounds()` still uses it as the last-resort
  fallback. `.view-all-btn` CSS rules deleted.
- `js/legend.js`/`css/app.css` — the red "Klick für Details" pill
  (`.layer-note`/`.layer-note--primary`) removed from `rowHtml()`. The WiE
  row still gets `.layer-row--primary` (accent left border + tint), and
  `.section-hint` in `index.html` still names the queryable layer above the
  list — between the two, which layer answers a click is still visible
  without the extra pill.

**Verified** (headless Chrome over CDP, `serve_range.py`; driver script in
the session scratchpad, not committed — pattern per "Build & test commands"
above):
- `map.getPaintProperty('basemap-osm', 'raster-opacity') === 0.5`; a `bg`
  layer exists first in the style's layer stack, `basemap-osm` second, first
  vector layer (`flurstuecke-fill`) third; screenshot shows a visibly faded
  OSM basemap under the still-fully-saturated WiE hatch fill.
- `.sc-name` order reads Ahrensburg, Lübeck, Elmshorn, Schwerin.
- Exactly one `.sc-head[aria-expanded="true"]` (Ahrensburg); Lübeck's
  `sc-body` starts `hidden: true`, flips to `false` after clicking its head.
- `.sc-head--empty` count is 2, both `<div>` (not `<button>`), neither has
  `aria-controls`; `.chip` count is 13 (7 Ahrensburg + 6 Lübeck, down from 34
  before this change); clicking an empty head left `map.getCenter()`/
  `getZoom()` byte-identical (confirmed inert).
- `.view-all-btn` is absent from the DOM; remaining `[data-bounds]` count is
  13 (2 Standort buttons + 11 Untergebiet buttons); clicking the Ratzeburg
  Standort still flies to its bounds with exactly one `.is-active` element.
- `.layer-note` is absent; `.layer-row--primary` is still present on the WiE
  row; toggling `#cb-we` still flips `we-fill`'s `visibility`
  (`visible`→`none`, restored after).
- Console clean apart from the pre-existing favicon 404.

### 2026-09-08 — committed verification harness (`tools/verify.py`)

**Why:** every session so far (including the two above) hand-wrote a
throwaway CDP driver from scratch, ran it once from the scratchpad, and threw
it away — paying the same setup cost repeatedly and, this session confirmed,
re-risking the same silent-failure traps (see below). The plumbing was worth
committing; a speculative full check suite was not — see the scope note this
entry ends with.

**What changed:**
- **New `tools/verify.py`** — a CDP-driven headless-Chrome harness structured
  as an ordered registry of independent, named checks
  (`@check("name", "description")`), each free to run alone
  (`verify.bat some_check`) or as part of a full run. A shared `Page` class
  (navigate, readiness-poll, eval, click/hover, screenshot,
  console/network collection) is the reusable surface; a future session adds
  a check by writing one decorated function against it.
- **New `tools/verify.bat`** — launches it with the OSGeo4W Python (the only
  real interpreter on this machine; `python` on `PATH` is the Microsoft Store
  stub), mirroring `serve.bat`'s approach.
- **Four checks**, chosen as the stable half of the manual sweep the last two
  sessions each ran by hand rather than a full suite (see "Build & test
  commands" above for the fuller reasoning and the list of candidates
  considered and dropped):
  - `map_loads` — style layer ids/order derived from `buildStyleLayers(LAYERS)`,
    `nl` source shape, `basemap-osm` raster-opacity, `#error-banner` hidden.
  - `console_clean` — the load-and-do-nothing baseline for the shared
    console/network classifier every check gets for free (see below).
  - `layer_checkboxes_toggle` — one checkbox per `LAYERS` entry, `checked`
    matches `defaultVisible`, and toggling flips every id in `partIds(cfg)`.
  - `wie_popup_opens` — finds a real rendered WiE pixel, clicks it, and
    asserts the popup's title/subtitle against *that feature's own
    properties* (via `pad4`/`txt` imported live from `js/fields.js`, not a
    hardcoded id), plus the fixed a11y-autoscroll regression guard
    (`scrollTop === 0`, only asserted when the popup actually overflows).
  All four derive their expectations by dynamically importing the app's own
  `js/layers.js` / `js/bookmarks.js` / `js/fields.js` **inside the browser**
  at runtime (confirmed viable on both `localhost` and the live Pages origin
  — neither sends a CSP header, both serve `.js` with a JS MIME type), so
  adding or removing a layer moves the expectations with it.
- **Every check gets an implicit trailing assertion for free**: no
  unexpected console error/exception or failed network request occurred
  during it (severity rules and the favicon/OSM exceptions are in
  `SIGNIFICANT_WARNINGS`/`IGNORE_PATTERNS`/`NOTE_ONLY_PATTERNS` at the top of
  the file). This is what turned a plain id-rename into a caught bug during
  this session's own testing — see "Verified" below.

**Verified** (this session, against a live-running instance each time, not a
read-through):
- `tools\verify.bat --list` prints all four names + descriptions;
  `tools\verify.bat bogus_name` exits `2` with the valid names listed.
- Full run against a manually-started `serve.bat`: 4/4 passed, and no
  `[server]` line printed (confirms it left the already-running instance
  alone).
- Full run with nothing listening on `:8000`: `[server] no listener…` /
  `[server] up (pid ...)` printed, 4/4 passed, and the spawned server was
  gone afterward (confirmed via a follow-up connection attempt failing).
- **Proved the harness can actually fail, not just always print PASS**: a
  scratch edit nudging `basemap-osm`'s `raster-opacity` from `0.5` to `0.9`
  in `js/app.js` was caught by `map_loads` with a readable
  expected/got message; a scratch edit renaming the `cb-` checkbox-id prefix
  to `chk-` in `js/legend.js` was caught by `layer_checkboxes_toggle`'s
  missing-checkbox assertions *and*, independently, by the implicit
  console-error assertion (the id mismatch left `renderLegend()` calling
  `.addEventListener` on `null`, a real `TypeError` the tool surfaced
  verbatim). Both scratch edits were reverted before this commit — confirmed
  via `git diff` showing no changes to either file.
- Full run against `https://maptransfer.github.io/nl_webmap/`: 4/4 passed,
  same counts as local, confirming the harness works unmodified against the
  `/nl_webmap/` subdirectory deploy.

**Found while building it** (all now retired inside the tool, with comments
at the point each is handled — see "Build & test commands" for the details):
Chrome ≥137 refuses the software WebGL fallback in headless mode without
`--enable-unsafe-swiftshader`; `Input.dispatchMouseEvent` needs
`clickCount: 1` on both press and release or no `click` fires; the favicon
404 arrives via `Log.entryAdded`, not `Runtime.consoleAPICalled`, so a
console-API-only collector misses it entirely; this machine's Chrome was
already running and a plain `chrome.exe --version` silently relayed to it
instead of launching standalone.

**Scope, deliberately kept lean:** a `sidebar_tree_structure` check was
designed in full during planning and **not** added — the sidebar was the
highest-churn part of the UI in both the 2026-09-07 and 2026-09-08 sessions
above, so a check mirroring its exact shape would have needed editing in the
same session that changed the feature, which is duplicated work rather than
a regression guard. Also considered and dropped for "no bug has occurred
yet": `config_invariants`, `dom_ids_unique`, `glyphs_load`,
`no_cdn_requests`, `import_completeness`, `default_view`, `area_navigation`,
`queryable_scope`. Add one — or a new one — the next time a bug in that area
actually happens.

## Known issues / blockers

- **DB password in `scripts/export_pgis_layers.bat` needs rotating.** The
  file is gitignored (never committed), but it's sat in plaintext on disk —
  treat it as exposed. Not something I can do; needs the user to rotate it
  on the DB side.
- **OSM raster basemap is an accepted deviation, not a blocker.**
  `tile.openstreetmap.org` is under a usage policy that doesn't cover
  production traffic, and the live site uses it anyway — a deliberate call at
  the current low traffic level (decided 2026-09-07). The fix, when traffic
  or client requirements make it matter, is the one `tiles:` URL in
  `js/app.js`. OSM attribution is already rendered and stays required
  whatever the provider.
- **The published dataset is world-readable, by design.** The repo is
  public, so `data/neue-luebecker.pmtiles` is directly downloadable, not just
  browsable through the map. Confirmed as intended for this deployment
  (2026-09-07) — don't treat it as a leak, but don't assume the next dataset
  carries the same clearance.
- **No CI, though `tools/verify.py` closes the "nothing is committed" half
  of this** (2026-09-08 — see "Build & test commands" and the dated entry
  below). Four checks run on demand and gate a commit locally; nothing runs
  them automatically on push. GitHub Pages deploys from `master` with no
  Actions workflow, so adding CI is a separate decision, not yet made. The
  four checks are also a regression *floor*, not full coverage of the app —
  several candidate checks (sidebar structure, config invariants, CDN/glyph
  loading, import completeness) were designed and deliberately left out; see
  the dated entry for which and why.

## Next steps

None requested. The sidebar/basemap polish pass and the `tools/verify.py`
harness are both built and verified (see the two 2026-09-08 entries above) —
awaiting review or a specific next ask.

Small things noticed and deliberately left alone:
- `js/areas.js` is hand-written and will drift silently if the client's org
  structure changes (renamed/merged/split Standorte) — there's no automated
  check tying it back to `servicecenter_structure.json`. Fine for a
  sales-demo snapshot; worth a comparison script if the structure becomes a
  living document.
- No `favicon.ico` (404 on every load, cosmetic).
- No `.nojekyll` — see the deployment entry above; nothing is broken, it
  would just remove a dependency on Jekyll's default behaviour.
- `note_to_self.png` sits untracked in the repo root. Not mine to commit or
  delete; ask before touching it.
- `CLAUDE.md`'s "Project folder structure" tree is stale — it predates the
  frontend and omits `js/`, `css/`, `vendor/`, `tools/` and the `.md` files.
  Left alone to keep the deployment-docs commit atomic; worth a one-line
  cleanup commit of its own.

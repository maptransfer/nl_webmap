// Zoom-out generalization overlay: below js/layers.js's DETAIL_MINZOOM the
// five thematic layers are hidden (an illegible speckle at that zoom over a
// whole Standort - see the comment on DETAIL_MINZOOM), and this module draws
// clickable markers instead - one per Untergebiet at "zoomed to a Standort"
// zoom, one per Town further out still. It is a NAVIGATION overlay built
// from js/bookmarks.js + js/areas.js, not a thematic PMTiles layer, so it
// deliberately does NOT live in js/layers.js's LAYERS array: it has no
// legend row, no checkbox and no popup, and folding it in would need special
// cases in buildStyleLayers()/partIds()/hitLayerIds()/renderLegend() that
// all currently assume "one PMTiles layer, one legend row, one checkbox".
//
// Marker clicks reuse the sidebar's own fly/active-state/expand logic rather
// than reimplementing it: every Standort/Untergebiet button in js/app.js's
// initAreaPicker() carries a stable id (navTownId()/navUgId(), js/util.js),
// and a marker click just calls that button's own .click().
import { TOWNS } from './bookmarks.js';
import { stripTownPrefix } from './areas.js';
import { DETAIL_MINZOOM } from './layers.js';
import { navTownId, navUgId } from './util.js';

// ---- zoom-band geometry ----------------------------------------------------
// Derived from REAL fitBounds() zooms, measured live (tools/verify.py's
// Chrome/CDP classes, a scratch script, not committed) across seven viewport
// sizes from 800x500 to 2560x1440: Ahrensburg/Ratzeburg town-fit zooms range
// ~11.9-13.5; every Untergebiet (sub-area) bookmark fits at >=14.8. So:
//   - below TOWN_FADE_LO: town markers, full opacity (down to the map's own
//     minZoom 10 - reachable via COMBINED_BOUNDS, the last-resort fallback
//     resolveDefaultBounds() in app.js still uses, or by pinching out).
//   - TOWN_FADE_LO -> TOWN_FADE_HI: crossfade, town markers out, Untergebiet
//     markers in.
//   - TOWN_FADE_HI -> UG_PLATEAU_HI: Untergebiet markers at full opacity -
//     every observed "zoomed to a full Standort" view lands here.
//   - UG_PLATEAU_HI -> DETAIL_MINZOOM: Untergebiet markers fade out as the
//     handover to the five thematic layers approaches.
//   - >= DETAIL_MINZOOM: markers gone (hard maxzoom, matching the thematic
//     layers' hard minzoom in js/layers.js - no window where both a marker
//     and a WiE polygon are hit-testable at once).
const TOWN_FADE_LO = 11.0;
const TOWN_FADE_HI = 11.3;
const UG_PLATEAU_HI = DETAIL_MINZOOM - 0.4; // 13.6

const FADE_TOWN = ['interpolate', ['linear'], ['zoom'], TOWN_FADE_LO, 1, TOWN_FADE_HI, 0];
const FADE_UG = ['interpolate', ['linear'], ['zoom'],
  TOWN_FADE_LO, 0, TOWN_FADE_HI, 1, UG_PLATEAU_HI, 1, DETAIL_MINZOOM, 0];

// ---- label text -------------------------------------------------------------
// Map symbol labels are rendered from the two vendored glyph fontstacks
// (vendor/glyphs/Open Sans {Bold,Regular}/, ranges 0-255 and 256-511 only -
// confirmed on disk, no other ranges were fetched). German umlauts/ss sit
// well inside that (Latin-1 Supplement, U+0080-00FF), so town/Untergebiet
// names are safe verbatim - but punctuation like an en dash or ellipsis
// (U+2013/U+2026, General Punctuation) is NOT vendored and would 404 on
// every render. "u.a." (plain ASCII) stands in for a truncation ellipsis
// below for that reason, not for style.
function ugLabel(rawName) {
  const stripped = stripTownPrefix(rawName);
  const first = stripped.split(' / ')[0];
  return first.length < stripped.length ? `${first} u.a.` : first;
}

function centre(bounds) {
  const [[w, s], [e, n]] = bounds;
  return [(w + e) / 2, (s + n) / 2];
}

/** Pure builder, no map argument - mirrors buildStyleLayers()'s shape in
 *  js/layers.js so tools/verify.py can import and derive expectations from
 *  it the same way. `towns` defaults to the app's own TOWNS (js/bookmarks.js)
 *  but takes a parameter so a check can pass a synthetic list too. */
export function buildOverviewGeoJSON(towns = TOWNS) {
  const features = [];
  let id = 1;
  for (const town of towns) {
    features.push({
      type: 'Feature',
      id: id++,
      properties: {
        kind: 'town',
        navId: navTownId(town.name),
        label: `${town.name}\n${town.weCount} WiE`,
      },
      geometry: { type: 'Point', coordinates: centre(town.bounds) },
    });
    for (const sub of town.subAreas || []) {
      features.push({
        type: 'Feature',
        id: id++,
        properties: {
          kind: 'ug',
          navId: navUgId(town.name, sub.name),
          label: ugLabel(sub.name),
        },
        geometry: { type: 'Point', coordinates: centre(sub.bounds) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Style layers, bottom -> top: both circle layers, then both label layers
 *  (so names always sit above every dot, the same structural rule
 *  buildStyleLayers() uses for symbol parts in js/layers.js). Pure - takes
 *  no map - so tools/verify.py's map_loads check can import and append these
 *  ids/minzooms to its expected style without touching a live map. */
export function buildOverviewLayers() {
  return [
    {
      id: 'ov-ug-dot', type: 'circle', source: 'overview',
      filter: ['==', ['get', 'kind'], 'ug'],
      minzoom: TOWN_FADE_LO, maxzoom: DETAIL_MINZOOM,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], TOWN_FADE_HI, 6, DETAIL_MINZOOM, 9],
        'circle-color': '#901e1d',
        'circle-stroke-color': '#f9d6d2',
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 4, 2],
        'circle-opacity': FADE_UG,
        'circle-stroke-opacity': FADE_UG,
      },
    },
    {
      id: 'ov-town-dot', type: 'circle', source: 'overview',
      filter: ['==', ['get', 'kind'], 'town'],
      maxzoom: TOWN_FADE_HI,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, TOWN_FADE_HI, 13],
        'circle-color': '#901e1d',
        'circle-stroke-color': '#f9d6d2',
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 5, 3],
        'circle-opacity': FADE_TOWN,
        'circle-stroke-opacity': FADE_TOWN,
      },
    },
    {
      id: 'ov-ug-label', type: 'symbol', source: 'overview',
      filter: ['==', ['get', 'kind'], 'ug'],
      minzoom: TOWN_FADE_LO, maxzoom: DETAIL_MINZOOM,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], TOWN_FADE_HI, 11, DETAIL_MINZOOM, 13],
        'text-variable-anchor': ['bottom', 'top', 'right', 'left'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-max-width': 9,
        'text-line-height': 1.15,
        'text-padding': 2,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#901e1d',
        'text-halo-color': '#fafafa',
        'text-halo-width': 1.8,
        'text-halo-blur': 0,
        'text-opacity': FADE_UG,
      },
    },
    {
      id: 'ov-town-label', type: 'symbol', source: 'overview',
      filter: ['==', ['get', 'kind'], 'town'],
      maxzoom: TOWN_FADE_HI,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, TOWN_FADE_HI, 14],
        'text-anchor': 'top',
        'text-offset': [0, 1.0],
        'text-line-height': 1.15,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-padding': 2,
      },
      paint: {
        'text-color': '#901e1d',
        'text-halo-color': '#fafafa',
        'text-halo-width': 1.8,
        'text-halo-blur': 0,
        'text-opacity': FADE_TOWN,
      },
    },
  ];
}

/** Layer ids to hit-test for marker clicks/hover/cursor, TOP -> BOTTOM -
 *  mirrors hitLayerIds()'s shape in js/layers.js. Exported so js/app.js's
 *  wireHover()/wireClicks() can fold marker hit-testing into the same
 *  cursor/click decision they already own for the thematic `we` layer,
 *  rather than this module reaching into that state itself. */
export function overviewHitLayerIds() {
  return ['ov-town-label', 'ov-ug-label', 'ov-town-dot', 'ov-ug-dot'];
}

/** queryRenderedFeatures against the overview layers, ADDITIONALLY dropping
 *  any hit whose kind doesn't belong at the CURRENT continuous zoom.
 *
 *  Why this is needed, not just belt-and-suspenders: MapLibre only
 *  re-evaluates a GeoJSON-backed layer's minzoom/maxzoom when it rebuilds
 *  that source's internal tile for the viewport, which happens at
 *  integer-zoom boundaries - NOT every frame. Measured live (a scratch CDP
 *  sweep, not committed): with ov-town-dot's maxzoom set to TOWN_FADE_HI
 *  (11.3), queryRenderedFeatures kept returning it up to z~11.9, a whole
 *  zoom level past the cutoff - even though its circle-opacity paint
 *  expression (a genuinely continuous, per-frame value) had already
 *  clamped to 0, so it was invisible the entire time. The fade therefore
 *  looks correct on screen, but without this filter a click or hover in
 *  that dead zone would still hit an invisible marker. This function is the
 *  single place both the click handler below and js/app.js's wireHover()
 *  query through, so the two can't disagree about what's "really" active. */
export function queryOverviewHits(map, point) {
  const zoom = map.getZoom();
  return map.queryRenderedFeatures(point, { layers: overviewHitLayerIds() }).filter((f) => {
    if (f.properties.kind === 'town') return zoom < TOWN_FADE_HI;
    if (f.properties.kind === 'ug') return zoom >= TOWN_FADE_LO && zoom < DETAIL_MINZOOM;
    return false;
  });
}

/** Side-effecting setup: adds the source/layers, wires marker clicks (which
 *  activate the matching sidebar button via its own .click(), so fly/active-
 *  state/ancestor-reveal logic lives in exactly one place, js/app.js's
 *  initAreaPicker()), a light hover ring via feature-state, and the sidebar's
 *  "layers are hidden right now" affordance (#zoom-note / .is-dimmed).
 *  Call AFTER the thematic layers are added (so markers draw on top) and
 *  BEFORE wireHover()/wireClicks() register their own listeners (querying a
 *  layer id that doesn't exist yet in the style logs a console error on
 *  every mousemove, which would fail the console_clean check). */
export function initOverview(map) {
  map.addSource('overview', { type: 'geojson', data: buildOverviewGeoJSON() });
  for (const layer of buildOverviewLayers()) map.addLayer(layer);

  map.on('click', (e) => {
    const hits = queryOverviewHits(map, e.point);
    if (!hits.length) return;
    const navId = hits[0].properties.navId;
    const btn = document.getElementById(navId);
    if (!btn) {
      console.warn(`overview.js: no sidebar row with id "${navId}" - js/areas.js and js/bookmarks.js may be out of sync.`);
      return;
    }
    btn.click(); // reuses fly + is-active + ancestor-reveal, all in one place
    btn.scrollIntoView({ block: 'nearest' });
  });

  // Hover ring (feature-state, same pattern as the WiE highlight in
  // js/app.js's wireHover() - a real business id here too, via the
  // sequential id buildOverviewGeoJSON() assigns each feature). Cursor
  // itself is NOT set here - wireHover() in app.js owns the cursor for the
  // whole map and already folds HIT in via overviewHitLayerIds(), so a
  // second handler setting it here would race the same property.
  let hoveredId = null;
  map.on('mousemove', (e) => {
    const hits = queryOverviewHits(map, e.point);
    const nextId = hits[0] ? hits[0].id : null;
    if (hoveredId != null && hoveredId !== nextId) {
      map.setFeatureState({ source: 'overview', id: hoveredId }, { hover: false });
    }
    if (nextId != null && nextId !== hoveredId) {
      map.setFeatureState({ source: 'overview', id: nextId }, { hover: true });
    }
    hoveredId = nextId;
  });
  map.on('mouseout', () => {
    if (hoveredId != null) map.setFeatureState({ source: 'overview', id: hoveredId }, { hover: false });
    hoveredId = null;
  });

  // Sidebar affordance: with every thematic layer hidden below
  // DETAIL_MINZOOM, five live-looking checkboxes that visibly do nothing
  // are a trap in a demo. #zoom-note must NOT get a `display` of its own in
  // CSS - that's the exact specificity trap that made the v1 toast ignore
  // its `hidden` attribute (see PROGRESS.md, v1 verification, bug #3).
  const note = document.getElementById('zoom-note');
  const list = document.getElementById('layer-list');
  function updateZoomAffordance() {
    const detail = map.getZoom() >= DETAIL_MINZOOM;
    note.hidden = detail;
    list.classList.toggle('is-dimmed', !detail);
  }
  map.on('zoom', updateZoomAffordance);
  updateZoomAffordance();
}

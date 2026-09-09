import { LAYERS, buildPromoteId, buildStyleLayers, hitLayerIds } from './layers.js';
import { buildPatterns, registerPatterns } from './patterns.js';
import { renderLegend } from './legend.js';
import { buildPopupHtml, wirePopupInteractions } from './popups.js';
import { TOWNS, COMBINED_BOUNDS } from './bookmarks.js';
import { SERVICE_CENTERS, DEFAULT_VIEW, stripTownPrefix } from './areas.js';
import { esc, slug, navTownId, navUgId } from './util.js';
import { initOverview, queryOverviewHits } from './overview.js';
import { initSearch } from './search.js';

// ---- pmtiles protocol ------------------------------------------------------
// Absolutised against document.baseURI (no hardcoded hostname) so the same
// files work unchanged on localhost, a subdirectory, or any static host.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
const PMTILES_HREF = new URL('data/neue-luebecker.pmtiles', document.baseURI).href;

// ---- sidebar padding, used by every fitBounds call ------------------------
function sidebarPadLeft() {
  const sidebar = document.getElementById('sidebar');
  const collapsed = sidebar.classList.contains('is-collapsed');
  return (collapsed ? 44 : sidebar.offsetWidth) + 24;
}
function fitPadding() {
  return { top: 24, right: 24, bottom: 24, left: sidebarPadLeft() };
}

// Used only by js/search.js's jump-to-result: a WiE bbox is tiny (<=90m, see
// PROGRESS.md), so fitBounds's own maxZoom cap always decides the zoom and
// this padding only shifts WHERE the WiE lands on screen. A generous top
// reserve pushes it into the lower half of the map, so the popup search.js
// auto-opens on arrival - which MapLibre anchors above the point - lands in
// the free space above the WiE instead of covering it. Clamped to 45% of
// the map's own height so it can't invert the fit on a short viewport.
function searchFitPadding() {
  const mapHeight = document.getElementById('map').clientHeight;
  const topReserve = Math.min(300, mapHeight * 0.45);
  return { top: topReserve, right: 24, bottom: 24, left: sidebarPadLeft() };
}

// ---- initial style: basemap only. Vector layers are added in map.on('load')
// so pattern images (registered there too) exist before any layer that
// references them via fill-pattern - otherwise MapLibre logs "Image could
// not be loaded" and the fill silently renders empty. ----------------------

// Opening view: the first Untergebiet of Standort Ahrensburg (DEFAULT_VIEW,
// from areas.js), not the whole town - falls back to the town's own bounds
// (then to COMBINED_BOUNDS) if a re-export ever drops that sub-area.
function resolveDefaultBounds() {
  const town = TOWNS.find((t) => t.name === DEFAULT_VIEW.town);
  if (!town) return COMBINED_BOUNDS;
  const sub = town.subAreas && town.subAreas[DEFAULT_VIEW.subAreaIndex];
  return (sub && sub.bounds) || town.bounds;
}

const style = {
  version: 8,
  // Plain relative string, NOT new URL(...): the URL constructor percent-
  // encodes the { } tokens ({fontstack} -> %7Bfontstack%7D) and MapLibre's
  // token replacement then silently fails to find any glyphs.
  glyphs: 'vendor/glyphs/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende',
    },
  },
  // The OSM raster sits at 50% opacity so it reads as context and the
  // thematic overlays (hatched WiE, stippled buildings, yellow Flurstücke)
  // carry the contrast. The white `background` layer underneath gives the
  // faded raster something defined to blend toward - without it the result
  // depends on the canvas clear colour and #map's (unset) CSS background.
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#ffffff' } },
    { id: 'basemap-osm', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.5 } },
  ],
};

const map = new maplibregl.Map({
  container: 'map',
  style,
  bounds: resolveDefaultBounds(),
  fitBoundsOptions: fitPadding(),
  minZoom: 10,
  maxZoom: 20,
  hash: false,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

// Dev helpers: window.map for console poking, window.__style() to paste
// into Maputnik and inspect the generated style (it's built in JS rather
// than a static style.json - see js/layers.js).
window.map = map;
window.__style = () => JSON.stringify(map.getStyle(), null, 2);

// ---- error surface ----------------------------------------------------
const errorBanner = document.getElementById('error-banner');
let lastErrorAt = 0;
map.on('error', (e) => {
  const now = Date.now();
  if (now - lastErrorAt < 4000) return; // avoid spamming the banner
  lastErrorAt = now;
  const msg = (e && e.error && e.error.message) || 'Unbekannter Fehler';
  errorBanner.textContent = `Kartendaten konnten nicht geladen werden: ${msg}`;
  errorBanner.hidden = false;
  console.error('MapLibre error:', e);
});

// ---- build everything once the basemap style has loaded -------------------
map.on('load', () => {
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const patterns = buildPatterns(pixelRatio);
  registerPatterns(map, patterns);

  map.addSource('nl', {
    type: 'vector',
    url: 'pmtiles://' + PMTILES_HREF,
    promoteId: buildPromoteId(LAYERS),
  });

  for (const layer of buildStyleLayers(LAYERS)) {
    map.addLayer(layer);
  }

  renderLegend(map, LAYERS, patterns, document.getElementById('layer-list'));
  // Before wireHover()/wireClicks(): both fold in overviewHitLayerIds(), so
  // those layer ids must already exist in the style, or queryRenderedFeatures
  // logs a console error on every mousemove (which console_clean would then
  // fail on).
  initOverview(map);
  wireHover(map);
  wireClicks(map);
  // activateAreaForWe is assigned synchronously by initAreaPicker()'s own
  // IIFE below, at module load - already set by the time this 'load'
  // handler runs, so the wrapper arrow just defers the lookup by reference
  // rather than needing initSearch to be called any later than this.
  initSearch(map, {
    openPopup,
    searchFitPadding,
    activateArea: (townName, subAreaRawName) => activateAreaForWe(townName, subAreaRawName),
  });
});

// ---- hover highlight --------------------------------------------------
// One map-level mousemove handler (not one per layer), scoped to the same
// HIT list as the click handler: the cyan outline and the pointer cursor
// therefore appear only over the queryable layer, so the cursor itself says
// what will answer a click. The overview markers (js/overview.js) fold into
// the CURSOR half of that only - not the cyan feature-state highlight, which
// stays scoped to `we` alone; the markers get their own hover ring, wired
// inside initOverview() itself.
//
// feature-state requires promoteId (set above) on a real business
// key: the tiles' own mvt_id is synthesised PER TILE, so a polygon clipped
// across a tile boundary would get different mvt_ids and only the fragment
// under the cursor would highlight.
function wireHover(map) {
  const HIT = hitLayerIds(LAYERS);
  let hovered = null; // { sourceLayer, id }

  map.on('mousemove', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: HIT });
    const top = hits[0];
    const next = top ? { sourceLayer: top.sourceLayer, id: top.id } : null;

    if (hovered && (!next || hovered.id !== next.id || hovered.sourceLayer !== next.sourceLayer)) {
      map.setFeatureState({ source: 'nl', sourceLayer: hovered.sourceLayer, id: hovered.id }, { hover: false });
    }
    hovered = next;
    if (hovered) {
      map.setFeatureState({ source: 'nl', sourceLayer: hovered.sourceLayer, id: hovered.id }, { hover: true });
    }
    const overMarker = !hovered && queryOverviewHits(map, e.point).length > 0;
    map.getCanvas().style.cursor = (hovered || overMarker) ? 'pointer' : '';
  });

  map.on('mouseout', () => {
    if (hovered) {
      map.setFeatureState({ source: 'nl', sourceLayer: hovered.sourceLayer, id: hovered.id }, { hover: false });
      hovered = null;
    }
    map.getCanvas().style.cursor = '';
  });
}

// ---- click popups -------------------------------------------------------
// Only `queryable` layers get a popup, which today means `we` alone (see
// hitLayerIds in layers.js). Every other layer - context fills and label-only
// layers alike - is never in HIT, so clicks pass through it. A `we` polygon
// toggled to visibility:'none' drops out of HIT too, since
// queryRenderedFeatures skips hidden layers.
function wireClicks(map) {
  const HIT = hitLayerIds(LAYERS);

  map.on('click', (e) => {
    // An overview marker sits on top and handles its own click (see
    // initOverview() in js/overview.js) - never open the WiE popup under
    // one. In practice the two are never both hit-testable at the same
    // zoom (the marker layers' effective maxzoom, enforced by
    // queryOverviewHits()'s own zoom check, equals the thematic layers'
    // hard minzoom, DETAIL_MINZOOM), but this stays correct even if that
    // threshold is ever retuned to leave a brief overlap.
    if (queryOverviewHits(map, e.point).length) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: HIT });
    if (!hits.length) return;
    openPopup(map, e.lngLat, hits, 0);
  });
}

// Exported so js/search.js's jump-to-result can reuse this exact code path
// for a search selection - real tile data via querySourceFeatures(), same
// grouping/scroll-fix logic, no popup field duplicated into js/we_index.js.
export function openPopup(map, lngLat, hits, activeIndex) {
  function render(idx) {
    const container = document.createElement('div');
    container.innerHTML = buildPopupHtml(hits, idx);
    wirePopupInteractions(container, hits, (newIndex) => popup.setDOMContent(render(newIndex)));
    // MapLibre's popup a11y focus handling scrolls the nearest scrollable
    // ancestor (our .popup, which has overflow-y:auto for tall content)
    // down by a few dozen px right after insertion, hiding the header
    // band. Force it back to the top on the next frame, after that
    // scroll-into-view has had its chance to run.
    requestAnimationFrame(() => {
      const box = container.querySelector('.popup');
      if (box) box.scrollTop = 0;
    });
    return container;
  }

  // maxWidth sets an INLINE max-width on the popup container, so it caps the
  // popup regardless of CSS - keep it in sync with the .maplibregl-popup rule
  // in css/app.css, which adds the min(92vw, ...) mobile clamp on top and wins
  // via !important. Passing it at all is necessary: MapLibre defaults to 240px.
  const popup = new maplibregl.Popup({ maxWidth: '560px', closeButton: true })
    .setLngLat(lngLat)
    .setDOMContent(render(activeIndex))
    .addTo(map);
  return popup;
}

// ---- sidebar: collapse / expand -----------------------------------------
(function initSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const body = document.getElementById('sidebar-body');
  let userTouched = false;

  function setCollapsed(collapsed) {
    sidebar.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }

  const mq = window.matchMedia('(max-width: 900px)');
  setCollapsed(mq.matches);
  mq.addEventListener('change', (e) => {
    if (!userTouched) setCollapsed(e.matches);
  });

  toggle.addEventListener('click', () => {
    userTouched = true;
    setCollapsed(!sidebar.classList.contains('is-collapsed'));
  });
})();

// Assigned by initAreaPicker() below, on its way out. js/search.js's
// jump-to-result calls this to activate (reveal + is-active) the sidebar
// row for a searched WiE's containing Untergebiet - deliberately NOT that
// row's own .click() (the trick js/overview.js uses for its markers), since
// that also flies to the Untergebiet's bounds and would fight the WiE's own
// fitBounds call in js/search.js.
let activateAreaForWe = null;

// ---- sidebar: ServiceCenter / Standort / Untergebiet picker ---------------
// Renders the client's full portfolio (js/areas.js) as a 3-level tree, so the
// demo shows the whole structure - not just the two imported towns. A
// Standort is "imported" purely by carrying a `town` field that resolves
// against TOWNS (js/bookmarks.js); Standorte without one render as inert grey
// chips rather than clickable rows. See CLAUDE.md / PROGRESS.md for why.
(function initAreaPicker() {
  const container = document.getElementById('view-list');

  function fly(bounds) {
    map.fitBounds(bounds, { ...fitPadding(), duration: 900 });
  }

  function setActive(el) {
    container.querySelectorAll('.is-active').forEach((n) => n.classList.remove('is-active'));
    el.classList.add('is-active');
  }

  function resolveTown(standort) {
    if (!standort.town) return null;
    const town = TOWNS.find((t) => t.name === standort.town);
    if (!town) {
      console.warn(`areas.js: Standort "${standort.name}" references unknown town "${standort.town}" - showing as not imported.`);
      return null;
    }
    return town;
  }

  const totalStandorte = SERVICE_CENTERS.reduce((sum, sc) => sum + sc.standorte.length, 0);
  let importedStandorte = 0;
  let importedWe = 0;

  const groupsHtml = SERVICE_CENTERS.map((sc) => {
    const resolved = sc.standorte.map((s) => ({ standort: s, town: resolveTown(s) }));
    const imported = resolved.filter((r) => r.town);
    const pending = resolved.filter((r) => !r.town);
    importedStandorte += imported.length;
    importedWe += imported.reduce((sum, r) => sum + r.town.weCount, 0);

    const scId = `sc-${slug(sc.name)}`;
    // scHasData: whether this group is interactive at all (chevron, body,
    // pending chips shown inline). scIsDefault: whether it starts expanded -
    // only the ServiceCenter holding DEFAULT_VIEW's town does, so the demo
    // opens on exactly one open group even though two carry data.
    const scHasData = imported.length > 0;
    const scIsDefault = imported.some((r) => r.standort.town === DEFAULT_VIEW.town);

    const standortRowsHtml = imported.map(({ standort, town }) => {
      const isDefaultStandort = standort.town === DEFAULT_VIEW.town;
      const ugListId = `st-${slug(sc.name)}-${slug(standort.name)}`;
      const subAreas = town.subAreas || [];
      const chevHtml = subAreas.length ? `
          <button type="button" class="chev-wrap" aria-expanded="${isDefaultStandort ? 'true' : 'false'}" aria-controls="${ugListId}" title="Untergebiete ein-/ausblenden">
            <svg class="chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>` : '';
      const ugListHtml = subAreas.length ? `
        <ul class="ug-list" id="${ugListId}" ${isDefaultStandort ? '' : 'hidden'}>
          ${subAreas.map((s, i) => {
            const isDefaultSub = isDefaultStandort && i === DEFAULT_VIEW.subAreaIndex;
            return `<li><button type="button" id="${navUgId(town.name, s.name)}" class="${isDefaultSub ? 'is-active' : ''}" data-bounds='${JSON.stringify(s.bounds)}'>${esc(stripTownPrefix(s.name))}</button></li>`;
          }).join('')}
        </ul>` : '';

      // An imported Standort is boxed with a tinted head bar - the same
      // treatment as the WiE popup's collapsible "Lage" group - so the two
      // live areas read as objects rather than as one more list row among
      // the Untergebiete below them and the grey chips beside them.
      return `
        <li>
          <div class="standort-group">
            <div class="standort-head">
              <button type="button" id="${navTownId(town.name)}" class="standort-btn" data-bounds='${JSON.stringify(town.bounds)}' ${subAreas.length ? `data-expand="${ugListId}"` : ''}>
                ${esc(standort.name)} <span class="cnt">${town.weCount} WiE</span>
              </button>${chevHtml}
            </div>${ugListHtml}
          </div>
        </li>`;
    }).join('');

    const pendingHtml = pending.length ? `
      <div class="pending">
        <span class="pending-label">noch nicht importiert</span>
        <ul class="chip-list">
          ${pending.map((r) => `<li class="chip" title="noch nicht importiert">${esc(r.standort.name)}</li>`).join('')}
        </ul>
      </div>` : '';

    // A ServiceCenter with nothing imported yet is a single inert grey row -
    // no chevron, no aria-controls/aria-expanded, no body, so it falls
    // outside the [aria-controls] expand/collapse wiring below (same
    // "absent attribute = inert" pattern the .chip rows already use for
    // data-bounds). Its 7-14 Standort names aren't shown anywhere; the demo
    // note's aggregate counts still account for them.
    if (!scHasData) {
      return `
        <div class="sc-group">
          <div class="sc-head sc-head--empty" title="noch nicht importiert">
            <span class="sc-name">${esc(sc.name)}</span>
            <span class="sc-cnt">${imported.length} von ${resolved.length}</span>
          </div>
        </div>`;
    }

    return `
      <div class="sc-group">
        <button type="button" class="sc-head" aria-expanded="${scIsDefault ? 'true' : 'false'}" aria-controls="${scId}">
          <svg class="chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="sc-name">${esc(sc.name)}</span>
          <span class="sc-cnt">${imported.length} von ${resolved.length}</span>
        </button>
        <div class="sc-body" id="${scId}" ${scIsDefault ? '' : 'hidden'}>
          ${standortRowsHtml ? `<ul class="standort-list">${standortRowsHtml}</ul>` : ''}
          ${pendingHtml}
        </div>
      </div>`;
  }).join('');

  const demoNoteHtml = `<p class="views-demo-note">Demo-App: ${importedStandorte} von ${totalStandorte} Standorten erfasst
    (${importedWe} Wirtschaftseinheiten). Grau: noch nicht importiert.</p>`;

  container.innerHTML = `
    ${demoNoteHtml}
    ${groupsHtml}`;

  // Reveals every collapsed panel an element sits INSIDE (walking up
  // ancestors, not down into a descendant - that's what data-expand below is
  // for). Needed because a row can now be activated from somewhere other
  // than a click that started inside its own collapsed tree: a map overview
  // marker (js/overview.js) calls a sidebar button's own .click() directly,
  // which would otherwise fly correctly but leave .is-active painted on a
  // row nobody can see (e.g. Ratzeburg's Untergebiete, inside both a
  // collapsed sc-body AND its own collapsed ug-list).
  function reveal(el) {
    for (let p = el.parentElement; p && p !== container; p = p.parentElement) {
      if (!p.id) continue;
      const head = container.querySelector(`[aria-controls="${p.id}"]`);
      if (!head) continue;
      p.hidden = false;
      head.setAttribute('aria-expanded', 'true');
    }
  }

  // Zoom + active-state wiring: every element carrying data-bounds, at any
  // depth (Standort row, Untergebiet row).
  container.querySelectorAll('[data-bounds]').forEach((el) => {
    el.addEventListener('click', (evt) => {
      evt.stopPropagation();
      reveal(el);
      fly(JSON.parse(el.dataset.bounds));
      setActive(el);
      // Clicking a Standort name also reveals its Untergebiete - one click,
      // both effects - rather than requiring a separate chevron click.
      if (el.dataset.expand) {
        const panel = document.getElementById(el.dataset.expand);
        const head = container.querySelector(`[aria-controls="${el.dataset.expand}"]`);
        if (panel) panel.hidden = false;
        if (head) head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Expand/collapse wiring: every head at any depth (ServiceCenter, Standort
  // chevron), generalized from one selector since both levels use the same
  // aria-expanded/aria-controls/hidden contract.
  container.querySelectorAll('[aria-controls]').forEach((head) => {
    head.addEventListener('click', (evt) => {
      evt.stopPropagation();
      const panel = document.getElementById(head.getAttribute('aria-controls'));
      if (!panel) return;
      const open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });

  // Exposed for js/search.js - see the comment on the module-scope
  // `activateAreaForWe` declaration above.
  activateAreaForWe = function (townName, subAreaRawName) {
    const el = document.getElementById(navUgId(townName, subAreaRawName));
    if (!el) return;
    reveal(el);
    setActive(el);
  };
})();

// ---- intro card: frames the app as a demo, shown on every load ------------
// 2026-09-09: replaced the old once-per-browser "two-town split" toast (which
// suppressed itself via localStorage after first dismissal) - this is sales-
// demo framing that should appear every time someone opens the site, not
// just the first. No localStorage involved on purpose.
(function initIntroModal() {
  const toast = document.getElementById('hint-toast');
  const dismiss = document.getElementById('hint-dismiss');
  toast.hidden = false;
  dismiss.addEventListener('click', () => {
    toast.hidden = true;
  });
})();

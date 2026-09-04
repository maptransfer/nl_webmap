import { LAYERS, buildPromoteId, buildStyleLayers, hitLayerIds } from './layers.js';
import { buildPatterns, registerPatterns } from './patterns.js';
import { renderLegend } from './legend.js';
import { buildPopupHtml, wirePopupInteractions } from './popups.js';
import { TOWNS, COMBINED_BOUNDS, DEFAULT_TOWN } from './bookmarks.js';

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

// ---- initial style: basemap only. Vector layers are added in map.on('load')
// so pattern images (registered there too) exist before any layer that
// references them via fill-pattern - otherwise MapLibre logs "Image could
// not be loaded" and the fill silently renders empty. ----------------------

const defaultTown = TOWNS.find((t) => t.name === DEFAULT_TOWN) || TOWNS[0];

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
  layers: [{ id: 'basemap-osm', type: 'raster', source: 'osm' }],
};

const map = new maplibregl.Map({
  container: 'map',
  style,
  bounds: defaultTown.bounds,
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
  wireHover(map);
  wireClicks(map);
});

// ---- hover highlight --------------------------------------------------
// One map-level mousemove handler (not one per layer) so only the topmost
// hit highlights - four simultaneous highlights on overlapping layers would
// be noise. feature-state requires promoteId (set above) on a real business
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
    map.getCanvas().style.cursor = hovered ? 'pointer' : '';
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
// Only layers with a visible symbol get a popup (see hitLayerIds). Label-
// only layers (adressen, flst_grundbuchblaetter) are never in HIT.
function wireClicks(map) {
  const HIT = hitLayerIds(LAYERS);

  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: HIT });
    if (!hits.length) return;
    openPopup(map, e.lngLat, hits, 0);
  });
}

function openPopup(map, lngLat, hits, activeIndex) {
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

  const popup = new maplibregl.Popup({ maxWidth: '420px', closeButton: true })
    .setLngLat(lngLat)
    .setDOMContent(render(activeIndex))
    .addTo(map);
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

// ---- sidebar: bookmark picker (Ahrensburg / Ratzeburg + sub-areas) -------
(function initViewPicker() {
  const container = document.getElementById('view-list');

  function fly(bounds) {
    map.fitBounds(bounds, { ...fitPadding(), duration: 900 });
  }

  const groupsHtml = TOWNS.map((town, i) => `
    <div class="view-group" data-town="${town.name}">
      <div class="view-group-head" aria-expanded="${i === 0 ? 'true' : 'false'}" aria-controls="sub-${town.name}">
        <button type="button" class="town-btn" data-bounds='${JSON.stringify(town.bounds)}'>
          ${town.name} <span class="cnt">${town.weCount} WiE</span>
        </button>
        <span class="chev-wrap">
          <svg class="chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
      <ul class="view-sub-list" id="sub-${town.name}" ${i === 0 ? '' : 'hidden'}>
        ${town.subAreas.map((s) => `<li><button type="button" data-bounds='${JSON.stringify(s.bounds)}'>${s.name}</button></li>`).join('')}
      </ul>
    </div>`).join('');

  container.innerHTML = `
    ${groupsHtml}
    <button type="button" class="view-all-btn" data-bounds='${JSON.stringify(COMBINED_BOUNDS)}'>Beide Standorte</button>`;

  container.querySelectorAll('[data-bounds]').forEach((el) => {
    el.addEventListener('click', (evt) => {
      evt.stopPropagation();
      fly(JSON.parse(el.dataset.bounds));
    });
  });

  container.querySelectorAll('.view-group-head').forEach((head) => {
    const chevWrap = head.querySelector('.chev-wrap');
    chevWrap.addEventListener('click', () => {
      const panel = document.getElementById(head.getAttribute('aria-controls'));
      const open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });
})();

// ---- first-load toast: explains the two-town split -----------------------
(function initHintToast() {
  const KEY = 'nl_webmap_hint_dismissed';
  const toast = document.getElementById('hint-toast');
  const dismiss = document.getElementById('hint-dismiss');
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (_e) { /* private mode etc. */ }
  if (!seen) toast.hidden = false;
  dismiss.addEventListener('click', () => {
    toast.hidden = true;
    try { localStorage.setItem(KEY, '1'); } catch (_e) { /* ignore */ }
  });
})();

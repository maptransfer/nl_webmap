import { partIds } from './layers.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Renders one legend entry's swatch. `patternData` maps pattern-id ->
 *  {dataURL} from patterns.js, so the swatch is pixel-identical to the map. */
function swatchHtml(entry, patternData) {
  if (entry.kind === 'fill') {
    const bg = hexToRgba(entry.fill, entry.fillOpacity ?? 1);
    const stroke = entry.stroke || 'transparent';
    return `<span class="swatch" style="background:${bg};box-shadow:inset 0 0 0 1px ${stroke}"></span>`;
  }
  if (entry.kind === 'fillPattern') {
    const tile = patternData[entry.pattern];
    const bgImage = tile ? `url(${tile.dataURL})` : 'none';
    return `<span class="swatch" style="background-color:${entry.fill};background-image:${bgImage};box-shadow:inset 0 0 0 1px ${entry.stroke}"></span>`;
  }
  if (entry.kind === 'line') {
    return `<span class="swatch swatch--line" style="--line-color:${entry.stroke}"></span>`;
  }
  if (entry.kind === 'label') {
    const style = [
      `color:${entry.color}`,
      `font-weight:${entry.weight || 400}`,
      entry.halo ? `text-shadow:0 0 2px ${entry.halo},0 0 2px ${entry.halo}` : '',
      entry.bg ? `background:${entry.bg}` : '',
    ].filter(Boolean).join(';');
    return `<span class="swatch swatch--label" style="${style}">${esc(entry.sample)}</span>`;
  }
  return '';
}

function metaLine(cfg) {
  const labelPart = cfg.parts.find((p) => p.type === 'symbol');
  const zoomBits = [];
  if (labelPart) {
    if (labelPart.minzoom != null && labelPart.maxzoom != null) {
      zoomBits.push(`nur Beschriftung · Zoom ${labelPart.minzoom}–${labelPart.maxzoom}`);
    } else if (labelPart.minzoom != null) {
      zoomBits.push(`nur Beschriftung · ab Zoom ${labelPart.minzoom}`);
    } else if (!cfg.interactive) {
      zoomBits.push('nur Beschriftung');
    }
  }
  const countBit = `${cfg.count} Objekte`;
  return zoomBits.length ? `${countBit} · ${zoomBits.join(' · ')}` : `${countBit} · sichtbar ab Zoom 10`;
}

/** Builds the #layer-list <li> rows and wires checkbox/expander behaviour.
 *  `patterns` is the output of buildPatterns() from patterns.js. */
export function renderLegend(map, layers, patterns, container) {
  // Reversed so the sidebar order matches the visual stack: topmost map
  // layer (adressen labels) appears first, matching GIS-user convention.
  const ordered = [...layers].reverse();

  container.innerHTML = ordered
    .map((cfg) => {
      const swatches = cfg.legend.map((e) => `
        <div class="swatch-row">
          ${swatchHtml(e, patterns)}
          <span>${esc(e.label || '')}</span>
        </div>`).join('');
      return `
        <li class="layer-row" data-key="${cfg.key}">
          <div class="layer-head">
            <input type="checkbox" id="cb-${cfg.key}" ${cfg.defaultVisible ? 'checked' : ''}>
            <label for="cb-${cfg.key}">${esc(cfg.title)}</label>
            <button class="expand" type="button" aria-expanded="false" aria-controls="lg-${cfg.key}" title="Legende">
              <svg class="chev" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="layer-legend" id="lg-${cfg.key}" hidden>
            ${swatches}
            <p class="meta">${esc(metaLine(cfg))}</p>
          </div>
        </li>`;
    })
    .join('');

  // Checkbox -> visibility, flips every part (fill/pattern/line/highlight)
  // belonging to that logical layer together.
  for (const cfg of layers) {
    const cb = container.querySelector(`#cb-${cfg.key}`);
    cb.addEventListener('change', () => {
      const v = cb.checked ? 'visible' : 'none';
      for (const id of partIds(cfg)) map.setLayoutProperty(id, 'visibility', v);
    });
  }

  // Expand/collapse legend detail.
  container.querySelectorAll('.expand').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });
}

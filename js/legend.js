import { partIds, LEGEND_ORDER } from './layers.js';
import { esc } from './util.js';

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

/** One <li> row: checkbox, symbol swatch, name. Deliberately no expandable
 *  detail (2026-09-09 simplification) - the swatch alone is the legend now.
 *  The queryable layer keeps an accent treatment (left border + tint via
 *  .layer-row--primary), which together with the .section-hint sentence
 *  above the list is what still says which layer answers a click. */
function rowHtml(cfg, patterns) {
  return `
    <li class="layer-row${cfg.queryable ? ' layer-row--primary' : ''}" data-key="${cfg.key}">
      <input type="checkbox" id="cb-${cfg.key}" ${cfg.defaultVisible ? 'checked' : ''}>
      ${swatchHtml(cfg.legend[0], patterns)}
      <label for="cb-${cfg.key}">${esc(cfg.title)}</label>
    </li>`;
}

/** Builds the #layer-list rows and wires checkbox behaviour. `patterns` is
 *  the output of buildPatterns() from patterns.js. One flat list, ordered by
 *  LEGEND_ORDER (display order, independent of the map's draw order) -
 *  any layer key missing from LEGEND_ORDER is appended at the end rather
 *  than silently dropped. */
export function renderLegend(map, layers, patterns, container) {
  const rank = new Map(LEGEND_ORDER.map((key, i) => [key, i]));
  const ordered = [...layers].sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));

  container.innerHTML = ordered.map((cfg) => rowHtml(cfg, patterns)).join('');

  // Checkbox -> visibility, flips every part (fill/pattern/line/highlight)
  // belonging to that logical layer together.
  for (const cfg of layers) {
    const cb = container.querySelector(`#cb-${cfg.key}`);
    cb.addEventListener('change', () => {
      const v = cb.checked ? 'visible' : 'none';
      for (const id of partIds(cfg)) map.setLayoutProperty(id, 'visibility', v);
    });
  }
}

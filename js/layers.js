// Single source of truth for every rendered layer: style, legend and popup
// grouping all derive from this one array. Adding/removing a layer, or
// changing a QML-sourced value, is a one-place edit here.
//
// `queryable: true` marks a layer as the object of a click: it alone gets a
// popup, a hover highlight and a pointer cursor. Only `we` carries it - the
// other four layers are context (parcel boundaries, buildings, Grundbuch
// outlines + their label, addresses) and stay toggleable but inert. Making
// another layer queryable again is this one flag plus, for a thin-line
// layer, restoring its commented-out `hit` part; the popup bodies for the
// other layers are still present in js/popups.js.
//
// Colours and widths are taken verbatim from the QML files in qml/ (see the
// comment on each entry). Width/size ramps use
//   ["interpolate", ["exponential", 2], ["zoom"], ...]
// because every QGIS size here is `RenderMetersInMapUnits`, and
//   px = metres * 2^z / 92_690        (at the data's latitude, 53.68 deg)
// is exactly reproduced by an exponential-base-2 ramp between any two
// stops - see CLAUDE.md / the project plan for the derivation.

// ---- shared width ramps (meters -> px, per the derivation above) ----------

const W_026M = ['interpolate', ['exponential', 2], ['zoom'], 14, 0.4, 19, 1.5, 20, 2.9];
const W_05M = ['interpolate', ['exponential', 2], ['zoom'], 14, 0.6, 18, 1.4, 20, 5.6];
const W_15M = ['interpolate', ['exponential', 2], ['zoom'], 12, 1.2, 17, 2.1, 19, 8.4];

// ---- layer config -----------------------------------------------------
//
// `LAYERS` stays in DRAW order (bottom -> top of the map stack). Sidebar
// display order is a separate concern - see `LEGEND_ORDER` below - because
// the 2026-09-09 sidebar simplification put Hausnummern above
// Grundbuchblätter in the list even though it's drawn last on the map.
//
// `count`/`subtitle` are kept as config documentation (traceable back to the
// source export and QML) but are no longer rendered anywhere in the UI as of
// the 2026-09-09 legend simplification - the sidebar row now shows only a
// checkbox, a symbol and the title.

export const LAYERS = [
  // Bottom of the stack: largest-area context first.
  {
    key: 'flurstuecke',
    sourceLayer: 'flurstuecke',
    idField: 'id',
    title: 'Flurstücke',
    subtitle: 'ALKIS-Flurstücke mit Grundbuchbezug',
    count: 118,
    defaultVisible: true,
    qml: 'qml/v_flurstuecke.qml',
    // singleSymbol, symbol alpha=0.5 -> multiplies BOTH fill and outline
    parts: [
      { id: 'fill', type: 'fill', paint: { 'fill-color': '#edd943', 'fill-opacity': 0.5 } },
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#9a9a9a', 'line-opacity': 0.5, 'line-width': W_026M },
      },
    ],
    legend: [{ kind: 'fill', fill: '#edd943', fillOpacity: 0.5, stroke: '#9a9a9a', label: 'Flurstück (50% Deckkraft)' }],
  },

  {
    key: 'grundbuch_ansicht',
    sourceLayer: 'grundbuch_ansicht',
    idField: 'id',
    // 2026-09-09: merged with the former standalone `flst_grundbuchblaetter`
    // entry into one switch - to the client these are one thing
    // (Grundbuchblätter and their sheet-number label), not two layers.
    title: 'Grundbuchblätter',
    subtitle: 'Grundbuchbezirke / -blätter',
    count: 64,
    defaultVisible: true,
    qml: 'qml/v_grundbuch_ansicht.qml',
    parts: [
      // style="no" -> NO fill layer. Outline only.
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#838383', 'line-width': W_15M },
      },
      // Zero-opacity wide hit target, only useful while this layer is
      // queryable: the 1.5m line is a thin, unpleasant mouse target. Kept
      // commented so re-enabling the layer stays a config edit. It was
      // placed low in hit-test order (see hitLayerIds) so it never stole a
      // click from `we`.
      // {
      //   id: 'hit', type: 'line', interactionOnly: true,
      //   paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 8 },
      // },
      // Sheet-number label ("Blatt: 735"), formerly the standalone
      // `flst_grundbuchblaetter` layer/checkbox (source view
      // v_flst_grundbuchblaetter, same 64 features, alternate view of the
      // same entities as grundbuch_ansicht). Its own `sourceLayer` overrides
      // the parent cfg's for this one part - see buildStyleLayers().
      //
      // 2026-09-09: moved off the polygon centre and onto the boundary
      // (client request) - symbol-placement:'line' runs the label along the
      // polygon's own rings (MapLibre treats a fill layer's rings as the
      // line geometry for this purpose), text-rotation-alignment defaults to
      // 'map' under 'line' placement so it rotates to follow the edge,
      // symbol-spacing repeats it every ~400px of boundary instead of the
      // 250px default, and the small negative text-offset nudges it off the
      // line towards the polygon's inside rather than sitting on top of it.
      {
        id: 'label', type: 'symbol', sourceLayer: 'flst_grundbuchblaetter',
        minzoom: 16, // QGIS scaleMax=2600 -> exact z>=16.96, widened to 16
        layout: {
          'text-field': ['concat', 'Blatt: ', ['to-string', ['get', 'grundbuch_blatt']]],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['exponential', 2], ['zoom'], 17, 10, 19, 17, 20, 24],
          'symbol-placement': 'line',
          'symbol-spacing': 400,
          'text-offset': [0, -0.8],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
        },
        paint: { 'text-color': '#626262' },
      },
    ],
    // Legend shows only the boundary line (user's choice, 2026-09-09) - the
    // label is still toggled by this row but not pictured separately.
    legend: [{ kind: 'line', stroke: '#838383', label: 'Grenze (keine Füllung)' }],
  },

  {
    key: 'gebaeude_ansicht',
    sourceLayer: 'gebaeude_ansicht',
    idField: 'id',
    title: 'nicht-Wohngebäude', // 2026-09-09: was "Gebäude"
    subtitle: 'ALKIS-Gebäude ohne SAP-Adresszuordnung',
    count: 174,
    defaultVisible: true,
    qml: 'qml/v_gebaeude_ansicht.qml',
    parts: [
      { id: 'fill', type: 'fill', paint: { 'fill-color': '#ba72b3', 'fill-opacity': 1 } },
      { id: 'stipple', type: 'fill', paint: { 'fill-pattern': 'pat-dense5-geb' } },
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#232323', 'line-width': W_05M },
      },
    ],
    legend: [{ kind: 'fillPattern', fill: '#ba72b3', pattern: 'pat-dense5-geb', stroke: '#232323', label: 'Gebäude (Stipple)' }],
  },

  {
    key: 'we',
    sourceLayer: 'we',
    idField: 'we_id', // note: `we` has NO `id` column at all
    title: 'Wirtschaftseinheiten (WiE)',
    subtitle: 'Primäre Ebene mit vollständigem Bestandspopup',
    count: 119,
    defaultVisible: true,
    queryable: true, // the ONLY queryable layer - see the file header
    // 2026-09-09: moved here from a standalone <p class="section-hint"> that
    // sat above the whole layer list - now rendered inside this row by
    // rowHtml() in js/legend.js, since it explains what a click on THIS
    // layer does. `hint` is generic (any LAYERS entry can carry one); today
    // only `we` does.
    hint: 'Details öffnen sich per Klick auf eine Wirtschaftseinheit.',
    qml: 'qml/mv_we.qml',
    // singleSymbol, 2 stacked SimpleFill layers: solid fill, then a
    // f_diagonal hatch overlay, then the outline.
    parts: [
      { id: 'fill', type: 'fill', paint: { 'fill-color': '#de9f9e', 'fill-opacity': 1 } },
      { id: 'hatch', type: 'fill', paint: { 'fill-pattern': 'pat-fdiag-we' } },
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#232323', 'line-width': W_05M },
      },
    ],
    highlight: { color: '#00e5ff', width: 3 },
    legend: [{ kind: 'fillPattern', fill: '#de9f9e', pattern: 'pat-fdiag-we', stroke: '#232323', label: 'Fläche WiE (schraffiert)' }],
  },

  // ---- label-only layer: draw order puts this above every fill ----------

  {
    key: 'adressen',
    sourceLayer: 'adressen',
    idField: 'id',
    title: 'Hausnummern', // 2026-09-09: was "Adressen"
    subtitle: 'Hausnummern (ALKIS/SAP-abgeglichen)',
    count: 272,
    defaultVisible: true,
    qml: 'qml/v_adressen.qml',
    parts: [
      {
        // No scale limit in the QML (scaleVisibility=0) - this part's
        // minzoom comes only from buildStyleLayers()'s blanket
        // Math.max(DETAIL_MINZOOM, ...) floor (2026-09-09, zoom-out
        // generalization), a deliberate web-map generalization decision,
        // not a QML value. Don't "restore" an unlimited range here.
        //
        // 2026-09-09: the size/halo ramps below used to clamp flat at their
        // first stop (z15 -> 10px text), so house numbers stayed a fixed
        // size while the map around them kept shrinking - proportionally
        // huge and cluttered zoomed out. Extended downward so the size
        // actually falls off across the now-visible [14, 15.5] range too.
        id: 'label', type: 'symbol',
        layout: {
          'text-field': ['coalesce', ['get', 'hausnummer'], ['get', 'hn_zusatz'], ''],
          'text-font': ['Open Sans Bold'],
          'text-size': ['interpolate', ['exponential', 2], ['zoom'], 14, 7, 15.5, 9, 18, 14, 20, 24],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#901e1d',
          'text-halo-color': '#fafafa',
          'text-halo-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 0.7, 16, 1.2, 18, 2.2, 20, 3],
          'text-halo-blur': 0,
        },
      },
    ],
    legend: [{ kind: 'label', color: '#901e1d', weight: 700, halo: '#fafafa', sample: '12a', meta: 'nur Beschriftung' }],
  },

  // ---- dropped from v1: nullSymbol, so labels were its ONLY output, and
  // every field in the multi-line label is already in the `we` popup for
  // the same 119 entities. See the project plan for the full rationale.
  // Kept here (commented) so restoring it is a config edit, not a
  // re-derivation of the QML values.
  //
  // {
  //   key: 'we_ansicht',
  //   sourceLayer: 'we_ansicht',
  //   idField: 'id',
  //   title: 'WiE-Beschriftung (Detail)',
  //   count: 119,
  //   defaultVisible: false,
  //   qml: 'qml/v_we_ansicht.qml',
  //   parts: [{
  //     id: 'label', type: 'symbol',
  //     minzoom: 15.5, maxzoom: 19.3, // QGIS scaleMin=1000 scaleMax=3600, widened ~1 zoom
  //     layout: {
  //       'text-font': ['Open Sans Regular'],
  //       'text-size': ['interpolate', ['exponential', 2], ['zoom'], 16, 11, 18, 17, 19.5, 26],
  //       'text-allow-overlap': true, 'text-ignore-placement': false,
  //     },
  //     paint: { 'text-color': '#585858' }, // label bg #f9d6d2 dropped, no MapLibre equivalent shipped
  //   }],
  // },
];

// Sidebar display order (top -> bottom), independent of draw order above.
// 2026-09-09: the client asked for WiE - nicht-Wohngebäude - Hausnummern -
// Grundbuchblätter - Flurstücke, which is no longer a reversal of `LAYERS`
// (Hausnummern is drawn last on the map but listed above Grundbuchblätter).
// renderLegend() in js/legend.js sorts by this list; any layer key missing
// from it is appended at the end rather than silently dropped.
export const LEGEND_ORDER = ['we', 'gebaeude_ansicht', 'adressen', 'grundbuch_ansicht', 'flurstuecke'];

// 2026-09-09 (zoom-out generalization): below this zoom the five thematic
// layers are an illegible speckle over a whole Standort (e.g. Ahrensburg's
// fitted zoom is ~12.6-13.5 depending on window size - measured live via
// tools/verify.py's Chrome/CDP classes across seven viewport sizes, not
// assumed from a formula) - js/overview.js shows clickable Untergebiet/Town
// markers in that band instead. Every sub-area (Untergebiet) bookmark fits
// at >=14.8 on the same range of viewports, so 14.0 clears both clusters
// with margin on each side. buildStyleLayers() below applies this as a
// floor under every part's own minzoom (Math.max), and js/overview.js
// imports it so the marker fade-out and this cutoff can never drift apart.
export const DETAIL_MINZOOM = 14.0;

// ---- derived builders ---------------------------------------------------

/** { we: 'we_id', flurstuecke: 'id', ... } for the vector source's promoteId. */
export function buildPromoteId(layers) {
  const out = {};
  for (const cfg of layers) out[cfg.sourceLayer] = cfg.idField;
  return out;
}

/** Ordered array of MapLibre layer objects, bottom -> top: every non-symbol
 *  part in LAYERS order, then every symbol (label) part in LAYERS order, then
 *  one highlight line layer per entry that declares `highlight` (only the
 *  queryable ones do). Symbol parts are hoisted above all fills/lines as a
 *  structural rule - not just position in LAYERS - because a merged entry
 *  (grundbuch_ansicht) now carries both a line part and a label part, and the
 *  label still needs to sit above every fill regardless of where in LAYERS
 *  its parent entry lives.
 *  A part may set its own `sourceLayer` to read from a different tiled layer
 *  than its parent cfg (used by grundbuch_ansicht's merged label part, which
 *  reads the separately-tiled `flst_grundbuchblaetter` source-layer).
 *
 *  Every emitted layer's minzoom is floored at DETAIL_MINZOOM (Math.max
 *  against whatever the part itself declares, so grundbuch_ansicht's label
 *  part keeps its own higher 16) - this is what makes the five thematic
 *  layers disappear below the zoom-out threshold in favour of
 *  js/overview.js's markers. The hl-* highlight layers get the same floor:
 *  a cyan hover outline drawn on a hidden fill would be a rendering bug. */
export function buildStyleLayers(layers) {
  const out = [];
  const emit = (cfg, part) => {
    const layer = {
      id: `${cfg.key}-${part.id}`,
      type: part.type,
      source: 'nl',
      'source-layer': part.sourceLayer || cfg.sourceLayer,
      layout: { visibility: cfg.defaultVisible ? 'visible' : 'none', ...(part.layout || {}) },
      paint: part.paint,
      minzoom: Math.max(DETAIL_MINZOOM, part.minzoom ?? 0),
    };
    if (part.maxzoom != null) layer.maxzoom = part.maxzoom;
    out.push(layer);
  };
  for (const cfg of layers) {
    for (const part of cfg.parts) if (part.type !== 'symbol') emit(cfg, part);
  }
  for (const cfg of layers) {
    for (const part of cfg.parts) if (part.type === 'symbol') emit(cfg, part);
  }
  for (const cfg of layers) {
    if (!cfg.highlight) continue;
    out.push({
      id: `hl-${cfg.key}`,
      type: 'line',
      source: 'nl',
      'source-layer': cfg.sourceLayer,
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: cfg.defaultVisible ? 'visible' : 'none' },
      minzoom: DETAIL_MINZOOM,
      paint: {
        'line-color': cfg.highlight.color,
        'line-width': cfg.highlight.width,
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      },
    });
  }
  return out;
}

/** All style-layer ids belonging to one logical layer (parts + highlight),
 *  for toggling visibility together from a single checkbox. */
export function partIds(cfg) {
  const ids = cfg.parts.map((p) => `${cfg.key}-${p.id}`);
  if (cfg.highlight) ids.push(`hl-${cfg.key}`);
  return ids;
}

/** Layer ids to hit-test for hover/click, TOP -> BOTTOM. Only fill/point
 *  parts of `queryable` layers participate (never patterns, outlines, or
 *  label-only layers) - currently that means `we` alone. This single list
 *  feeds both wireHover() and wireClicks() in app.js, so popup, hover
 *  highlight and pointer cursor are all scoped by it together.
 *
 *  The `order` array is kept in full: it records the intended click priority
 *  should another layer be made queryable again (grundbuch below `we`
 *  deliberately, so its wide hit line could never steal a click). Entries
 *  without `queryable` are skipped, so it costs nothing today. */
export function hitLayerIds(layers) {
  const order = ['gebaeude_ansicht', 'we', 'grundbuch_ansicht', 'flurstuecke'];
  const byKey = Object.fromEntries(layers.map((c) => [c.key, c]));
  const ids = [];
  for (const key of order) {
    const cfg = byKey[key];
    if (!cfg || !cfg.queryable) continue;
    const hitPart = cfg.parts.find((p) => p.interactionOnly) || cfg.parts.find((p) => p.type === 'fill') || cfg.parts[0];
    ids.push(`${cfg.key}-${hitPart.id}`);
  }
  return ids;
}

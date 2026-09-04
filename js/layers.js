// Single source of truth for every rendered layer: style, legend and popup
// grouping all derive from this one array. Adding/removing a layer, or
// changing a QML-sourced value, is a one-place edit here.
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
    interactive: true,
    qml: 'qml/v_flurstuecke.qml',
    // singleSymbol, symbol alpha=0.5 -> multiplies BOTH fill and outline
    parts: [
      { id: 'fill', type: 'fill', paint: { 'fill-color': '#edd943', 'fill-opacity': 0.5 } },
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#9a9a9a', 'line-opacity': 0.5, 'line-width': W_026M },
      },
    ],
    highlight: { color: '#00e5ff', width: 3 },
    legend: [{ kind: 'fill', fill: '#edd943', fillOpacity: 0.5, stroke: '#9a9a9a', label: 'Flurstück (50% Deckkraft)' }],
  },

  {
    key: 'grundbuch_ansicht',
    sourceLayer: 'grundbuch_ansicht',
    idField: 'id',
    title: 'Grundbuchblätter',
    subtitle: 'Grundbuchbezirke / -blätter',
    count: 64,
    defaultVisible: true,
    interactive: true,
    qml: 'qml/v_grundbuch_ansicht.qml',
    // style="no" -> NO fill layer. Outline only.
    parts: [
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#838383', 'line-width': W_15M },
      },
      // Zero-opacity wide hit target: the 1.5m line is a thin, unpleasant
      // mouse target. Still returned by queryRenderedFeatures (only
      // visibility:'none' layers are excluded). Placed low in hit-test
      // order (see hitLayerIds) so it never steals a click from `we`.
      {
        id: 'hit', type: 'line', interactionOnly: true,
        paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 8 },
      },
    ],
    highlight: { color: '#00e5ff', width: 3 },
    legend: [{ kind: 'line', stroke: '#838383', label: 'Grenze (keine Füllung)' }],
  },

  {
    key: 'gebaeude_ansicht',
    sourceLayer: 'gebaeude_ansicht',
    idField: 'id',
    title: 'Gebäude',
    subtitle: 'ALKIS-Gebäude ohne SAP-Adresszuordnung',
    count: 174,
    defaultVisible: true,
    interactive: true,
    qml: 'qml/v_gebaeude_ansicht.qml',
    parts: [
      { id: 'fill', type: 'fill', paint: { 'fill-color': '#ba72b3', 'fill-opacity': 1 } },
      { id: 'stipple', type: 'fill', paint: { 'fill-pattern': 'pat-dense5-geb' } },
      {
        id: 'line', type: 'line', layout: { 'line-join': 'bevel' },
        paint: { 'line-color': '#232323', 'line-width': W_05M },
      },
    ],
    highlight: { color: '#00e5ff', width: 3 },
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
    interactive: true,
    primary: true,
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

  // ---- label-only layers: draw order puts these above every fill --------

  {
    key: 'flst_grundbuchblaetter',
    sourceLayer: 'flst_grundbuchblaetter',
    idField: 'id',
    title: 'Blattnummern',
    subtitle: 'Beschriftung der Grundbuchblätter',
    count: 64,
    defaultVisible: true,
    interactive: false, // nullSymbol, label only - no popup, no hit target
    qml: 'qml/v_flst_grundbuchblaetter.qml',
    parts: [
      {
        id: 'label', type: 'symbol',
        minzoom: 16, // QGIS scaleMax=2600 -> exact z>=16.96, widened to 16
        layout: {
          'text-field': ['concat', 'Blatt: ', ['to-string', ['get', 'grundbuch_blatt']]],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['exponential', 2], ['zoom'], 17, 10, 19, 17, 20, 24],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
        },
        paint: { 'text-color': '#626262' },
      },
    ],
    legend: [{ kind: 'label', color: '#626262', weight: 400, sample: 'Blatt: 735', meta: 'nur Beschriftung · ab Zoom 16' }],
  },

  {
    key: 'adressen',
    sourceLayer: 'adressen',
    idField: 'id',
    title: 'Adressen',
    subtitle: 'Hausnummern (ALKIS/SAP-abgeglichen)',
    count: 272,
    defaultVisible: true,
    interactive: false, // nullSymbol, label only - no popup, no hit target
    qml: 'qml/v_adressen.qml',
    parts: [
      {
        id: 'label', type: 'symbol', // no scale limit in QML (scaleVisibility=0)
        layout: {
          'text-field': ['coalesce', ['get', 'hausnummer'], ['get', 'hn_zusatz'], ''],
          'text-font': ['Open Sans Bold'],
          'text-size': ['interpolate', ['exponential', 2], ['zoom'], 15, 10, 18, 14, 20, 24],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#901e1d',
          'text-halo-color': '#fafafa',
          'text-halo-width': ['interpolate', ['exponential', 2], ['zoom'], 16, 1.2, 18, 2.2, 20, 3],
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
  //   interactive: false,
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

// ---- derived builders ---------------------------------------------------

/** { we: 'we_id', flurstuecke: 'id', ... } for the vector source's promoteId. */
export function buildPromoteId(layers) {
  const out = {};
  for (const cfg of layers) out[cfg.sourceLayer] = cfg.idField;
  return out;
}

/** Ordered array of MapLibre layer objects, bottom -> top, in LAYERS order,
 *  followed by one highlight line layer per interactive entry so hover
 *  highlights always sit above every fill regardless of layer toggles. */
export function buildStyleLayers(layers) {
  const out = [];
  for (const cfg of layers) {
    for (const part of cfg.parts) {
      const layer = {
        id: `${cfg.key}-${part.id}`,
        type: part.type,
        source: 'nl',
        'source-layer': cfg.sourceLayer,
        layout: { visibility: cfg.defaultVisible ? 'visible' : 'none', ...(part.layout || {}) },
        paint: part.paint,
      };
      if (part.minzoom != null) layer.minzoom = part.minzoom;
      if (part.maxzoom != null) layer.maxzoom = part.maxzoom;
      out.push(layer);
    }
  }
  for (const cfg of layers) {
    if (!cfg.highlight) continue;
    out.push({
      id: `hl-${cfg.key}`,
      type: 'line',
      source: 'nl',
      'source-layer': cfg.sourceLayer,
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: cfg.defaultVisible ? 'visible' : 'none' },
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
 *  parts of interactive layers participate (never patterns, outlines, or
 *  label-only layers). grundbuch's hit layer sits below `we` deliberately -
 *  see the config comment above. */
export function hitLayerIds(layers) {
  const order = ['gebaeude_ansicht', 'we', 'grundbuch_ansicht', 'flurstuecke'];
  const byKey = Object.fromEntries(layers.map((c) => [c.key, c]));
  const ids = [];
  for (const key of order) {
    const cfg = byKey[key];
    if (!cfg || !cfg.interactive) continue;
    const hitPart = cfg.parts.find((p) => p.interactionOnly) || cfg.parts.find((p) => p.type === 'fill') || cfg.parts[0];
    ids.push(`${cfg.key}-${hitPart.id}`);
  }
  return ids;
}

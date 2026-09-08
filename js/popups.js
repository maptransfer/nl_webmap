import { NA, txt, num, qm, isoDate, splitList, splitSemi, pad4, flstKennz, LABELS } from './fields.js';

// ---- generic row/group builders ------------------------------------------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Renders a list value as a <ul>, collapsing beyond 4 entries with a
 *  "+N weitere" expander. Falls back to NA on an empty list. Each item can
 *  carry a title= (e.g. the raw, undecoded Flurstückskennzeichen). */
function listValue(items, { titleFor } = {}) {
  if (!items || items.length === 0) return NA;
  const li = (v, idx) => {
    const raw = titleFor ? titleFor(v, idx) : null;
    return `<li${raw ? ` title="${esc(raw)}"` : ''}>${esc(v)}</li>`;
  };
  const visible = items.slice(0, 4);
  const rest = items.slice(4);
  const restLi = (v, i) => {
    const raw = titleFor ? titleFor(v, i + 4) : null;
    return `<li class="list-more" hidden${raw ? ` title="${esc(raw)}"` : ''}>${esc(v)}</li>`;
  };
  let html = '<ul>' + visible.map((v, i) => li(v, i)).join('') + rest.map(restLi).join('') + '</ul>';
  if (rest.length) {
    html += `<button class="list-expand" type="button" data-expand>+${rest.length} weitere</button>`;
  }
  return html;
}

function row(label, valueHtml) {
  return `<div class="popup-row"><span class="k">${esc(label)}</span><span class="val">${valueHtml}</span></div>`;
}

function group(title, rowsHtml, { open = true } = {}) {
  if (!rowsHtml.trim()) return '';
  return `<details class="popup-group"${open ? ' open' : ''}><summary>${esc(title)}</summary>${rowsHtml}</details>`;
}

// ---- the `we` popup (priority) -------------------------------------------

function weBody(p) {
  const labels = LABELS.we;
  const header = `
    <div class="popup-head">
      <p class="title">${esc(txt(p.we_bezeichnung))}</p>
      <p class="subtitle">WiE ${esc(txt(p.we_id_padded || pad4(p.we_id)))}</p>
    </div>`;

  const stat = (n, key) => `<div class="popup-stat"><span class="n">${esc(num(p[key] ?? 0))}</span><span class="lbl">${esc(n)}</span></div>`;
  const stats = `<div class="popup-stats">
      ${stat('Wohneinheiten', 'anzahl_wohneinheiten')}
      ${stat('Gewerbe', 'anzahl_gewerbe')}
      ${stat('Mietobjekte', 'anzahl_mietobjekte')}
      ${stat('Hauseingänge', 'anzahl_hauseingaenge')}
      ${stat('Adressen', 'anzahl_adressen')}
      ${stat('Flurstücke', 'anzahl_flurstuecke')}
    </div>`;

  // Mirrors the flat top section of the QGIS "Übersicht" form (mv_we.qml)
  // above its "Hauseingänge / Mietobjekte" group box - always visible, no
  // <details> wrapper. WiE / WiE Bezeichnung are the header's subtitle/title
  // above, so they aren't repeated here. Alt-Az is always rendered (– when
  // null), unlike the old conditional "Altdaten" group, since the QGIS form
  // shows it unconditionally too.
  const overviewRows =
    row(labels.az_alt_werte, esc(txt(p.az_alt_padded || p.az_alt_werte))) +
    row(labels.baujahre, listValue(splitList(p.baujahre))) +
    row(labels.jahre_modernisierung, listValue(splitList(p.jahre_modernisierung))) +
    row(labels.nutzungsarten, listValue(splitList(p.nutzungsarten))) +
    row(labels.nutzungsbezeichnungen, listValue(splitList(p.nutzungsbezeichnungen))) +
    row(labels.funktionen, listValue(splitList(p.funktionen)));

  // Mirrors the QGIS form's "Lage" group box (collapsed by default here -
  // the QGIS form has it open, but the popup is meant to lead with the
  // overview). Standort omitted: verified identical to gemeinde on all 119
  // rows, so showing it too would put the same value on screen twice; see
  // the comment on LABELS.we.standort in js/fields.js. Anz. Adressen / Anz.
  // Flurstücke also omitted here - the badge row above already covers them.
  // Each Flurstückskennzeichen entry is decoded (Flur 7 - Flurstück 5/4);
  // the raw 20-char kennzeichen stays available via title= since the decode
  // is a convenience, not the authoritative identifier.
  const flstItems = splitList(p.flstkennzeichen);
  const lageRows =
    row(labels.adressen_sap, listValue(splitList(p.adressen_sap))) +
    row(labels.adressen_alkis, listValue(splitList(p.adressen_alkis))) +
    row(labels.plz, esc(txt(p.plz))) +
    row(labels.gemeinde, esc(txt(p.gemeinde))) +
    row(labels.gemarkungen, listValue(splitList(p.gemarkungen))) +
    row(labels.flstkennzeichen, listValue(flstItems.map(flstKennz), { titleFor: (_v, idx) => flstItems[idx] }));

  return `
    ${header}
    <div class="popup-body">
      ${stats}
      ${overviewRows}
      ${group('Lage', lageRows, { open: false })}
    </div>`;
}

// ---- the three simpler, flat popups ---------------------------------------

function gebaeudeBody(p) {
  const l = LABELS.gebaeude_ansicht;
  const rows =
    row(l.funktion, esc(txt(p.funktion))) +
    row(l.nutzungsbezeichnung, esc(txt(p.nutzungsbezeichnung))) +
    row(l.lagebeztxt, listValue(splitSemi(p.lagebeztxt))) +
    row(l.alkis_oid, `<code>${esc(txt(p.alkis_oid))}</code>`) +
    row(l.aktualitaet, esc(isoDate(p.aktualitaet)));
  return `
    <div class="popup-head"><p class="title">Gebäude</p><p class="subtitle">${esc(txt(p.funktion))}</p></div>
    <div class="popup-body">${rows}</div>`;
}

function flurstueckBody(p) {
  const l = LABELS.flurstuecke;
  const rows =
    row(l.gemarkung, esc(txt(p.gemarkung))) +
    row(l.flur, esc(txt(p.flur))) +
    row(l.flstkennz, `${esc(flstKennz(p.flstkennz))}${p.flstkennz ? ` <span title="${esc(p.flstkennz)}">ⓘ</span>` : ''}`) +
    row(l.amtliche_flaeche_qm, esc(qm(p.amtliche_flaeche_qm))) +
    row(l.grundbuch_info, esc(txt(p.grundbuch_info))) +
    row(l.anzahl_we, esc(num(p.anzahl_we ?? 0))) +
    row(l.we_ids, listValue(splitList(p.we_ids))) +
    row(l.we_bezeichnungen, listValue(splitList(p.we_bezeichnungen))) +
    row(l.we_id_primaer, esc(txt(p.we_id_primaer)));
  return `
    <div class="popup-head"><p class="title">Flurstück ${esc(txt(p.flstnr))}</p><p class="subtitle">${esc(txt(p.gemarkung))}</p></div>
    <div class="popup-body">${rows}</div>`;
}

function grundbuchBody(p) {
  const l = LABELS.grundbuch_ansicht;
  const stat = (n, key) => `<div class="popup-stat"><span class="n">${esc(num(p[key] ?? 0))}</span><span class="lbl">${esc(n)}</span></div>`;
  const stats = `<div class="popup-stats">
      ${stat('WE', 'anzahl_we')}
      ${stat('Wohneinh.', 'anzahl_wohneinheiten')}
      ${stat('Gewerbe', 'anzahl_gewerbe')}
      ${stat('Mietobj.', 'anzahl_mietobjekte')}
      ${stat('Hauseing.', 'anzahl_hauseingaenge')}
      ${stat('Flurst.', 'anzahl_flurstuecke')}
    </div>`;
  const rows =
    row(l.we_ids, listValue(splitList(p.we_ids))) +
    row(l.az_alt_werte, listValue(splitList(p.az_alt_werte))) +
    row(l.baujahre, listValue(splitList(p.baujahre))) +
    row(l.jahre_modernisierung, listValue(splitList(p.jahre_modernisierung)));
  return `
    <div class="popup-head"><p class="title">Grundbuch ${esc(txt(p.grundbuch))}</p><p class="subtitle">Blatt ${esc(txt(p.grundbuch_blatt))}</p></div>
    <div class="popup-body">${stats}${rows}</div>`;
}

// Only `we` is queryable (see the header of js/layers.js), so the three other
// builders below - and their HIT_TITLES entries - are currently unreachable by
// design, not by accident. They are kept so that re-enabling a layer is the
// one `queryable` flag in js/layers.js rather than a rewritten popup, the same
// way the we_ansicht config is preserved there.
const BODY_BUILDERS = {
  we: weBody,
  gebaeude_ansicht: gebaeudeBody,
  flurstuecke: flurstueckBody,
  grundbuch_ansicht: grundbuchBody,
};

const HIT_TITLES = {
  we: (p) => txt(p.we_bezeichnung),
  gebaeude_ansicht: (p) => `Gebäude · ${txt(p.funktion)}`,
  flurstuecke: (p) => `Flurstück ${txt(p.flstnr)}`,
  grundbuch_ansicht: (p) => `Grundbuch ${txt(p.grundbuch)} Blatt ${txt(p.grundbuch_blatt)}`,
};

/** Builds full popup HTML for a stack of query hits (topmost first). Renders
 *  hits[0] in full and offers the rest as a "Weitere Objekte hier" picker
 *  that re-renders the body in place when clicked. Still reachable with only
 *  `we` queryable: a click can return more than one feature where WiE
 *  polygons overlap. */
export function buildPopupHtml(hits, activeIndex = 0) {
  const active = hits[activeIndex];
  const key = active.layer['source-layer'];
  const builder = BODY_BUILDERS[key];
  const body = builder ? builder(active.properties) : '<div class="popup-body">Keine Detailansicht.</div>';

  let more = '';
  if (hits.length > 1) {
    const others = hits
      .map((h, i) => ({ h, i }))
      .filter(({ i }) => i !== activeIndex);
    const buttons = others
      .map(({ h, i }) => {
        const k = h.layer['source-layer'];
        const label = HIT_TITLES[k] ? HIT_TITLES[k](h.properties) : k;
        return `<button type="button" data-hit-index="${i}">${esc(label)}</button>`;
      })
      .join('');
    more = `<div class="popup-more"><span>Weitere Objekte hier:</span>${buttons}</div>`;
  }

  return `<div class="popup">${body}${more}</div>`;
}

/** Wires the "+N weitere" list-expand buttons and the multi-hit picker
 *  buttons inside a popup's DOM node. Call after setDOMContent(). */
export function wirePopupInteractions(container, hits, onSwitch) {
  container.querySelectorAll('[data-expand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const list = btn.previousElementSibling; // the <ul>
      if (list) list.querySelectorAll('.list-more').forEach((li) => { li.hidden = false; });
      btn.hidden = true;
    });
  });
  container.querySelectorAll('[data-hit-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onSwitch(parseInt(btn.dataset.hitIndex, 10));
    });
  });
}

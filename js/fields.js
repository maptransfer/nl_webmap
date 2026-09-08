// German field labels plus the value formatters used by popups.js.
//
// LABELS.we is taken VERBATIM from the <aliases> block of qml/mv_we.qml
// (lines 526-550) - the same labels the client reads in the QGIS attribute
// form for demo.mv_we. Don't "improve" them here; they exist to make the web
// popup recognisable as their own form. The other six layers' QMLs really do
// carry no <alias> entries, so those blocks are hand-authored.

export const NA = '–';

/** null/undefined/'' -> NA, otherwise the value as-is. */
export function txt(v) {
  if (v === null || v === undefined || v === '') return NA;
  return String(v);
}

const NUM_FMT = new Intl.NumberFormat('de-DE');
export function num(v) {
  if (v === null || v === undefined || v === '') return NA;
  return NUM_FMT.format(v);
}
export function qm(v) {
  if (v === null || v === undefined || v === '') return NA;
  return `${NUM_FMT.format(v)} m²`;
}

/** '2025-03-20T00:00:00' -> '20.03.2025'. Plain string slicing - aktualitaet
 *  is confirmed a STRING in the tiles (verified via ogrinfo), not a date;
 *  never parse it with `new Date()`. */
export function isoDate(v) {
  if (!v || String(v).length < 10) return NA;
  const s = String(v);
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

/** Splits " | "-delimited multi-value fields. Deliberately keys ONLY on the
 *  pipe: values legitimately contain " - " (e.g. street ranges like
 *  "Friedrich-Ebert-Str. 5 - 7"), so splitting on a dash would corrupt them. */
export function splitList(v) {
  if (v === null || v === undefined || v === '') return [];
  return String(v)
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** gebaeude_ansicht.lagebeztxt uses "; " as its separator (different from
 *  the pipe used everywhere else). */
export function splitSemi(v) {
  if (v === null || v === undefined || v === '') return [];
  return String(v)
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pad4(v) {
  if (v === null || v === undefined || v === '') return NA;
  return String(v).padStart(4, '0');
}

/** ALKIS Flurstückskennzeichen, 20-char fixed layout, decoded and verified
 *  against `flur`/`flstnr` on real rows: 017209|007|00005|0004|__
 *  -> Flur 7 - Flurstück 5/4. Falls back to the raw string if the length
 *  doesn't match the expected layout. The raw value should still be shown
 *  via title= wherever this is used, since the decode is a convenience, not
 *  the authoritative identifier. */
export function flstKennz(k) {
  if (!k) return NA;
  const s = String(k);
  if (s.length < 18) return s;
  const flur = parseInt(s.slice(6, 9), 10);
  const z = parseInt(s.slice(9, 14), 10);
  const n = parseInt(s.slice(14, 18), 10);
  if (Number.isNaN(flur) || Number.isNaN(z)) return s;
  return `Flur ${flur} · Flurstück ${z}${n ? '/' + n : ''}`;
}

export const LABELS = {
  we: {
    we_id: 'WiE-Nr.',
    we_id_padded: 'WiE',
    we_bezeichnung: 'WiE Bezeichnung',
    // Kept in the dictionary though no popup row uses it: the QGIS form has
    // a Standort row, but it is byte-identical to `gemeinde` on all 119
    // rows (verified via ogrinfo), so the popup deliberately shows only
    // Gemeinde. Re-adding a Standort row is a one-liner, not a re-derivation.
    standort: 'Standort',
    gemeinde: 'Gemeinde',
    plz: 'PLZ',
    az_alt_werte: 'Alt-Az',
    az_alt_padded: 'Alt-Az',
    adressen_sap: 'SAP Adressen',
    adressen_alkis: 'ALKIS Adressen',
    funktionen: 'ALKIS Funktionen',
    nutzungsbezeichnungen: 'ALKIS Nutzungsbezeichnungen',
    nutzungsarten: 'SAP Nutzungsarten',
    baujahre: 'Baujahre',
    jahre_modernisierung: 'Modernisiert',
    // The anzahl_* labels below are unused by weBody(): the popup's badge
    // row already covers these six counts with its own short labels, so no
    // popup row repeats them as text. Kept here so re-adding one is a
    // one-liner, not a re-derivation.
    anzahl_hauseingaenge: 'Anz. Hauseingänge',
    anzahl_adressen: 'Anz. Adressen',
    anzahl_flurstuecke: 'Anz. Flurstücke',
    anzahl_wohneinheiten: 'Anz. Wohneinheiten',
    anzahl_gewerbe: 'Anz. Gewerbe',
    anzahl_mietobjekte: 'Anz. Mietobjekte',
    flstkennzeichen: 'Flst. Kennz.',
    gemarkungen: 'Gemarkung',
  },
  adressen: {
    strasse: 'Straße',
    hausnummer: 'Hausnummer',
    hn_zusatz: 'Hausnummernzusatz',
    plz: 'PLZ',
    gemeinde: 'Gemeinde',
    adresse_sap: 'Adresse (SAP)',
    match_typ: 'Zuordnungstyp',
    alkis_id: 'ALKIS-ID',
    anzahl_hauseingaenge: 'Hauseingänge',
    anzahl_we: 'Wirtschaftseinheiten',
    hat_gebaeude: 'Gebäude vorhanden',
    gebaeude_id: 'Gebäude-ID',
    gebaeude_funktion: 'Gebäudefunktion',
    gebaeude_nutzung: 'Gebäudenutzung',
    flurstueck_id: 'Flurstück-ID',
    flstkennz: 'Flurstückskennzeichen',
    gemarkung: 'Gemarkung',
    flaeche_qm: 'Fläche',
    nutzungsarten: 'Nutzungsart(en)',
    we_ids: 'WiE-Nummern',
    we_bezeichnungen: 'WiE-Bezeichnungen',
    standorte: 'Standorte',
  },
  grundbuch_ansicht: {
    grundbuch: 'Grundbuch',
    grundbuch_blatt: 'Grundbuchblatt',
    we_ids: 'WiE-Nummern',
    anzahl_we: 'Wirtschaftseinheiten',
    az_alt_werte: 'Alte Aktenzeichen',
    anzahl_hauseingaenge: 'Hauseingänge',
    anzahl_adressen: 'Adressen',
    anzahl_flurstuecke: 'Flurstücke',
    anzahl_wohneinheiten: 'Wohneinheiten',
    anzahl_gewerbe: 'Gewerbeeinheiten',
    anzahl_mietobjekte: 'Mietobjekte',
    baujahre: 'Baujahr(e)',
    jahre_modernisierung: 'Modernisierung',
  },
  gebaeude_ansicht: {
    alkis_oid: 'ALKIS-Objekt-ID',
    aktualitaet: 'Aktualität',
    nutzungsbezeichnung: 'Nutzungsbezeichnung',
    funktion: 'Funktion',
    lagebeztxt: 'Lagebezeichnung',
  },
  flst_grundbuchblaetter: {
    grundbuch: 'Grundbuch',
    grundbuch_blatt: 'Grundbuchblatt',
    gemarkung: 'Gemarkung',
    gemeinde: 'Gemeinde',
    flaeche_qm_total: 'Fläche (gesamt)',
    anzahl_flurstuecke: 'Flurstücke',
    flstkennzeichen: 'Flurstückskennzeichen',
  },
  flurstuecke: {
    flstkennz: 'Flurstückskennzeichen',
    flstnr: 'Flurstücksnummer',
    flur: 'Flur',
    gemarkung: 'Gemarkung',
    gemeinde: 'Gemeinde',
    amtliche_flaeche_qm: 'Amtliche Fläche',
    anzahl_we: 'Zugeordnete WiE',
    we_id_primaer: 'Primäre WiE',
    we_ids: 'WiE-Nummern',
    we_bezeichnungen: 'WiE-Bezeichnungen',
    standorte: 'Standorte',
    grundbuch_info: 'Grundbuch',
  },
};

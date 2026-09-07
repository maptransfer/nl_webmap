// Small string helpers shared across the sidebar-building modules
// (legend.js, app.js's area picker). No DOM/map dependencies here.

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Turns an arbitrary label (spaces, "/", ":", umlauts, ...) into a stable
// DOM-id-safe slug, e.g. "SchÃ¤ferweg" already-decoded "Schäferweg" -> "schaferweg",
// "Bad Oldesloe" -> "bad-oldesloe". Used for aria-controls targets in the
// ServiceCenter/Standort/Untergebiet tree, where raw names aren't safe ids.
const UMLAUT_MAP = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' };
export function slug(s) {
  return String(s)
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUT_MAP[c])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

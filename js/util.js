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

// Stable DOM ids for the Standort/Untergebiet sidebar buttons, shared between
// app.js (which renders them) and overview.js (which points a map marker
// click at one via document.getElementById(...).click() - see PROGRESS.md,
// zoom-out generalization). One helper each so the two call sites can't
// drift apart. Built from the RAW bookmark name (bookmarks.js's "AH: "/"RZ: "
// prefix included), not the display name stripTownPrefix() produces, so the
// id is stable even if that display rule ever changes.
export function navTownId(townName) {
  return `nav-town-${slug(townName)}`;
}
export function navUgId(townName, subAreaRawName) {
  return `nav-ug-${slug(townName)}-${slug(subAreaRawName)}`;
}

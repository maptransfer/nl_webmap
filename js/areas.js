// Client org structure: ServiceCenter -> Standort -> Untergebiet.
// Hand-written from servicecenter_structure.json (the client's full
// portfolio) - NOT generated, unlike bookmarks.js. Standort names, spelling
// and order follow that JSON verbatim.
//
// `town` on a Standort is the entire "is this imported" mechanism: present,
// it names a TOWNS[].name entry in bookmarks.js and the sidebar resolves that
// Standort's bounds/weCount/subAreas from there; absent, the Standort has no
// map data yet and renders as an inert grey chip. Importing a new area is
// then: add its bookmark to bookmarks/ahrensburg_ratzeburg.xml, re-run
// tools/bookmarks_to_js.py, and add `town: '<Name>'` to the matching Standort
// here - no separate "hasData" flag to keep in sync.
//
// Untergebiete are NOT restated here - they come only from bookmarks.js's
// TOWNS[].subAreas (Ahrensburg's 7 and Ratzeburg's 4 match this structure's
// Untergebiete 1:1, in order, once the "AH: "/"RZ: " prefix baked into the
// bookmark names is stripped via stripTownPrefix()). A Standort with no
// bookmark cannot show Untergebiete - there is no such case today.

export const SERVICE_CENTERS = [
  {
    name: 'ServiceCenter Ahrensburg',
    standorte: [
      { name: 'Bad Segeberg' },
      { name: 'Reinfeld' },
      { name: 'Bad Oldesloe' },
      { name: 'Bargteheide' },
      { name: 'Ahrensburg', town: 'Ahrensburg' },
      { name: 'Trittau' },
      { name: 'Großhansdorf' },
      { name: 'Glinde' },
    ],
  },
  {
    name: 'ServiceCenter Elmshorn',
    standorte: [
      { name: 'Neumünster' },
      { name: 'Barmstedt' },
      { name: 'Kaltenkirchen' },
      { name: 'Tangstedt' },
      { name: 'Norderstedt' },
      { name: 'Elmshorn' },
      { name: 'Hamburg' },
    ],
  },
  {
    name: 'ServiceCenter Lübeck',
    standorte: [
      { name: 'Eutin' },
      { name: 'Neustadt' },
      { name: 'Scharbeutz' },
      { name: 'Bad Schwartau' },
      { name: 'Lübeck und Travemünde' },
      { name: 'Groß Grönau' },
      { name: 'Ratzeburg', town: 'Ratzeburg' },
    ],
  },
  {
    name: 'ServiceCenter Schwerin',
    standorte: [
      { name: 'Wentorf' },
      { name: 'Börnsen' },
      { name: 'Schwarzenbek' },
      { name: 'Geesthacht' },
      { name: 'Lauenburg' },
      { name: 'Büchen' },
      { name: 'Boltenhagen' },
      { name: 'Grevesmühlen' },
      { name: 'Wittenburg' },
      { name: 'Hagenow' },
      { name: 'Lübstorf' },
      { name: 'Schwerin' },
      { name: 'Crivitz' },
      { name: 'Warin' },
    ],
  },
];

// Opening view: the first Untergebiet of Standort Ahrensburg (Schäferweg),
// resolved against TOWNS[].subAreas[0] in bookmarks.js.
export const DEFAULT_VIEW = { town: 'Ahrensburg', subAreaIndex: 0 };

// Bookmark sub-area names carry a hardcoded "AH: " / "RZ: " prefix from the
// QGIS export project grouping - redundant now that the ServiceCenter tree
// supplies that context, so strip it for display.
export function stripTownPrefix(name) {
  return name.replace(/^(AH|RZ):\s*/, '');
}

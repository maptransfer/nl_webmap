# Deployment

**This describes the setup that is live**, not options under consideration.
Every fact below was checked against the running site on 2026-09-07 (the
`curl` commands are in "Verifying a deploy").

## Where it lives

| | |
|---|---|
| **Live URL** | <https://maptransfer.github.io/nl_webmap/> |
| Host | GitHub Pages |
| Repository | `maptransfer/nl_webmap` — **public** |
| Publish source | "Deploy from a branch": `master`, folder `/` (repo root) |
| Build | GitHub's legacy branch build. **No** Actions workflow, no build step |
| HTTPS | Enforced by GitHub Pages |
| Custom domain | None — the `github.io` project URL is the address |

Because it is a *project* site, the app is served from the `/nl_webmap/`
subpath, not a domain root.

## How a deploy happens

```
git push origin master
```

That is the whole process. GitHub Pages rebuilds from `master` automatically
and the change is live within about a minute. There is nothing to compile,
bundle or upload: `index.html`, `css/`, `js/` and `vendor/` are plain files
served as-is, and `data/neue-luebecker.pmtiles` is served straight off disk.

No deploy keys, no CI secrets, no artifact step — which also means there is
no gate between a push and the public site. Verify locally with `serve.bat`
before pushing (see `README.md`).

## What is published — and what isn't

The site is the **repo root**, so everything tracked in git is reachable
over HTTP, not just the five things the browser needs:

| Path | Live? | Note |
|---|---|---|
| `index.html`, `css/`, `js/`, `vendor/` | yes | what the app actually loads |
| `data/neue-luebecker.pmtiles` | yes | 1.74 MB, the map data |
| `qml/`, `bookmarks/`, `tools/` | yes | provenance/source files; harmless but public |
| `*.md` (`README`, `CLAUDE`, `PROGRESS`, this file) | yes | public |
| `scripts/` | **no** | gitignored — contains a plaintext DB password |
| `data/*.fgb` | **no** | gitignored — regenerable pre-tiling exports |

`scripts/` staying out is the one that matters: it was never committed, so
it is absent from the deployed site *and* from git history (verified:
`scripts/export_pgis_layers.bat` returns 404 live). Keep it that way — do
not remove it from `.gitignore`.

## The two requirements this host satisfies

1. **HTTP range requests.** PMTiles fetches byte ranges out of the single
   `.pmtiles` file rather than downloading it whole. GitHub Pages honours
   `Range` correctly — a `bytes=0-15` request returns `206 Partial Content`
   with `Content-Range: bytes 0-15/1823852`. This is the same requirement
   that makes Python's built-in `http.server` unusable locally.
2. **Relative asset paths.** Every path in `index.html` and `js/app.js` is
   relative, so serving from the `/nl_webmap/` subpath works unchanged. The
   PMTiles URL is resolved against `document.baseURI` in `js/app.js` for the
   same reason. **Never introduce a leading-`/` path** — it would resolve to
   `maptransfer.github.io/...` and 404 in production while still working on
   a local server rooted at `/`.

## Caching and data updates

GitHub Pages serves these files with `Cache-Control: max-age=600`, so a
push is picked up by browsers within ~10 minutes. No cache-busting or
filename hashing is needed, and none is in place.

To publish refreshed data:

1. Re-run the export pipeline in `scripts/` (needs DB access — see
   `CLAUDE.md`, "Data pipeline").
2. Replace `data/neue-luebecker.pmtiles`.
3. Commit and push.

The frontend needs no change; layer names and fields are unchanged by a
re-export. Note that the `we` layer comes from the `mv_we` materialized
view, which can be stale in the database itself before any export happens.

## Verifying a deploy

```bash
# 1. page is up
curl -sI https://maptransfer.github.io/nl_webmap/ | head -1

# 2. range requests work (the one thing PMTiles cannot do without)
curl -sD - -o /dev/null -H "Range: bytes=0-15" \
  https://maptransfer.github.io/nl_webmap/data/neue-luebecker.pmtiles \
  | grep -iE "^(HTTP|Content-Range)"
# expect: 206 Partial Content  /  Content-Range: bytes 0-15/1823852

# 3. vendored libraries are served (see the Jekyll note below)
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" \
  https://maptransfer.github.io/nl_webmap/vendor/maplibre-gl.js
# expect: 200 1056837
```

A green result on all three means the deploy is sound; the map itself then
only depends on code that was already verified locally.

## Accepted deviations and open items

- **The dataset is world-readable, by design.** The repo is public, so
  `data/neue-luebecker.pmtiles` (119 Wirtschaftseinheiten, 272 address
  points, Grundbuch/Flurstück records) can be downloaded directly, not only
  browsed through the map UI. This is intended for this deployment. If that
  ever changes, the fix is a different host or an auth proxy in front of the
  site — not an app change, since the app has no authentication of its own
  and would not need any.
- **The basemap still points at `tile.openstreetmap.org`** (in `js/app.js`).
  OSM's tile usage policy does not cover production traffic; this is an
  accepted deviation at the current low traffic level, not an oversight. The
  fix, when it matters, is the one `tiles:` URL in `js/app.js` pointing at a
  paid or self-hosted provider. OSM attribution is already rendered on the
  map and is required regardless of provider.
- **No `.nojekyll` file.** GitHub's legacy build runs the content through
  Jekyll, whose defaults exclude a `vendor/` directory — which is exactly
  where MapLibre, pmtiles and the glyph PBFs live. In practice this repo is
  served correctly (check 3 above returns the expected 1,056,837 bytes), so
  nothing is broken today. Adding an empty `.nojekyll` at the root would
  remove the dependency on that behaviour, and is worth doing if anything
  underscore-prefixed or a `_config.yml` is ever added.
- **No CI smoke test.** Nothing checks the live site after a push; the three
  `curl` commands above are the manual substitute. There is no automated
  test suite in the project at all (see `PROGRESS.md`).

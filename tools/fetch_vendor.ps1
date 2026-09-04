<#
  Vendors MapLibre GL JS, the pmtiles plugin, and Open Sans glyph PBFs into vendor/.
  No npm/Node involved - plain HTTP downloads. Idempotent: safe to re-run.

  Pinned versions:
    maplibre-gl 5.24.0  - last release whose dist/ still ships a UMD bundle
                          (maplibre-gl.js). 6.x dropped it for ESM-only chunks.
    pmtiles     4.5.0   - current latest, dist/pmtiles.js UMD, global `pmtiles`.
    openmaptiles/fonts v2.0 - glyph PBFs for Open Sans Regular + Bold.

  Usage:  powershell -File tools\fetch_vendor.ps1
#>
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$v    = Join-Path $root 'vendor'

New-Item -ItemType Directory -Force -Path $v | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $v 'glyphs') | Out-Null

$files = @(
  @{ u = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js';  o = "$v\maplibre-gl.js";  min = 900000 },
  @{ u = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css'; o = "$v\maplibre-gl.css"; min = 15000  },
  @{ u = 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js';           o = "$v\pmtiles.js";      min = 15000  }
)
foreach ($f in $files) {
  Write-Host ("Fetching {0} ..." -f $f.u)
  Invoke-WebRequest -Uri $f.u -OutFile $f.o -UseBasicParsing
  $len = (Get-Item $f.o).Length
  if ($len -lt $f.min) { throw "$($f.o) is only $len bytes - download looks wrong (expected >= $($f.min))" }
  Write-Host ("  OK  {0}  {1:N0} bytes" -f (Split-Path $f.o -Leaf), $len)
}

# --- glyphs: Open Sans Regular + Bold, Latin ranges only (0-255, 256-511 covers
#     ASCII + Latin-1 Supplement + Latin Extended-A, which is everything the
#     German data needs, incl. ae/oe/ue umlauts and Eszett) ---
$zip = Join-Path $env:TEMP 'omt-fonts-v2.0.zip'
$ext = Join-Path $env:TEMP 'omt-fonts-v2.0'

Write-Host 'Fetching openmaptiles/fonts v2.0 ...'
Invoke-WebRequest -Uri 'https://github.com/openmaptiles/fonts/releases/download/v2.0/v2.0.zip' -OutFile $zip -UseBasicParsing

if (Test-Path $ext) { Remove-Item -Recurse -Force $ext }
Expand-Archive -Path $zip -DestinationPath $ext

Write-Host 'Fontstack directories found in release archive:'
Get-ChildItem -Path $ext -Directory -Recurse -Filter 'Open Sans *' | ForEach-Object { Write-Host "  $($_.FullName)" }

foreach ($stack in 'Open Sans Regular', 'Open Sans Bold') {
  $src = Get-ChildItem -Path $ext -Directory -Recurse -Filter $stack | Select-Object -First 1
  if (-not $src) { throw "Fontstack '$stack' not found in the release zip - inspect $ext manually" }
  $dst = Join-Path $v "glyphs\$stack"
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  foreach ($r in '0-255.pbf', '256-511.pbf') {
    $srcFile = Join-Path $src.FullName $r
    if (-not (Test-Path $srcFile)) { throw "$srcFile missing from release" }
    Copy-Item $srcFile (Join-Path $dst $r) -Force
  }
  Write-Host ("  OK  glyphs '{0}'" -f $stack)
}

Write-Host ''
Write-Host 'Vendoring complete.'
Write-Host '  maplibre-gl 5.24.0, pmtiles 4.5.0, openmaptiles/fonts v2.0 (Open Sans Regular + Bold)'

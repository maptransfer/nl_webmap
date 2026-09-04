// Canvas-generated fill patterns, standing in for two QGIS brush styles that
// have no MapLibre equivalent:
//   - Qt::FDiagPattern ("f_diagonal" in the QML) - forward diagonal hairlines
//   - Qt::Dense5Pattern ("dense5" in the QML)     - a 37.5%-coverage stipple
//
// Both are generated once at a fixed 8x8 logical size and registered with
// map.addImage() for use as `fill-pattern`. The SAME functions build the
// legend swatches (via toDataURL), so the legend can never drift from the map.
//
// Generation is manual pixel replication, never canvas drawImage/scale -
// smoothing would blur the hairlines into a soft gray wash.

const TILE = 8;

/**
 * @param {number} size logical CSS pixel size (always 8 here)
 * @param {(x:number,y:number)=>boolean} isInk true = paint this pixel
 * @param {string} rgb CSS color for ink pixels, e.g. '#ff326b'
 * @param {number} pixelRatio device pixel multiplier for crispness
 * @returns {{ imageData: {width:number,height:number,data:Uint8ClampedArray}, pixelRatio:number, dataURL:string }}
 */
function makeTile(size, isInk, rgb, pixelRatio) {
  const [r, g, b] = hexToRgb(rgb);
  const px = size * pixelRatio;

  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const lx = Math.floor(x / pixelRatio);
      const ly = Math.floor(y / pixelRatio);
      const idx = (y * px + x) * 4;
      if (isInk(lx, ly)) {
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      } else {
        img.data[idx + 3] = 0; // transparent
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    imageData: { width: px, height: px, data: new Uint8Array(img.data.buffer.slice(0)) },
    pixelRatio,
    dataURL: canvas.toDataURL('image/png'),
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Qt::FDiagPattern: "/" diagonal lines, 1px wide, 4px period.
// pixel set  <=>  (x + y) % 4 === 3
function fdiagInk(x, y) {
  return ((x + y) % 4) === 3;
}

// Qt::Dense5Pattern: 4-row repeating bitmask, 37.5% coverage (sparser than
// Dense4's 50% checkerboard). Row bits read MSB-first, 8 px wide.
const DENSE5_ROWS = [0xAA, 0x44, 0xAA, 0x11];
function dense5Ink(x, y) {
  const row = DENSE5_ROWS[y % 4];
  return ((row >> (7 - (x % 8))) & 1) === 1;
}

/**
 * Build both registered map patterns plus matching legend swatch data URLs.
 * @param {number} pixelRatio typically Math.min(2, window.devicePixelRatio || 1)
 */
export function buildPatterns(pixelRatio) {
  const fdiagWe = makeTile(TILE, fdiagInk, '#ff326b', pixelRatio);
  const dense5Geb = makeTile(TILE, dense5Ink, '#000000', pixelRatio);
  return {
    'pat-fdiag-we': fdiagWe,
    'pat-dense5-geb': dense5Geb,
  };
}

/**
 * Register every pattern image with the map. MUST run before any layer that
 * references the pattern via fill-pattern is added, or MapLibre logs
 * "Image '...' could not be loaded" and the fill silently renders empty.
 */
export function registerPatterns(map, patterns) {
  for (const [name, tile] of Object.entries(patterns)) {
    if (map.hasImage(name)) continue;
    map.addImage(name, tile.imageData, { pixelRatio: tile.pixelRatio });
  }
}

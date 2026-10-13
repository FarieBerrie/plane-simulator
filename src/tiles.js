// Elevation-tile math for Terrarium PNG tiles (the open AWS Terrain Tiles dataset). Pure
// functions with no Cesium or DOM, so they run under node --test as well as in the browser.

export const TILE_SIZE = 256;

/** Terrarium RGBA pixels → heights in metres. Ocean depths are clamped to sea level so seas stay flat. */
export function decodeTerrarium(rgba, out = new Float32Array(rgba.length / 4)) {
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const h = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
    out[i] = h > 0 ? h : 0;
  }
  return out;
}

/** Bilinear sample of a size×size grid at pixel coordinates (pixel centres sit at k + 0.5). */
export function sampleGrid(grid, size, px, py) {
  const x = Math.min(size - 1, Math.max(0, px - 0.5));
  const y = Math.min(size - 1, Math.max(0, py - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = grid[y0 * size + x0] * (1 - fx) + grid[y0 * size + x1] * fx;
  const bottom = grid[y1 * size + x0] * (1 - fx) + grid[y1 * size + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Tiles deeper than `maxLevel` are cut from their ancestor at `maxLevel`. Returns that source
 * tile and the window (in its pixels) that tile (x, y, level) covers.
 */
export function sourceWindow(x, y, level, maxLevel) {
  const sourceLevel = Math.min(level, maxLevel);
  const shift = level - sourceLevel;
  const perSource = 2 ** shift;
  const size = TILE_SIZE / perSource;
  return {
    level: sourceLevel,
    x: Math.floor(x / perSource),
    y: Math.floor(y / perSource),
    offX: (x % perSource) * size,
    offY: (y % perSource) * size,
    size,
  };
}

/** Heights for a width×width heightmap spanning `win` of a decoded tile, edge to edge, north row first. */
export function resampleTile(grid, win, width) {
  const out = new Float32Array(width * width);
  const step = win.size / (width - 1);
  for (let j = 0; j < width; j++) {
    for (let i = 0; i < width; i++) {
      out[j * width + i] = sampleGrid(grid, TILE_SIZE, win.offX + i * step, win.offY + j * step);
    }
  }
  return out;
}

/** The Web Mercator tile containing a point, and the point's pixel position inside it. */
export function lonLatToTilePixel(lonDeg, latDeg, level) {
  const n = 2 ** level;
  const lat = (latDeg * Math.PI) / 180;
  const fx = ((lonDeg + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: (fx - x) * TILE_SIZE, py: (fy - y) * TILE_SIZE };
}

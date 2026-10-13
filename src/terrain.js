// Feeds Cesium real elevation from the open AWS Terrain Tiles (Terrarium PNGs, no API key).
import { Credit, CustomHeightmapTerrainProvider, WebMercatorTilingScheme } from 'cesium';
import { decodeTerrarium, lonLatToTilePixel, resampleTile, sampleGrid, sourceWindow, TILE_SIZE } from './tiles.js';

const tileUrl = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const MAX_LEVEL = 14; // ~10 m pixels; deeper tiles are cut from these
const HEIGHTMAP_SIZE = 65;
const MAX_IN_FLIGHT = 16;
const CACHE_SIZE = 400; // decoded tiles kept, most recently used last

const cache = new Map();
let inFlight = 0;

async function fetchGrid(z, x, y) {
  const res = await fetch(tileUrl(z, x, y));
  if (!res.ok) throw new Error(`terrain tile ${z}/${x}/${y}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return decodeTerrarium(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
}

function loadGrid(z, x, y) {
  const key = `${z}/${x}/${y}`;
  let grid = cache.get(key);
  if (grid) {
    cache.delete(key);
  } else {
    inFlight++;
    grid = fetchGrid(z, x, y).finally(() => inFlight--);
    grid.catch(() => cache.delete(key));
  }
  cache.set(key, grid);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return grid;
}

export function createTerrainProvider() {
  const flat = new Float32Array(HEIGHTMAP_SIZE * HEIGHTMAP_SIZE);
  return new CustomHeightmapTerrainProvider({
    width: HEIGHTMAP_SIZE,
    height: HEIGHTMAP_SIZE,
    tilingScheme: new WebMercatorTilingScheme(),
    credit: new Credit('Elevation: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">AWS Terrain Tiles</a> (SRTM, USGS, ETOPO1 and others)', true),
    callback(x, y, level) {
      const win = sourceWindow(x, y, level, MAX_LEVEL);
      // undefined tells Cesium to retry later, which keeps a fast flight from queueing hundreds of downloads.
      if (inFlight >= MAX_IN_FLIGHT && !cache.has(`${win.level}/${win.x}/${win.y}`)) return undefined;
      return loadGrid(win.level, win.x, win.y).then(
        (grid) => resampleTile(grid, win, HEIGHTMAP_SIZE),
        () => flat,
      );
    },
  });
}

/** Terrain height in metres at a point, read straight from the elevation tiles. */
export async function groundHeightAt(lonDeg, latDeg, level = 13) {
  const t = lonLatToTilePixel(lonDeg, latDeg, level);
  return sampleGrid(await loadGrid(level, t.x, t.y), TILE_SIZE, t.px, t.py);
}

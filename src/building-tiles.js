// Building footprints from OpenStreetMap vector tiles, turned into lon/lat rings with heights.
// Pure functions, no Cesium or DOM, so they run under node --test.

/**
 * Clips a ring of tile points ({x, y}) to the tile square [0, extent]. Vector tiles carry a
 * buffer past their edges, so without this a building on a tile border would be drawn twice.
 */
export function clipRing(ring, extent) {
  const edges = [
    (p) => p.x >= 0,
    (p) => p.x <= extent,
    (p) => p.y >= 0,
    (p) => p.y <= extent,
  ];
  const cut = [
    (a, b) => at(a, b, (0 - a.x) / (b.x - a.x)),
    (a, b) => at(a, b, (extent - a.x) / (b.x - a.x)),
    (a, b) => at(a, b, (0 - a.y) / (b.y - a.y)),
    (a, b) => at(a, b, (extent - a.y) / (b.y - a.y)),
  ];
  let out = ring[0] && ring[0].x === ring.at(-1).x && ring[0].y === ring.at(-1).y ? ring.slice(0, -1) : ring;
  for (let e = 0; e < 4 && out.length; e++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = edges[e](cur);
      const prevIn = edges[e](prev);
      if (curIn) {
        if (!prevIn) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(cut[e](prev, cur));
      }
    }
  }
  return out.length >= 3 ? out : [];
}

const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Tile pixel → [lon, lat] in degrees for tile (x, y, z) with the given extent. */
export function tilePointToLonLat(p, x, y, z, extent) {
  const n = 2 ** z;
  const lon = ((x + p.x / extent) / n) * 360 - 180;
  const merc = Math.PI * (1 - (2 * (y + p.y / extent)) / n);
  const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
  return [lon, lat];
}

/** Even-odd test: is [lon, lat] inside a ring of [lon, lat] points? */
export function pointInRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Bounding box [minLon, minLat, maxLon, maxLat] of a ring. */
export function ringBounds(ring) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of ring) {
    b[0] = Math.min(b[0], lon);
    b[1] = Math.min(b[1], lat);
    b[2] = Math.max(b[2], lon);
    b[3] = Math.max(b[3], lat);
  }
  return b;
}

const WALLS = ['#d9d4c7', '#cfc8b8', '#c2bcae', '#b9b2a3', '#e0dccf', '#c9b8a2', '#b8a58e', '#a99f93'];
const TOWERS = ['#8f9aa6', '#7f8c99', '#9aa6b1', '#b7bec5', '#6f7d8b'];

/** A stable, plausible colour for a building: masonry tones, glassy greys for towers. */
export function buildingColor(seed, height) {
  const palette = height > 40 ? TOWERS : WALLS;
  const h = Math.abs(Math.imul(seed | 0, 2654435761)) >>> 0;
  return palette[h % palette.length];
}

/**
 * Turns the polygons of one building feature (as from classifyRings: arrays of rings, outer
 * first, in tile points) into clipped lon/lat polygons. Returns [{ outer, holes }].
 */
export function featurePolygons(polygons, x, y, z, extent) {
  const out = [];
  for (const rings of polygons) {
    const outer = clipRing(rings[0], extent);
    if (!outer.length) continue;
    const toLonLat = (ring) => ring.map((p) => tilePointToLonLat(p, x, y, z, extent));
    const holes = rings
      .slice(1)
      .map((r) => clipRing(r, extent))
      .filter((r) => r.length)
      .map(toLonLat);
    out.push({ outer: toLonLat(outer), holes });
  }
  return out;
}

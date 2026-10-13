// Turns a tile's buildings into one mesh for the textured-building shader: walls carry texture
// coordinates in metres (along the wall, up from the ground) so windows come out the same size on
// every building, and a facade code picks the window pattern. Pure math, no Cesium.
import earcut from 'earcut';

export const FACADE = { roof: 0, windows: 1, glass: 2, house: 3 };

const WGS84_A = 6378137;
const WGS84_E2 = 6.69437999014e-3;
const DEG = Math.PI / 180;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/** Which window pattern suits a building of this height. */
export function facadeFor(height) {
  if (height > 40) return FACADE.glass;
  if (height <= 8) return FACADE.house;
  return FACADE.windows;
}

/** Geodetic degrees + metres → Earth-centred (ECEF) metres. */
export function toEcef(lonDeg, latDeg, h) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const s = Math.sin(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
  return [(n + h) * Math.cos(lat) * Math.cos(lon), (n + h) * Math.cos(lat) * Math.sin(lon), (n * (1 - WGS84_E2) + h) * s];
}

/** East, north and up unit vectors at a point, in ECEF. */
function enu(lonDeg, latDeg) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  return {
    east: [-Math.sin(lon), Math.cos(lon), 0],
    north: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
    up: [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)],
  };
}

const signedArea = (pts) => pts.reduce((sum, [x, y], i) => {
  const [nx, ny] = pts[(i + 1) % pts.length];
  return sum + x * ny - nx * y;
}, 0) / 2;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * buildings: [{ outer, holes, base, ground, top, color, facade }] with rings of [lon, lat].
 * Returns typed arrays ready for a Cesium Geometry: positions (ECEF, float64), normals, st,
 * colors (RGBA bytes), facades (one float per vertex) and indices.
 */
export function buildTileMesh(buildings) {
  const positions = [];
  const normals = [];
  const st = [];
  const colors = [];
  const facades = [];
  const indices = [];

  for (const b of buildings) {
    if (b.top - b.base < 0.5) continue;
    const [lon0, lat0] = b.outer[0];
    const kx = M_PER_DEG_LON * Math.cos(lat0 * DEG);
    const local = (ring) => ring.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * M_PER_DEG_LAT]);
    const frame = enu(lon0, lat0);
    const rgb = hexToRgb(b.color);
    const toWorldDir = ([x, y, z]) => [0, 1, 2].map((k) => frame.east[k] * x + frame.north[k] * y + frame.up[k] * z);

    // Outer ring anticlockwise and holes clockwise (seen from above), so "right of the edge" is
    // always out of the building.
    let outer = b.outer;
    if (signedArea(local(outer)) < 0) outer = [...outer].reverse();
    const holes = b.holes.map((h) => (signedArea(local(h)) > 0 ? [...h].reverse() : h));

    const vertex = (lon, lat, h, normal, s, t, facade) => {
      positions.push(...toEcef(lon, lat, h));
      normals.push(...normal);
      st.push(s, t);
      colors.push(...rgb, 255);
      facades.push(facade);
      return positions.length / 3 - 1;
    };

    // Walls: one quad per edge, with their own vertices so edges stay sharp.
    for (const ring of [outer, ...holes]) {
      const xy = local(ring);
      let along = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        const dx = xy[j][0] - xy[i][0];
        const dy = xy[j][1] - xy[i][1];
        const len = Math.hypot(dx, dy);
        if (len < 0.05) continue;
        const normal = toWorldDir([dy / len, -dx / len, 0]);
        const t0 = b.base - b.ground;
        const t1 = b.top - b.ground;
        const a = vertex(...ring[i], b.base, normal, along, t0, b.facade);
        const c = vertex(...ring[j], b.base, normal, along + len, t0, b.facade);
        const d = vertex(...ring[j], b.top, normal, along + len, t1, b.facade);
        const e = vertex(...ring[i], b.top, normal, along, t1, b.facade);
        indices.push(a, c, d, a, d, e);
        along += len;
      }
    }

    // Roof, and an underside for parts that start above the ground (overhangs, skybridges).
    const rings = [outer, ...holes];
    const flat = rings.flatMap(local).flat();
    const holeStarts = [];
    let count = outer.length;
    for (const h of holes) {
      holeStarts.push(count);
      count += h.length;
    }
    const tris = earcut(flat, holeStarts);
    const all = rings.flat();
    const up = frame.up;
    const down = up.map((v) => -v);
    const caps = [[b.top, up, false]];
    if (b.base > b.ground + 0.5) caps.push([b.base, down, true]);
    for (const [h, normal, flip] of caps) {
      const first = positions.length / 3;
      all.forEach(([lon, lat], i) => vertex(lon, lat, h, normal, flat[2 * i], flat[2 * i + 1], FACADE.roof));
      for (let i = 0; i < tris.length; i += 3) {
        let [p, q, r] = [tris[i], tris[i + 1], tris[i + 2]];
        const area = (flat[2 * q] - flat[2 * p]) * (flat[2 * r + 1] - flat[2 * p + 1]) - (flat[2 * r] - flat[2 * p]) * (flat[2 * q + 1] - flat[2 * p + 1]);
        if ((area < 0) !== flip) [q, r] = [r, q]; // anticlockwise seen from the side the face points to
        indices.push(first + p, first + q, first + r);
      }
    }
  }

  return {
    positions: Float64Array.from(positions),
    normals: Float32Array.from(normals),
    st: Float32Array.from(st),
    colors: Uint8Array.from(colors),
    facades: Float32Array.from(facades),
    indices: Uint32Array.from(indices),
  };
}

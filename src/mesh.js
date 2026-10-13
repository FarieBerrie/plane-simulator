// Triangle meshes built by lofting a skin through closed cross-section rings. Pure math, no
// Cesium, so it runs under node --test; aircraft.js turns the meshes into Cesium geometry.
// Points are [x, y, z] arrays in metres.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => scale(a, 1 / (length(a) || 1));
const centroid = (pts) => scale(pts.reduce(add, [0, 0, 0]), 1 / pts.length);

/**
 * A closed ring of n points around `center` in the plane spanned by unit axes u and v, with
 * half-sizes a (along u) and b (along v). power > 2 squares the shape off (a superellipse).
 */
export function ring(center, u, v, a, b, n, power = 2) {
  const e = 2 / power;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const cu = Math.sign(c) * Math.abs(c) ** e * a;
    const sv = Math.sign(s) * Math.abs(s) ** e * b;
    pts.push(add(center, add(scale(u, cu), scale(v, sv))));
  }
  return pts;
}

/**
 * A symmetric NACA 00xx airfoil outline as [chordwise 0..1, thickness] pairs: 2k points,
 * round leading edge at 0, sharp trailing edge at 1.
 */
export function airfoil(thickness, k = 10) {
  const half = (x) =>
    5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const xs = [];
  for (let i = 0; i <= k; i++) xs.push((1 - Math.cos((i / k) * Math.PI)) / 2); // bunched at both edges
  const upper = xs.slice(1).reverse().map((x) => [x, half(x)]); // trailing edge → just behind the nose
  const lower = xs.slice(0, -1).map((x) => [x, -half(x)]); // nose → just before the tail
  return [...upper, ...lower];
}

/**
 * Places an airfoil section in space: the chord runs from `leadingEdge` towards -X (aft) for
 * `chord` metres, and thickness runs along `thicknessAxis`.
 */
export function airfoilRing(outline, leadingEdge, chord, thicknessAxis) {
  return outline.map(([x, t]) => add(add(leadingEdge, [-x * chord, 0, 0]), scale(thicknessAxis, t * chord)));
}

/** A closed cylinder from `from` to `to`. */
export function cylinder(from, to, radius, n = 14) {
  const axis = normalize(sub(to, from));
  const helper = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(axis, helper));
  const v = cross(axis, u);
  return loft([ring(from, u, v, radius, radius, n), ring(to, u, v, radius, radius, n)]);
}

/**
 * Skins a closed mesh through rings of equal point count, capping both ends. Triangles are
 * wound so faces point outwards; normals are smooth along the skin and flat on the caps.
 * Returns { positions: Float64Array, normals: Float32Array, indices: Uint16Array|Uint32Array }.
 */
export function loft(rings) {
  const n = rings[0].length;
  const points = rings.flat();
  const tris = [];

  const side = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i;
      const d = (r + 1) * n + ((i + 1) % n);
      side.push([a, b, d], [a, d, c]);
    }
  }
  // Every ring runs the same way round, so one test of the outward direction covers the whole skin.
  const outward = side.reduce((sum, [a, b, c]) => {
    const middle = centroid(rings[Math.floor(a / n)]);
    return sum + dot(cross(sub(points[b], points[a]), sub(points[c], points[a])), sub(points[a], middle));
  }, 0);
  for (const t of side) tris.push(outward >= 0 ? t : [t[0], t[2], t[1]]);

  // Caps get their own vertices so their normals stay flat.
  const cap = (capRing, neighbour) => {
    const base = points.length;
    const middle = centroid(capRing);
    points.push(middle, ...capRing);
    const away = sub(middle, centroid(neighbour));
    const first = cross(sub(capRing[0], middle), sub(capRing[1], middle));
    const flip = dot(first, away) < 0;
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      tris.push(flip ? [base, b, a] : [base, a, b]);
    }
  };
  cap(rings[0], rings[1]);
  cap(rings[rings.length - 1], rings[rings.length - 2]);

  const normals = points.map(() => [0, 0, 0]);
  for (const [a, b, c] of tris) {
    const face = cross(sub(points[b], points[a]), sub(points[c], points[a])); // area-weighted
    for (const i of [a, b, c]) normals[i] = add(normals[i], face);
  }
  const middle = centroid(points);
  const unit = normals.map((nrm, i) => (length(nrm) > 1e-12 ? normalize(nrm) : normalize(sub(points[i], middle))));

  const Index = points.length > 65535 ? Uint32Array : Uint16Array;
  return {
    positions: Float64Array.from(points.flat()),
    normals: Float32Array.from(unit.flat()),
    indices: Index.from(tris.flat()),
  };
}

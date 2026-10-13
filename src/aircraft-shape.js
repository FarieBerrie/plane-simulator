// The aircraft's shape: a low-wing, single-engine sport plane about 9.6 m long with a 9.2 m span.
// Body axes: +X forward, +Y left, +Z up, origin near the centre of gravity, wheels touching down
// at z = -1.5 (the flight model's gearHeight). Pure data, no Cesium.
import { airfoil, airfoilRing, cylinder, loft, ring } from './mesh.js';

const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];
const DIHEDRAL = Math.tan((5 * Math.PI) / 180);

export const COLORS = {
  paint: '#f4f4f0',
  accent: '#c8322a',
  stripe: '#1f3f73',
  glass: '#18263a',
  dark: '#2b2f36',
  metal: '#9aa1aa',
  navLeft: '#ff2a2a', // red on the left wingtip, green on the right, as on real aircraft
  navRight: '#22e05a',
  blur: '#c9ced6',
};

// Fuselage stations: [x, half-width, half-height, centre z].
const FUSELAGE = [
  [3.9, 0.4, 0.43, 0.05],
  [3.45, 0.55, 0.6, 0.06],
  [2.4, 0.6, 0.68, 0.1],
  [1.2, 0.6, 0.7, 0.12],
  [0, 0.56, 0.66, 0.13],
  [-1.5, 0.42, 0.5, 0.19],
  [-3.0, 0.27, 0.33, 0.27],
  [-4.4, 0.14, 0.2, 0.35],
  [-5.0, 0.05, 0.1, 0.39],
];

const CANOPY = [
  [2.35, 0.06, 0.04, 0.64],
  [2.05, 0.3, 0.22, 0.68],
  [1.35, 0.42, 0.36, 0.72],
  [0.4, 0.41, 0.34, 0.71],
  [-0.4, 0.3, 0.24, 0.67],
  [-0.95, 0.05, 0.05, 0.6],
];

// A stripe along each side: a thin band of the fuselage, scaled out a touch so it sits on the skin.
const STRIPE_STATIONS = FUSELAGE.slice(1, 7);

const SPINNER = [
  [4.6, 0.02],
  [4.45, 0.15],
  [4.25, 0.26],
  [3.95, 0.33],
];

const stations = (rows, n, power) => rows.map(([x, w, h, z]) => ring([x, 0, z], Y, Z, w, h, n, power));

/** A lifting surface from root to tip: linear taper of leading edge, chord and height. */
function surface({ outline, root, tip, spans, thicknessAxis }) {
  return loft(
    spans.map((f) => {
      const lerp = (a, b) => a + (b - a) * Math.abs(f);
      const le = [lerp(root.le[0], tip.le[0]), lerp(root.le[1], tip.le[1]) * Math.sign(f || 1), lerp(root.le[2], tip.le[2])];
      return airfoilRing(outline, le, lerp(root.chord, tip.chord), thicknessAxis);
    }),
  );
}

function wing(from, to) {
  // f runs -1 (right tip) .. 1 (left tip); the left wing is +Y.
  const halfSpan = 4.6;
  return surface({
    outline: airfoil(0.14),
    root: { le: [1.15, 0, -0.38], chord: 1.9 },
    tip: { le: [0.75, halfSpan, -0.38 + halfSpan * DIHEDRAL], chord: 0.95 },
    spans: [from, ...(from < 0 && to > 0 ? [0] : []), to],
    thicknessAxis: Z,
  });
}

/** Stripe: the fuselage between two heights, puffed out slightly. */
function stripe() {
  const n = 28;
  const band = (lo, hi) =>
    STRIPE_STATIONS.map(([x, w, h, z]) => {
      const pts = ring([x, 0, z], Y, Z, w * 1.012, h * 1.012, n, 2.3);
      // Squash the ring vertically into the band, keeping its width.
      return pts.map(([px, py, pz]) => [px, py, Math.min(z + hi * h, Math.max(z + lo * h, pz))]);
    });
  return loft(band(-0.12, 0.08));
}

export function buildAircraft() {
  const body = [
    { color: COLORS.paint, mesh: loft(stations(FUSELAGE, 28, 2.3)) },
    { color: COLORS.stripe, mesh: stripe() },
    { color: COLORS.glass, mesh: loft(stations(CANOPY, 20, 2)) },
    { color: COLORS.accent, mesh: loft(SPINNER.map(([x, r]) => ring([x, 0, 0.05], Y, Z, r, r, 18))) },
    { color: COLORS.paint, mesh: wing(-0.935, 0.935) },
    { color: COLORS.navLeft, mesh: wing(0.935, 1) },
    { color: COLORS.navRight, mesh: wing(-1, -0.935) },
    {
      color: COLORS.paint,
      mesh: surface({
        outline: airfoil(0.1),
        root: { le: [-3.85, 0, 0.36], chord: 0.95 },
        tip: { le: [-4.2, 1.75, 0.36], chord: 0.55 },
        spans: [-1, 0, 1],
        thicknessAxis: Z,
      }),
    },
    {
      color: COLORS.accent,
      mesh: loft([
        airfoilRing(airfoil(0.1), [-3.7, 0, 0.3], 1.35, Y),
        airfoilRing(airfoil(0.1), [-4.55, 0, 1.65], 0.7, Y),
      ]),
    },
  ];

  const wheel = (x, y, z, r, w) => ({ color: COLORS.dark, mesh: cylinder([x, y - w / 2, z], [x, y + w / 2, z], r, 16) });
  const strut = (from, to, r) => ({ color: COLORS.metal, mesh: cylinder(from, to, r, 8) });
  const gear = [
    wheel(0.15, 1.25, -1.25, 0.25, 0.16),
    wheel(0.15, -1.25, -1.25, 0.25, 0.16),
    wheel(3.1, 0, -1.28, 0.22, 0.13),
    strut([0.15, 1.15, -0.42], [0.15, 1.25, -1.25], 0.05),
    strut([0.15, -1.15, -0.42], [0.15, -1.25, -1.25], 0.05),
    strut([3.1, 0, -0.1], [3.1, 0, -1.28], 0.045),
  ];

  // Propeller parts are centred on the hub; the renderer spins them about X.
  const blade = (dir) =>
    loft([0.12, 0.55, 1.0].map((r, i) => ring([0, 0, dir * r], Y, X, [0.09, 0.08, 0.045][i], 0.022, 10)));
  const propeller = [
    { color: COLORS.dark, mesh: blade(1) },
    { color: COLORS.dark, mesh: blade(-1) },
  ];
  const disc = { color: COLORS.blur, mesh: cylinder([-0.005, 0, 0], [0.005, 0, 0], 1.02, 40) };

  return { body, gear, propeller, disc, hub: [4.38, 0, 0.05] };
}

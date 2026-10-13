import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAircraft } from '../src/aircraft-shape.js';
import { AIRCRAFT } from '../src/flight.js';
import { airfoil, cylinder, loft, ring } from '../src/mesh.js';

const parts = () => {
  const a = buildAircraft();
  return [...a.body, ...a.gear, ...a.propeller, a.disc];
};

/** Signed volume of a closed mesh: positive when its triangles face outwards. */
function signedVolume({ positions: p, indices }) {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map((j) => [p[3 * j], p[3 * j + 1], p[3 * j + 2]]);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

function bounds(meshes) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of meshes) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], positions[i + k]);
        hi[k] = Math.max(hi[k], positions[i + k]);
      }
    }
  }
  return { lo, hi };
}

test('lofted meshes face outwards and enclose the right volume', () => {
  const box = loft([-1, 1].map((x) => ring([x, 0, 0], [0, 1, 0], [0, 0, 1], 1, 1, 4)));
  const pipe = cylinder([0, 0, 0], [0, 0, 3], 0.5);
  // A 4-point ring of radius 1 is a diamond of area 2, so the 2 m long box holds 4 m³.
  assert.ok(Math.abs(signedVolume(box) - 4) < 1e-9, `box volume ${signedVolume(box)}`);
  assert.ok(Math.abs(signedVolume(pipe) - Math.PI * 0.25 * 3) < 0.1, `pipe volume ${signedVolume(pipe)}`);
});

test('airfoil runs trailing edge → nose → trailing edge with a thickness peak near 30% chord', () => {
  const pts = airfoil(0.12, 10);
  assert.equal(pts.length, 20);
  assert.ok(Math.abs(pts[0][0] - 1) < 1e-9);
  const top = Math.max(...pts.map(([, t]) => t));
  assert.ok(Math.abs(top - 0.06) < 0.002, `max half-thickness ${top}`);
});

test('every part is a valid, outward-facing mesh with unit normals', () => {
  for (const { color, mesh } of parts()) {
    assert.ok(signedVolume(mesh) > 0, `${color} part faces inwards`);
    assert.match(color, /^#[0-9a-f]{6}$/);
    const vertices = mesh.positions.length / 3;
    assert.equal(mesh.normals.length, vertices * 3);
    assert.equal(mesh.indices.length % 3, 0);
    assert.ok(Math.max(...mesh.indices) < vertices);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const len = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
      assert.ok(Math.abs(len - 1) < 1e-5, `normal length ${len}`);
    }
    assert.ok(mesh.positions.every(Number.isFinite));
  }
});

test('the airframe is plane-sized and the wheels touch down at gear height', () => {
  const a = buildAircraft();
  const { lo, hi } = bounds(a.body.map((p) => p.mesh));
  assert.ok(hi[0] - lo[0] > 9 && hi[0] - lo[0] < 10.5, `length ${hi[0] - lo[0]}`);
  assert.ok(hi[1] - lo[1] > 8.8 && hi[1] - lo[1] < 9.6, `span ${hi[1] - lo[1]}`);
  assert.ok(Math.abs(hi[1] + lo[1]) < 1e-9, 'symmetric left to right');
  const gear = bounds(a.gear.map((p) => p.mesh));
  assert.ok(Math.abs(gear.lo[2] + AIRCRAFT.gearHeight) < 0.01, `wheel bottom ${gear.lo[2]}`);
});

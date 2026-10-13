import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTileMesh, FACADE, facadeFor, toEcef } from '../src/building-mesh.js';

// A 20 m × 10 m box near the equator, given clockwise so the builder has to fix the winding.
const DLON = 20 / 111320;
const DLAT = 10 / 110540;
const box = (extra = {}) => ({
  outer: [[0, 0], [0, DLAT], [DLON, DLAT], [DLON, 0]],
  holes: [],
  base: 96,
  ground: 100,
  top: 130,
  color: '#c0a080',
  facade: FACADE.windows,
  ...extra,
});

const vec = (arr, i) => [arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]];
const sub = (a, b) => a.map((v, k) => v - b[k]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);

function triangles(mesh) {
  const out = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.indices[i + k]);
    const face = cross(sub(vec(mesh.positions, b), vec(mesh.positions, a)), sub(vec(mesh.positions, c), vec(mesh.positions, a)));
    out.push({ a, face, normal: vec(mesh.normals, a), facade: mesh.facades[a] });
  }
  return out;
}

test('ECEF conversion matches known points', () => {
  assert.deepEqual(toEcef(0, 0, 0).map(Math.round), [6378137, 0, 0]);
  assert.deepEqual(toEcef(90, 0, 100).map(Math.round), [0, 6378237, 0]);
  assert.ok(Math.abs(toEcef(0, 90, 0)[2] - 6356752.3) < 0.1);
});

test('facades follow building height', () => {
  assert.equal(facadeFor(6), FACADE.house);
  assert.equal(facadeFor(20), FACADE.windows);
  assert.equal(facadeFor(150), FACADE.glass);
});

test('a box gets four walls and a roof, all wound to face their normals', () => {
  const mesh = buildTileMesh([box()]);
  const tris = triangles(mesh);
  assert.equal(tris.filter((t) => t.facade !== FACADE.roof).length, 8); // 4 walls × 2
  assert.equal(tris.filter((t) => t.facade === FACADE.roof).length, 2);
  for (const t of tris) assert.ok(dot(t.face, t.normal) > 0, 'triangle faces away from its normal');
  // Walls face outwards from the box centre.
  const centre = toEcef(DLON / 2, DLAT / 2, 115);
  for (const t of tris.filter((x) => x.facade !== FACADE.roof)) {
    assert.ok(dot(t.normal, sub(vec(mesh.positions, t.a), centre)) > 0, 'wall faces inwards');
  }
});

test('wall texture coordinates are metres along the wall and up from the ground', () => {
  const mesh = buildTileMesh([box()]);
  const s = [];
  const t = [];
  for (let i = 0; i < mesh.facades.length; i++) {
    if (mesh.facades[i] === FACADE.roof) continue;
    s.push(mesh.st[2 * i]);
    t.push(mesh.st[2 * i + 1]);
  }
  assert.ok(Math.abs(Math.max(...s) - 60) < 0.1, `perimeter ${Math.max(...s)}`); // 20 + 10 + 20 + 10
  assert.equal(Math.min(...t), -4); // walls start 4 m underground
  assert.equal(Math.max(...t), 30);
});

test('raised parts get an underside; holes get inward-facing walls', () => {
  const raised = triangles(buildTileMesh([box({ base: 110 })]));
  assert.equal(raised.filter((t) => t.facade === FACADE.roof).length, 4); // roof + underside

  const courtyard = [[DLON * 0.25, DLAT * 0.25], [DLON * 0.75, DLAT * 0.25], [DLON * 0.75, DLAT * 0.75], [DLON * 0.25, DLAT * 0.75]];
  const mesh = buildTileMesh([box({ holes: [courtyard] })]);
  const tris = triangles(mesh);
  assert.equal(tris.filter((t) => t.facade !== FACADE.roof).length, 16);
  const centre = toEcef(DLON / 2, DLAT / 2, 115);
  const courtyardWalls = tris.filter((t) => t.facade !== FACADE.roof).slice(8);
  for (const t of courtyardWalls) {
    assert.ok(dot(t.normal, sub(vec(mesh.positions, t.a), centre)) < 0, 'courtyard wall should face the courtyard');
  }
  for (const t of tris) assert.ok(dot(t.face, t.normal) > 0);
});

test('vertex attributes line up', () => {
  const mesh = buildTileMesh([box(), box({ color: '#112233', facade: FACADE.glass })]);
  const n = mesh.positions.length / 3;
  assert.equal(mesh.normals.length, 3 * n);
  assert.equal(mesh.st.length, 2 * n);
  assert.equal(mesh.colors.length, 4 * n);
  assert.equal(mesh.facades.length, n);
  assert.ok(Math.max(...mesh.indices) < n);
  assert.deepEqual([...mesh.colors.slice(-4)], [0x11, 0x22, 0x33, 255]);
});

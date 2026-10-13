import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildingColor, clipRing, featurePolygons, pointInRing, ringBounds, tilePointToLonLat } from '../src/building-tiles.js';

const pts = (...xy) => xy.map(([x, y]) => ({ x, y }));
const area = (ring) => ring.reduce((s, p, i) => s + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0) / 2;

test('a ring inside the tile is left alone (minus the closing point)', () => {
  const ring = pts([10, 10], [20, 10], [20, 20], [10, 20], [10, 10]);
  assert.deepEqual(clipRing(ring, 4096), ring.slice(0, -1));
});

test('a ring over the tile edge is cut at the edge', () => {
  const ring = pts([-50, 100], [50, 100], [50, 200], [-50, 200]);
  const clipped = clipRing(ring, 4096);
  assert.ok(clipped.every((p) => p.x >= 0));
  assert.equal(Math.abs(area(clipped)), 50 * 100);
});

test('a ring entirely in the buffer disappears', () => {
  assert.deepEqual(clipRing(pts([4100, 10], [4150, 10], [4150, 60]), 4096), []);
});

test('tile corners map to the right lon/lat', () => {
  const [lon0, lat0] = tilePointToLonLat({ x: 0, y: 0 }, 0, 0, 0, 4096);
  assert.equal(lon0, -180);
  assert.ok(Math.abs(lat0 - 85.0511) < 1e-3);
  const [lon, lat] = tilePointToLonLat({ x: 2048, y: 2048 }, 0, 0, 0, 4096);
  assert.ok(Math.abs(lon) < 1e-9 && Math.abs(lat) < 1e-9);
});

test('point-in-ring and bounds', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(pointInRing([0.5, 0.5], square), true);
  assert.equal(pointInRing([1.5, 0.5], square), false);
  assert.deepEqual(ringBounds(square), [0, 0, 1, 1]);
});

test('features become clipped lon/lat polygons with their holes', () => {
  const outer = pts([100, 100], [300, 100], [300, 300], [100, 300]);
  const hole = pts([150, 150], [150, 250], [250, 250], [250, 150]);
  const [poly] = featurePolygons([[outer, hole]], 0, 0, 1, 4096);
  assert.equal(poly.outer.length, 4);
  assert.equal(poly.holes.length, 1);
  assert.ok(poly.outer.every(([lon, lat]) => lon < -160 && lat > 80));
});

test('building colours are stable and depend on height class', () => {
  assert.equal(buildingColor(42, 10), buildingColor(42, 10));
  assert.match(buildingColor(7, 120), /^#[0-9a-f]{6}$/);
  assert.notEqual(buildingColor(3, 10), buildingColor(3, 100));
});

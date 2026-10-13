import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeTerrarium, lonLatToTilePixel, resampleTile, sampleGrid, sourceWindow, TILE_SIZE } from '../src/tiles.js';

test('decodes Terrarium pixels to metres, clamping seas to zero', () => {
  // 128,0,0 is sea level; 128,100,128 is 100.5 m; 127,0,0 is -256 m (clamped).
  const h = decodeTerrarium(new Uint8ClampedArray([128, 0, 0, 255, 128, 100, 128, 255, 127, 0, 0, 255]));
  assert.deepEqual([...h], [0, 100.5, 0]);
});

test('bilinear sampling interpolates between pixel centres and clamps at edges', () => {
  const grid = new Float32Array([0, 10, 20, 30]); // 2×2
  assert.equal(sampleGrid(grid, 2, 0.5, 0.5), 0);
  assert.equal(sampleGrid(grid, 2, 1, 0.5), 5);
  assert.equal(sampleGrid(grid, 2, 1, 1), 15);
  assert.equal(sampleGrid(grid, 2, -5, 99), 20);
});

test('tiles above the max level come from themselves, deeper ones from an ancestor', () => {
  assert.deepEqual(sourceWindow(5, 9, 10, 14), { level: 10, x: 5, y: 9, offX: 0, offY: 0, size: 256 });
  // Level 16 tile (7, 6) is in level 14 tile (1, 1), at quarter (3, 2).
  assert.deepEqual(sourceWindow(7, 6, 16, 14), { level: 14, x: 1, y: 1, offX: 192, offY: 128, size: 64 });
});

test('resampling covers the window edge to edge, north row first', () => {
  const grid = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) grid[y * TILE_SIZE + x] = y; // rises southwards
  const out = resampleTile(grid, sourceWindow(0, 0, 0, 14), 5);
  assert.equal(out.length, 25);
  assert.equal(out[0], 0);
  assert.equal(out[24], TILE_SIZE - 1);
  assert.ok(out[5] > out[0] && out[10] > out[5]);
});

test('finds the tile and pixel under a lon/lat', () => {
  assert.deepEqual(lonLatToTilePixel(0, 0, 1), { x: 1, y: 1, px: 0, py: 0 });
  const sf = lonLatToTilePixel(-122.4194, 37.7749, 10);
  assert.equal(sf.x, 163);
  assert.equal(sf.y, 395);
  assert.ok(sf.px >= 0 && sf.px < TILE_SIZE && sf.py >= 0 && sf.py < TILE_SIZE);
});

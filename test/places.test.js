import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatLatLon, parseLatLon, shortName } from '../src/places.js';

test('reads coordinate pairs in common forms', () => {
  assert.deepEqual(parseLatLon('36.1, -112.1'), { lat: 36.1, lon: -112.1 });
  assert.deepEqual(parseLatLon(' 36.1 -112.1 '), { lat: 36.1, lon: -112.1 });
  assert.deepEqual(parseLatLon('27.988N 86.925E'), { lat: 27.988, lon: 86.925 });
  assert.deepEqual(parseLatLon('22.95° S, 43.21° W'), { lat: -22.95, lon: -43.21 });
  assert.deepEqual(parseLatLon('-33.86;151.21'), { lat: -33.86, lon: 151.21 });
});

test('rejects place names and out-of-range coordinates', () => {
  assert.equal(parseLatLon('Mount Fuji'), null);
  assert.equal(parseLatLon('36.1'), null);
  assert.equal(parseLatLon('95, 10'), null); // beyond the map's ±85° latitude
  assert.equal(parseLatLon('10, 190'), null);
});

test('formats coordinates', () => {
  assert.equal(formatLatLon(36.03, -112.3), '36.0300°N 112.3000°W');
});

test('shortens geocoder names to the first two parts', () => {
  assert.equal(shortName('Mount Fuji, Oyama, Shizuoka, Japan'), 'Mount Fuji, Oyama');
  assert.equal(shortName('Iceland'), 'Iceland');
});

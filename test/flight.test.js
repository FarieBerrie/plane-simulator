import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIRCRAFT, createState, DEG, step } from '../src/flight.js';

const DT = 1 / 60;
const fly = (s, controls, seconds, ground) => {
  for (let i = 0; i < seconds / DT; i++) step(s, controls, DT, ground);
  return s;
};
const cruise = (extra = {}) => createState({ lat: 46, lon: 7, alt: 3000, heading: 0, speed: 120, throttle: 0.5, ...extra });
const level = { elevator: 0, aileron: 0, rudder: 0 };

test('hands-off level flight holds altitude and heading', () => {
  const s = fly(cruise(), { ...level, throttle: 0.5 }, 10);
  assert.ok(Math.abs(s.alt - 3000) < 1, `alt ${s.alt}`);
  assert.ok(Math.abs(s.heading) < 1e-9 || Math.abs(s.heading - 2 * Math.PI) < 1e-9);
  assert.equal(s.crashed, false);
});

test('flying north raises latitude, flying east raises longitude', () => {
  const north = fly(cruise(), { ...level, throttle: 0.5 }, 5);
  assert.ok(north.lat > 46 * DEG);
  const east = fly(cruise({ heading: 90 }), { ...level, throttle: 0.5 }, 5);
  assert.ok(east.lon > 7 * DEG);
  assert.ok(Math.abs(east.lat - 46 * DEG) < 1e-4);
});

test('banking right turns right, banking left turns left', () => {
  const right = cruise();
  right.roll = 30 * DEG;
  fly(right, { ...level, throttle: 0.5 }, 3);
  assert.ok(right.heading > 0.05 && right.heading < Math.PI, `heading ${right.heading}`);
  const left = cruise();
  left.roll = -30 * DEG;
  fly(left, { ...level, throttle: 0.5 }, 3);
  assert.ok(left.heading > Math.PI && left.heading < 2 * Math.PI - 0.05, `heading ${left.heading}`);
});

test('ailerons roll the aircraft and bank is limited', () => {
  const s = fly(cruise(), { ...level, aileron: 1, throttle: 0.5 }, 5);
  assert.ok(Math.abs(s.roll - AIRCRAFT.maxBank) < 1e-9);
});

test('pulling back climbs, pushing forward dives', () => {
  const up = fly(cruise(), { ...level, elevator: 0.3, throttle: 0.5 }, 3);
  assert.ok(up.pitch > 0 && up.alt > 3000);
  const down = fly(cruise(), { ...level, elevator: -0.3, throttle: 0.5 }, 3);
  assert.ok(down.pitch < 0 && down.alt < 3000);
});

test('full throttle accelerates up to a top speed', () => {
  const s = fly(cruise(), { ...level, throttle: 1 }, 120);
  const top = Math.sqrt(AIRCRAFT.maxThrust / AIRCRAFT.drag);
  assert.ok(s.speed > top - 2 && s.speed < top + 0.5, `speed ${s.speed}`);
});

test('too slow stalls and the nose drops', () => {
  const s = cruise({ speed: 30, throttle: 0 });
  step(s, { ...level, throttle: 0 }, DT);
  assert.equal(s.stalled, true);
  fly(s, { ...level, throttle: 0 }, 2);
  assert.ok(s.pitch < -5 * DEG, `pitch ${s.pitch}`);
});

test('a gentle descent onto the ground lands', () => {
  const s = cruise({ alt: 520, speed: 60, throttle: 0.2 });
  s.pitch = -2 * DEG; // ~2 m/s sink
  fly(s, { ...level, throttle: 0.2 }, 30, 500);
  assert.equal(s.crashed, false);
  assert.equal(s.onGround, true);
  assert.equal(s.alt, 500 + AIRCRAFT.gearHeight);
});

test('diving into the ground crashes', () => {
  const s = cruise({ alt: 600 });
  s.pitch = -30 * DEG;
  fly(s, { ...level, throttle: 0.5 }, 10, 500);
  assert.equal(s.crashed, true);
  assert.equal(s.speed, 0);
});

test('flying level into rising terrain crashes', () => {
  const s = cruise({ alt: 510 });
  let ground = 500;
  for (let i = 0; i < 600 && !s.crashed; i++) {
    ground += 0.5; // a 25% slope at 120 m/s
    step(s, { ...level, throttle: 0.5 }, DT, ground);
  }
  assert.equal(s.crashed, true);
});

test('brakes stop the aircraft on the ground without rolling it backwards', () => {
  const s = cruise({ alt: 500 + AIRCRAFT.gearHeight, speed: 30, throttle: 0 });
  s.onGround = true;
  fly(s, { ...level, throttle: 0, brake: 1 }, 20, 500);
  assert.equal(s.speed, 0);
  assert.equal(s.crashed, false);
});

test('takeoff: full throttle and a pull after rotation speed lifts off', () => {
  const s = cruise({ alt: 500 + AIRCRAFT.gearHeight, speed: 0, throttle: 1 });
  s.onGround = true;
  fly(s, { ...level, throttle: 1 }, 10, 500);
  assert.equal(s.onGround, true, 'stays on the runway without a pull');
  assert.ok(s.speed > AIRCRAFT.stallSpeed);
  fly(s, { ...level, elevator: 0.3, throttle: 1 }, 10, 500);
  assert.equal(s.onGround, false);
  assert.ok(s.alt > 550, `alt ${s.alt}`);
  assert.equal(s.crashed, false);
});

test('a crashed aircraft stays put', () => {
  const s = cruise();
  s.crashed = true;
  const before = { ...s };
  step(s, { ...level, throttle: 1 }, DT, 0);
  assert.deepEqual(s, before);
});

// Flight model: a point-mass aircraft steered by load factor (elevator), bank (ailerons) and
// rudder. Angles are radians, distances metres, speeds m/s. Heading 0 is north and grows
// clockwise; positive pitch is nose up; positive roll is right wing down. No Cesium or DOM here,
// so it runs under node --test.

export const G = 9.81;
export const DEG = Math.PI / 180;
const EARTH_RADIUS = 6371000;

export const AIRCRAFT = {
  stallSpeed: 42, // below this the wings can't hold the nose up
  maxThrust: 6, // m/s² at full throttle
  drag: 0.000234, // m/s² per (m/s)²; top speed in level flight ≈ sqrt(maxThrust / drag) ≈ 160 m/s
  pullAuthority: 3, // extra g at full elevator
  maxLoad: 4,
  minLoad: -1.5,
  rollRate: 1.4, // rad/s at full aileron
  yawRate: 0.25, // rad/s at full rudder in the air
  steerRate: 0.5, // rad/s at full rudder while taxiing
  maxBank: 85 * DEG,
  maxPitch: 80 * DEG,
  gearHeight: 1.5, // the aircraft's centre sits this far above the wheels
  rollingFriction: 0.25, // m/s² on the ground
  brakeDecel: 5, // m/s² extra at full brake
  maxImpactSpeed: 6, // m/s into the ground; harder than this is a crash
  maxLandingBank: 20 * DEG,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapAngle = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** A new aircraft at a lat/lon in degrees, altitude in metres, heading in degrees. */
export function createState({ lat, lon, alt, heading = 0, speed = 90, throttle = 0.55 }) {
  return {
    lat: lat * DEG,
    lon: lon * DEG,
    alt,
    heading: wrapAngle(heading * DEG),
    pitch: 0,
    roll: 0,
    speed,
    throttle,
    verticalSpeed: 0,
    ground: undefined, // last terrain height seen under the aircraft
    onGround: false,
    stalled: false,
    crashed: false,
  };
}

/**
 * Advances the aircraft by dt seconds, in place.
 * controls: { elevator, aileron, rudder } in -1..1 (elevator +1 = pull back), throttle and brake in 0..1.
 * ground: terrain height under the aircraft in metres, or undefined if not known yet.
 */
export function step(s, controls, dt, ground, a = AIRCRAFT) {
  if (s.crashed || dt <= 0) return s;
  const { elevator = 0, aileron = 0, rudder = 0, brake = 0 } = controls;
  s.throttle = clamp(controls.throttle ?? s.throttle, 0, 1);

  const v = s.speed;
  const vTurn = Math.max(v, 20); // keeps turn and pitch rates finite when very slow
  const lift = Math.min(1, (v / a.stallSpeed) ** 2); // share of full lift the wings can make
  const load = clamp(lift * (Math.cos(s.pitch) + elevator * a.pullAuthority), a.minLoad, a.maxLoad);
  s.stalled = !s.onGround && lift < 0.95;

  // Lift tilts with the bank: its vertical part pitches the flight path, its sideways part turns it.
  let pitchRate = (G * (load * Math.cos(s.roll) - Math.cos(s.pitch))) / vTurn;
  let headingRate;
  let accel = s.throttle * a.maxThrust - a.drag * v * v - G * Math.sin(s.pitch);

  if (s.onGround) {
    headingRate = rudder * a.steerRate * Math.min(1, v / 10);
    s.roll += clamp(-s.roll, -a.rollRate * dt, a.rollRate * dt);
    if (pitchRate < 0 && s.pitch <= 0) pitchRate = 0;
    accel -= a.rollingFriction + brake * a.brakeDecel; // speed is floored at 0 below, so this never reverses
  } else {
    headingRate = (G * load * Math.sin(s.roll)) / (vTurn * Math.max(0.2, Math.cos(s.pitch))) + rudder * a.yawRate;
    s.roll = clamp(s.roll + aileron * a.rollRate * dt, -a.maxBank, a.maxBank);
  }

  s.pitch = clamp(s.pitch + pitchRate * dt, -a.maxPitch, a.maxPitch);
  s.heading = wrapAngle(s.heading + headingRate * dt);
  s.speed = Math.max(0, v + accel * dt);

  const groundSpeed = s.speed * Math.cos(s.pitch);
  s.verticalSpeed = s.speed * Math.sin(s.pitch);
  s.lat = clamp(s.lat + (groundSpeed * Math.cos(s.heading) * dt) / EARTH_RADIUS, -1.5, 1.5);
  s.lon += (groundSpeed * Math.sin(s.heading) * dt) / (EARTH_RADIUS * Math.cos(s.lat));
  if (s.lon > Math.PI) s.lon -= 2 * Math.PI;
  if (s.lon < -Math.PI) s.lon += 2 * Math.PI;
  s.alt += s.verticalSpeed * dt;

  if (ground === undefined) return s;
  const floor = ground + a.gearHeight;
  // How fast the ground is coming up at us. Big jumps in a single frame are terrain detail
  // loading in, not a cliff, so they don't count.
  const groundRise = s.ground !== undefined && Math.abs(ground - s.ground) < 30 ? (ground - s.ground) / dt : 0;
  s.ground = ground;

  if (s.alt <= floor) {
    const impact = groundRise - s.verticalSpeed;
    const wasAirborne = !s.onGround;
    if (impact > a.maxImpactSpeed || (wasAirborne && Math.abs(s.roll) > a.maxLandingBank)) {
      s.crashed = true;
      s.speed = 0;
      s.verticalSpeed = 0;
    }
    s.alt = floor;
    s.onGround = true;
    s.stalled = false;
    if (s.pitch < 0) s.pitch = 0;
  } else if (s.alt > floor + 0.5) {
    s.onGround = false;
  }
  return s;
}

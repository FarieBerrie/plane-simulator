import {
  Cartesian3,
  Cartographic,
  CesiumWidget,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
} from 'cesium';
import { createAircraftModel } from './aircraft.js';
import { AIRCRAFT, createState, DEG, step } from './flight.js';
import { createHud } from './hud.js';
import { addImagery } from './imagery.js';
import { createInput } from './input.js';
import { LOCATIONS } from './locations.js';
import { createTerrainProvider, groundHeightAt } from './terrain.js';

const START_SPEED = 90;
const START_THROTTLE = 0.55;
const COCKPIT_EYE = 1.2; // metres above the aircraft's centre
const CHASE_RANGE = 38;

// ------------------------------------------------------------------- globe

const widget = new CesiumWidget('globe', {
  baseLayer: false,
  terrainProvider: createTerrainProvider(),
  creditContainer: document.getElementById('credits'),
});
const { scene, camera } = widget;
addImagery(widget);
scene.screenSpaceCameraController.enableInputs = false;
scene.globe.depthTestAgainstTerrain = true;
scene.globe.tileCacheSize = 400;
scene.globe.preloadSiblings = true;
scene.fog.density = 1.2e-4;
camera.frustum.near = 0.5;

const model = createAircraftModel();
scene.primitives.add(model.primitive);

const hud = createHud(document.getElementById('hud'));
const input = createInput();

// ------------------------------------------------------------------- UI

const menu = document.getElementById('menu');
const list = document.getElementById('locations');
const startButton = document.getElementById('start');
const resumeButton = document.getElementById('resume');
const banner = document.getElementById('banner');
const viewLabel = document.getElementById('view-label');

let chosen = LOCATIONS[0];
for (const loc of LOCATIONS) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'location';
  item.dataset.id = loc.id;
  item.innerHTML = `<strong>${loc.name}</strong><span>${loc.blurb}</span>`;
  item.addEventListener('click', () => select(loc));
  item.addEventListener('dblclick', () => start());
  list.appendChild(item);
}

function select(loc) {
  chosen = loc;
  for (const el of list.children) el.setAttribute('aria-pressed', String(el.dataset.id === loc.id));
  if (!plane) previewLocation(loc);
}

/** Before the first flight, the menu shows the selected location from above. */
function previewLocation(loc) {
  camera.lookAtTransform(Matrix4.IDENTITY);
  camera.flyTo({
    destination: Cartesian3.fromDegrees(loc.lon - Math.sin(loc.heading * DEG) * 0.06, loc.lat - Math.cos(loc.heading * DEG) * 0.05, loc.alt + 2500),
    orientation: { heading: loc.heading * DEG, pitch: -0.45, roll: 0 },
    duration: 2.5,
  });
}

// ------------------------------------------------------------------- flight

let plane = null;
let paused = true;
let view = 'chase';
let chaseHeading = 0;
let lastFrame = performance.now();
let elapsed = 0;

async function start() {
  startButton.disabled = true;
  startButton.textContent = 'Loading terrain…';
  let ground = 0;
  try {
    ground = await groundHeightAt(chosen.lon, chosen.lat);
  } catch {
    // No terrain data yet; start high and let the globe catch up.
    ground = chosen.alt;
  }
  startButton.disabled = false;
  startButton.textContent = 'Take off here';
  plane = createState({
    lat: chosen.lat,
    lon: chosen.lon,
    alt: Math.max(chosen.alt, ground + chosen.agl),
    heading: chosen.heading,
    speed: START_SPEED,
    throttle: START_THROTTLE,
  });
  chaseHeading = plane.heading;
  input.reset(START_THROTTLE);
  camera.cancelFlight();
  setPaused(false);
  showBanner('');
}

function setPaused(value) {
  paused = value;
  menu.hidden = !paused;
  resumeButton.hidden = !plane || plane.crashed;
  document.body.classList.toggle('flying', !paused);
  if (!paused) document.activeElement?.blur?.();
}

function showBanner(html) {
  banner.innerHTML = html;
  banner.hidden = !html;
}

function toggleView() {
  view = view === 'chase' ? 'cockpit' : 'chase';
  viewLabel.textContent = view === 'chase' ? 'Chase view' : 'Cockpit view';
}

const scratchCarto = new Cartographic();
const scratchPos = new Cartesian3();
const scratchEye = new Cartesian3();
const chaseOffset = new HeadingPitchRange();

function terrainHeight(s) {
  scratchCarto.longitude = s.lon;
  scratchCarto.latitude = s.lat;
  scratchCarto.height = 0;
  return scene.globe.getHeight(scratchCarto);
}

function placeCamera(s, position, dt) {
  if (view === 'cockpit') {
    camera.lookAtTransform(Matrix4.IDENTITY);
    Cartesian3.fromRadians(s.lon, s.lat, s.alt + COCKPIT_EYE, undefined, scratchEye);
    camera.setView({ destination: scratchEye, orientation: { heading: s.heading, pitch: s.pitch, roll: s.roll } });
    return;
  }
  // The chase camera swings round behind the aircraft rather than snapping, and stays wings-level.
  const diff = CesiumMath.negativePiToPi(s.heading - chaseHeading);
  chaseHeading += diff * Math.min(1, dt * 3);
  chaseOffset.heading = chaseHeading;
  chaseOffset.pitch = -0.16 + 0.7 * s.pitch;
  chaseOffset.range = CHASE_RANGE;
  camera.lookAt(position, chaseOffset);
}

function handleKeys() {
  if (input.pressed('KeyC') || input.pressed('KeyV')) toggleView();
  if (input.pressed('Escape') || input.pressed('KeyP')) setPaused(!paused);
  if (plane?.crashed && !paused && input.pressed('Enter')) start();
}

scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!plane) return;
  handleKeys();
  if (!paused) {
    elapsed += dt;
    input.update(dt);
    const wasCrashed = plane.crashed;
    step(plane, input.controls, dt, terrainHeight(plane) ?? plane.ground);
    if (plane.crashed && !wasCrashed) showBanner('<strong>Crashed</strong><span>Press Enter to try again</span>');
  }
  input.endFrame();

  Cartesian3.fromRadians(plane.lon, plane.lat, plane.alt, undefined, scratchPos);
  model.update(scratchPos, plane);
  model.primitive.show = view === 'chase';
  placeCamera(plane, scratchPos, dt);
});

scene.postRender.addEventListener(() => {
  if (!plane || paused) {
    hud.clear();
    return;
  }
  const agl = plane.ground === undefined ? undefined : plane.alt - AIRCRAFT.gearHeight - plane.ground;
  hud.draw(plane, { agl, view, fovy: camera.frustum.fovy, t: elapsed, controls: input.controls });
});

startButton.addEventListener('click', start);
resumeButton.addEventListener('click', () => setPaused(false));

select(chosen);

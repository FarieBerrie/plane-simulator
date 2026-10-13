import {
  Cartesian3,
  Cartographic,
  CesiumWidget,
  HeadingPitchRange,
  JulianDate,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { createAircraftModel } from './aircraft.js';
import { createBuildings } from './buildings.js';
import { AIRCRAFT, crash, createState, DEG, step } from './flight.js';
import { createHud } from './hud.js';
import { addImagery } from './imagery.js';
import { createInput } from './input.js';
import { LOCATIONS } from './locations.js';
import { formatLatLon, parseLatLon, searchPlaces } from './places.js';
import { createTerrainProvider, groundHeightAt } from './terrain.js';

const START_SPEED = 90;
const START_THROTTLE = 0.55;
const COCKPIT_EYE = 1.2; // metres above the aircraft's centre
const CHASE_RANGE = 30;
const LOCAL_HOUR = 10.5; // fixed time of day at the start point, so the sun lights the scene
const PICK_VIEW_HEIGHT = 2_000_000; // metres; how far out the globe is when picking a start point
const SEARCH_INTERVAL = 1100; // ms between place searches, per Nominatim's usage policy

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

const model = createAircraftModel(scene.primitives);
const buildings = createBuildings(scene);
widget.clock.shouldAnimate = false;

const hud = createHud(document.getElementById('hud'));
const input = createInput();

// ------------------------------------------------------------------- UI

const menu = document.getElementById('menu');
const list = document.getElementById('locations');
const startButton = document.getElementById('start');
const resumeButton = document.getElementById('resume');
const banner = document.getElementById('banner');
const viewLabel = document.getElementById('view-label');
const searchForm = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const results = document.getElementById('search-results');
const customOptions = document.getElementById('custom-options');
const headingSelect = document.getElementById('custom-heading');
const heightSelect = document.getElementById('custom-height');
const pickButton = document.getElementById('pick');
const pickBar = document.getElementById('pickbar');

function card(loc, onClick) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'location';
  item.dataset.id = loc.id;
  const name = document.createElement('strong');
  const blurb = document.createElement('span');
  name.textContent = loc.name; // place names come from the geocoder, so never as HTML
  blurb.textContent = loc.blurb;
  item.append(name, blurb);
  item.addEventListener('click', onClick);
  return item;
}

let chosen = LOCATIONS[0];
let custom = null;
for (const loc of LOCATIONS) {
  const item = card(loc, () => select(loc));
  item.addEventListener('dblclick', () => start());
  list.appendChild(item);
}

function select(loc) {
  chosen = loc;
  for (const el of list.children) el.setAttribute('aria-pressed', String(el.dataset.id === loc.id));
  customOptions.hidden = loc !== custom;
  if (!plane) {
    setSunFor(loc);
    previewLocation(loc);
  }
}

let previewToken = 0;

/** Before the first flight, the menu shows the selected location from above. */
async function previewLocation(loc) {
  const token = ++previewToken;
  const ground = await groundHeightAt(loc.lon, loc.lat).catch(() => loc.alt);
  if (token !== previewToken || plane || picking) return; // something newer took over
  camera.lookAtTransform(Matrix4.IDENTITY);
  camera.flyTo({
    destination: Cartesian3.fromDegrees(
      loc.lon - Math.sin(loc.heading * DEG) * 0.06,
      loc.lat - Math.cos(loc.heading * DEG) * 0.05,
      Math.max(loc.alt, ground + loc.agl) + 2000,
    ),
    orientation: { heading: loc.heading * DEG, pitch: -0.45, roll: 0 },
    duration: 2.5,
  });
}

// ------------------------------------------------------------------- custom start point

/** Makes `spot` ({ name, lat, lon }) the custom start, shown as the first card. */
function setCustom(spot) {
  custom = {
    id: 'custom',
    name: spot.name,
    blurb: formatLatLon(spot.lat, spot.lon),
    lat: spot.lat,
    lon: spot.lon,
    heading: Number(headingSelect.value),
    alt: 0,
    agl: Number(heightSelect.value),
  };
  list.querySelector('[data-id="custom"]')?.remove();
  const item = card(custom, () => select(custom));
  item.addEventListener('dblclick', () => start());
  list.prepend(item);
  results.hidden = true;
  select(custom);
}

headingSelect.addEventListener('change', () => {
  if (!custom) return;
  custom.heading = Number(headingSelect.value);
  if (!plane && chosen === custom) previewLocation(custom);
});
heightSelect.addEventListener('change', () => {
  if (custom) custom.agl = Number(heightSelect.value);
});

function showResults(...children) {
  results.replaceChildren(...children);
  results.hidden = false;
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'results-note';
  p.textContent = text;
  return p;
}

let lastSearch = 0;

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  const coords = parseLatLon(query);
  if (coords) {
    setCustom({ name: 'Custom coordinates', ...coords });
    return;
  }
  searchButton.disabled = true;
  showResults(note('Searching…'));
  const wait = lastSearch + SEARCH_INTERVAL - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  try {
    const places = await searchPlaces(query);
    const credit = note('');
    credit.innerHTML =
      'Search by <a href="https://nominatim.openstreetmap.org" target="_blank">Nominatim</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';
    if (!places.length) showResults(note(`No places found for "${query}".`), credit);
    else showResults(...places.map((place) => card({ ...place, id: '', blurb: place.detail }, () => setCustom(place))), credit);
  } catch {
    showResults(note('Place search is unavailable right now. You can still type coordinates or pick a spot on the globe.'));
  } finally {
    searchButton.disabled = false;
  }
});

let picking = false;

function startPicking() {
  picking = true;
  menu.hidden = true;
  pickBar.hidden = false;
  camera.cancelFlight();
  camera.lookAtTransform(Matrix4.IDENTITY);
  camera.flyTo({
    destination: Cartesian3.fromDegrees(chosen.lon, chosen.lat, PICK_VIEW_HEIGHT),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: 1.5,
  });
  scene.screenSpaceCameraController.enableInputs = true;
}

function endPicking() {
  picking = false;
  pickBar.hidden = true;
  menu.hidden = false;
  camera.cancelFlight();
  scene.screenSpaceCameraController.enableInputs = false;
}

pickButton.addEventListener('click', startPicking);

document.getElementById('buildings-toggle').addEventListener('change', (e) => {
  buildings.enabled = e.target.checked;
});

new ScreenSpaceEventHandler(scene.canvas).setInputAction((click) => {
  if (!picking) return;
  const ray = camera.getPickRay(click.position);
  const spot = ray && scene.globe.pick(ray, scene);
  if (!spot) return; // clicked the sky
  const where = Cartographic.fromCartesian(spot);
  endPicking();
  setCustom({ name: 'Picked on the globe', lat: where.latitude / DEG, lon: where.longitude / DEG });
}, ScreenSpaceEventType.LEFT_CLICK);

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
  setSunFor(chosen);
  input.reset(START_THROTTLE);
  camera.cancelFlight();
  setPaused(false);
  showBanner('');
}

/** Morning sun at the start point: an equinox date, with the hour shifted by longitude. */
function setSunFor(loc) {
  const ms = Date.UTC(2026, 2, 20) + (LOCAL_HOUR - loc.lon / 15) * 3600e3;
  widget.clock.currentTime = JulianDate.fromDate(new Date(ms));
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

const aboveGround = (s) => (s.ground === undefined ? undefined : s.alt - AIRCRAFT.gearHeight - s.ground);

let overRoof = false;

/**
 * What the aircraft would touch: the terrain, or a roof once you're above it. Flying into the
 * side of a building ends the flight.
 */
function groundUnder(s) {
  const lon = s.lon / DEG;
  const lat = s.lat / DEG;
  buildings.update(lon, lat, aboveGround(s));
  const terrain = terrainHeight(s) ?? s.ground;
  const roof = buildings.roofAt(lon, lat);
  const wheels = s.alt - AIRCRAFT.gearHeight;
  const wasOverRoof = overRoof;
  overRoof = roof !== undefined && wheels >= roof - 1;
  if (roof === undefined || (terrain !== undefined && roof <= terrain)) return terrain;
  if (!wasOverRoof && wheels < roof - 1) crash(s);
  return roof;
}

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
  if (picking) {
    if (input.pressed('Escape')) {
      endPicking();
      if (!plane) previewLocation(chosen);
    }
    return;
  }
  if (!plane) return;
  if (input.pressed('KeyC') || input.pressed('KeyV')) toggleView();
  if (input.pressed('Escape') || input.pressed('KeyP')) setPaused(!paused);
  if (plane?.crashed && !paused && input.pressed('Enter')) start();
}

scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  handleKeys();
  if (plane && !paused) {
    elapsed += dt;
    input.update(dt);
    const wasCrashed = plane.crashed;
    step(plane, input.controls, dt, groundUnder(plane));
    if (plane.crashed && !wasCrashed) showBanner('<strong>Crashed</strong><span>Press Enter to try again</span>');
  }
  input.endFrame();
  if (!plane || picking) return;

  Cartesian3.fromRadians(plane.lon, plane.lat, plane.alt, undefined, scratchPos);
  model.update(scratchPos, plane, { dt, agl: aboveGround(plane), visible: view === 'chase' });
  placeCamera(plane, scratchPos, dt);
});

scene.postRender.addEventListener(() => {
  if (!plane || paused) {
    hud.clear();
    return;
  }
  hud.draw(plane, { agl: aboveGround(plane), view, fovy: camera.frustum.fovy, t: elapsed, controls: input.controls });
});

startButton.addEventListener('click', start);
resumeButton.addEventListener('click', () => setPaused(false));

select(chosen);

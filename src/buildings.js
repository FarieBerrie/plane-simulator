// 3D buildings from OpenStreetMap: footprints and heights come from OpenFreeMap's vector tiles
// (free, no key), are set on the terrain and extruded. Only the 5×5 block of zoom-14 tiles
// around the aircraft is kept, so a flight over a big city stays light.
import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Credit,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
} from 'cesium';
import { PbfReader } from 'pbf';
import { buildingColor, featurePolygons, pointInRing, ringBounds } from './building-tiles.js';
import { terrainGrid } from './terrain.js';
import { lonLatToTilePixel, sampleGrid, TILE_SIZE } from './tiles.js';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const Z = 14; // the building layer's most detailed zoom
const RADIUS = 2; // tiles each side of the aircraft's tile: a 5×5 block, ±4–6 km
const MAX_AGL = 3000; // metres; higher than this, buildings are too small to bother loading
const MAX_LOADING = 4;
const SINK = 4; // walls start this far below the ground so they don't float on slopes
const DEFAULT_HEIGHT = 6;

const CREDIT = new Credit(
  'Buildings: <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org" target="_blank">OpenMapTiles</a>, data © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  true,
);

let tileTemplate;
function tileUrl(x, y) {
  tileTemplate ??= fetch(TILEJSON)
    .then((r) => r.json())
    .then((j) => j.tiles[0]);
  return tileTemplate.then((t) => t.replace('{z}', Z).replace('{x}', x).replace('{y}', y));
}

/** Decodes one tile's buildings into lon/lat footprints with base and roof heights (metres). */
async function loadBuildings(x, y) {
  const res = await fetch(await tileUrl(x, y));
  if (!res.ok) return [];
  const layer = new VectorTile(new PbfReader(await res.arrayBuffer())).layers.building;
  if (!layer) return [];
  const grid = await terrainGrid(Z, x, y).catch(() => null);
  const groundAt = ([lon, lat]) => {
    if (!grid) return 0;
    const t = lonLatToTilePixel(lon, lat, Z);
    return sampleGrid(grid, TILE_SIZE, t.px + (t.x - x) * TILE_SIZE, t.py + (t.y - y) * TILE_SIZE);
  };

  const buildings = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 3 || feature.properties.hide_3d) continue;
    const height = Number(feature.properties.render_height) || DEFAULT_HEIGHT;
    const minHeight = Number(feature.properties.render_min_height) || 0;
    for (const { outer, holes } of featurePolygons(classifyRings(feature.loadGeometry()), x, y, Z, layer.extent)) {
      const grounds = outer.map(groundAt);
      const ground = grounds.reduce((a, b) => a + b, 0) / grounds.length;
      buildings.push({
        outer,
        holes,
        bounds: ringBounds(outer),
        base: minHeight > 0 ? ground + minHeight : Math.min(...grounds) - SINK,
        top: ground + height,
        color: buildingColor(feature.id ?? i, height),
      });
    }
  }
  return buildings;
}

function createPrimitive(buildings) {
  const instances = [];
  for (const b of buildings) {
    if (b.top - b.base < 0.5) continue;
    instances.push(
      new GeometryInstance({
        geometry: new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(
            Cartesian3.fromDegreesArray(b.outer.flat()),
            b.holes.map((h) => new PolygonHierarchy(Cartesian3.fromDegreesArray(h.flat()))),
          ),
          height: b.base,
          extrudedHeight: b.top,
          closeBottom: false,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(b.color)) },
      }),
    );
  }
  if (!instances.length) return null;
  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
    releaseGeometryInstances: true,
    allowPicking: false,
  });
}

export function createBuildings(scene) {
  const tiles = new Map(); // "x/y" → { x, y, buildings, primitive }
  let loading = 0;
  let enabled = true;
  scene.frameState.creditDisplay.addStaticCredit(CREDIT);

  function unload(key) {
    const tile = tiles.get(key);
    if (tile?.primitive) scene.primitives.remove(tile.primitive); // remove() destroys it
    tiles.delete(key);
  }

  function load(x, y) {
    const key = `${x}/${y}`;
    const tile = { x, y, buildings: [], primitive: null };
    tiles.set(key, tile);
    loading++;
    loadBuildings(x, y)
      .then((buildings) => {
        if (tiles.get(key) !== tile) return; // unloaded while downloading
        tile.buildings = buildings;
        tile.primitive = createPrimitive(buildings);
        if (tile.primitive) {
          tile.primitive.show = enabled;
          scene.primitives.add(tile.primitive);
        }
      })
      .catch((error) => {
        console.warn(`Buildings for tile ${key} failed to load.`, error);
        if (tiles.get(key) === tile) setTimeout(() => tiles.get(key) === tile && tiles.delete(key), 15000); // retry later
      })
      .finally(() => loading--);
  }

  return {
    /** Loads the tiles around a point and drops the far ones. agl in metres (or undefined). */
    update(lonDeg, latDeg, agl) {
      const { x: cx, y: cy } = lonLatToTilePixel(lonDeg, latDeg, Z);
      for (const [key, tile] of tiles) {
        if (Math.abs(tile.x - cx) > RADIUS + 1 || Math.abs(tile.y - cy) > RADIUS + 1) unload(key);
      }
      if (!enabled || (agl ?? 0) > MAX_AGL) return;
      // Nearest first: the tile underneath, then its neighbours.
      const wanted = [];
      for (let dy = -RADIUS; dy <= RADIUS; dy++) for (let dx = -RADIUS; dx <= RADIUS; dx++) wanted.push([cx + dx, cy + dy, dx * dx + dy * dy]);
      wanted.sort((a, b) => a[2] - b[2]);
      for (const [x, y] of wanted) {
        if (loading >= MAX_LOADING) break;
        if (!tiles.has(`${x}/${y}`)) load(x, y);
      }
    },

    /** Height of the highest roof over a point, or undefined if there's no building there. */
    roofAt(lonDeg, latDeg) {
      if (!enabled) return undefined;
      const { x, y } = lonLatToTilePixel(lonDeg, latDeg, Z);
      const tile = tiles.get(`${x}/${y}`);
      if (!tile?.primitive?.ready) return undefined; // only buildings you can see are solid
      let roof;
      const p = [lonDeg, latDeg];
      for (const b of tile.buildings) {
        const [w, s, e, n] = b.bounds;
        if (lonDeg < w || lonDeg > e || latDeg < s || latDeg > n) continue;
        if (!pointInRing(p, b.outer) || b.holes.some((h) => pointInRing(p, h))) continue;
        if (roof === undefined || b.top > roof) roof = b.top;
      }
      return roof;
    },

    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = value;
      for (const tile of tiles.values()) if (tile.primitive) tile.primitive.show = value;
    },
  };
}

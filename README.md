# Plane Simulator

Fly a plane anywhere on Earth in your browser, over real terrain and satellite imagery. It's a
nod to the flight simulator that used to hide inside Google Earth, built on open-source software,
open elevation data and Esri's free satellite imagery. No accounts or API keys needed.

## Run it

```sh
npm install
npm run dev      # http://localhost:5191
npm test         # flight-model and terrain-tile tests
npm run build    # static site in dist/, deployable to any static host
```

## Fly it

Pick a starting point in the menu and press **Take off here**. You start in the air, trimmed for
level flight. To start anywhere else:

- **Search** for a place by name, like `Mount Fuji` or `Lake Tahoe`.
- **Type coordinates** into the same box: `36.1, -112.1`, `27.988N 86.925E` and similar.
- **Pick on globe**: drag and zoom the globe, then click where you want to start.

For a custom start you also choose the heading and the height above the ground.

| Keys | Does |
| --- | --- |
| `↑` `↓` or `W` `S` | Nose down / nose up (like a joystick: pull back to climb) |
| `←` `→` or `A` `D` | Roll. Bank to turn; the plane holds its bank until you roll back |
| `Q` `E` | Rudder; steers on the ground |
| `R` `F` or `PgUp` `PgDn` | Throttle |
| `Space` or `B` | Brakes |
| `C` | Chase or cockpit view |
| `Esc` or `P` | Pause / menu |

Gamepads work too: left stick flies, triggers throttle, bumpers rudder, A brakes.

Too slow (under ~80 kt) and the wings stall and the nose drops. Banking without pulling back
loses height. You can land on any flat-ish ground: touch down with less than ~1,200 ft/min of sink
and the wings nearly level.

## Where the data comes from

| What | Source | License |
| --- | --- | --- |
| Elevation | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium PNGs from SRTM, USGS NED, ETOPO1 and others) | Open data, attribution |
| Imagery | [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) (Esri, Vantor, Earthstar Geographics and the GIS User Community), sub-metre in most places | Not open data: free for non-commercial use with attribution (terms on the service page) |
| Place search | [Nominatim](https://nominatim.org) over OpenStreetMap data | ODbL, © OpenStreetMap contributors |
| Fallback imagery | [Sentinel-2 cloudless 2016](https://s2maps.eu) by EOX IT Services GmbH, used only if Esri can't be reached | CC BY 4.0 |
| 3D globe | [CesiumJS](https://cesium.com/platform/cesiumjs/) | Apache 2.0 |

Credits for the data on screen are shown in the bottom-right corner while you fly.

## How it fits together

- `src/flight.js`: the flight model, a point-mass aircraft steered by load factor, bank and
  rudder, with stalls, landing and crashes. No browser code, so it's unit tested.
- `src/tiles.js` and `src/terrain.js`: decode Terrarium elevation PNGs and feed them to Cesium as
  a custom heightmap terrain provider. Tiles past zoom 14 are cut from their zoom-14 parent.
- `src/imagery.js`: the satellite imagery, with a Sentinel-2 fallback.
- `src/hud.js`: the green head-up display, drawn on a canvas over the globe.
- `src/aircraft-shape.js` and `src/mesh.js`: the plane's shape, a low-wing single-engine sport
  plane lofted from fuselage stations and NACA airfoil sections. Pure data, unit tested.
- `src/aircraft.js`: renders it in Cesium, with a propeller that spins with the throttle and
  landing gear that comes down below 500 ft when slow.
- `src/input.js`: keyboard and gamepad.
- `src/locations.js`: the preset starting points. Add your own with a lat/lon, heading and altitude.
- `src/places.js`: coordinate parsing and place search for custom starting points.

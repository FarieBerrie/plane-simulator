# Plane Simulator

Fly a plane anywhere on Earth in your browser, over real terrain and satellite imagery. It's a
nod to the flight simulator that used to hide inside Google Earth, built entirely on open data
and open-source software. No accounts or API keys needed.

## Run it

```sh
npm install
npm run dev      # http://localhost:5191
npm test         # flight-model and terrain-tile tests
npm run build    # static site in dist/, deployable to any static host
```

## Fly it

Pick a starting point in the menu and press **Take off here**. You start in the air, trimmed for
level flight.

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
| Global imagery | [Sentinel-2 cloudless 2016](https://s2maps.eu) by EOX IT Services GmbH | CC BY 4.0 |
| US imagery (sharper) | [USGS The National Map](https://www.usgs.gov/programs/national-geospatial-program/national-map) | Public domain |
| 3D globe | [CesiumJS](https://cesium.com/platform/cesiumjs/) | Apache 2.0 |

Credits for the data on screen are shown in the bottom-right corner while you fly.

## How it fits together

- `src/flight.js`: the flight model, a point-mass aircraft steered by load factor, bank and
  rudder, with stalls, landing and crashes. No browser code, so it's unit tested.
- `src/tiles.js` and `src/terrain.js`: decode Terrarium elevation PNGs and feed them to Cesium as
  a custom heightmap terrain provider. Tiles past zoom 14 are cut from their zoom-14 parent.
- `src/imagery.js`: the satellite layers.
- `src/hud.js`: the green head-up display, drawn on a canvas over the globe.
- `src/aircraft.js`: a low-poly plane made from boxes, for the chase view.
- `src/input.js`: keyboard and gamepad.
- `src/locations.js`: starting points. Add your own with a lat/lon, heading and altitude.

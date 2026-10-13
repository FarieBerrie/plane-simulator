// Open imagery: Sentinel-2 cloudless covers the globe at ~10 m; over the continental US the
// public-domain USGS aerial photos (~1 m) are layered on top.
import { Credit, ImageryLayer, Rectangle, UrlTemplateImageryProvider } from 'cesium';

export function createBaseLayer() {
  return new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
      maximumLevel: 14,
      credit: new Credit(
        'Imagery: <a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 &amp; 2017), CC BY 4.0',
        true,
      ),
    }),
  );
}

export function createDetailLayer() {
  return new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 16,
      rectangle: Rectangle.fromDegrees(-125, 24.5, -66.5, 49.5),
      credit: new Credit('US imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank">USGS The National Map</a>', true),
    }),
  );
}

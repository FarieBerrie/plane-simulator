// Satellite imagery: Esri World Imagery, sub-metre in most populated places and global. It isn't
// open data; Esri's terms allow free non-commercial use with the attribution below. If the Esri
// service can't be reached, the open Sentinel-2 cloudless mosaic (~10 m) is used instead.
import { ArcGisMapServerImageryProvider, Credit, ImageryLayer, UrlTemplateImageryProvider } from 'cesium';

const ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';

function createEsriLayer() {
  return ImageryLayer.fromProviderAsync(
    ArcGisMapServerImageryProvider.fromUrl(ESRI_URL, {
      enablePickFeatures: false,
      credit: new Credit(
        'Powered by <a href="https://www.esri.com" target="_blank">Esri</a>. Imagery: Esri, Vantor, Earthstar Geographics and the GIS User Community',
        true,
      ),
    }),
  );
}

function createSentinelLayer() {
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

/** Adds the imagery to a Cesium widget, falling back to Sentinel-2 if Esri fails to load. */
export function addImagery(widget) {
  const esri = createEsriLayer();
  esri.errorEvent.addEventListener((error) => {
    console.warn('Esri World Imagery unavailable, using Sentinel-2 cloudless instead.', error);
    widget.imageryLayers.remove(esri);
    widget.imageryLayers.add(createSentinelLayer(), 0);
  });
  widget.imageryLayers.add(esri);
}

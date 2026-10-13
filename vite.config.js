import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Cesium loads its web workers, textures and widget CSS at runtime from CESIUM_BASE_URL
// (set in index.html), so those folders are served as-is under ./cesium/.
export default defineConfig({
  base: './',
  server: { port: 5191 },
  build: { chunkSizeWarningLimit: 6000 },
  plugins: [
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
        src: `node_modules/cesium/Build/Cesium/${dir}`,
        dest: 'cesium',
        rename: { stripBase: 4 }, // drop node_modules/cesium/Build/Cesium
      })),
    }),
  ],
});

// The look of the 3D buildings: a shader that paints windows onto walls procedurally, sized in
// metres from the mesh's texture coordinates (see building-mesh.js), so there are no image
// textures to download. Patterns fade to their average colour with distance instead of shimmering.
import { Appearance } from 'cesium';

const vertexShaderSource = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in vec4 color;
in float facade;
in float batchId;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec2 v_st;
out vec3 v_color;
out float v_facade;

void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_st = st;
  v_color = color.rgb;
  v_facade = facade;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`;

// Facade codes match FACADE in building-mesh.js: 0 roof, 1 windows, 2 glass tower, 3 house.
const fragmentShaderSource = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;
in vec3 v_color;
in float v_facade;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 1 inside [lo, hi] of a repeating cell, 0 outside, with edges softened by the pixel footprint.
float band(float f, float lo, float hi, float w) {
  return smoothstep(lo - w, lo + w, f) - smoothstep(hi - w, hi + w, f);
}

void main() {
  vec3 wall = v_color;
  vec3 color = wall;

  if (v_facade < 0.5) {
    // Roofs: a little darker than the walls, with gravel-like speckle per square metre.
    color = wall * (0.72 + 0.1 * hash(floor(v_st)));
  } else {
    // Bay width and floor height in metres, and the window's share of each cell.
    vec2 cellSize = vec2(3.2, 3.3);
    vec4 window = vec4(0.22, 0.78, 0.3, 0.8); // x from, x to, y from, y to
    if (v_facade > 2.5) {          // house: fewer, smaller windows
      cellSize = vec2(4.5, 3.0);
      window = vec4(0.3, 0.65, 0.35, 0.78);
    } else if (v_facade > 1.5) {   // glass tower: wide panes, thin mullions and floor slabs
      cellSize = vec2(1.6, 3.8);
      window = vec4(0.06, 0.94, 0.14, 0.92);
    }

    vec2 cell = v_st / cellSize;
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    vec2 w = fwidth(cell);

    // Far away a cell covers only a pixel or two, so each direction fades on its own to its
    // average coverage instead of shimmering. Floors are taller than bays are wide, so the
    // floor stripes outlast the individual windows.
    vec2 fade = clamp(1.5 - 2.5 * w, 0.0, 1.0); // full detail above ~3 px per cell
    float across = mix(window.y - window.x, band(f.x, window.x, window.y, w.x), fade.x);
    float up = mix(window.w - window.z, band(f.y, window.z, window.w, w.y), fade.y);
    float glass = id.y < 0.0 ? 0.0 : across * up; // nothing below the ground

    // Glass reflects the sky; curtain walls are tinted by the building's colour.
    vec3 glassTint = vec3(0.24, 0.30, 0.37);
    if (v_facade > 1.5 && v_facade < 2.5) glassTint = mix(vec3(0.30, 0.38, 0.46), wall, 0.3);

    // Up close each pane differs a little, and the odd room has its lights on.
    float r = hash(id + floor(v_st.x / 40.0));
    vec3 pane = glassTint * (0.75 + 0.5 * r);
    if (r > 0.94 && v_facade < 1.5) pane = vec3(0.75, 0.66, 0.46);
    if (id.y == 0.0 && v_facade < 1.5) pane = vec3(0.17, 0.18, 0.2); // shopfronts

    // Per-pane variation only once panes are big enough to see.
    color = mix(wall, mix(glassTint, pane, min(fade.x, fade.y)), glass);
  }

  vec3 n = normalize(v_normalEC);
  float sun = max(dot(n, czm_lightDirectionEC), 0.0);
  float sky = 0.5 + 0.5 * n.y; // a touch brighter facing up than down, in eye space
  color *= 0.5 + 0.12 * sky + 0.5 * sun;

  color = czm_fog(length(v_positionEC), color, vec3(0.72, 0.80, 0.88));
  out_FragColor = vec4(color, 1.0);
}
`;

export function createBuildingAppearance() {
  return new Appearance({
    translucent: false,
    closed: true,
    vertexShaderSource,
    fragmentShaderSource,
    renderState: Appearance.getDefaultRenderState(false, true),
  });
}

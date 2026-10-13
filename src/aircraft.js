// A simple low-poly aircraft built from boxes, so the chase view has something to follow without
// shipping a 3D model. Body axes: +X forward, +Y left, +Z up, in metres.
import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  HeadingPitchRoll,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  Transforms,
} from 'cesium';

const WHITE = Color.fromCssColorString('#f2f2ee');
const RED = Color.fromCssColorString('#d23a2a');
const GLASS = Color.fromCssColorString('#1d2f4a');
const GRAY = Color.fromCssColorString('#8a9099');

const PARTS = [
  // [length, span, height], [x, y, z], colour
  [[11, 1.5, 1.6], [0, 0, 0], WHITE], // fuselage
  [[1.6, 1.1, 1.1], [6.2, 0, -0.1], GRAY], // nose
  [[2.4, 1, 0.7], [2.6, 0, 1.0], GLASS], // canopy
  [[2.8, 13, 0.25], [0.6, 0, -0.35], WHITE], // wing
  [[1.2, 0.6, 0.3], [0.5, 6.6, -0.35], RED], // left wingtip
  [[1.2, 0.6, 0.3], [0.5, -6.6, -0.35], RED], // right wingtip
  [[1.6, 4.8, 0.2], [-5, 0, 0.35], WHITE], // tailplane
  [[2, 0.25, 2.4], [-4.9, 0, 1.6], RED], // fin
];

export function createAircraftModel() {
  const geometryInstances = PARTS.map(
    ([size, offset, color]) =>
      new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(...size),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(...offset)),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
      }),
  );
  const primitive = new Primitive({
    geometryInstances,
    appearance: new PerInstanceColorAppearance({ closed: true }),
    asynchronous: false,
  });
  const hpr = new HeadingPitchRoll();
  return {
    primitive,
    /** Places the model at a world position with the aircraft's heading, pitch and roll. */
    update(position, s) {
      // Cesium's model frame faces east at heading 0; ours faces north.
      hpr.heading = s.heading - Math.PI / 2;
      hpr.pitch = s.pitch;
      hpr.roll = s.roll;
      Transforms.headingPitchRollToFixedFrame(position, hpr, undefined, undefined, primitive.modelMatrix);
    },
  };
}

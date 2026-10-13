// Renders the aircraft from aircraft-shape.js: the airframe, landing gear that comes down near
// the ground, and a propeller that spins with the throttle (a translucent disc at speed).
import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  HeadingPitchRoll,
  Matrix3,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveType,
  Transforms,
} from 'cesium';
import { buildAircraft } from './aircraft-shape.js';

const GEAR_DOWN_BELOW = 150; // metres above ground
const GEAR_DOWN_SLOWER_THAN = 75; // m/s

function toGeometry({ positions, normals, indices }) {
  return new Geometry({
    attributes: new GeometryAttributes({
      position: new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
      normal: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: normals }),
    }),
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}

function createPrimitive(parts, { translucent = false, alpha = 1 } = {}) {
  return new Primitive({
    geometryInstances: parts.map(
      ({ color, mesh }) =>
        new GeometryInstance({
          geometry: toGeometry(mesh),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color).withAlpha(alpha)) },
        }),
    ),
    appearance: new PerInstanceColorAppearance({ translucent, closed: !translucent, flat: translucent }),
    asynchronous: false, // custom geometry has to be built on the main thread
  });
}

export function createAircraftModel(primitives) {
  const shape = buildAircraft();
  const body = primitives.add(createPrimitive(shape.body));
  const gear = primitives.add(createPrimitive(shape.gear));
  const propeller = primitives.add(createPrimitive(shape.propeller));
  const disc = primitives.add(createPrimitive([shape.disc], { translucent: true, alpha: 0.15 }));

  const hpr = new HeadingPitchRoll();
  const hub = Cartesian3.fromArray(shape.hub);
  const spin = new Matrix3();
  const hubLocal = new Matrix4();
  let propAngle = 0;

  return {
    /**
     * Places the model at a world position with the aircraft's attitude. agl is metres above the
     * ground (undefined if unknown); visible hides everything, e.g. in the cockpit view.
     */
    update(position, s, { dt, agl, visible }) {
      // Cesium's model frame faces east at heading 0; ours faces north.
      hpr.heading = s.heading - Math.PI / 2;
      hpr.pitch = s.pitch;
      hpr.roll = s.roll;
      Transforms.headingPitchRollToFixedFrame(position, hpr, undefined, undefined, body.modelMatrix);
      Matrix4.clone(body.modelMatrix, gear.modelMatrix);

      const running = !s.crashed && s.throttle > 0.02;
      const rpm = running ? 0.35 + 0.65 * s.throttle : 0;
      propAngle = (propAngle + rpm * 40 * dt) % (2 * Math.PI);
      Matrix4.fromRotationTranslation(Matrix3.fromRotationX(propAngle, spin), hub, hubLocal);
      Matrix4.multiply(body.modelMatrix, hubLocal, propeller.modelMatrix);
      Matrix4.clone(propeller.modelMatrix, disc.modelMatrix);

      const fast = rpm > 0.5;
      body.show = visible;
      gear.show = visible && (s.onGround || s.crashed || ((agl ?? Infinity) < GEAR_DOWN_BELOW && s.speed < GEAR_DOWN_SLOWER_THAN));
      propeller.show = visible && !fast;
      disc.show = visible && fast;
    },
  };
}

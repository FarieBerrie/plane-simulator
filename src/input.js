// Keyboard and gamepad → flight controls. Keys ramp the stick in and out so a tap gives a small
// correction and a hold gives full deflection.

const AXES = {
  elevator: { plus: ['ArrowDown', 'KeyS'], minus: ['ArrowUp', 'KeyW'] }, // stick back (Down) pulls the nose up
  aileron: { plus: ['ArrowRight', 'KeyD'], minus: ['ArrowLeft', 'KeyA'] },
  rudder: { plus: ['KeyE', 'Period'], minus: ['KeyQ', 'Comma'] },
};
const THROTTLE_UP = ['KeyR', 'PageUp', 'Equal', 'NumpadAdd'];
const THROTTLE_DOWN = ['KeyF', 'PageDown', 'Minus', 'NumpadSubtract'];
const BRAKE = ['KeyB', 'Space'];
const RAMP = 2.5; // stick travel per second while a key is held
const THROTTLE_RATE = 0.4;
const DEADZONE = 0.12;

export function createInput() {
  const held = new Set();
  const pressedOnce = new Set();
  const controls = { elevator: 0, aileron: 0, rudder: 0, throttle: 0.55, brake: 0 };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
    if (!e.repeat) pressedOnce.add(e.code);
    held.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code.startsWith('Page')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  const any = (codes) => codes.some((c) => held.has(c));
  const toward = (value, target, maxStep) => value + Math.max(-maxStep, Math.min(maxStep, target - value));
  const dead = (v) => (Math.abs(v) < DEADZONE ? 0 : v);

  function readPad() {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad?.connected) continue;
      const b = (i) => pad.buttons[i]?.value ?? 0;
      return {
        elevator: dead(pad.axes[1] ?? 0),
        aileron: dead(pad.axes[0] ?? 0),
        rudder: b(5) - b(4) || dead(pad.axes[2] ?? 0), // bumpers or right stick
        throttle: b(7) - b(6), // triggers move the throttle
        brake: b(0),
      };
    }
    return null;
  }

  return {
    controls,
    /** Updates `controls` for a frame of dt seconds. */
    update(dt) {
      const pad = readPad();
      for (const [axis, keys] of Object.entries(AXES)) {
        const target = (any(keys.plus) ? 1 : 0) - (any(keys.minus) ? 1 : 0);
        if (target || !pad) controls[axis] = toward(controls[axis], target, RAMP * dt * (target ? 1 : 2));
        else controls[axis] = pad[axis];
      }
      const throttleInput = (any(THROTTLE_UP) ? 1 : 0) - (any(THROTTLE_DOWN) ? 1 : 0) + (pad?.throttle ?? 0);
      controls.throttle = Math.min(1, Math.max(0, controls.throttle + throttleInput * THROTTLE_RATE * dt));
      controls.brake = any(BRAKE) ? 1 : (pad?.brake ?? 0);
    },
    /** True once per key press, for toggles. */
    pressed(code) {
      return pressedOnce.delete(code);
    },
    endFrame() {
      pressedOnce.clear();
    },
    reset(throttle) {
      Object.assign(controls, { elevator: 0, aileron: 0, rudder: 0, throttle, brake: 0 });
    },
  };
}

// Green head-up display drawn on a 2D canvas over the globe: pitch ladder, speed and altitude
// tapes, heading tape, throttle and warnings. Units are aviation's: knots, feet, feet per minute.

const KNOTS = 1.94384;
const FEET = 3.28084;
const GREEN = '#7dff8a';
const AMBER = '#ffbf3f';
const RED = '#ff4d4d';
const DEG = Math.PI / 180;
const COMPASS = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function text(str, x, y, { align = 'center', color = GREEN, size = 14, weight = 600 } = {}) {
    ctx.font = `${weight} ${size}px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** Pitch ladder and horizon, conformal with the cockpit camera (pxPerRad from its field of view). */
  function ladder(s, cx, cy, pxPerRad) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 220, cy - 190, 440, 380);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-s.roll);
    for (let deg = -90; deg <= 90; deg += 5) {
      const y = Math.tan(s.pitch - deg * DEG) * pxPerRad;
      if (Math.abs(y) > 260 || Math.abs(s.pitch - deg * DEG) > 1.2) continue;
      if (deg === 0) {
        line(-260, y, -40, y);
        line(40, y, 260, y);
        continue;
      }
      const major = deg % 10 === 0;
      const half = major ? 70 : 35;
      ctx.setLineDash(deg < 0 ? [8, 6] : []);
      line(-half - 30, y, -30, y);
      line(30, y, half + 30, y);
      ctx.setLineDash([]);
      const tick = deg > 0 ? 8 : -8;
      if (major) {
        line(-half - 30, y, -half - 30, y + tick);
        line(half + 30, y, half + 30, y + tick);
        text(String(Math.abs(deg)), -half - 48, y, { size: 12 });
        text(String(Math.abs(deg)), half + 48, y, { size: 12 });
      }
    }
    ctx.restore();
  }

  function aircraftSymbol(cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx - 44, cy);
    ctx.lineTo(cx - 16, cy);
    ctx.lineTo(cx - 8, cy + 10);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 8, cy + 10);
    ctx.lineTo(cx + 16, cy);
    ctx.lineTo(cx + 44, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function headingTape(s, cx, y) {
    const hdg = s.heading / DEG;
    const pxPerDeg = 6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 180, y - 24, 360, 40);
    ctx.clip();
    for (let d = Math.floor(hdg) - 32; d <= hdg + 32; d++) {
      if (d % 5) continue;
      const x = cx + (d - hdg) * pxPerDeg;
      const deg = ((d % 360) + 360) % 360;
      line(x, y, x, y + (deg % 10 ? 5 : 9));
      if (deg % 30 === 0) text(COMPASS[deg] ?? String(deg / 10).padStart(2, '0'), x, y - 10, { size: 13 });
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(cx, y + 12);
    ctx.lineTo(cx - 6, y + 20);
    ctx.lineTo(cx + 6, y + 20);
    ctx.closePath();
    ctx.fill();
    text(String(Math.round(hdg) % 360).padStart(3, '0'), cx, y + 32, { size: 15 });
  }

  function readout(label, value, x, y, align) {
    const boxW = 96;
    const bx = align === 'right' ? x - boxW : x;
    ctx.strokeRect(bx, y - 15, boxW, 30);
    text(value, bx + boxW / 2, y + 1, { size: 18, weight: 700 });
    text(label, bx + boxW / 2, y - 26, { size: 11 });
  }

  function throttleBar(s, x, y) {
    const barH = 90;
    ctx.strokeRect(x, y - barH, 12, barH);
    ctx.fillRect(x + 2, y - 2 - (barH - 4) * s.throttle, 8, (barH - 4) * s.throttle);
    text('THR', x + 6, y + 12, { size: 11 });
    text(`${Math.round(s.throttle * 100)}%`, x + 24, y - barH * s.throttle, { size: 11, align: 'left' });
  }

  function warnings(s, agl, t) {
    const blink = Math.floor(t * 2.5) % 2 === 0;
    const sinkTime = s.verticalSpeed < -1 ? agl / -s.verticalSpeed : Infinity;
    const cy = h / 2 + 120;
    if (!s.onGround && agl < 300 && sinkTime < 8) {
      if (blink) text('PULL UP', w / 2, cy, { color: RED, size: 26, weight: 800 });
    } else if (s.stalled) {
      if (blink) text('STALL', w / 2, cy, { color: AMBER, size: 26, weight: 800 });
    }
  }

  return {
    resize,
    /**
     * s: flight state; agl: metres above the terrain (or undefined);
     * view: 'cockpit' | 'chase'; fovy: camera vertical field of view in radians; t: seconds.
     */
    draw(s, { agl, view, fovy, t, controls }) {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = GREEN;
      ctx.fillStyle = GREEN;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 3;
      const cx = w / 2;
      const cy = h / 2;
      const compact = w < 640;

      if (view === 'cockpit') {
        ladder(s, cx, cy, h / 2 / Math.tan(fovy / 2));
        aircraftSymbol(cx, cy);
      }
      headingTape(s, cx, 48);

      const side = compact ? 12 : Math.max(24, cx - 330);
      readout('SPEED KT', String(Math.round(s.speed * KNOTS)), side, cy, 'left');
      readout('ALT FT', Math.round(s.alt * FEET).toLocaleString('en-US'), w - side, cy, 'right');
      const fpm = Math.round((s.verticalSpeed * FEET * 60) / 50) * 50;
      text(`${fpm > 0 ? '+' : ''}${fpm} FPM`, w - side - 48, cy + 30, { size: 13 });
      if (agl !== undefined) text(`RA ${Math.max(0, Math.round(agl * FEET)).toLocaleString('en-US')}`, w - side - 48, cy + 50, { size: 13 });

      throttleBar(s, side, h - 40);
      if (s.onGround) text(controls?.brake ? 'BRAKES' : 'GROUND', side + 48, cy + 30, { size: 13, color: controls?.brake ? AMBER : GREEN });
      text(
        `${Math.abs(s.lat / DEG).toFixed(4)}°${s.lat >= 0 ? 'N' : 'S'}  ${Math.abs(s.lon / DEG).toFixed(4)}°${s.lon >= 0 ? 'E' : 'W'}`,
        cx,
        h - 22,
        { size: 12, weight: 500 },
      );
      warnings(s, agl ?? Infinity, t);
      ctx.shadowBlur = 0;
    },
    clear() {
      ctx.clearRect(0, 0, w, h);
    },
  };
}

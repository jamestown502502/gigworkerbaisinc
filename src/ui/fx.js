// Tiny transient FX system for game feel: particle bursts, floating text, screen shake,
// and a full-screen tint pulse. All pooled/filtered arrays, zero overhead when empty.
import { drawText } from './text.js';

let parts = [];
let floaters = [];
let shake = { t: 0, dur: 0, mag: 0 };
let tint = { t: 0, dur: 0, color: null };

export function spawnBurst(x, y, { color = '#ffd700', count = 14, speed = 140 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    parts.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 40,
      life: 0.6 + Math.random() * 0.3,
      t: 0,
      color,
      r: 2 + Math.random() * 2,
    });
  }
}

/** A "+$40" / "-8 stress" style popup that drifts up and fades. */
export function spawnFloatingText(x, y, text, { color = '#ffffff', size = 18 } = {}) {
  floaters.push({ x, y, text, color, size, t: 0, life: 1.1 });
}

/** Brief camera shake — risky outcomes, QTE success/fail. Kept subtle: present, not nauseating. */
export function triggerShake(mag = 6, dur = 0.25) {
  shake = { t: 0, dur, mag: Math.max(shake.mag * (1 - shake.t / Math.max(shake.dur, 0.001)), mag) };
}

/** A brief full-screen color wash — a lightweight stand-in for hit-stop that can't desync any
 *  timing-sensitive state (QTE timers, travel progress) the way an actual frozen frame could. */
export function triggerTint(color, dur = 0.22) {
  tint = { t: 0, dur, color };
}

export function getShakeOffset() {
  if (shake.t >= shake.dur) return { x: 0, y: 0 };
  const falloff = 1 - shake.t / shake.dur;
  const mag = shake.mag * falloff;
  return { x: (Math.random() * 2 - 1) * mag, y: (Math.random() * 2 - 1) * mag };
}

export function updateFX(dt) {
  if (parts.length > 0) {
    for (const p of parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt; // gravity
    }
    parts = parts.filter((p) => p.t < p.life);
  }
  if (floaters.length > 0) {
    for (const f of floaters) {
      f.t += dt;
      f.y -= 28 * dt;
    }
    floaters = floaters.filter((f) => f.t < f.life);
  }
  if (shake.t < shake.dur) shake.t += dt;
  if (tint.t < tint.dur) tint.t += dt;
}

export function renderFX(ctx) {
  if (parts.length > 0) {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  }
  if (floaters.length > 0) {
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      drawText(ctx, f.text, f.x, f.y, { size: f.size, weight: 'bold', color: f.color, align: 'center', outline: true });
    }
    ctx.globalAlpha = 1;
  }
}

/** Drawn last, screen-space, unaffected by the shake translate — a wash over everything. */
export function renderTint(ctx) {
  if (tint.t >= tint.dur || !tint.color) return;
  const alpha = 0.35 * (1 - tint.t / tint.dur);
  ctx.fillStyle = tint.color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, 800, 600);
  ctx.globalAlpha = 1;
}

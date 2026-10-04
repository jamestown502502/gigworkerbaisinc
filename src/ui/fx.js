// Tiny transient FX system for game feel: particle bursts, floating text, screen shake,
// and a full-screen tint pulse. All pooled/filtered arrays, zero overhead when empty.
import { drawText } from './text.js';
import { METER_POS, easeOutCubic } from './juice.js';

let parts = [];
let floaters = [];
let shake = { t: 0, dur: 0, mag: 0 };
let tint = { t: 0, dur: 0, color: null };
// Tokens that arc from where a change happened to the HUD meter it changes, and the meter's
// answering bulge (2026-10-04): you see where the money went.
let tokens = [];
const bulge = { cash: 0, stress: 0, rep: 0, energy: 0, balance: 0 };
export const MAX_PARTICLES = 90;

export function spawnBurst(x, y, { color = '#ffd700', count = 14, speed = 140 } = {}) {
  count = Math.min(count, Math.max(0, MAX_PARTICLES - parts.length));   // a hard cap keeps phones smooth
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

/** A labelled token that flies in an arc to a HUD meter, which bulges when it lands. With Reduce
 *  Motion the meter just bulges. */
export function spawnFlyToken(x, y, key, text, color = '#ffffff', { delay = 0, calm = false } = {}) {
  if (!METER_POS[key]) return;
  if (calm) { bulge[key] = 0.3; return; }
  tokens.push({ x0: x, y0: y, key, text, color, t: -delay, life: 0.7 });
}
export function meterBulge(key) { return bulge[key] || 0; }
export function particleCount() { return parts.length; }
export function tokenCount() { return tokens.length; }

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
  if (tokens.length > 0) {
    for (const k of tokens) {
      const before = k.t;
      k.t += dt;
      if (before < k.life && k.t >= k.life) bulge[k.key] = 0.3;
    }
    tokens = tokens.filter((k) => k.t < k.life);
  }
  for (const key of Object.keys(bulge)) if (bulge[key] > 0) bulge[key] = Math.max(0, bulge[key] - dt);
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

/** Tokens in flight: a quadratic arc that rises before it falls into the meter. */
export function renderTokens(ctx) {
  for (const k of tokens) {
    if (k.t < 0) continue;
    const p = easeOutCubic(k.t / k.life), to = METER_POS[k.key];
    const cx = (k.x0 + to.x) / 2, cy = Math.min(k.y0, to.y) - 80;
    const x = (1 - p) * (1 - p) * k.x0 + 2 * (1 - p) * p * cx + p * p * to.x;
    const y = (1 - p) * (1 - p) * k.y0 + 2 * (1 - p) * p * cy + p * p * to.y;
    ctx.globalAlpha = p > 0.85 ? Math.max(0, (1 - p) / 0.15) : 1;
    drawText(ctx, k.text, x, y, { size: 15, weight: 'bold', color: k.color, align: 'center', outline: true });
  }
  ctx.globalAlpha = 1;
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

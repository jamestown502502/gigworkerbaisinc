// Tiny transient particle system for game feel: bursts on accept / payout.
// Pixel-square particles to match the art style. Empty array = zero overhead.
let parts = [];

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

export function updateFX(dt) {
  if (parts.length === 0) return;
  for (const p of parts) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 260 * dt;   // gravity
  }
  parts = parts.filter((p) => p.t < p.life);
}

export function renderFX(ctx) {
  if (parts.length === 0) return;
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
  }
  ctx.globalAlpha = 1;
}

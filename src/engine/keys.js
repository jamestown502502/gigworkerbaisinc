// Keyboard and gamepad play (web pivot, 2026-10-11). The game is drawn on one canvas and every
// screen and job challenge already answers to taps, so keys do not get their own code path: a
// focus point moves between this frame's tap targets (arrows / WASD / D-pad / left stick), and
// Enter / Space / A presses there exactly as a finger would (held = finger down, released = tap).
// Escape / Backspace / B is the same as the browser's Back button.

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
};
const PRESS_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']);
const BACK_KEYS = new Set(['Escape', 'Backspace']);

const STICK = 0.5;            // left-stick deflection that counts as a direction
const REPEAT_FIRST = 0.35;    // seconds a held direction waits before repeating
const REPEAT_EVERY = 0.16;

export const Keys = {
  queue: [],        // { type: 'move', dx, dy } | { type: 'down' } | { type: 'up' } | { type: 'back' }
  _held: new Set(), // press keys currently down, so key repeat never re-presses
  _pad: { dir: null, t: 0, a: false, b: false },

  init(target = window) {
    target.addEventListener('keydown', (e) => {
      // A screen-reader / Tab user on a mirrored button (ui/a11y.js): the browser presses it.
      if (isA11yButton(e.target) && (PRESS_KEYS.has(e.code) || e.code === 'Tab')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = MOVE_KEYS[e.code];
      if (dir) { e.preventDefault(); this.queue.push({ type: 'move', dx: dir[0], dy: dir[1] }); return; }
      if (PRESS_KEYS.has(e.code)) {
        e.preventDefault();
        if (!this._held.has(e.code)) { this._held.add(e.code); this.queue.push({ type: 'down' }); }
        return;
      }
      if (BACK_KEYS.has(e.code) && !e.repeat) { e.preventDefault(); this.queue.push({ type: 'back' }); }
    });
    target.addEventListener('keyup', (e) => {
      if (!this._held.has(e.code)) return;
      this._held.delete(e.code);
      if (this._held.size === 0) this.queue.push({ type: 'up' });
    });
    // Alt-tabbing away mid-press must not leave a finger stuck down.
    target.addEventListener('blur', () => { if (this._held.size) { this._held.clear(); this.queue.push({ type: 'up' }); } });
  },

  /** Read the first connected gamepad (standard mapping) into the same queue. Call once a frame. */
  pollGamepad(dt) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...(pads || [])].find((p) => p && p.connected);
    if (!gp) return;
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dir = btn(12) || ay < -STICK ? 'up' : btn(13) || ay > STICK ? 'down'
      : btn(14) || ax < -STICK ? 'left' : btn(15) || ax > STICK ? 'right' : null;
    const p = this._pad;
    if (dir !== p.dir) { p.dir = dir; p.t = -REPEAT_FIRST; if (dir) this.queue.push(moveFor(dir)); }
    else if (dir) { p.t += dt; if (p.t >= REPEAT_EVERY) { p.t = 0; this.queue.push(moveFor(dir)); } }
    const a = btn(0), b = btn(1) || btn(9);
    if (a !== p.a) { p.a = a; this.queue.push({ type: a ? 'down' : 'up' }); }
    if (b && !p.b) this.queue.push({ type: 'back' });
    p.b = b;
  },

  consume() { const q = this.queue; this.queue = []; return q; },
};

function moveFor(dir) {
  return { type: 'move', dx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy: dir === 'up' ? -1 : dir === 'down' ? 1 : 0 };
}

function isA11yButton(el) {
  return !!(el && el.tagName === 'BUTTON' && el.closest && el.closest('#a11y-layer'));
}

export const center = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });

/** The target whose center is closest to a point. */
export function nearest(pt, targets) {
  let best = null, bestD = Infinity;
  for (const t of targets) {
    const c = center(t), d = Math.hypot(c.x - pt.x, c.y - pt.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

/** The first target in reading order below the HUD strip. The gear and mute never take focus by
 *  default (only by moving there): Enter on a screen whose buttons have not appeared yet (travel)
 *  must not open settings. A full-screen "tap anywhere" target counts as below the strip. */
export function firstTarget(targets) {
  return [...targets].filter((t) => t.y >= 56 || t.h >= 600).sort((a, b) => (a.y - b.y) || (a.x - b.x))[0] || null;
}

/** The best target from `from` in direction (dx, dy): ahead of it, and favoring a straight line. */
export function pickInDirection(from, targets, dx, dy) {
  const f = center(from);
  let best = null, bestScore = Infinity;
  for (const t of targets) {
    if (t === from) continue;
    const c = center(t);
    const ahead = (c.x - f.x) * dx + (c.y - f.y) * dy;
    if (ahead <= 4) continue;
    const side = Math.abs((c.x - f.x) * dy - (c.y - f.y) * dx);
    const score = ahead + side * 2;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

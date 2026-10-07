// Job-shaped microgames (2026-09-29). Replaces the three generic skill challenges (a shrinking
// ring, numbered squares, a bouncing ball) that had nothing to do with the gig being worked. Each
// microgame here IS the job, WarioWare-style: one word to introduce it, a few seconds to play it,
// readable at a glance.
//
//   Help Move Furniture  -> LIFT!       your partner counts, lift together on three
//   Dog Walking          -> UNTANGLE!   free the dog whose leash is on top of the pile
//   Clean Out Garage     -> PACK!       fit the boxes into the trunk
//   Yard Work            -> RAKE!       sweep the leaves into the pile before the wind does
//   Logo Design          -> PROOFREAD!  catch the client's typos before the flyer prints
//   Mystery Shopping     -> SORT!       judge each return by the store's rules
//   Assemble IKEA        -> ASSEMBLE!   put the build steps in the right order        (2026-10-02)
//   Tutoring             -> PERCENT!    work the student's percent problems with them (2026-10-02)
//   Product Photography  -> FRAME!      place the product by the rule of thirds       (2026-10-02)
//
// Every result now carries a `lesson`: one real-world takeaway about doing the job well, shown on
// the result card. Where it fit, the lesson is the rule the game is scored on (PACK's heavy-goes-
// low, FRAME's thirds, PERCENT's arithmetic), because learning sticks best when it is the mechanic
// rather than a caption on it (Habgood & Ainsworth, 2011, "intrinsic integration").
//
// Stress shows up in your hands: the harder the day (difficultyFactor: stress, fatigue, low
// balance), the more the targets drift under your finger, and the tighter the timing. A calm
// evening and "Reduce timing pressure" both soften it, exactly as before.
//
// Every instance keeps the skill-QTE contract loop.js relies on: update(dt), render(ctx),
// handleTap(pt), done, result { success, score }.
import { difficultyFactor, AREA } from './qte.js';
import { drawText, drawWrapped, roundRectPath } from '../ui/text.js';
import { playTick, playSuccess, playFail, playError, playGood } from '../engine/audio.js';
import { InputManager } from '../engine/input.js';
import { RushShift, MarketDay } from './longform.js';
import { spawnBurst } from '../ui/fx.js';
import { easeOutBack, easeOutBounce } from '../ui/juice.js';
import { haptic } from '../engine/audio.js';

function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** How far stress makes things drift under your finger, in logical px, at time t. */
export function shakeOffset(d, t, seed = 0) {
  const a = Math.max(0, d - 1) * 7;
  return { x: Math.sin(t * 9.1 + seed) * a, y: Math.cos(t * 7.3 + seed * 1.7) * a };
}

/** The countdown, under the challenge's name and instruction line (the screen draws those at the
 *  top of the play area; a bar at the very top covered the name). */
function timerBar(ctx, frac) {
  ctx.fillStyle = '#3a2d1f';
  ctx.fillRect(AREA.x + 20, AREA.y + 52, AREA.w - 40, 6);
  ctx.fillStyle = frac > 0.3 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(AREA.x + 20, AREA.y + 52, (AREA.w - 40) * Math.max(0, frac), 6);
}

function inRect(pt, r) { return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h; }

/** One real-world takeaway per job, shown on the result card. Kept short enough for two lines
 *  there (tests/unit/microgames.test.js holds them to it). */
export const LESSONS = {
  lift: 'Agree on a count out loud, then lift with your legs, back straight. Lift together or not at all.',
  untangle: 'Unwind tangled leashes from the top of the pile down. Pulling one from the bottom tightens the knot.',
  pack: 'Heavy items ride low and forward. Up high, they slide and crush what is under them when you brake.',
  rake: 'Work with the wind, not against it. Rake small piles and bag them before a gust undoes the work.',
  proofread: 'Read slowly, one word at a time. Reading for meaning lets your eye skip right over typos.',
  sort: 'A receipt proves the price paid; tags prove it is unused. No receipt usually means store credit.',
  assemble: 'Read every step before the first screw, and sort the hardware. Order matters more than speed.',
  percent: 'Percent means "out of 100". Find 10% by moving the decimal one place, then build from there.',
  frame: 'Rule of thirds: put the subject on a third line, off center, with space on the side it faces.',
  packFragile: 'Heavy low, fragile on top: nothing should ever rest on what can break.',
  rakeShift: 'Check the wind again mid-job. A pile that was downwind an hour ago can be upwind now.',
  sortFinal: 'Final sale means no returns at all: no refund, no exchange, no credit. Say so kindly, up front.',
};

/** Variants (2026-10-07): after a challenge has been played twice (across runs), half the time it
 *  comes with one new rule, so the tenth play still asks something of you. The first time a variant
 *  appears, its own how-to card waits for a tap (introKey). */
export function variantFor(state, name, rand = Math.random) {
  return ((state?.microgamePlays || {})[name] || 0) >= 2 && rand() < 0.5;
}

// ---------------------------------------------------------------- LIFT! (Help Move Furniture)
const LIFT_LEAD = 0.45;
/** Seconds the finger must be held during the count for the lift to count as knees-bent. */
export const SQUAT_MIN = 0.35;
// Knees first (2026-10-02): press and hold during the count to bend your knees, let go on THREE to
// lift. A tap on THREE without bending still lifts, but with your back: half the score and not a
// clean lift. The skill being scored is the real one, a shared count AND a leg lift.
export class LiftOnThree {
  constructor(state) {
    this.name = 'LIFT!';
    this.hint = 'Hold to bend your knees during the count. Let go on THREE to lift together.';
    this.squat = 0; this.clean = [];
    this.d = difficultyFactor(state);
    this.items = shuffle(['Couch', 'Fridge', 'Dresser', 'Mattress']);
    this.beat = 0.62;
    this.window = 0.24 / this.d;          // seconds either side of "three"
    this.idx = 0; this.t = 0; this.rest = 0;
    this.scores = []; this.tapped = false; this.feedback = null; this.lastCount = -1;
    this.done = false; this.result = null;
  }
  liftAt() { return LIFT_LEAD + this.beat * 2; }
  count() { return this.t < LIFT_LEAD ? -1 : Math.min(2, Math.floor((this.t - LIFT_LEAD) / this.beat)); }
  bent() { return this.squat >= SQUAT_MIN; }
  update(dt, pointer = InputManager.pointer) {
    if (this.done) return;
    if (this.rest > 0) {
      this.rest -= dt;
      if (this.rest <= 0) {
        this.idx += 1;
        if (this.idx >= this.items.length) return this.finish();
        this.t = 0; this.tapped = false; this.feedback = null; this.lastCount = -1; this.squat = 0; this.backLift = false;
      }
      return;
    }
    this.t += dt;
    if (pointer?.down && !this.tapped) this.squat += dt;   // holding = knees bent
    const c = this.count();
    if (c !== this.lastCount && c >= 0) { this.lastCount = c; c < 2 ? playTick() : playGood(); }
    if (!this.tapped && this.t > this.liftAt() + this.window) this.endLift(0, 'Too slow. It drops back down.');
  }
  handleTap() {
    if (this.done || this.tapped || this.rest > 0) return;
    const diff = this.t - this.liftAt();
    if (Math.abs(diff) > this.window) return this.endLift(0, diff < 0 ? 'Too early. You lift alone.' : 'Too late. They lift alone.');
    const timing = Math.round(100 - (Math.abs(diff) / this.window) * 60);
    if (this.bent()) this.endLift(timing, 'Knees bent, together. Up it goes.', true);
    else this.endLift(Math.round(timing * 0.5), 'On time, but with your back. Hold first to bend your knees.');
  }
  endLift(score, text, clean = false) {
    this.tapped = true;
    this.backLift = score > 0 && !clean;
    this.clean.push(clean);
    this.scores.push(score);
    this.feedback = { ok: score > 0, text };
    score > 0 ? playTick() : playError();
    this.rest = 0.85;
  }
  finish() {
    const good = this.clean.filter(Boolean).length;
    this.result = { success: good >= 3, score: Math.round(this.scores.reduce((a, b) => a + b, 0) / this.items.length), lesson: LESSONS.lift };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    const cx = AREA.x + AREA.w / 2, floor = AREA.y + AREA.h - 70;
    const sh = shakeOffset(this.d, this.t, this.idx);
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(AREA.x + 30, floor); ctx.lineTo(AREA.x + AREA.w - 30, floor); ctx.stroke();
    const ok = this.feedback?.ok, lifted = this.tapped && ok ? Math.min(1, (0.85 - this.rest) / 0.4) : 0;
    const tilt = this.tapped && !ok ? 0.12 : 0;
    // squash while you bend (anticipation), stretch as it leaves the floor, settle at the top
    const bending = !this.tapped && this.squat > 0;
    const stretch = lifted > 0 && lifted < 1 ? Math.sin(lifted * Math.PI) * 0.12 : 0;
    const sqX = bending ? 1.05 : 1 - stretch * 0.5, sqY = bending ? 0.93 : 1 + stretch;
    // the item
    const w = 180, h = 90, ix = cx - w / 2 + sh.x, iy = floor - h - lifted * 60 + sh.y;
    ctx.save(); ctx.translate(ix + w / 2, iy + h / 2); ctx.rotate(tilt); ctx.scale(sqX, sqY);
    ctx.fillStyle = '#6b4a2e'; roundRectPath(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 3; roundRectPath(ctx, -w / 2, -h / 2, w, h, 8); ctx.stroke();
    ctx.restore();
    drawText(ctx, this.items[Math.min(this.idx, this.items.length - 1)], cx + sh.x, iy + h / 2 + 6, { size: 18, weight: 'bold', color: '#ffffff', align: 'center', outline: true });
    // you and your partner, holding the ends
    for (const side of [-1, 1]) {
      // you crouch while your knees are bent (holding), your partner on every count
      const crouch = side < 0 ? (!this.tapped && this.squat > 0 ? 22 : 0) : (!this.tapped && this.count() >= 0 ? 14 : 0);
      const px = cx + side * (w / 2 + 34), top = floor - 110 - lifted * 20 + crouch;
      ctx.fillStyle = side < 0 ? '#3498db' : '#e67e22';
      ctx.beginPath(); ctx.arc(px, top, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(px - 12, top + 18, 24, 50);
      ctx.fillRect(px - 12, top + 68, 9, floor - top - 68); ctx.fillRect(px + 3, top + 68, 9, floor - top - 68);
    }
    if (this.backLift) {
      // strain: a jagged red line down your back
      const bx = cx - (w / 2 + 34) - 18, by = floor - 100;
      ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by);
      for (let k = 1; k <= 5; k++) ctx.lineTo(bx + (k % 2 ? -7 : 7), by + k * 12);
      ctx.stroke();
    }
    drawText(ctx, 'You', cx - (w / 2 + 34), floor + 26, { size: 14, color: '#c9a876', align: 'center' });
    drawText(ctx, 'Partner', cx + (w / 2 + 34), floor + 26, { size: 14, color: '#c9a876', align: 'center' });
    // the count, from your partner
    const c = this.count();
    const say = this.tapped ? this.feedback.text : c < 0 ? 'Ready...' : ['One...', 'Two...', 'THREE!'][c];
    const color = this.tapped ? (ok ? '#2ecc71' : '#ff6b5e') : c === 2 ? '#f1c40f' : '#ffffff';
    drawText(ctx, say, cx, AREA.y + 70, { size: this.tapped ? 20 : 30, weight: 'bold', color, align: 'center', outline: true });
    drawText(ctx, `Lift ${Math.min(this.idx + 1, this.items.length)} of ${this.items.length}`, cx, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
    if (!this.tapped) drawText(ctx, this.bent() ? 'Knees bent. Let go on THREE.' : 'Press and hold to bend your knees', cx, AREA.y + 104, { size: 15, weight: 'bold', color: this.bent() ? '#9fe0b5' : '#f5deb3', align: 'center', outline: true });
  }
}

// ---------------------------------------------------------------- UNTANGLE! (Dog Walking)
const DOG_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];
const DOG_NAMES = ['Biscuit', 'Juniper', 'Moose', 'Pepper'];
export class UntangleLeash {
  constructor(state) {
    this.name = 'UNTANGLE!';
    this.hint = 'Tap the dog whose leash is on top of the pile.';
    this.d = difficultyFactor(state);
    const n = 4;
    this.anchor = { x: AREA.x + AREA.w / 2, y: AREA.y + AREA.h - 40 };
    const slots = shuffle([0, 1, 2, 3]);
    this.dogs = slots.map((slot, i) => ({
      i, x: AREA.x + 90 + slot * ((AREA.w - 180) / (n - 1)), y: AREA.y + 96,
      // the control point sits over a DIFFERENT dog's side, so the leashes cross
      cx: AREA.x + 90 + (n - 1 - slot) * ((AREA.w - 180) / (n - 1)) + (Math.random() - 0.5) * 60, cy: AREA.y + 200 + Math.random() * 60,
      free: false,
    }));
    this.stack = shuffle(this.dogs.map((d) => d.i)); // bottom first; the last one is on top
    this.timeMax = 10 / this.d; this.timeLeft = this.timeMax; this.t = 0;
    this.flash = 0; this.done = false; this.result = null;
  }
  top() { return this.stack[this.stack.length - 1]; }
  dogPos(dog) {
    const s = shakeOffset(this.d, this.t, dog.i);
    // a freed dog wags for a moment (side to side), then settles
    const wag = dog.free && this.t - dog.freedAt < 0.7 ? Math.sin((this.t - dog.freedAt) * 30) * 5 : 0;
    return { x: dog.x + s.x + wag, y: dog.y + s.y };
  }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 2);
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.finish(false);
  }
  handleTap(pt) {
    if (this.done) return;
    const hit = this.dogs.find((d) => !d.free && Math.hypot(pt.x - this.dogPos(d).x, pt.y - this.dogPos(d).y) <= 34);
    if (!hit) return;
    if (hit.i === this.top()) {
      hit.free = true; hit.freedAt = this.t; this.stack.pop(); playTick(); haptic(8);
      if (this.stack.length === 0) this.finish(true);
    } else {
      this.timeLeft = Math.max(0.1, this.timeLeft - 1.2); this.flash = 1; playError();
      this.flashText = `${DOG_NAMES[hit.i]}'s leash is under ${DOG_NAMES[this.top()]}'s. Top of the pile first.`;
    }
  }
  finish(success) {
    const freed = this.dogs.filter((d) => d.free).length;
    this.result = { success, score: success ? Math.round(50 + 50 * (this.timeLeft / this.timeMax)) : Math.round((freed / this.dogs.length) * 40), lesson: LESSONS.untangle };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    // tangled leashes, bottom of the pile first
    for (const idx of this.stack) {
      const dog = this.dogs[idx], p = this.dogPos(dog);
      for (const [w, c] of [[11, '#1d150d'], [7, DOG_COLORS[idx]]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(this.anchor.x, this.anchor.y); ctx.quadraticCurveTo(dog.cx, dog.cy, p.x, p.y + 20); ctx.stroke();
      }
    }
    for (const dog of this.dogs) {
      const p = this.dogPos(dog);
      if (dog.free) {
        ctx.strokeStyle = 'rgba(240,240,240,0.35)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.anchor.x, this.anchor.y); ctx.lineTo(p.x, p.y + 20); ctx.stroke();
      }
      ctx.fillStyle = DOG_COLORS[dog.i];
      ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - 18, p.y - 16, 9, 0, Math.PI * 2); ctx.arc(p.x + 18, p.y - 16, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d150d';
      ctx.beginPath(); ctx.arc(p.x - 8, p.y - 4, 3, 0, Math.PI * 2); ctx.arc(p.x + 8, p.y - 4, 3, 0, Math.PI * 2); ctx.fill();
      drawText(ctx, dog.free ? `${DOG_NAMES[dog.i]} ✓` : DOG_NAMES[dog.i], p.x, p.y + 46, { size: 13, weight: 'bold', color: dog.free ? '#2ecc71' : '#ffffff', align: 'center', outline: true });
    }
    ctx.fillStyle = '#f5deb3'; ctx.beginPath(); ctx.arc(this.anchor.x, this.anchor.y, 12, 0, Math.PI * 2); ctx.fill();
    if (this.flash > 0) drawText(ctx, this.flashText || 'That one was underneath.', AREA.x + AREA.w / 2, AREA.y + 300, { size: 16, weight: 'bold', color: '#ff8a7e', align: 'center', outline: true, maxWidth: AREA.w - 30 });
  }
}

// ---------------------------------------------------------------- PACK! (Clean Out Garage)
const GRID = { cols: 4, rows: 3, cell: 72, x: AREA.x + 40, y: AREA.y + 90 };
const PIECES = [[2, 2, 'Toolbox'], [2, 1, 'Bike rack'], [2, 1, 'Paint cans'], [1, 2, 'Lamp'], [1, 1, 'Box'], [1, 1, 'Fan']];
/** The heavy pieces. Packed for real, they ride on the floor of the trunk: up high they slide and
 *  crush what is under them when you brake. Scored, not just captioned. */
export const HEAVY = new Set(['Toolbox', 'Paint cans']);
const PIECE_COLORS = ['#8e6e4e', '#5d7a8a', '#9b59b6', '#c0873f', '#6f8f4e', '#b85c4e'];
export const FRAGILE = new Set(['Lamp', 'Fan']);
export class PackTheCar {
  constructor(state, opts = {}) {
    this.name = 'PACK!';
    this.variant = opts.variant ?? variantFor(state, 'PACK!');
    this.introKey = this.variant ? 'PACK!:fragile' : 'PACK!';
    this.fragileLow = 0;
    this.hint = this.variant
      ? 'New rule: the lamp and the fan are fragile, so they ride in the TOP row. Heavy items still go on the floor.'
      : 'Tap the trunk to drop the next item. Heavy items go on the floor (bottom row).';
    this.d = difficultyFactor(state);
    this.queue = shuffle(PIECES.map((p, i) => ({ w: p[0], h: p[1], label: p[2], color: PIECE_COLORS[i] })));
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    this.packed = 0; this.skipped = 0; this.heavyHigh = 0; this.warn = null;
    this.dropAt = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(-9));
    this.timeMax = 24 / this.d; this.timeLeft = this.timeMax; this.t = 0;
    this.flash = 0; this.done = false; this.result = null;
    this.preview = { x: AREA.x + 400, y: AREA.y + 100, w: 170, h: 170 };
    this.backSeat = { x: AREA.x + 400, y: AREA.y + 290, w: 170, h: 48 };
  }
  current() { return this.queue[0]; }
  fits(piece, col, row) {
    if (col + piece.w > GRID.cols || row + piece.h > GRID.rows) return false;
    for (let r = row; r < row + piece.h; r++) for (let c = col; c < col + piece.w; c++) if (this.grid[r][c]) return false;
    return true;
  }
  place(col, row) {
    const p = this.current();
    if (!p || !this.fits(p, col, row)) { this.flash = 1; playError(); return false; }
    for (let r = row; r < row + p.h; r++) for (let c = col; c < col + p.w; c++) { this.grid[r][c] = p.color; this.dropAt[r][c] = this.t; }
    if (HEAVY.has(p.label)) {
      spawnBurst(GRID.x + (col + p.w / 2) * GRID.cell, GRID.y + (row + p.h) * GRID.cell, { color: '#bfa98a', count: 10, speed: 70 });
      haptic(18);
    } else haptic(8);
    // heavy and not touching the floor: it still fits, but it will slide
    if (HEAVY.has(p.label) && row + p.h < GRID.rows) { this.heavyHigh += 1; this.warn = { text: `${p.label} up high will slide when you brake.`, t: 1.6 }; playError(); }
    if (this.variant && FRAGILE.has(p.label) && row !== 0) { this.fragileLow += 1; this.warn = { text: `${p.label} under other things may crack.`, t: 1.6 }; playError(); }
    this.queue.shift(); this.packed += 1; playTick();
    if (this.queue.length === 0) this.finish();
    return true;
  }
  rotate() { const p = this.current(); if (p) { [p.w, p.h] = [p.h, p.w]; playTick(); } }
  skip() { if (this.current()) { this.queue.shift(); this.skipped += 1; playError(); if (this.queue.length === 0) this.finish(); } }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 2);
    if (this.warn) { this.warn.t -= dt; if (this.warn.t <= 0) this.warn = null; }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.skipped += this.queue.length; this.queue = []; this.finish(); }
  }
  handleTap(pt) {
    if (this.done) return;
    const s = shakeOffset(this.d, this.t);
    const gx = pt.x - GRID.x - s.x, gy = pt.y - GRID.y - s.y;
    if (gx >= 0 && gy >= 0 && gx < GRID.cols * GRID.cell && gy < GRID.rows * GRID.cell) { this.place(Math.floor(gx / GRID.cell), Math.floor(gy / GRID.cell)); return; }
    if (inRect(pt, this.preview)) { this.rotate(); return; }
    if (inRect(pt, this.backSeat)) this.skip();
  }
  finish() {
    const total = PIECES.length;
    const success = this.packed >= total - 1;
    const raw = (this.packed / total) * 80 + (success ? 20 * Math.max(0, this.timeLeft) / this.timeMax : 0) - this.heavyHigh * 15 - this.fragileLow * 15;
    this.result = { success, score: Math.max(0, Math.round(raw)), lesson: this.variant ? LESSONS.packFragile : LESSONS.pack };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    const s = shakeOffset(this.d, this.t);
    drawText(ctx, 'The trunk', GRID.x + (GRID.cols * GRID.cell) / 2, GRID.y - 14, { size: 15, weight: 'bold', color: '#c9a876', align: 'center' });
    // the floor of the trunk, where heavy things belong
    ctx.fillStyle = 'rgba(255, 210, 122, 0.18)';
    ctx.fillRect(GRID.x + s.x, GRID.y + (GRID.rows - 1) * GRID.cell + s.y, GRID.cols * GRID.cell, GRID.cell);
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const drop = this.t - this.dropAt[r][c];
      const fall = drop >= 0 && drop < 0.3 ? (1 - easeOutBounce(drop / 0.3)) * 36 : 0;
      const x = GRID.x + c * GRID.cell + s.x, y = GRID.y + r * GRID.cell + s.y - fall;
      ctx.fillStyle = this.grid[r][c] ?? 'rgba(20,14,8,0.8)';
      ctx.fillRect(x + 2, y + 2, GRID.cell - 4, GRID.cell - 4);
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1; ctx.strokeRect(x + 2, y + 2, GRID.cell - 4, GRID.cell - 4);
    }
    const p = this.current();
    ctx.fillStyle = 'rgba(20,14,8,0.85)'; roundRectPath(ctx, this.preview.x, this.preview.y, this.preview.w, this.preview.h, 10); ctx.fill();
    ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, this.preview.x, this.preview.y, this.preview.w, this.preview.h, 10); ctx.stroke();
    drawText(ctx, 'Next item (tap to turn)', this.preview.x + this.preview.w / 2, this.preview.y - 10, { size: 13, color: '#c9a876', align: 'center' });
    if (p) {
      const u = 36, pw = p.w * u, ph = p.h * u;
      const px = this.preview.x + (this.preview.w - pw) / 2, py = this.preview.y + (this.preview.h - ph) / 2 - 8;
      ctx.fillStyle = p.color; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#1d150d'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, ph);
      drawText(ctx, HEAVY.has(p.label) ? `${p.label} (heavy)` : this.variant && FRAGILE.has(p.label) ? `${p.label} (fragile)` : p.label, this.preview.x + this.preview.w / 2, this.preview.y + this.preview.h - 14, { size: 14, weight: 'bold', color: HEAVY.has(p.label) ? '#ffd27a' : this.variant && FRAGILE.has(p.label) ? '#9fd8ff' : '#ffffff', align: 'center' });
    }
    ctx.fillStyle = '#5d4023'; roundRectPath(ctx, this.backSeat.x, this.backSeat.y, this.backSeat.w, this.backSeat.h, 9); ctx.fill();
    drawText(ctx, 'Back seat (skip)', this.backSeat.x + this.backSeat.w / 2, this.backSeat.y + 30, { size: 14, weight: 'bold', color: '#ffffff', align: 'center' });
    drawText(ctx, `Packed ${this.packed} of ${PIECES.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
    const msg = this.flash > 0 ? "Doesn't fit there." : this.warn ? this.warn.text : 'Floor of the trunk (heavy items)';
    drawText(ctx, msg, GRID.x + (GRID.cols * GRID.cell) / 2, GRID.y + GRID.rows * GRID.cell + 26, { size: 14, weight: this.flash > 0 || this.warn ? 'bold' : 'normal', color: this.flash > 0 || this.warn ? '#ff8a7e' : '#ffd27a', align: 'center', outline: true, maxWidth: GRID.cols * GRID.cell + 40 });
  }
}

// ---------------------------------------------------------------- RAKE! (Yard Work)
const LEAF_COLORS = ['#d35400', '#e67e22', '#c0392b', '#f39c12'];
export class RakeThePile {
  constructor(state, opts = {}) {
    this.name = 'RAKE!';
    this.variant = opts.variant ?? variantFor(state, 'RAKE!');
    this.introKey = this.variant ? 'RAKE!:shift' : 'RAKE!';
    this.shifted = false; this.shiftT = -9;
    this.hint = this.variant
      ? 'New rule: the wind turns halfway through. Rake fast while it helps you, or wait it out.'
      : 'Check the wind, tap where the pile goes, then drag the leaves into it.';
    this.d = difficultyFactor(state);
    // Downwind (2026-10-02): the wind blows one way this time; you choose where the pile goes. Gusts
    // carry loose leaves downwind, so a pile set downwind collects them and one set upwind loses
    // them. Reading the wind before you rake is the skill.
    this.wind = Math.random() < 0.5 ? 1 : -1;
    this.spots = [-1, 1].map((side) => ({ side, x: side < 0 ? AREA.x + 90 : AREA.x + AREA.w - 90, y: AREA.y + AREA.h - 80 }));
    this.pile = null; this.downwind = null; this.placeT = 0;
    this.leaves = Array.from({ length: 22 }, (_, i) => ({
      x: AREA.x + 160 + Math.random() * (AREA.w - 320), y: AREA.y + 90 + Math.random() * (AREA.h - 170),
      color: LEAF_COLORS[i % LEAF_COLORS.length], a: Math.random() * Math.PI, inPile: false,
    }));
    this.timeMax = 16 / this.d; this.timeLeft = this.timeMax; this.t = 0; // 14 + ~2 s to read the wind
    this.last = null; this.nextGust = 3.2; this.gust = 0;
    this.done = false; this.result = null;
  }
  inPileCount() { return this.leaves.filter((l) => l.inPile).length; }
  /** Put the pile on one side: -1 left, 1 right. */
  placePile(side) {
    if (this.pile) return;
    const spot = this.spots.find((sp) => sp.side === side);
    this.pile = { x: spot.x, y: spot.y, r: 62 };
    this.downwind = side === this.wind;
    playTick();
  }
  settle(l) {
    if (!this.pile) return;
    if (!l.inPile && Math.hypot(l.x - this.pile.x, l.y - this.pile.y) <= this.pile.r) {
      l.inPile = true;
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.pile.r * 0.6;
      l.x = this.pile.x + Math.cos(a) * r; l.y = this.pile.y + Math.sin(a) * r * 0.6;
    }
  }
  /** Sweep: loose leaves near the finger move with it. `pointer` is read from input; tests pass it. */
  update(dt, pointer = InputManager.pointer) {
    if (this.done) return;
    this.t += dt; this.gust = Math.max(0, this.gust - dt);
    // no choice after a few seconds: the pile goes where you are standing (the left), no-fail
    if (!this.pile) { this.placeT += dt; if (this.placeT >= 4) this.placePile(-1); }
    if (pointer?.down && this.pile) {
      if (this.last) {
        const dx = pointer.x - this.last.x, dy = pointer.y - this.last.y;
        for (const l of this.leaves) {
          // measured from where the finger WAS, and moved the full distance: a rake carries what it
          // touches, so one broad swipe gathers a whole row instead of dropping leaves behind it
          if (l.inPile || Math.hypot(l.x - this.last.x, l.y - this.last.y) > 52) continue;
          l.x = Math.max(AREA.x + 10, Math.min(AREA.x + AREA.w - 10, l.x + dx));
          l.y = Math.max(AREA.y + 66, Math.min(AREA.y + AREA.h - 10, l.y + dy));
          this.settle(l);
        }
      }
      this.last = { x: pointer.x, y: pointer.y };
    } else this.last = null;
    if (this.pile) this.nextGust -= dt;
    // Variant: halfway through, the wind turns around (and says so).
    if (this.variant && !this.shifted && this.pile && this.timeLeft <= this.timeMax / 2) {
      this.shifted = true; this.shiftT = this.t; this.wind = -this.wind; this.downwind = !this.downwind; playError();
    }
    if (this.nextGust <= 0 && this.pile) {   // a gust carries a few loose leaves downwind
      this.nextGust = 3.4; this.gust = 0.8;
      for (const l of shuffle(this.leaves.filter((x) => !x.inPile)).slice(0, 4)) {
        l.x = Math.max(AREA.x + 10, Math.min(AREA.x + AREA.w - 10, l.x + this.wind * (40 + Math.random() * 40)));
        l.y += (Math.random() - 0.5) * 30;
        this.settle(l);
      }
    }
    this.timeLeft -= dt;
    if (this.inPileCount() === this.leaves.length || this.timeLeft <= 0) this.finish();
  }
  handleTap(pt) {
    if (this.done) return;
    if (!this.pile) {
      const spot = this.spots.find((sp) => Math.hypot(pt.x - sp.x, pt.y - sp.y) <= 80);
      if (spot) this.placePile(spot.side);
      return;
    }
    for (const l of this.leaves) {
      if (l.inPile || Math.hypot(l.x - pt.x, l.y - pt.y) > 56) continue;
      const dx = this.pile.x - l.x, dy = this.pile.y - l.y, dist = Math.hypot(dx, dy) || 1;
      l.x += (dx / dist) * 48; l.y += (dy / dist) * 48;
      this.settle(l);
    }
  }
  finish() {
    const pct = this.inPileCount() / this.leaves.length;
    this.result = { success: pct >= 0.7, score: Math.round(pct * 100), lesson: this.variant ? LESSONS.rakeShift : LESSONS.rake, downwind: this.downwind };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    ctx.fillStyle = 'rgba(46, 90, 40, 0.35)'; ctx.fillRect(AREA.x, AREA.y + 62, AREA.w, AREA.h - 62);
    // the wind, always visible
    const turned = this.t - this.shiftT < 1.8;
    drawText(ctx, turned ? (this.wind > 0 ? 'The wind turns!  →  →' : '←  ←  The wind turns!') : this.wind > 0 ? 'Wind  →  →' : '←  ←  Wind', AREA.x + AREA.w / 2, AREA.y + 82, { size: 17, weight: 'bold', color: turned ? '#ffd27a' : '#d6eaf8', align: 'center', outline: true });
    if (!this.pile) {
      for (const sp of this.spots) {
        ctx.strokeStyle = '#f5deb3'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 62, 40, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        drawText(ctx, 'Pile here?', sp.x, sp.y + 6, { size: 14, weight: 'bold', color: '#f5deb3', align: 'center', outline: true });
      }
      drawText(ctx, 'Tap where the pile goes', AREA.x + AREA.w / 2, AREA.y + AREA.h - 46, { size: 16, weight: 'bold', color: '#ffd27a', align: 'center', outline: true });
    } else {
      ctx.fillStyle = 'rgba(120, 70, 30, 0.45)';
      const grown = 0.65 + 0.25 * (this.inPileCount() / this.leaves.length);   // the pile rises as it fills
      ctx.beginPath(); ctx.ellipse(this.pile.x, this.pile.y, this.pile.r, this.pile.r * grown, 0, 0, Math.PI * 2); ctx.fill();
      drawText(ctx, this.downwind ? 'The pile (downwind)' : 'The pile (upwind)', this.pile.x, this.pile.y + this.pile.r * 0.65 + 18, { size: 14, weight: 'bold', color: this.downwind ? '#9fe0b5' : '#ffb3a8', align: 'center', outline: true });
    }
    const s = shakeOffset(this.d, this.t);
    if (this.gust > 0) {
      // wind streaks blowing the way the wind goes
      ctx.strokeStyle = 'rgba(214, 234, 248, 0.45)'; ctx.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const yy = AREA.y + 130 + k * 55, run = ((this.t * 420 + k * 97) % (AREA.w + 120)) - 60;
        const xx = this.wind > 0 ? AREA.x + run : AREA.x + AREA.w - run;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + this.wind * 46, yy); ctx.stroke();
      }
    }
    this.leaves.forEach((l, idx) => {
      // loose leaves flutter: a sway and a slow spin; leaves in the pile lie still
      const sway = l.inPile ? 0 : Math.sin(this.t * 2.3 + idx) * 2.5;
      const spin = l.inPile ? 0 : Math.sin(this.t * 4 + idx * 1.7) * 0.35;
      ctx.save(); ctx.translate(l.x + sway + (l.inPile ? 0 : s.x * 0.5), l.y + (l.inPile ? 0 : s.y * 0.5)); ctx.rotate(l.a + spin);
      ctx.fillStyle = l.color; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    if (this.gust > 0) drawText(ctx, this.downwind ? 'A gust! It blows leaves into your pile.' : 'A gust! It blows leaves away from your pile.', AREA.x + AREA.w / 2, AREA.y + 110, { size: 15, weight: 'bold', color: '#d6eaf8', align: 'center', outline: true });
    drawText(ctx, `${this.inPileCount()} of ${this.leaves.length} in the pile`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center', outline: true });
  }
}

// ---------------------------------------------------------------- PROOFREAD! (Logo Design)
// Each flyer: the correct text, and the three words the client typed wrong ([correct, as typed]).
export const FLYERS = [
  { text: 'Grand opening this Saturday! Fresh bread, local coffee, and live music all afternoon.', typos: [['Grand', 'Grnad'], ['coffee,', 'cofee,'], ['afternoon.', 'afternon.']] },
  { text: 'Dog grooming by appointment. Gentle hands, fair prices, and every pup leaves with a treat.', typos: [['grooming', 'groomming'], ['prices,', 'prises,'], ['treat.', 'treet.']] },
  { text: 'Community garden cleanup this Sunday. Bring gloves and water. Snacks provided for all volunteers.', typos: [['garden', 'gardin'], ['gloves', 'glovs'], ['volunteers.', 'volunters.']] },
  { text: 'Now hiring friendly baristas. Flexible schedule, weekly pay, and free drinks on every shift.', typos: [['friendly', 'freindly'], ['schedule,', 'schedual,'], ['every', 'evrey']] },
  { text: 'Yoga in the park every morning at seven. All levels welcome. Bring a mat and a friend.', typos: [['Yoga', 'Yogga'], ['morning', 'morining'], ['welcome.', 'welcom.']] },
  { text: 'Bike repair clinic this Thursday. Flat tires, loose brakes, and squeaky chains fixed while you wait.', typos: [['repair', 'repiar'], ['brakes,', 'brakees,'], ['squeaky', 'squeeky']] },
];
export class ProofreadFlyer {
  constructor(state, flyer) {
    this.name = 'PROOFREAD!';
    this.hint = 'The flyer prints in seconds. Tap the three misspelled words.';
    this.d = difficultyFactor(state);
    const f = flyer ?? FLYERS[Math.floor(Math.random() * FLYERS.length)];
    const typoFor = new Map(f.typos);
    this.words = f.text.split(' ').map((w) => ({ shown: typoFor.get(w) ?? w, typo: typoFor.has(w), found: false, box: null }));
    this.timeMax = 13 / this.d; this.timeLeft = this.timeMax; this.t = 0;
    this.flash = 0; this.done = false; this.result = null;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 2);
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.finish(false);
  }
  handleTap(pt) {
    if (this.done) return;
    const w = this.words.find((x) => x.box && inRect(pt, x.box));
    if (!w) return;
    if (w.typo && !w.found) {
      w.found = true; w.foundAt = this.t; playTick(); haptic(8);
      if (this.words.every((x) => !x.typo || x.found)) this.finish(true);
    } else if (!w.typo) { this.timeLeft = Math.max(0.1, this.timeLeft - 1.5); this.flash = 1; playError(); }
  }
  finish(success) {
    const found = this.words.filter((x) => x.typo && x.found).length;
    this.result = { success, score: success ? Math.round(50 + 50 * (this.timeLeft / this.timeMax)) : Math.round((found / 3) * 40), lesson: LESSONS.proofread };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    const card = { x: AREA.x + 50, y: AREA.y + 62, w: AREA.w - 100, h: AREA.h - 122 };
    ctx.fillStyle = '#f7f1e3'; roundRectPath(ctx, card.x, card.y, card.w, card.h, 6); ctx.fill();
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; roundRectPath(ctx, card.x, card.y, card.w, card.h, 6); ctx.stroke();
    const s = shakeOffset(this.d, this.t);
    const size = 22, lineH = 40, space = 9;
    ctx.font = `${size}px system-ui, sans-serif`;
    let x = card.x + 26, y = card.y + 56;
    for (const w of this.words) {
      const ww = ctx.measureText(w.shown).width;
      if (x + ww > card.x + card.w - 26) { x = card.x + 26; y += lineH; }
      w.box = { x: x - 4 + s.x, y: y - size - 4 + s.y, w: ww + 8, h: size + 12 };
      if (w.found) {
        ctx.fillStyle = 'rgba(46,204,113,0.35)'; ctx.fillRect(w.box.x, w.box.y, w.box.w, w.box.h);
        // the red pen draws its circle around the typo
        const k = Math.min(1, (this.t - (w.foundAt ?? -1)) / 0.25);
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.ellipse(w.box.x + w.box.w / 2, w.box.y + w.box.h / 2, w.box.w / 2 + 6, w.box.h / 2 + 3, -0.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        ctx.stroke();
      }
      drawText(ctx, w.shown, x + s.x, y + s.y, { size, color: w.found ? '#145a32' : '#1d150d', shadow: false });
      x += ww + space;
    }
    drawText(ctx, `${this.words.filter((x) => x.typo && x.found).length} of 3 typos caught`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
    if (this.flash > 0) drawText(ctx, 'That one was right.', AREA.x + AREA.w / 2, card.y + card.h + 2, { size: 15, weight: 'bold', color: '#ff6b5e', align: 'center', outline: true });
  }
}

// ---------------------------------------------------------------- SORT! (Mystery Shopping)
export const SORT_BINS = [
  { id: 'refund', label: 'REFUND' },
  { id: 'exchange', label: 'EXCHANGE' },
  { id: 'credit', label: 'STORE CREDIT' },
];
export function binFor(item) { return item.finalSale ? 'none' : !item.receipt ? 'credit' : item.tags ? 'refund' : 'exchange'; }
const NO_RETURN_BIN = { id: 'none', label: 'NO RETURN' };
const RETURN_ITEMS = ['Sweater', 'Headphones', 'Sneakers', 'Desk lamp', 'Backpack', 'Rain jacket', 'Blender', 'Scarf'];
export class SortReturns {
  constructor(state, items, opts = {}) {
    this.name = 'SORT!';
    this.variant = opts.variant ?? (items ? false : variantFor(state, 'SORT!'));
    this.introKey = this.variant ? 'SORT!:final' : 'SORT!';
    this.hint = this.variant
      ? 'New rule: FINAL SALE items cannot be returned at all. Otherwise: receipt + tags refund, receipt only exchange, no receipt credit.'
      : 'Receipt and tags: refund. Receipt, no tags: exchange. No receipt: store credit.';
    this.d = difficultyFactor(state);
    const combos = shuffle([[true, true], [true, false], [false, true], [true, true], [false, false], [true, false]]);
    this.items = items ?? shuffle(RETURN_ITEMS).slice(0, 6).map((name, i) => ({ name, receipt: combos[i][0], tags: combos[i][1] }));
    if (this.variant) for (const i of shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2)) this.items[i].finalSale = true;
    this.idx = 0; this.correct = 0; this.perItem = 4.2 / this.d; this.itemLeft = this.perItem; this.t = 0;
    this.feedback = null; this.pause = 0;
    this.done = false; this.result = null;
    const bins = this.variant ? [...SORT_BINS, NO_RETURN_BIN] : SORT_BINS;
    const bw = this.variant ? 136 : 180, gap = this.variant ? 146 : 195;
    this.bins = bins.map((b, i) => ({ ...b, x: AREA.x + 20 + i * gap, y: AREA.y + AREA.h - 110, w: bw, h: 64 }));
  }
  judge(binId) {
    const item = this.items[this.idx];
    const right = binFor(item) === binId;
    if (right) { this.correct += 1; playTick(); haptic(8); } else { playError(); haptic(30); }
    this.hop = { id: binId, t: this.t, right };
    this.feedback = { right, text: right ? 'Correct.' : `That one is ${[...SORT_BINS, NO_RETURN_BIN].find((b) => b.id === binFor(item)).label.toLowerCase()}.` };
    this.pause = 0.7;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.idx += 1; this.feedback = null; this.itemLeft = this.perItem;
        if (this.idx >= this.items.length) this.finish();
      }
      return;
    }
    this.itemLeft -= dt;
    if (this.itemLeft <= 0) this.judge(null);
  }
  handleTap(pt) {
    if (this.done || this.pause > 0) return;
    const s = shakeOffset(this.d, this.t);
    const b = this.bins.find((x) => inRect({ x: pt.x - s.x, y: pt.y - s.y }, x));
    if (b) this.judge(b.id);
  }
  finish() {
    this.result = { success: this.correct >= this.items.length - 1, score: Math.round((this.correct / this.items.length) * 100), lesson: this.variant ? LESSONS.sortFinal : LESSONS.sort };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.itemLeft / this.perItem);
    // the rules are the challenge's own hint line, which stays on screen above the play area
    const item = this.items[Math.min(this.idx, this.items.length - 1)];
    const card = { x: AREA.x + 150, y: AREA.y + 86, w: 300, h: 150 };
    ctx.fillStyle = 'rgba(20,14,8,0.88)'; roundRectPath(ctx, card.x, card.y, card.w, card.h, 12); ctx.fill();
    ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, card.x, card.y, card.w, card.h, 12); ctx.stroke();
    drawText(ctx, item.name, card.x + card.w / 2, card.y + 42, { size: 24, weight: 'bold', color: '#ffffff', align: 'center' });
    drawText(ctx, `Receipt: ${item.receipt ? 'yes' : 'no'}`, card.x + card.w / 2, card.y + 84, { size: 18, color: item.receipt ? '#2ecc71' : '#ff8a7e', align: 'center' });
    drawText(ctx, `Tags on: ${item.tags ? 'yes' : 'no'}`, card.x + card.w / 2, card.y + 114, { size: 18, color: item.tags ? '#2ecc71' : '#ff8a7e', align: 'center' });
    if (item.finalSale) drawText(ctx, 'FINAL SALE', card.x + card.w / 2, card.y + 140, { size: 13, weight: 'bold', color: '#ffd27a', align: 'center' });
    if (this.feedback) drawText(ctx, this.feedback.text, AREA.x + AREA.w / 2, card.y + card.h + 26, { size: 17, weight: 'bold', color: this.feedback.right ? '#2ecc71' : '#ff8a7e', align: 'center', outline: true });
    const s = shakeOffset(this.d, this.t);
    for (const b of this.bins) {
      const hopK = this.hop && this.hop.id === b.id ? (this.t - this.hop.t) / 0.28 : 2;
      const hy = hopK >= 0 && hopK < 1 ? -Math.sin(hopK * Math.PI) * 9 : 0;
      ctx.fillStyle = '#2b3d4f'; roundRectPath(ctx, b.x + s.x, b.y + s.y + hy, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = hopK < 1 ? (this.hop.right ? '#2ecc71' : '#ff6b5e') : '#c9a876'; ctx.lineWidth = hopK < 1 ? 3 : 2; roundRectPath(ctx, b.x + s.x, b.y + s.y + hy, b.w, b.h, 10); ctx.stroke();
      drawText(ctx, b.label, b.x + b.w / 2 + s.x, b.y + b.h / 2 + s.y + hy, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle' });
    }
    drawText(ctx, `Item ${Math.min(this.idx + 1, this.items.length)} of ${this.items.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 14, color: '#f0f0f0', align: 'center' });
  }
}

// ---------------------------------------------------------------- ASSEMBLE! (Assemble IKEA Furniture)
// The build's steps, shuffled; tap them in the order you would do them. Each recipe hides one real
// rule of flat-pack assembly (the back panel squares the frame; bolts stay loose until the end;
// tall furniture gets anchored), and a wrong tap says which step has to come first.
export const RECIPES = [
  { piece: 'Wardrobe', steps: ['Read every step first', 'Sort screws and dowels', 'Build the frame', 'Nail on the back panel', 'Slide in the shelves', 'Hang the doors'],
    why: 'The back panel squares the frame, so it goes on before shelves and doors.' },
  { piece: 'Desk', steps: ['Read every step first', 'Sort the hardware', 'Bolt legs on loosely', 'Add the cross brace', 'Tighten every bolt', 'Flip it onto its feet'],
    why: 'Bolts stay loose until every piece is in, or the last piece will not line up.' },
  { piece: 'Bookshelf', steps: ['Read every step first', 'Sort the hardware', 'Join sides to the base', 'Nail on the back panel', 'Add the shelves', 'Anchor it to the wall'],
    why: 'Tall furniture tips over. The wall anchor is the step people skip and the one that matters.' },
];
export class AssembleSteps {
  constructor(state, recipe) {
    this.name = 'ASSEMBLE!';
    this.hint = 'Tap the build steps in the order you would actually do them.';
    this.d = difficultyFactor(state);
    this.recipe = recipe ?? RECIPES[Math.floor(Math.random() * RECIPES.length)];
    const order = shuffle(this.recipe.steps.map((text, i) => ({ text, i })));
    this.cards = order.map((c, k) => ({ ...c, done: false, box: { x: AREA.x + 22 + (k % 3) * 190, y: AREA.y + 96 + Math.floor(k / 3) * 96, w: 176, h: 80 } }));
    this.next = 0;
    this.timeMax = 18 / this.d; this.timeLeft = this.timeMax; this.t = 0;
    this.flash = 0; this.flashText = ''; this.mistakes = 0;
    this.done = false; this.result = null;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 0.8);
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.finish(false);
  }
  handleTap(pt) {
    if (this.done) return;
    const s = shakeOffset(this.d, this.t);
    const c = this.cards.find((x) => !x.done && inRect({ x: pt.x - s.x, y: pt.y - s.y }, x.box));
    if (!c) return;
    if (c.i === this.next) {
      c.done = true; c.doneAt = this.t; this.next += 1; playTick(); haptic(8);
      if (this.next >= this.cards.length) this.finish(true);
    } else {
      this.mistakes += 1; this.timeLeft = Math.max(0.1, this.timeLeft - 1.5); playError();
      this.flash = 1; this.flashText = `Not yet: "${this.recipe.steps[this.next]}" comes first.`;
    }
  }
  finish(success) {
    const placed = this.next;
    const score = success ? Math.round(55 + 45 * (this.timeLeft / this.timeMax)) - this.mistakes * 6 : Math.round((placed / this.cards.length) * 40);
    this.result = { success, score: Math.max(0, Math.min(100, score)), lesson: LESSONS.assemble };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    drawText(ctx, `Building: ${this.recipe.piece}`, AREA.x + AREA.w / 2, AREA.y + 80, { size: 16, weight: 'bold', color: '#c9a876', align: 'center' });
    const s = shakeOffset(this.d, this.t);
    for (const c of this.cards) {
      const pop = c.done && this.t - c.doneAt < 0.2 ? 1 + 0.08 * (1 - (this.t - c.doneAt) / 0.2) : 1;
      const b = { x: c.box.x + s.x - (c.box.w * (pop - 1)) / 2, y: c.box.y + s.y - (c.box.h * (pop - 1)) / 2, w: c.box.w * pop, h: c.box.h * pop };
      ctx.fillStyle = c.done ? '#2c6e49' : '#2b3d4f'; roundRectPath(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
      if (c.done) drawText(ctx, `${c.i + 1}`, b.x + 16, b.y + 24, { size: 16, weight: 'bold', color: '#ffd27a', align: 'center' });
      drawWrapped(ctx, c.text, b.x + b.w / 2 + (c.done ? 8 : 0), b.y + 34, b.w - 36, 19, { size: 15, weight: 'bold', color: '#ffffff', align: 'center', shadow: false });
    }
    if (this.flash > 0) drawText(ctx, this.flashText, AREA.x + AREA.w / 2, AREA.y + 312, { size: 15, weight: 'bold', color: '#ff8a7e', align: 'center', outline: true, maxWidth: AREA.w - 40 });
    else if (this.done && this.result.success) drawText(ctx, this.recipe.why, AREA.x + AREA.w / 2, AREA.y + 312, { size: 14, color: '#9fe0b5', align: 'center', maxWidth: AREA.w - 40 });
    drawText(ctx, `Step ${Math.min(this.next + 1, this.cards.length)} of ${this.cards.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
  }
}

// ---------------------------------------------------------------- PERCENT! (Tutoring — High School Math)
// The student's homework is the game: three percent problems about money they will actually meet
// (sales, tips, savings, rent, tax). Every answer, right or wrong, shows the working, because a
// worked example after each attempt is how the method transfers.
export const PERCENT_PROBLEMS = [
  { q: 'A $80 jacket is 25% off. What does it cost now?', answer: '$60', wrong: ['$55', '$20'], why: '25% is a quarter. A quarter of $80 is $20, and $80 - $20 = $60.' },
  { q: 'Dinner is $40. What is a 20% tip?', answer: '$8', wrong: ['$4', '$12'], why: '10% of $40 is $4 (move the decimal). 20% is double that: $8.' },
  { q: 'You earn $120 and save 15% of it. How much is saved?', answer: '$18', wrong: ['$15', '$12'], why: '10% is $12 and 5% is half of that, $6. $12 + $6 = $18.' },
  { q: 'Rent goes from $600 to $660. What percent increase?', answer: '10%', wrong: ['6%', '60%'], why: 'It rose $60. $60 out of $600 is 60/600, which is 10%.' },
  { q: 'A $50 game is on sale for $35. What percent off?', answer: '30%', wrong: ['15%', '35%'], why: '$15 off out of $50. 15/50 = 30/100, so 30% off.' },
  { q: 'Sales tax is 8%. What is the tax on $25?', answer: '$2', wrong: ['$8', '$0.80'], why: '1% of $25 is $0.25. Eight of those is $2.' },
  { q: 'You got 30 of 40 questions right. What is your score?', answer: '75%', wrong: ['70%', '30%'], why: '30 out of 40 is 3/4, which is 75 out of 100.' },
  { q: 'A $200 phone drops 50%, then 10% more off that price. Final?', answer: '$90', wrong: ['$80', '$100'], why: 'Half of $200 is $100. 10% off $100 is $10. So $90, not 60% off.' },
  { q: 'A $30 shirt is 10% off. What is the sale price?', answer: '$27', wrong: ['$20', '$3'], why: '10% of $30 is $3 (move the decimal). $30 - $3 = $27.' },
  { q: 'Lunch is $60. What is a 15% tip?', answer: '$9', wrong: ['$6', '$15'], why: '10% of $60 is $6 and 5% is half that, $3. $6 + $3 = $9.' },
  { q: 'Your $400 rent goes up 5%. What is the new rent?', answer: '$420', wrong: ['$405', '$450'], why: '1% of $400 is $4, so 5% is $20. $400 + $20 = $420.' },
  { q: 'You save $45 of your $300 pay. What percent is that?', answer: '15%', wrong: ['45%', '10%'], why: '45 out of 300 is the same as 15 out of 100: 15%.' },
  { q: 'A $90 coat is 20% off. How much do you save?', answer: '$18', wrong: ['$20', '$72'], why: '10% of $90 is $9. 20% is double that: $18 off.' },
  { q: 'Gas goes from $3.00 to $3.30 a gallon. What percent rise?', answer: '10%', wrong: ['30%', '3%'], why: 'It rose 30 cents. 30 cents of $3.00 is 0.30 / 3.00 = 10%.' },
  { q: 'You got 18 of 20 questions right. What is your score?', answer: '90%', wrong: ['18%', '80%'], why: '18 out of 20 is 9 out of 10, which is 90 out of 100.' },
  { q: 'A $150 bike is 40% off. What does it cost now?', answer: '$90', wrong: ['$60', '$110'], why: '10% of $150 is $15, so 40% is $60 off. $150 - $60 = $90.' },
];

/** `k` different problems for one visit, drawn from a deck kept in the save, so a problem does not
 *  come back until the whole bank has been worked through (QA round 3 #5: three random picks from
 *  eight repeated a question most visits). */
export function drawPercentProblems(state, k = 3) {
  if (!state) return shuffle(PERCENT_PROBLEMS).slice(0, k);
  const decks = state.eiDecks || (state.eiDecks = {});
  const picks = [];
  while (picks.length < k) {
    // a refilled deck leaves out what this visit already has, so one visit never repeats
    if (!Array.isArray(decks.percent) || decks.percent.length === 0) decks.percent = shuffle([...PERCENT_PROBLEMS.keys()]).filter((i) => !picks.includes(i));
    const i = decks.percent.pop();
    if (i < PERCENT_PROBLEMS.length) picks.push(i);
  }
  return picks.map((i) => PERCENT_PROBLEMS[i]);
}
export class PercentTutor {
  constructor(state, problems) {
    this.name = 'PERCENT!';
    this.hint = 'Work through the student\'s homework with them. Pick the right answer.';
    this.d = difficultyFactor(state);
    this.problems = (problems ?? drawPercentProblems(state, 3)).map((p) => ({ ...p, options: shuffle([p.answer, ...p.wrong]) }));
    this.idx = 0; this.correct = 0;
    this.perQ = 11 / this.d; this.qLeft = this.perQ; this.t = 0;
    this.timeMax = this.perQ * this.problems.length;
    this.reveal = null; this.buttons = [];
    this.done = false; this.result = null;
  }
  current() { return this.problems[Math.min(this.idx, this.problems.length - 1)]; }
  answer(opt) {
    if (this.done || this.reveal) return;
    const p = this.current();
    const right = opt === p.answer;
    if (right) { this.correct += 1; playGood(); } else playError();
    this.reveal = { right, picked: opt, t: 2.6 };
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.reveal) {
      this.reveal.t -= dt;
      if (this.reveal.t <= 0) {
        this.reveal = null; this.idx += 1; this.qLeft = this.perQ;
        if (this.idx >= this.problems.length) this.finish();
      }
      return;
    }
    this.qLeft -= dt;
    if (this.qLeft <= 0) this.answer(null);
  }
  handleTap(pt) {
    if (this.done || this.reveal) return;
    const s = shakeOffset(this.d, this.t);
    const b = this.buttons.find((x) => inRect({ x: pt.x - s.x, y: pt.y - s.y }, x));
    if (b) this.answer(b.opt);
  }
  finish() {
    const n = this.problems.length;
    this.result = { success: this.correct >= n - 1, score: Math.round((this.correct / n) * 100), lesson: LESSONS.percent };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.reveal ? 0 : this.qLeft / this.perQ);
    const p = this.current();
    drawWrapped(ctx, p.q, AREA.x + AREA.w / 2, AREA.y + 98, AREA.w - 80, 26, { size: 20, weight: 'bold', color: '#ffffff', align: 'center' });
    const s = shakeOffset(this.d, this.t);
    this.buttons = p.options.map((opt, i) => ({ opt, x: AREA.x + 45 + i * 180, y: AREA.y + 170, w: 150, h: 64 }));
    for (const b of this.buttons) {
      let fill = '#2b3d4f';
      if (this.reveal && b.opt === p.answer) fill = '#2c6e49';
      else if (this.reveal && b.opt === this.reveal.picked) fill = '#7a2e26';
      ctx.fillStyle = fill; roundRectPath(ctx, b.x + s.x, b.y + s.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, b.x + s.x, b.y + s.y, b.w, b.h, 10); ctx.stroke();
      drawText(ctx, b.opt, b.x + b.w / 2 + s.x, b.y + b.h / 2 + s.y, { size: 22, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle' });
    }
    if (this.reveal) {
      drawText(ctx, this.reveal.right ? 'Right.' : this.reveal.picked ? `Not ${this.reveal.picked}. It is ${p.answer}.` : `Time. It is ${p.answer}.`, AREA.x + AREA.w / 2, AREA.y + 272, { size: 17, weight: 'bold', color: this.reveal.right ? '#2ecc71' : '#ff8a7e', align: 'center' });
      drawWrapped(ctx, p.why, AREA.x + AREA.w / 2, AREA.y + 302, AREA.w - 80, 20, { size: 15, color: '#f5deb3', align: 'center' });
    }
    drawText(ctx, `Problem ${Math.min(this.idx + 1, this.problems.length)} of ${this.problems.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
  }
}

// ---------------------------------------------------------------- FRAME! (Photography — Product Shots)
// A viewfinder with the thirds drawn on it. Place the product on a third line, with the open space
// on the side it faces. Dead center still gets the shot, just a flat one; the wrong side crowds it.
export const FRAME_SHOTS = [
  { label: 'Coffee mug, spout facing right', facing: 'right' },
  { label: 'Sneaker, toe pointing left', facing: 'left' },
  { label: 'Potted plant, growing up', facing: 'up' },
  { label: 'Teapot, spout facing left', facing: 'left' },
  { label: 'Desk lamp, shining right', facing: 'right' },
  { label: 'Wristwatch, lying flat', facing: 'none' },
];
const VF = { x: AREA.x + 100, y: AREA.y + 92, w: 400, h: 240 };
/** The five places you can put the product: four thirds intersections and dead center. */
export const FRAME_SPOTS = [
  { id: 'tl', col: 1, row: 1 }, { id: 'tr', col: 2, row: 1 },
  { id: 'bl', col: 1, row: 2 }, { id: 'br', col: 2, row: 2 },
  { id: 'c', col: 1.5, row: 1.5 },
];
/** How good a spot is for a shot: 'good' (thirds, facing into space), 'flat' (center), or 'crowded'. */
export function frameVerdict(shot, spotId) {
  if (spotId === 'c') return 'flat';
  const left = spotId[1] === 'l', bottom = spotId[0] === 'b';
  if (shot.facing === 'right') return left ? 'good' : 'crowded';
  if (shot.facing === 'left') return left ? 'crowded' : 'good';
  if (shot.facing === 'up') return bottom ? 'good' : 'crowded';
  return 'good';
}
const FRAME_WHY = {
  good: 'On a third, with room on the side it faces. That reads as a real product shot.',
  flat: 'Dead center works, but it reads flat. Move it onto a third line.',
  crowded: 'It faces straight into the edge. Leave the open space on the side it faces.',
};
export class FrameShot {
  constructor(state, shots) {
    this.name = 'FRAME!';
    this.hint = 'Tap where the product goes: on a third, with space on the side it faces.';
    this.d = difficultyFactor(state);
    this.shots = shots ?? shuffle(FRAME_SHOTS).slice(0, 3);
    this.idx = 0; this.scores = [];
    this.perShot = 8 / this.d; this.shotLeft = this.perShot; this.t = 0;
    this.timeMax = this.perShot * this.shots.length;
    this.reveal = null;
    this.done = false; this.result = null;
  }
  current() { return this.shots[Math.min(this.idx, this.shots.length - 1)]; }
  spotPos(spot) { return { x: VF.x + (VF.w / 3) * spot.col, y: VF.y + (VF.h / 3) * spot.row }; }
  place(spotId) {
    if (this.done || this.reveal) return;
    const v = spotId ? frameVerdict(this.current(), spotId) : 'crowded';
    this.scores.push(v === 'good' ? 100 : v === 'flat' ? 45 : 0);
    v === 'good' ? playGood() : playError();
    this.reveal = { spotId, verdict: spotId ? v : 'time', t: 2.2 };
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.reveal) {
      this.reveal.t -= dt;
      if (this.reveal.t <= 0) {
        this.reveal = null; this.idx += 1; this.shotLeft = this.perShot;
        if (this.idx >= this.shots.length) this.finish();
      }
      return;
    }
    this.shotLeft -= dt;
    if (this.shotLeft <= 0) this.place(null);
  }
  handleTap(pt) {
    if (this.done || this.reveal) return;
    const s = shakeOffset(this.d, this.t);
    const spot = FRAME_SPOTS.find((sp) => { const p = this.spotPos(sp); return Math.hypot(pt.x - s.x - p.x, pt.y - s.y - p.y) <= 34; });
    if (spot) this.place(spot.id);
  }
  finish() {
    const good = this.scores.filter((x) => x === 100).length;
    this.result = { success: good >= 2, score: Math.round(this.scores.reduce((a, b) => a + b, 0) / this.shots.length), lesson: LESSONS.frame };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.reveal ? 0 : this.shotLeft / this.perShot);
    const shot = this.current();
    drawText(ctx, shot.label, AREA.x + AREA.w / 2, AREA.y + 80, { size: 17, weight: 'bold', color: '#ffd27a', align: 'center' });
    const s = shakeOffset(this.d, this.t);
    ctx.fillStyle = 'rgba(10, 10, 14, 0.85)'; ctx.fillRect(VF.x + s.x, VF.y + s.y, VF.w, VF.h);
    ctx.strokeStyle = 'rgba(240, 240, 240, 0.35)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 2; k++) {
      ctx.beginPath(); ctx.moveTo(VF.x + (VF.w / 3) * k + s.x, VF.y + s.y); ctx.lineTo(VF.x + (VF.w / 3) * k + s.x, VF.y + VF.h + s.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(VF.x + s.x, VF.y + (VF.h / 3) * k + s.y); ctx.lineTo(VF.x + VF.w + s.x, VF.y + (VF.h / 3) * k + s.y); ctx.stroke();
    }
    ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; ctx.strokeRect(VF.x + s.x, VF.y + s.y, VF.w, VF.h);
    for (const sp of FRAME_SPOTS) {
      const p = this.spotPos(sp);
      const chosen = this.reveal && this.reveal.spotId === sp.id;
      ctx.fillStyle = chosen ? (this.reveal.verdict === 'good' ? '#2ecc71' : '#e67e22') : 'rgba(255, 210, 122, 0.55)';
      ctx.beginPath(); ctx.arc(p.x + s.x, p.y + s.y, chosen ? 18 : 11, 0, Math.PI * 2); ctx.fill();
    }
    if (this.reveal && this.reveal.t > 2.0 && this.reveal.verdict !== 'time') {
      // the shutter: a quick white flash over the viewfinder as the shot is taken
      ctx.fillStyle = `rgba(255, 255, 255, ${((this.reveal.t - 2.0) / 0.2 * 0.55).toFixed(3)})`;
      ctx.fillRect(VF.x + s.x, VF.y + s.y, VF.w, VF.h);
    }
    if (this.reveal) {
      const text = this.reveal.verdict === 'time' ? 'The light changed. Shot missed.' : FRAME_WHY[this.reveal.verdict];
      drawText(ctx, text, AREA.x + AREA.w / 2, VF.y + VF.h + 30, { size: 15, weight: 'bold', color: this.reveal.verdict === 'good' ? '#9fe0b5' : '#ffb3a8', align: 'center', maxWidth: AREA.w - 30 });
    }
    drawText(ctx, `Shot ${Math.min(this.idx + 1, this.shots.length)} of ${this.shots.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
  }
}

/** Which microgame each gig plays, by its choice tree (unique per gig template). */
export const MICROGAME_BY_TREE = {
  movingHelp: LiftOnThree,
  dogWalking: UntangleLeash,
  garageClean: PackTheCar,
  yardWork: RakeThePile,
  creativeGig: ProofreadFlyer,
  mysteryShop: SortReturns,
  furnitureAssembly: AssembleSteps,
  tutoring: PercentTutor,
  photoGig: FrameShot,
  rushShift: RushShift,
  marketDay: MarketDay,
};

export function createQTE(gig, state) {
  const Cls = MICROGAME_BY_TREE[gig.choiceTree] ?? LiftOnThree;
  return new Cls(state);
}

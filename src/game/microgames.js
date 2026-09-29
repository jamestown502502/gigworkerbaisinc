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
//
// Stress shows up in your hands: the harder the day (difficultyFactor: stress, fatigue, low
// balance), the more the targets drift under your finger, and the tighter the timing. A calm
// evening and "Reduce timing pressure" both soften it, exactly as before.
//
// Every instance keeps the skill-QTE contract loop.js relies on: update(dt), render(ctx),
// handleTap(pt), done, result { success, score }.
import { difficultyFactor, AREA } from './qte.js';
import { drawText, roundRectPath } from '../ui/text.js';
import { playTick, playSuccess, playFail, playError, playGood } from '../engine/audio.js';
import { InputManager } from '../engine/input.js';

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

// ---------------------------------------------------------------- LIFT! (Help Move Furniture)
const LIFT_LEAD = 0.45;
export class LiftOnThree {
  constructor(state) {
    this.name = 'LIFT!';
    this.hint = 'Your partner counts to three. Tap on THREE, together.';
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
  update(dt) {
    if (this.done) return;
    if (this.rest > 0) {
      this.rest -= dt;
      if (this.rest <= 0) {
        this.idx += 1;
        if (this.idx >= this.items.length) return this.finish();
        this.t = 0; this.tapped = false; this.feedback = null; this.lastCount = -1;
      }
      return;
    }
    this.t += dt;
    const c = this.count();
    if (c !== this.lastCount && c >= 0) { this.lastCount = c; c < 2 ? playTick() : playGood(); }
    if (!this.tapped && this.t > this.liftAt() + this.window) this.endLift(0, 'Too slow. It drops back down.');
  }
  handleTap() {
    if (this.done || this.tapped || this.rest > 0) return;
    const diff = this.t - this.liftAt();
    if (Math.abs(diff) <= this.window) this.endLift(Math.round(100 - (Math.abs(diff) / this.window) * 60), 'Together. Up it goes.');
    else this.endLift(0, diff < 0 ? 'Too early. You lift alone.' : 'Too late. They lift alone.');
  }
  endLift(score, text) {
    this.tapped = true;
    this.scores.push(score);
    this.feedback = { ok: score > 0, text };
    score > 0 ? playTick() : playError();
    this.rest = 0.85;
  }
  finish() {
    const good = this.scores.filter((s) => s > 0).length;
    this.result = { success: good >= 3, score: Math.round(this.scores.reduce((a, b) => a + b, 0) / this.items.length) };
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
    // the item
    const w = 180, h = 90, ix = cx - w / 2 + sh.x, iy = floor - h - lifted * 60 + sh.y;
    ctx.save(); ctx.translate(ix + w / 2, iy + h / 2); ctx.rotate(tilt);
    ctx.fillStyle = '#6b4a2e'; roundRectPath(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 3; roundRectPath(ctx, -w / 2, -h / 2, w, h, 8); ctx.stroke();
    ctx.restore();
    drawText(ctx, this.items[Math.min(this.idx, this.items.length - 1)], cx + sh.x, iy + h / 2 + 6, { size: 18, weight: 'bold', color: '#ffffff', align: 'center', outline: true });
    // you and your partner, holding the ends
    for (const side of [-1, 1]) {
      const px = cx + side * (w / 2 + 34), top = floor - 110 - lifted * 20;
      ctx.fillStyle = side < 0 ? '#3498db' : '#e67e22';
      ctx.beginPath(); ctx.arc(px, top, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(px - 12, top + 18, 24, 50);
      ctx.fillRect(px - 12, top + 68, 9, floor - top - 68); ctx.fillRect(px + 3, top + 68, 9, floor - top - 68);
    }
    drawText(ctx, 'You', cx - (w / 2 + 34), floor + 26, { size: 14, color: '#c9a876', align: 'center' });
    drawText(ctx, 'Partner', cx + (w / 2 + 34), floor + 26, { size: 14, color: '#c9a876', align: 'center' });
    // the count, from your partner
    const c = this.count();
    const say = this.tapped ? this.feedback.text : c < 0 ? 'Ready...' : ['One...', 'Two...', 'THREE!'][c];
    const color = this.tapped ? (ok ? '#2ecc71' : '#ff6b5e') : c === 2 ? '#f1c40f' : '#ffffff';
    drawText(ctx, say, cx, AREA.y + 70, { size: this.tapped ? 20 : 30, weight: 'bold', color, align: 'center', outline: true });
    drawText(ctx, `Lift ${Math.min(this.idx + 1, this.items.length)} of ${this.items.length}`, cx, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
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
  dogPos(dog) { const s = shakeOffset(this.d, this.t, dog.i); return { x: dog.x + s.x, y: dog.y + s.y }; }
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
      hit.free = true; this.stack.pop(); playTick();
      if (this.stack.length === 0) this.finish(true);
    } else {
      this.timeLeft = Math.max(0.1, this.timeLeft - 1.2); this.flash = 1; playError();
    }
  }
  finish(success) {
    const freed = this.dogs.filter((d) => d.free).length;
    this.result = { success, score: success ? Math.round(50 + 50 * (this.timeLeft / this.timeMax)) : Math.round((freed / this.dogs.length) * 40) };
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
    if (this.flash > 0) drawText(ctx, 'Tighter! That one was underneath.', AREA.x + AREA.w / 2, AREA.y + 150, { size: 17, weight: 'bold', color: '#ff6b5e', align: 'center', outline: true });
  }
}

// ---------------------------------------------------------------- PACK! (Clean Out Garage)
const GRID = { cols: 4, rows: 3, cell: 72, x: AREA.x + 40, y: AREA.y + 90 };
const PIECES = [[2, 2, 'Toolbox'], [2, 1, 'Bike rack'], [2, 1, 'Paint cans'], [1, 2, 'Lamp'], [1, 1, 'Box'], [1, 1, 'Fan']];
const PIECE_COLORS = ['#8e6e4e', '#5d7a8a', '#9b59b6', '#c0873f', '#6f8f4e', '#b85c4e'];
export class PackTheCar {
  constructor(state) {
    this.name = 'PACK!';
    this.hint = 'Tap a space in the trunk to drop the next item there. Tap the item to turn it.';
    this.d = difficultyFactor(state);
    this.queue = shuffle(PIECES.map((p, i) => ({ w: p[0], h: p[1], label: p[2], color: PIECE_COLORS[i] })));
    this.grid = Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null));
    this.packed = 0; this.skipped = 0;
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
    for (let r = row; r < row + p.h; r++) for (let c = col; c < col + p.w; c++) this.grid[r][c] = p.color;
    this.queue.shift(); this.packed += 1; playTick();
    if (this.queue.length === 0) this.finish();
    return true;
  }
  rotate() { const p = this.current(); if (p) { [p.w, p.h] = [p.h, p.w]; playTick(); } }
  skip() { if (this.current()) { this.queue.shift(); this.skipped += 1; playError(); if (this.queue.length === 0) this.finish(); } }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 2);
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
    this.result = { success, score: Math.round((this.packed / total) * 80 + (success ? 20 * Math.max(0, this.timeLeft) / this.timeMax : 0)) };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    const s = shakeOffset(this.d, this.t);
    drawText(ctx, 'The trunk', GRID.x + (GRID.cols * GRID.cell) / 2, GRID.y - 14, { size: 15, weight: 'bold', color: '#c9a876', align: 'center' });
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const x = GRID.x + c * GRID.cell + s.x, y = GRID.y + r * GRID.cell + s.y;
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
      drawText(ctx, p.label, this.preview.x + this.preview.w / 2, this.preview.y + this.preview.h - 14, { size: 14, weight: 'bold', color: '#ffffff', align: 'center' });
    }
    ctx.fillStyle = '#5d4023'; roundRectPath(ctx, this.backSeat.x, this.backSeat.y, this.backSeat.w, this.backSeat.h, 9); ctx.fill();
    drawText(ctx, 'Back seat (skip)', this.backSeat.x + this.backSeat.w / 2, this.backSeat.y + 30, { size: 14, weight: 'bold', color: '#ffffff', align: 'center' });
    drawText(ctx, `Packed ${this.packed} of ${PIECES.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
    if (this.flash > 0) drawText(ctx, "Doesn't fit there.", GRID.x + (GRID.cols * GRID.cell) / 2, GRID.y + GRID.rows * GRID.cell + 26, { size: 15, weight: 'bold', color: '#ff6b5e', align: 'center', outline: true });
  }
}

// ---------------------------------------------------------------- RAKE! (Yard Work)
const LEAF_COLORS = ['#d35400', '#e67e22', '#c0392b', '#f39c12'];
export class RakeThePile {
  constructor(state) {
    this.name = 'RAKE!';
    this.hint = 'Drag across the leaves to sweep them into the pile. Tapping near leaves nudges them too.';
    this.d = difficultyFactor(state);
    this.pile = { x: AREA.x + AREA.w - 90, y: AREA.y + AREA.h - 80, r: 62 };
    this.leaves = Array.from({ length: 22 }, (_, i) => ({
      x: AREA.x + 40 + Math.random() * (AREA.w - 260), y: AREA.y + 70 + Math.random() * (AREA.h - 130),
      color: LEAF_COLORS[i % LEAF_COLORS.length], a: Math.random() * Math.PI, inPile: false,
    }));
    this.timeMax = 14 / this.d; this.timeLeft = this.timeMax; this.t = 0;
    this.last = null; this.nextGust = 3.2; this.gust = 0;
    this.done = false; this.result = null;
  }
  inPileCount() { return this.leaves.filter((l) => l.inPile).length; }
  settle(l) {
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
    if (pointer?.down) {
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
    this.nextGust -= dt;
    if (this.nextGust <= 0) {          // the wind takes a few loose ones back
      this.nextGust = 3.4; this.gust = 0.8;
      for (const l of shuffle(this.leaves.filter((x) => !x.inPile)).slice(0, 3)) { l.x -= 30 + Math.random() * 30; l.y += (Math.random() - 0.5) * 40; l.x = Math.max(AREA.x + 10, l.x); }
    }
    this.timeLeft -= dt;
    if (this.inPileCount() === this.leaves.length || this.timeLeft <= 0) this.finish();
  }
  handleTap(pt) {
    if (this.done) return;
    for (const l of this.leaves) {
      if (l.inPile || Math.hypot(l.x - pt.x, l.y - pt.y) > 56) continue;
      const dx = this.pile.x - l.x, dy = this.pile.y - l.y, dist = Math.hypot(dx, dy) || 1;
      l.x += (dx / dist) * 48; l.y += (dy / dist) * 48;
      this.settle(l);
    }
  }
  finish() {
    const pct = this.inPileCount() / this.leaves.length;
    this.result = { success: pct >= 0.7, score: Math.round(pct * 100) };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.timeLeft / this.timeMax);
    ctx.fillStyle = 'rgba(46, 90, 40, 0.35)'; ctx.fillRect(AREA.x, AREA.y + 62, AREA.w, AREA.h - 62);
    ctx.fillStyle = 'rgba(120, 70, 30, 0.45)';
    ctx.beginPath(); ctx.ellipse(this.pile.x, this.pile.y, this.pile.r, this.pile.r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    drawText(ctx, 'The pile', this.pile.x, this.pile.y + this.pile.r * 0.65 + 18, { size: 14, weight: 'bold', color: '#f5deb3', align: 'center', outline: true });
    const s = shakeOffset(this.d, this.t);
    for (const l of this.leaves) {
      ctx.save(); ctx.translate(l.x + (l.inPile ? 0 : s.x * 0.5), l.y + (l.inPile ? 0 : s.y * 0.5)); ctx.rotate(l.a);
      ctx.fillStyle = l.color; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this.gust > 0) drawText(ctx, 'A gust of wind!', AREA.x + 140, AREA.y + 60, { size: 16, weight: 'bold', color: '#d6eaf8', align: 'center', outline: true });
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
      w.found = true; playTick();
      if (this.words.every((x) => !x.typo || x.found)) this.finish(true);
    } else if (!w.typo) { this.timeLeft = Math.max(0.1, this.timeLeft - 1.5); this.flash = 1; playError(); }
  }
  finish(success) {
    const found = this.words.filter((x) => x.typo && x.found).length;
    this.result = { success, score: success ? Math.round(50 + 50 * (this.timeLeft / this.timeMax)) : Math.round((found / 3) * 40) };
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
      if (w.found) { ctx.fillStyle = 'rgba(46,204,113,0.35)'; ctx.fillRect(w.box.x, w.box.y, w.box.w, w.box.h); }
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
export function binFor(item) { return !item.receipt ? 'credit' : item.tags ? 'refund' : 'exchange'; }
const RETURN_ITEMS = ['Sweater', 'Headphones', 'Sneakers', 'Desk lamp', 'Backpack', 'Rain jacket', 'Blender', 'Scarf'];
export class SortReturns {
  constructor(state, items) {
    this.name = 'SORT!';
    this.hint = 'Receipt and tags: refund. Receipt, no tags: exchange. No receipt: store credit.';
    this.d = difficultyFactor(state);
    const combos = shuffle([[true, true], [true, false], [false, true], [true, true], [false, false], [true, false]]);
    this.items = items ?? shuffle(RETURN_ITEMS).slice(0, 6).map((name, i) => ({ name, receipt: combos[i][0], tags: combos[i][1] }));
    this.idx = 0; this.correct = 0; this.perItem = 4.2 / this.d; this.itemLeft = this.perItem; this.t = 0;
    this.feedback = null; this.pause = 0;
    this.done = false; this.result = null;
    this.bins = SORT_BINS.map((b, i) => ({ ...b, x: AREA.x + 20 + i * 195, y: AREA.y + AREA.h - 110, w: 180, h: 64 }));
  }
  judge(binId) {
    const item = this.items[this.idx];
    const right = binFor(item) === binId;
    if (right) { this.correct += 1; playTick(); } else playError();
    this.feedback = { right, text: right ? 'Correct.' : `That one is ${SORT_BINS.find((b) => b.id === binFor(item)).label.toLowerCase()}.` };
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
    this.result = { success: this.correct >= this.items.length - 1, score: Math.round((this.correct / this.items.length) * 100) };
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
    if (this.feedback) drawText(ctx, this.feedback.text, AREA.x + AREA.w / 2, card.y + card.h + 26, { size: 17, weight: 'bold', color: this.feedback.right ? '#2ecc71' : '#ff8a7e', align: 'center', outline: true });
    const s = shakeOffset(this.d, this.t);
    for (const b of this.bins) {
      ctx.fillStyle = '#2b3d4f'; roundRectPath(ctx, b.x + s.x, b.y + s.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, b.x + s.x, b.y + s.y, b.w, b.h, 10); ctx.stroke();
      drawText(ctx, b.label, b.x + b.w / 2 + s.x, b.y + b.h / 2 + s.y, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle' });
    }
    drawText(ctx, `Item ${Math.min(this.idx + 1, this.items.length)} of ${this.items.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 18, { size: 14, color: '#f0f0f0', align: 'center' });
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
};

export function createQTE(gig, state) {
  const Cls = MICROGAME_BY_TREE[gig.choiceTree] ?? LiftOnThree;
  return new Cls(state);
}

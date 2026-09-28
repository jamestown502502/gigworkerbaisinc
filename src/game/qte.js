// Minigames. Three skill QTEs (rhythm tap, timed sequence, steady hand) plus the emotional-
// intelligence / work-life-balance set added in the 2026-09 pass: Breathe (evening wind-down),
// Read the Client and Text Back (in-gig), Check In (evening call).
// Every instance: update(dt), render(ctx), handleTap(pt), done, result { success, score, ... }.
// Skill QTE difficulty scales with stress (high = harder) and energy (low = harder).

import { playTick, playSuccess, playFail, playBreathIn, playBreathOut, playBuzz, playWarm, playError } from '../engine/audio.js';
import { drawText, drawWrapped, roundRectPath, wrapLines } from '../ui/text.js';
import { InputManager } from '../engine/input.js';

// Brief "GET READY" beat before a skill QTE's own update()/handleTap() go live — shared with
// loop.js (gates input) and screens.js (renders the countdown). Lives here, not in loop.js,
// so both can import it without a loop.js <-> screens.js circular dependency.
export const QTE_READY_DURATION = 0.8;

export function difficultyFactor(state) {
  const stressPenalty = state.stress / 150;                    // up to +0.66
  const energyPenalty = (80 - Math.min(state.energy, 80)) / 200; // up to +0.4
  let d = Math.min(1.9, 1 + stressPenalty + energyPenalty);
  d *= 1 + (100 - (state.health ?? 100)) / 200;                // low balance = harder (softened)
  d = Math.min(1.8, d);                                        // hard cap: tough, never impossible
  // Last night's wind-down eases today's timed challenges — the evening loop's visible payoff.
  if (state.calm) d = 1 + (d - 1) * 0.7;
  // Accessibility toggle (Settings): widen all windows / slow timers by scaling difficulty
  // down rather than adding a second code path per QTE type.
  if (state.settings?.reduceTimingPressure) d = 1 + (d - 1) * 0.45;
  return d;
}

const AREA = { x: 100, y: 110, w: 600, h: 400 };

// ---------- TYPE 1: Rhythm Tap — circles converge, tap when aligned ----------
class RhythmTap {
  constructor(state) {
    this.name = 'RHYTHM TAP';
    this.hint = 'Tap when the ring hits the target!';
    this.d = difficultyFactor(state);
    this.totalRounds = 5;
    this.round = 0;
    this.hits = [];
    this.done = false;
    this.result = null;
    this.flash = 0;
    this.restT = 0;
    this.startRound();
  }
  startRound() {
    this.radius = 130;
    this.speed = 90 * this.d;   // px/sec shrink
    this.tapped = false;
  }
  update(dt) {
    if (this.done) return;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.tapped) {
      // Between rounds: driven by the game clock, not setTimeout, so a paused/throttled tab
      // (or a test stepping the loop by hand) cannot desync the round cadence.
      this.restT += dt;
      if (this.restT >= 0.35) { this.restT = 0; this.startRound(); }
      return;
    }
    this.radius -= this.speed * dt;
    if (this.radius < 22 && !this.tapped) this.endRound(0);   // missed entirely
  }
  handleTap() {
    if (this.done || this.tapped) return;
    const diff = Math.abs(this.radius - 40);
    // Grace zone: a near-miss outside the scoring window still counts for something instead of
    // an instant zero — a small forgiveness buffer around the hit window, not a second hit window.
    if (diff < 14) { this.endRound(Math.round(100 - (diff / 14) * 50)); playTick(); }
    else if (diff < 28) { this.endRound(Math.round(20 - ((diff - 14) / 14) * 15)); playTick(); }
    else this.endRound(0);
  }
  endRound(score) {
    this.tapped = true;
    this.hits.push(score);
    this.flash = score > 0 ? 1 : -1;
    this.round++;
    if (this.round >= this.totalRounds) this.finish();
  }
  finish() {
    const score = Math.round(this.hits.reduce((a, b) => a + b, 0) / this.totalRounds);
    const success = this.hits.filter((h) => h > 0).length >= 3;
    this.result = { success, score };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    const cx = AREA.x + AREA.w / 2, cy = AREA.y + AREA.h / 2;
    ctx.strokeStyle = '#f5deb3';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
    if (!this.tapped && !this.done) {
      ctx.strokeStyle = '#e07030';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(this.radius, 5), 0, Math.PI * 2); ctx.stroke();
    }
    if (Math.abs(this.flash) > 0.01) {
      ctx.fillStyle = this.flash > 0 ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)';
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
    }
    drawText(ctx, `Round ${Math.min(this.round + 1, this.totalRounds)} / ${this.totalRounds}`, cx, AREA.y + AREA.h - 24, {
      size: 16, color: '#f0f0f0', font: 'monospace', align: 'center',
    });
  }
}

// ---------- TYPE 2: Timed Sequence — press buttons in order before timer ----------
class TimedSequence {
  constructor(state) {
    this.name = 'TIMED SEQUENCE';
    this.hint = 'Tap the numbers in order — beat the clock!';
    this.d = difficultyFactor(state);
    this.count = 4;
    this.timeLeft = 7 / this.d;
    this.timeMax = this.timeLeft;
    this.nextIdx = 0;
    this.done = false;
    this.result = null;
    this.buttons = this.placeButtons();
  }
  placeButtons() {
    const btns = [];
    const size = 64;
    let attempts = 0;
    while (btns.length < this.count && attempts < 500) {
      attempts++;
      const x = AREA.x + 20 + Math.random() * (AREA.w - size - 40);
      const y = AREA.y + 50 + Math.random() * (AREA.h - size - 80);
      if (btns.some((b) => Math.abs(b.x - x) < size + 20 && Math.abs(b.y - y) < size + 20)) continue;
      btns.push({ x, y, size, label: btns.length + 1, hit: false });
    }
    return btns;
  }
  update(dt) {
    if (this.done) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.finish(false);
  }
  handleTap(pt) {
    if (this.done) return;
    for (const b of this.buttons) {
      if (pt.x >= b.x && pt.x <= b.x + b.size && pt.y >= b.y && pt.y <= b.y + b.size && !b.hit) {
        if (b.label === this.nextIdx + 1) {
          b.hit = true; this.nextIdx++; playTick();
          if (this.nextIdx >= this.count) this.finish(true);
        } else {
          this.timeLeft = Math.max(0.1, this.timeLeft - 1); // wrong order penalty
        }
        return;
      }
    }
  }
  finish(success) {
    const score = success ? Math.round(50 + 50 * (this.timeLeft / this.timeMax)) : Math.round((this.nextIdx / this.count) * 40);
    this.result = { success, score };
    this.done = true;
    success ? playSuccess() : playFail();
  }
  render(ctx) {
    ctx.fillStyle = '#3a2d1f';
    ctx.fillRect(AREA.x, AREA.y + 8, AREA.w, 16);
    ctx.fillStyle = this.timeLeft / this.timeMax > 0.3 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(AREA.x, AREA.y + 8, AREA.w * Math.max(0, this.timeLeft / this.timeMax), 16);
    for (const b of this.buttons) {
      ctx.fillStyle = b.hit ? '#2ecc71' : '#e07030';
      ctx.fillRect(b.x, b.y, b.size, b.size);
      ctx.strokeStyle = '#1d150d'; ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.size, b.size);
      drawText(ctx, String(b.label), b.x + b.size / 2, b.y + b.size / 2, {
        size: 26, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true,
      });
    }
  }
}

// ---------- TYPE 3: Steady Hand — keep marker inside a moving zone ----------
class SteadyHand {
  constructor(state) {
    this.name = 'STEADY HAND';
    this.hint = 'Tap to lift — stay inside the moving zone!';
    this.d = difficultyFactor(state);
    this.duration = 6;
    this.elapsed = 0;
    this.insideTime = 0;
    this.markerY = AREA.y + AREA.h / 2;
    this.vy = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.bandHalf = 70 / this.d;
    this.done = false;
    this.result = null;
  }
  bandCenter() {
    return AREA.y + AREA.h / 2 + Math.sin(this.elapsed * 1.2 * this.d + this.phase) * 100;
  }
  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.vy += 260 * dt;                 // gravity
    this.markerY += this.vy * dt;
    this.markerY = Math.max(AREA.y + 10, Math.min(AREA.y + AREA.h - 10, this.markerY));
    const c = this.bandCenter();
    if (Math.abs(this.markerY - c) <= this.bandHalf) this.insideTime += dt;
    if (this.elapsed >= this.duration) {
      const pct = this.insideTime / this.duration;
      this.result = { success: pct >= 0.55, score: Math.round(pct * 100) };
      this.done = true;
      this.result.success ? playSuccess() : playFail();
    }
  }
  handleTap() {
    if (!this.done) { this.vy = -190; playTick(); }
  }
  render(ctx) {
    const c = this.bandCenter();
    ctx.fillStyle = 'rgba(46, 204, 113, 0.28)';
    ctx.fillRect(AREA.x + 40, c - this.bandHalf, AREA.w - 80, this.bandHalf * 2);
    ctx.strokeStyle = '#2ecc71';
    ctx.strokeRect(AREA.x + 40, c - this.bandHalf, AREA.w - 80, this.bandHalf * 2);
    const inside = Math.abs(this.markerY - c) <= this.bandHalf;
    ctx.fillStyle = inside ? '#f1c40f' : '#e74c3c';
    ctx.beginPath(); ctx.arc(AREA.x + AREA.w / 2, this.markerY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2d1f';
    ctx.fillRect(AREA.x, AREA.y + 8, AREA.w, 12);
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(AREA.x, AREA.y + 8, AREA.w * (this.elapsed / this.duration), 12);
  }
}

const QTE_BY_TYPE = {
  physical: RhythmTap,     // PRD: physical = tap/rhythm
  service: TimedSequence,  // PRD: service = timed buttons
  weird: null,             // unpredictable — random pick
};

export function createQTE(gig, state) {
  let Cls = QTE_BY_TYPE[gig.type];
  if (!Cls) Cls = [RhythmTap, TimedSequence, SteadyHand][Math.floor(Math.random() * 3)];
  // Mix in SteadyHand occasionally for variety
  if (Math.random() < 0.25) Cls = SteadyHand;
  return new Cls(state);
}

// =====================================================================================
// Shared bits for the conversational minigames: choice buttons hit-tested inside the game
// (they run under the same tap contract as the skill QTEs) and a procedural client face.
// =====================================================================================

function drawChoice(ctx, b, { color = '#3d4d5c', dim = false } = {}) {
  ctx.fillStyle = dim ? '#2a2a2a' : color;
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
  ctx.strokeStyle = dim ? '#444' : '#c9a876'; ctx.lineWidth = 2;
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 9); ctx.stroke();
  drawWrapped(ctx, b.label, b.x + 14, b.y + 24, b.w - 28, 18, { size: 14, color: dim ? '#b5a488' : '#ffffff', shadow: false });
}

function hit(b, pt) { return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h; }

const FACE_SKIN = ['#d4a574', '#f2d6bd', '#8d5a3a', '#c9b380', '#b07a52'];
const FACE_HAIR = ['#4a3728', '#d9b45b', '#1a1a1a', '#a83c28', '#777777'];

/** A code-drawn client portrait whose expression reads the feeling: the whole point of the
 *  minigame is that the face and the words together tell you what's going on. */
export function drawFace(ctx, x, y, size, seed, feeling) {
  const skin = FACE_SKIN[seed % FACE_SKIN.length];
  const hair = FACE_HAIR[Math.floor(seed / 5) % FACE_HAIR.length];
  const u = size / 16;
  const px = (gx, gy, gw, gh, c) => { ctx.fillStyle = c; ctx.fillRect(x + gx * u, y + gy * u, gw * u, gh * u); };
  // background disc
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 + 4, 0, Math.PI * 2); ctx.fill();
  px(3, 2, 10, 3, hair);
  px(2, 3, 12, 2, hair);
  px(3, 4, 10, 8, skin);
  px(2, 6, 1, 3, skin); px(13, 6, 1, 3, skin);
  // eyes
  const eyeY = feeling === 'embarrassed' || feeling === 'lonely' ? 7.4 : 7;
  px(5, eyeY, 1.4, 1.4, '#1a1a1a'); px(9.6, eyeY, 1.4, 1.4, '#1a1a1a');
  if (feeling === 'suspicious') { px(4.6, 6.6, 2.2, 0.6, hair); px(9.2, 6.2, 2.2, 0.6, hair); px(9.6, 7, 1.4, 0.5, skin); }
  if (feeling === 'rushed' || feeling === 'angry') { px(4.4, 6.2, 2.4, 0.6, hair); px(9.2, 6.2, 2.4, 0.6, hair); }
  if (feeling === 'embarrassed') { px(4, 9, 2, 1, 'rgba(231,76,60,0.55)'); px(10, 9, 2, 1, 'rgba(231,76,60,0.55)'); }
  // mouth
  ctx.strokeStyle = '#3a2418'; ctx.lineWidth = Math.max(1.5, u * 0.6);
  ctx.beginPath();
  const mx = x + 8 * u, my = y + 10.4 * u;
  if (feeling === 'grateful' || feeling === 'lonely') ctx.arc(mx, my - u * 0.6, u * 1.6, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (feeling === 'angry' || feeling === 'suspicious') ctx.arc(mx, my + u * 1.2, u * 1.6, 1.15 * Math.PI, 1.85 * Math.PI);
  else if (feeling === 'embarrassed') { ctx.moveTo(mx - u * 1.2, my); ctx.lineTo(mx + u * 0.8, my + u * 0.4); }
  else { ctx.moveTo(mx - u * 1.5, my); ctx.lineTo(mx + u * 1.5, my); }
  ctx.stroke();
  // rushed: a little motion mark
  if (feeling === 'rushed') { px(14.2, 5, 1, 0.5, '#f1c40f'); px(14.6, 6.2, 1, 0.5, '#f1c40f'); px(14.2, 7.4, 1, 0.5, '#f1c40f'); }
}

// ---------- Breathe — evening wind-down, no fail ----------
// Box breathing (in, hold, out, rest, equal counts), the paced-breathing pattern taught for stress
// down-regulation. The player's body does the pacing: press and HOLD through the inhale and the
// hold, LET GO through the exhale and the rest. A light travels the square so the next side is
// always visible before it arrives, and every side counts down. The score is how much of the
// exercise the finger matched the breath (a short grace at each turn, so reaction time is not
// scored). It cannot be failed: a player who never touches it still matches the two let-go sides.
//
// Replaced a "tap at the top and bottom of the breath" version: six taps over twenty seconds, with
// nothing to do in between, which players read as a loading screen rather than an exercise.
export const BOX_SIDE = 3;   // seconds per side
export const BOX_CYCLES = 3;
const BOX_GRACE = 0.45;      // seconds at the start of each side that are not scored
const BOX_SIDES = [
  { label: 'Breathe in', short: 'IN', press: true, color: '#5dade2' },
  { label: 'Hold', short: 'HOLD', press: true, color: '#9b8cd9' },
  { label: 'Breathe out', short: 'OUT', press: false, color: '#2ecc71' },
  { label: 'Rest', short: 'REST', press: false, color: '#c9a876' },
];
export class Breathe {
  constructor() {
    this.name = 'WIND DOWN';
    this.hint = 'Press and hold to breathe in and hold. Let go to breathe out and rest.';
    this.elapsed = 0;
    this.exercise = BOX_SIDE * 4 * BOX_CYCLES;
    this.duration = this.exercise + 1.2; // a moment of stillness before the result
    this.scored = 0;                     // seconds that counted
    this.matched = 0;                    // of those, seconds the finger matched the breath
    this.pressed = false;
    this.lastSide = -1;
    this.done = false;
    this.result = null;
    this.noFail = true;
  }
  sideIndex() { return Math.floor(Math.min(this.elapsed, this.exercise - 1e-6) / BOX_SIDE) % 4; }
  sideT() { return (Math.min(this.elapsed, this.exercise - 1e-6) % BOX_SIDE) / BOX_SIDE; }
  /** 0..1 how full the lungs are: fills on IN, stays full on HOLD, empties on OUT, empty on REST. */
  lungs() { const t = this.sideT(); return [t, 1, 1 - t, 0][this.sideIndex()]; }
  sync() { return this.scored > 0 ? this.matched / this.scored : 1; }
  /** `pressed` is read from the pointer each frame; tests pass it in. */
  update(dt, pressed = InputManager.pointer.down) {
    if (this.done) return;
    this.pressed = !!pressed;
    if (this.elapsed < this.exercise) {
      const side = this.sideIndex();
      if (side !== this.lastSide) {
        this.lastSide = side;
        if (side === 0) playBreathIn(); else if (side === 2) playBreathOut(); else playTick();
      }
      if (this.elapsed % BOX_SIDE >= BOX_GRACE) {
        this.scored += dt;
        if (this.pressed === BOX_SIDES[side].press) this.matched += dt;
      }
    }
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.result = { success: true, score: Math.round(this.sync() * 100) };
      this.done = true;
      playWarm();
    }
  }
  handleTap() { /* holding is read continuously in update(); a tap is just a short hold */ }
  render(ctx) {
    const cx = AREA.x + AREA.w / 2, cy = AREA.y + 196;
    const finished = this.elapsed >= this.exercise;
    const side = BOX_SIDES[this.sideIndex()];
    const progress = Math.min(1, this.elapsed / this.exercise);

    // the room settles: a cool night that warms as the exercise goes on
    const sky = ctx.createLinearGradient(0, AREA.y + 40, 0, AREA.y + AREA.h);
    sky.addColorStop(0, `rgba(${Math.round(30 + 40 * progress)}, ${Math.round(40 + 20 * progress)}, ${Math.round(70 - 20 * progress)}, 0.55)`);
    sky.addColorStop(1, 'rgba(20, 14, 8, 0.2)');
    ctx.fillStyle = sky;
    roundRectPath(ctx, AREA.x + 20, AREA.y + 44, AREA.w - 40, AREA.h - 70, 14); ctx.fill();
    for (let i = 0; i < 14; i++) {                        // slow drifting motes
      const mx = AREA.x + 40 + ((i * 97 + this.elapsed * (6 + (i % 4) * 3)) % (AREA.w - 80));
      const my = AREA.y + 60 + ((i * 53) % 280) - Math.sin(this.elapsed * 0.6 + i) * 6;
      ctx.fillStyle = `rgba(255, 240, 200, ${0.08 + 0.06 * Math.sin(this.elapsed + i)})`;
      ctx.beginPath(); ctx.arc(mx, my, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }

    // the box: faint track, each side labelled, the travelled part of this side lit
    const half = 110, x0 = cx - half, y0 = cy - half, s = half * 2;
    const corners = [[x0, y0 + s], [x0, y0], [x0 + s, y0], [x0 + s, y0 + s]]; // IN goes up the left side
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.strokeRect(x0, y0, s, s);
    const at = (i, t) => { const a = corners[i], b = corners[(i + 1) % 4]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    if (!finished) {
      const i = this.sideIndex(), [dx, dy] = at(i, this.sideT());
      ctx.strokeStyle = side.color; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(...corners[i]); ctx.lineTo(dx, dy); ctx.stroke();
      const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, 22);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(dx, dy, 22, 0, Math.PI * 2); ctx.fill();
    }
    const labelAt = [[x0 - 30, cy], [cx, y0 - 16], [x0 + s + 30, cy], [cx, y0 + s + 22]];
    BOX_SIDES.forEach((sd, i) => {
      const on = !finished && i === this.sideIndex();
      drawText(ctx, sd.short, labelAt[i][0], labelAt[i][1], { size: 12, weight: 'bold', color: on ? sd.color : 'rgba(240,240,240,0.55)', align: 'center', baseline: 'middle', shadow: false });
    });

    // the lungs: a soft circle that fills and empties; it glows when the finger matches the breath
    const inSync = this.pressed === side.press;
    const r = 26 + 58 * this.lungs();
    ctx.fillStyle = finished ? 'rgba(46,204,113,0.28)' : inSync ? 'rgba(255,255,255,0.16)' : 'rgba(230,126,34,0.16)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = finished ? '#2ecc71' : side.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    if (finished) {
      drawText(ctx, 'Settled.', cx, cy - 4, { size: 24, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true });
      drawText(ctx, `In sync ${Math.round(this.sync() * 100)}%`, cx, cy + 24, { size: 15, color: '#c9f2d6', align: 'center', baseline: 'middle', shadow: false });
    } else {
      const count = Math.ceil(BOX_SIDE - (this.elapsed % BOX_SIDE));
      drawText(ctx, side.label, cx, cy - 12, { size: 20, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true });
      drawText(ctx, String(count), cx, cy + 18, { size: 26, weight: 'bold', color: side.color, align: 'center', baseline: 'middle', outline: true });
    }

    // what to do with your finger, and how it is going
    const cycle = Math.min(BOX_CYCLES, Math.floor(this.elapsed / (BOX_SIDE * 4)) + 1);
    const instruction = finished ? 'Well done.' : side.press ? 'Press and hold' : 'Let go';
    drawText(ctx, instruction, AREA.x + 44, AREA.y + AREA.h - 40, { size: 16, weight: 'bold', color: side.press && !finished ? '#8ec6ea' : '#9fe0b5', shadow: false });
    drawText(ctx, `Breath ${cycle} of ${BOX_CYCLES}  ·  In sync ${Math.round(this.sync() * 100)}%`, AREA.x + AREA.w - 44, AREA.y + AREA.h - 40, { size: 14, color: '#e8dcc4', align: 'right', shadow: false });
    ctx.fillStyle = '#3a2d1f';
    ctx.fillRect(AREA.x, AREA.y + AREA.h - 14, AREA.w, 10);
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(AREA.x, AREA.y + AREA.h - 14, AREA.w * progress, 10);
  }
}

// ---------- scenario decks ----------
/** Every scenario in a pool plays once before any repeats, in a fresh shuffle each cycle, and a
 *  new cycle never opens with the one just played. Kept on the save so a reload does not reset it.
 *  Replaces a plain random pick, which with a pool of two replayed the same conversation about
 *  every other time. */
export function drawFromDeck(state, key, size) {
  if (!state) return Math.floor(Math.random() * size);
  const decks = state.eiDecks || (state.eiDecks = {});
  let deck = decks[key];
  if (!Array.isArray(deck) || deck.length === 0) {
    deck = shuffled([...Array(size).keys()]);
    const last = decks[`${key}Last`];
    if (deck.length > 1 && deck[deck.length - 1] === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
  }
  const pick = deck.pop();
  decks[key] = deck;
  decks[`${key}Last`] = pick;
  return pick < size ? pick : Math.floor(Math.random() * size);
}

/** A shuffled copy. Answer order is shuffled on every play: the best reply used to be the first
 *  button in every scenario, which taught "tap the top one" instead of reading the person. */
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Read the Client — in-gig emotional intelligence ----------
export const READ_CLIENT_SCENARIOS = [
  { seed: 3, line: '"Look, can we just get this done? I have a call in twenty minutes and my kid\'s school already rang twice."',
    feeling: 'rushed', options: ['rushed', 'suspicious', 'lonely', 'embarrassed'],
    responses: [
      { text: '"Totally. Point me at what matters most and I\'ll be out of your way."', good: true, effects: { rep: 0.3, stress: -3 } },
      { text: '"Rushing me is how mistakes happen."', good: false, effects: { rep: -0.2, stress: 6 } },
      { text: '"Twenty minutes? That\'s not really enough for the full job."', good: false, effects: { rep: -0.1, stress: 3 } },
    ] },
  { seed: 8, line: '"Sorry about the mess. I meant to tidy before you came. It\'s been... a week."',
    feeling: 'embarrassed', options: ['angry', 'embarrassed', 'rushed', 'suspicious'],
    responses: [
      { text: '"Honestly? You should see my place. Let\'s just start with the easy corner."', good: true, effects: { rep: 0.3, stress: -4 } },
      { text: '"Yeah, it\'s pretty bad. This\'ll take longer than the listing said."', good: false, effects: { rep: -0.3, stress: 4 } },
      { text: 'Say nothing and get to work.', good: false, effects: { rep: 0, stress: 2 } },
    ] },
  { seed: 12, line: '"The last person I hired took my deposit and never came back. So. You understand why I\'m asking for ID."',
    feeling: 'suspicious', options: ['lonely', 'rushed', 'suspicious', 'grateful'],
    responses: [
      { text: '"Completely fair. Here\'s my ID, and I\'m happy to be paid when you\'re satisfied."', good: true, effects: { rep: 0.4, stress: -2 } },
      { text: '"I\'m not the other guy. Can we skip the interrogation?"', good: false, effects: { rep: -0.3, stress: 6 } },
      { text: '"No ID on me, but I\'m legit, promise."', good: false, effects: { rep: -0.2, stress: 4 } },
    ] },
  { seed: 17, line: '"You can stay for tea after, if you like. My son used to help with this. He\'s in Denver now."',
    feeling: 'lonely', options: ['suspicious', 'grateful', 'lonely', 'rushed'],
    responses: [
      { text: '"I\'d like that. Tell me about Denver while we work."', good: true, effects: { rep: 0.3, stress: -5 } },
      { text: '"I\'ve got another gig after this, sorry."', good: false, effects: { rep: -0.1, stress: 0 } },
      { text: '"Denver\'s nice. Anyway, where\'s the toolbox?"', good: false, effects: { rep: -0.1, stress: 1 } },
    ] },
  { seed: 21, line: '"This is the third quote I\'ve had today and every one of them is higher than the last. Go on then, what\'s yours?"',
    feeling: 'angry', options: ['angry', 'embarrassed', 'lonely', 'grateful'],
    responses: [
      { text: '"Sounds like a frustrating day. Here\'s my number, and here\'s exactly what it covers."', good: true, effects: { rep: 0.3, stress: -2 } },
      { text: '"Maybe the job\'s just worth more than you think."', good: false, effects: { rep: -0.3, stress: 6 } },
      { text: '"I can go lower than the others, whatever they said."', good: false, effects: { rep: -0.1, stress: 3 } },
    ] },
  { seed: 6, line: '"You came! On a Sunday! I didn\'t think anyone would. Can I get you a coffee first?"',
    feeling: 'grateful', options: ['rushed', 'grateful', 'suspicious', 'angry'],
    responses: [
      { text: '"Coffee would be great. Walk me through what you need."', good: true, effects: { rep: 0.2, stress: -4 } },
      { text: '"No time for coffee, let\'s get started."', good: false, effects: { rep: -0.1, stress: 2 } },
      { text: '"Sunday rate\'s double, just so you know."', good: false, effects: { rep: -0.3, stress: 3 } },
    ] },
  { seed: 25, line: '"Movers bailed, the truck is due back at six, and I have to get my daughter at five. Where do we even start?"',
    feeling: 'rushed', options: ['lonely', 'rushed', 'grateful', 'angry'],
    responses: [
      { text: '"Heavy things first while you go get her. I\'ll leave a list on the fridge."', good: true, effects: { rep: 0.3, stress: -3 } },
      { text: '"Honestly, that timeline isn\'t realistic."', good: false, effects: { rep: -0.1, stress: 3 } },
      { text: '"Calm down, it\'s just a move."', good: false, effects: { rep: -0.3, stress: 6 } },
    ] },
  { seed: 30, line: '"I watched three videos and I still can\'t get this shelf level. My dad could do this in his sleep."',
    feeling: 'embarrassed', options: ['embarrassed', 'suspicious', 'rushed', 'grateful'],
    responses: [
      { text: '"These kits are badly designed. You got further than most people do."', good: true, effects: { rep: 0.3, stress: -3 } },
      { text: '"Yeah, it\'s pretty easy once you know how."', good: false, effects: { rep: -0.2, stress: 3 } },
      { text: 'Laugh and take the drill off them.', good: false, effects: { rep: -0.2, stress: 2 } },
    ] },
  { seed: 34, line: '"Why do you need to go in the bedroom? The listing only said the living room."',
    feeling: 'suspicious', options: ['angry', 'suspicious', 'embarrassed', 'lonely'],
    responses: [
      { text: '"Good question. I don\'t. I was after an outlet. I\'ll stay here and use a cord."', good: true, effects: { rep: 0.4, stress: -2 } },
      { text: '"Relax, I\'m not going to steal anything."', good: false, effects: { rep: -0.3, stress: 5 } },
      { text: '"I go where the job takes me."', good: false, effects: { rep: -0.2, stress: 3 } },
    ] },
  { seed: 39, line: '"Nobody\'s visited since the funeral. You\'re the first voice I\'ve heard in days. Sorry if I talk too much."',
    feeling: 'lonely', options: ['rushed', 'lonely', 'angry', 'suspicious'],
    responses: [
      { text: '"Talk as much as you like. I\'m listening."', good: true, effects: { rep: 0.3, stress: -5 } },
      { text: '"No worries. I\'ll put my headphones in so I don\'t bother you."', good: false, effects: { rep: -0.1, stress: 1 } },
      { text: '"Sorry for your loss. So, the sink?"', good: false, effects: { rep: -0.2, stress: 2 } },
    ] },
  { seed: 44, line: '"The app charged me twice and support won\'t answer. I\'m not paying anyone until somebody fixes it."',
    feeling: 'angry', options: ['grateful', 'angry', 'embarrassed', 'rushed'],
    responses: [
      { text: '"Maddening, and not your fault. Let\'s screenshot both charges and I\'ll flag it too."', good: true, effects: { rep: 0.3, stress: -2 } },
      { text: '"That\'s not my department."', good: false, effects: { rep: -0.3, stress: 5 } },
      { text: '"No pay, no work. Sorry."', good: false, effects: { rep: -0.2, stress: 4 } },
    ] },
  { seed: 48, line: '"You fixed in ten minutes what I\'ve been fighting for a month. Please, take some of these cookies. I insist."',
    feeling: 'grateful', options: ['suspicious', 'grateful', 'lonely', 'embarrassed'],
    responses: [
      { text: '"Thank you, that\'s really kind. Enjoy the working sink!"', good: true, effects: { rep: 0.2, stress: -4 } },
      { text: '"No thanks, I\'m on a schedule."', good: false, effects: { rep: -0.1, stress: 1 } },
      { text: '"It was easy, honestly. Anyone could have done it."', good: false, effects: { rep: -0.1, stress: 1 } },
    ] },
];
const FEELING_LABEL = { rushed: 'Rushed', suspicious: 'Wary', lonely: 'Lonely', embarrassed: 'Embarrassed', angry: 'Frustrated', grateful: 'Grateful' };

export class ReadClient {
  constructor(state, scenario) {
    this.name = 'READ THE CLIENT';
    this.hint = 'Look and listen. What\'s really going on with them?';
    const base = scenario || READ_CLIENT_SCENARIOS[drawFromDeck(state, 'readClient', READ_CLIENT_SCENARIOS.length)];
    this.s = { ...base, responses: shuffled(base.responses) };
    this.step = 0;          // 0 = pick feeling, 1 = pick response, 2 = reveal
    this.picked = null;
    this.buttons = [];
    this.done = false;
    this.result = null;
    this.revealT = 0;
    this.noFail = true;
  }
  update(dt) {
    if (this.done) return;
    if (this.step === 2) { this.revealT += dt; if (this.revealT > 1.6) this.finish(); }
  }
  handleTap(pt) {
    if (this.done) return;
    for (const b of this.buttons) if (hit(b, pt)) { b.onTap(); return; }
  }
  finish() {
    const feelingRight = this.picked === this.s.feeling;
    const resp = this.response;
    const score = (feelingRight ? 50 : 0) + (resp.good ? 50 : 0);
    this.result = { success: score >= 50, score, effects: { ...resp.effects }, summary: feelingRight ? `You read them right (${FEELING_LABEL[this.s.feeling].toLowerCase()}).` : `They were ${FEELING_LABEL[this.s.feeling].toLowerCase()}, not ${FEELING_LABEL[this.picked].toLowerCase()}.` };
    if (!feelingRight) this.result.effects.rep = (this.result.effects.rep || 0) - 0.1;
    this.done = true;
    score >= 50 ? playWarm() : playFail();
  }
  render(ctx) {
    this.buttons = [];
    drawFace(ctx, AREA.x + 30, AREA.y + 40, 96, this.s.seed, this.step === 2 ? this.s.feeling : 'neutral');
    drawWrapped(ctx, this.s.line, AREA.x + 150, AREA.y + 64, AREA.w - 180, 21, { size: 15, color: '#f0f0f0', shadow: false });
    if (this.step === 0) {
      drawText(ctx, 'What\'s going on with them?', AREA.x + AREA.w / 2, AREA.y + 190, { size: 16, weight: 'bold', color: '#f1c40f', align: 'center' });
      this.s.options.forEach((opt, i) => {
        const b = { x: AREA.x + 40 + (i % 2) * 270, y: AREA.y + 210 + Math.floor(i / 2) * 70, w: 250, h: 56, label: FEELING_LABEL[opt], onTap: () => { this.picked = opt; this.step = 1; playTick(); } };
        this.buttons.push(b); drawChoice(ctx, b);
      });
    } else if (this.step === 1) {
      drawText(ctx, `You think they're ${FEELING_LABEL[this.picked].toLowerCase()}. How do you respond?`, AREA.x + AREA.w / 2, AREA.y + 180, { size: 15, weight: 'bold', color: '#f1c40f', align: 'center' });
      this.s.responses.forEach((r, i) => {
        const b = { x: AREA.x + 40, y: AREA.y + 196 + i * 66, w: AREA.w - 80, h: 58, label: r.text, onTap: () => { this.response = r; this.step = 2; r.good ? playWarm() : playBuzz(); } };
        this.buttons.push(b); drawChoice(ctx, b);
      });
    } else {
      const right = this.picked === this.s.feeling;
      drawText(ctx, right ? `Right call — they were ${FEELING_LABEL[this.s.feeling].toLowerCase()}.` : `They were actually ${FEELING_LABEL[this.s.feeling].toLowerCase()}.`, AREA.x + AREA.w / 2, AREA.y + 210, { size: 18, weight: 'bold', color: right ? '#2ecc71' : '#e67e22', align: 'center' });
      drawText(ctx, this.response.good ? 'They relax. That landed.' : 'They stiffen. That did not land.', AREA.x + AREA.w / 2, AREA.y + 244, { size: 15, color: '#e0e0e0', align: 'center' });
    }
  }
}

// ---------- Thread games: Text Back (client, in-gig) and Check In (friend, evening) ----------
// A message thread with three exchanges. Each reply is tagged; the client version tracks a heat
// meter that acknowledging replies cool and defensive ones raise, under a soft timer. The friend
// version scores empathy and builds `support` — nothing to lose, but the good replies are the
// ones that ask about THEM.
export const TEXT_BACK_THREADS = [
  { title: 'Client texting mid-job', heat: 55, msgs: [
    { text: 'hey are you still coming?? it\'s been 40 min', replies: [
      { text: 'Yes — on the way, sorry for the wait. 10 minutes out.', tag: 'ack', heat: -20 },
      { text: 'Traffic isn\'t my fault.', tag: 'def', heat: 15 },
      { text: 'yeah', tag: 'dis', heat: 8 } ] },
    { text: 'the listing said $80 but you quoted 95 when you got here??', replies: [
      { text: 'Fair question. The extra is for the second flight of stairs — happy to show you the breakdown.', tag: 'ack', heat: -20 },
      { text: 'Prices go up when the job is bigger than described.', tag: 'def', heat: 15 },
      { text: 'it is what it is', tag: 'dis', heat: 10 } ] },
    { text: 'ok. also my neighbor says you scratched the hallway wall', replies: [
      { text: 'I\'ll take a look with you right now, and if it was me I\'ll make it right.', tag: 'ack', heat: -25 },
      { text: 'That was already there.', tag: 'def', heat: 18 },
      { text: 'not my problem, take it up with the building', tag: 'dis', heat: 12 } ] },
  ] },
  { title: 'Client texting mid-job', heat: 50, msgs: [
    { text: 'my landlord says the assembly has to be done by 3 or he\'s charging me', replies: [
      { text: 'Got it — that\'s the priority then. I\'ll skip the cosmetic bits until after.', tag: 'ack', heat: -20 },
      { text: 'You should have said that before I started.', tag: 'def', heat: 15 },
      { text: 'k', tag: 'dis', heat: 8 } ] },
    { text: 'also there\'s a piece missing from the box I think?', replies: [
      { text: 'Let\'s check together — I\'ve got spares in the car that usually cover it.', tag: 'ack', heat: -18 },
      { text: 'Not something I can fix, the box is what it is.', tag: 'def', heat: 14 },
      { text: 'probably', tag: 'dis', heat: 10 } ] },
    { text: 'sorry for all the texts. stressful day', replies: [
      { text: 'No apology needed. We\'ll get it done — you\'re in good hands.', tag: 'ack', heat: -22 },
      { text: 'It\'s fine, but the texting does slow me down.', tag: 'def', heat: 10 },
      { text: 'np', tag: 'dis', heat: 6 } ] },
  ] },
  { title: 'Client texting mid-job', heat: 45, msgs: [
    { text: 'while you\'re here could you also mount the tv? should only take a sec', replies: [
      { text: 'Happy to. It\'s a separate job, so I\'ll quote it now and you decide.', tag: 'ack', heat: -18 },
      { text: 'That\'s not what you booked.', tag: 'def', heat: 14 },
      { text: 'we\'ll see', tag: 'dis', heat: 8 } ] },
    { text: 'the last guy did it for free', replies: [
      { text: 'I get it. Mounting needs proper anchors so it stays up. That\'s what the price covers.', tag: 'ack', heat: -18 },
      { text: 'Then call the last guy.', tag: 'def', heat: 16 },
      { text: 'cool', tag: 'dis', heat: 8 } ] },
    { text: 'fine. how much', replies: [
      { text: '$40, anchors included, and I\'ll clean up after. Want me to go ahead?', tag: 'ack', heat: -22 },
      { text: 'More than you\'d like.', tag: 'def', heat: 12 },
      { text: 'depends', tag: 'dis', heat: 8 } ] },
  ] },
  { title: 'Client texting mid-job', heat: 60, msgs: [
    { text: 'you were supposed to be here at 2. i had to leave for work. what now', replies: [
      { text: 'That\'s on me, and I\'m sorry. Can I come tomorrow at a time that suits you?', tag: 'ack', heat: -22 },
      { text: 'The app said 3.', tag: 'def', heat: 14 },
      { text: 'can reschedule', tag: 'dis', heat: 8 } ] },
    { text: 'i took the afternoon off for this', replies: [
      { text: 'I know, and that cost you real money. I\'ll take $15 off to make up for some of it.', tag: 'ack', heat: -20 },
      { text: 'I can\'t control traffic.', tag: 'def', heat: 15 },
      { text: 'sorry', tag: 'dis', heat: 6 } ] },
    { text: 'ok. tomorrow at 9 then. don\'t be late', replies: [
      { text: '9 sharp. I\'ll text when I\'m ten minutes out.', tag: 'ack', heat: -20 },
      { text: 'I\'m usually never late, for the record.', tag: 'def', heat: 10 },
      { text: 'ok', tag: 'dis', heat: 6 } ] },
  ] },
  { title: 'Client texting mid-job', heat: 50, msgs: [
    { text: 'hi!! first time using one of these apps. is it weird if i stay home while you work?', replies: [
      { text: 'Not weird at all. Stay, ask me anything. It\'s your home.', tag: 'ack', heat: -18 },
      { text: 'I work faster alone, to be honest.', tag: 'def', heat: 12 },
      { text: 'up to you', tag: 'dis', heat: 6 } ] },
    { text: 'what should i do to get ready? don\'t want to waste your time', replies: [
      { text: 'Just clear a path to the room and show me the outlets. That\'s it.', tag: 'ack', heat: -18 },
      { text: 'Read the listing, it\'s all there.', tag: 'def', heat: 14 },
      { text: 'nothing', tag: 'dis', heat: 6 } ] },
    { text: 'thank you for being patient with all my questions', replies: [
      { text: 'Questions are how jobs go well. See you soon.', tag: 'ack', heat: -20 },
      { text: 'No problem, but I do have another job after.', tag: 'def', heat: 8 },
      { text: 'np', tag: 'dis', heat: 5 } ] },
  ] },
];

export const CHECK_IN_THREADS = [
  { title: 'Sam', msgs: [
    { text: 'hey stranger. how\'s the hustle treating you', replies: [
      { text: 'Honestly, tiring. How are YOU though — how did the interview go?', tag: 'emp' },
      { text: 'Busy. Money\'s tight. Same old.', tag: 'self' },
      { text: 'fine', tag: 'flat' } ] },
    { text: 'didn\'t get it. they went with someone internal. kind of gutted', replies: [
      { text: 'That\'s rough, I\'m sorry. Want to talk about it or want a distraction?', tag: 'emp' },
      { text: 'Their loss. Something better\'s coming.', tag: 'flat' },
      { text: 'ugh. at least you have a job to interview from lol', tag: 'self' } ] },
    { text: 'distraction please. tell me something dumb that happened this week', replies: [
      { text: 'A husky dragged me two blocks for a squirrel. I got paid $30 for the privilege. Your turn.', tag: 'emp' },
      { text: 'Nothing dumb, just work.', tag: 'flat' },
      { text: 'Everything. This whole week was dumb. Can\'t wait for it to be over.', tag: 'self' } ] },
  ] },
  { title: 'Mom', msgs: [
    { text: 'You haven\'t called. Are you eating?', replies: [
      { text: 'I am, promise. How\'s your knee been since the doctor?', tag: 'emp' },
      { text: 'Yes mom.', tag: 'flat' },
      { text: 'When I can afford to.', tag: 'self' } ] },
    { text: 'Better. They gave me exercises I don\'t do. Your father says hi.', replies: [
      { text: 'Tell him hi back. Do the exercises — I\'ll text you every morning to nag.', tag: 'emp' },
      { text: 'ok', tag: 'flat' },
      { text: 'Can he send me some money actually', tag: 'self' } ] },
    { text: 'You sound tired, honey.', replies: [
      { text: 'A little. But hearing your voice helps. I\'ll call properly on Sunday.', tag: 'emp' },
      { text: 'I\'m fine.', tag: 'flat' },
      { text: 'I am. Nobody gets how hard this is.', tag: 'self' } ] },
  ] },
  { title: 'Nadia', msgs: [
    { text: 'sorry I\'ve been MIA. the baby doesn\'t believe in sleep', replies: [
      { text: 'Don\'t apologize! How are YOU doing, not just the baby?', tag: 'emp' },
      { text: 'Tell me about it, I barely sleep either with work.', tag: 'self' },
      { text: 'haha congrats', tag: 'flat' } ] },
    { text: 'honestly? kind of lonely. everyone asks about her, nobody asks about me', replies: [
      { text: 'I\'m asking. What\'s been the hardest part?', tag: 'emp' },
      { text: 'that\'s normal I think', tag: 'flat' },
      { text: 'Same. Nobody asks about me either.', tag: 'self' } ] },
    { text: 'thank you. come over sunday? you can hold her while I shower lol', replies: [
      { text: 'Deal. I\'ll bring food so you don\'t have to cook.', tag: 'emp' },
      { text: 'maybe, if I\'m not working', tag: 'flat' },
      { text: 'Sunday is my only day off though...', tag: 'self' } ] },
  ] },
  { title: 'Jordan', msgs: [
    { text: 'did 14 hours of deliveries today. my back is done', replies: [
      { text: '14?! That\'s too much. Are you okay? Did you eat?', tag: 'emp' },
      { text: 'I did 12, so I get it.', tag: 'self' },
      { text: 'oof', tag: 'flat' } ] },
    { text: 'rent\'s due. can\'t really stop', replies: [
      { text: 'I hear you. Take tomorrow night off with me and we\'ll cook cheap. Rest is part of the job.', tag: 'emp' },
      { text: 'Yeah, same. It\'s the grind.', tag: 'self' },
      { text: 'that sucks', tag: 'flat' } ] },
    { text: 'ok. tomorrow night. you bring the pasta', replies: [
      { text: 'Deal. Phones on silent, no apps.', tag: 'emp' },
      { text: 'sure', tag: 'flat' },
      { text: 'If I don\'t get a late gig.', tag: 'self' } ] },
  ] },
  { title: 'Dad', msgs: [
    { text: 'Saw a news story about gig workers. Is that you?', replies: [
      { text: 'Ha, probably. How are you, Dad? Still fixing up the garage?', tag: 'emp' },
      { text: 'Yeah, it\'s rough out here.', tag: 'self' },
      { text: 'sort of', tag: 'flat' } ] },
    { text: 'Garage is done. Took me all summer. Wish you\'d seen it.', replies: [
      { text: 'Send me pictures! And I\'ll come see it in person soon.', tag: 'emp' },
      { text: 'nice', tag: 'flat' },
      { text: 'Wish I had time for projects.', tag: 'self' } ] },
    { text: 'Proud of you, kid. Don\'t work yourself sick.', replies: [
      { text: 'Thanks, Dad. That means a lot. I\'ll call more.', tag: 'emp' },
      { text: 'k', tag: 'flat' },
      { text: 'Easy to say when you\'re retired.', tag: 'self' } ] },
  ] },
];

export class ThreadGame {
  constructor(mode, thread, state = null) {
    this.mode = mode; // 'client' | 'friend'
    const pool = mode === 'client' ? TEXT_BACK_THREADS : CHECK_IN_THREADS;
    const base = thread || pool[drawFromDeck(state, mode === 'client' ? 'textBack' : 'checkIn', pool.length)];
    this.thread = { ...base, msgs: base.msgs.map((m) => ({ ...m, replies: shuffled(m.replies) })) };
    this.name = mode === 'client' ? 'TEXT BACK' : `CALL ${this.thread.title.toUpperCase()}`;
    this.hint = mode === 'client' ? 'Keep the client\'s temperature down. Timer is soft, silence is not.' : 'Ask about them. It is a two-way call.';
    this.idx = 0;
    this.heat = this.thread.heat ?? 0;
    this.timer = 0;
    this.perMsg = 9;
    this.log = [{ who: 'them', text: this.thread.msgs[0].text }];
    this.tags = [];
    this.buttons = [];
    this.done = false;
    this.result = null;
    this.endT = 0;
    this.noFail = mode === 'friend';
    playBuzz();
  }
  update(dt) {
    if (this.done) return;
    if (this.idx >= this.thread.msgs.length) { this.endT += dt; if (this.endT > 1.2) this.finish(); return; }
    if (this.mode === 'client') {
      this.timer += dt;
      if (this.timer >= this.perMsg) this.reply({ text: '(left on read)', tag: 'dis', heat: 14 });
    }
  }
  handleTap(pt) {
    if (this.done) return;
    for (const b of this.buttons) if (hit(b, pt)) { b.onTap(); return; }
  }
  reply(r) {
    this.log.push({ who: 'me', text: r.text });
    this.tags.push(r.tag);
    if (this.mode === 'client') { this.heat = Math.max(0, Math.min(100, this.heat + r.heat)); (r.tag === 'ack' ? playTick : playBuzz)(); }
    else (r.tag === 'emp' ? playWarm : playTick)();
    this.idx += 1;
    this.timer = 0;
    if (this.idx < this.thread.msgs.length) this.log.push({ who: 'them', text: this.thread.msgs[this.idx].text });
  }
  finish() {
    if (this.mode === 'client') {
      const success = this.heat <= 40;
      const acks = this.tags.filter((t) => t === 'ack').length;
      this.result = { success, score: Math.round(100 - this.heat), effects: { rep: success ? 0.2 + acks * 0.05 : -0.2, stress: success ? -4 : 6 }, summary: success ? 'The client cooled off. They\'ll remember that.' : 'The client stayed hot. That review won\'t be kind.' };
      success ? playSuccess() : playFail();
    } else {
      const emp = this.tags.filter((t) => t === 'emp').length;
      this.result = { success: true, score: Math.round((emp / this.thread.msgs.length) * 100), effects: { support: 4 + emp * 4, stress: -3 - emp * 2 }, summary: emp >= 2 ? `${this.thread.title} sounded better by the end. So did you.` : `${this.thread.title} was glad you called, even if the call was mostly about you.` };
      playWarm();
    }
    this.done = true;
  }
  render(ctx) {
    this.buttons = [];
    // thread: the newest messages that fit between the hint and the meter, sized from the real
    // wrapped line count. Older messages scroll off the top, as in a real chat.
    const w = 360, top = AREA.y + 58, bottom = AREA.y + 212, gap = 8;
    const sized = this.log.map((m) => ({ m, lines: wrapLines(ctx, m.text, w - 28, { size: 14 }) }))
      .map((b) => ({ ...b, h: 14 + b.lines.length * 18 }));
    const shown = [];
    let used = 0;
    for (let i = sized.length - 1; i >= 0; i--) {
      const need = sized[i].h + (shown.length ? gap : 0);
      if (used + need > bottom - top) break;
      shown.unshift(sized[i]); used += need;
    }
    let y = top;
    for (const { m, lines, h } of shown) {
      const mine = m.who === 'me';
      const x = mine ? AREA.x + AREA.w - w - 24 : AREA.x + 24;
      ctx.fillStyle = mine ? '#2c6e9e' : '#3a3a3a';
      roundRectPath(ctx, x, y, w, h, 12); ctx.fill();
      lines.forEach((line, i) => drawText(ctx, line, x + 14, y + 20 + i * 18, { size: 14, color: '#ffffff', shadow: false }));
      y += h + gap;
    }
    // meter / timer
    if (this.mode === 'client') {
      const hot = this.heat > 60;
      drawText(ctx, `Client temperature: ${Math.round(this.heat)}`, AREA.x + 24, AREA.y + 226, { size: 13, weight: 'bold', color: hot ? '#e74c3c' : '#2ecc71' });
      ctx.fillStyle = '#3a2d1f'; ctx.fillRect(AREA.x + 24, AREA.y + 232, 240, 10);
      ctx.fillStyle = hot ? '#e74c3c' : '#e67e22'; ctx.fillRect(AREA.x + 24, AREA.y + 232, 240 * (this.heat / 100), 10);
      if (this.idx < this.thread.msgs.length) {
        ctx.fillStyle = '#3a2d1f'; ctx.fillRect(AREA.x + AREA.w - 264, AREA.y + 232, 240, 10);
        ctx.fillStyle = '#5dade2'; ctx.fillRect(AREA.x + AREA.w - 264, AREA.y + 232, 240 * Math.max(0, 1 - this.timer / this.perMsg), 10);
        drawText(ctx, 'reply before they follow up', AREA.x + AREA.w - 24, AREA.y + 226, { size: 12, color: '#8a99a8', align: 'right' });
      }
    } else {
      drawText(ctx, `Calling ${this.thread.title}`, AREA.x + 24, AREA.y + 232, { size: 13, weight: 'bold', color: '#c9a876' });
    }
    // replies
    if (this.idx < this.thread.msgs.length) {
      this.thread.msgs[this.idx].replies.forEach((r, i) => {
        const b = { x: AREA.x + 24, y: AREA.y + 250 + i * 50, w: AREA.w - 48, h: 44, label: r.text, onTap: () => this.reply(r) };
        this.buttons.push(b); drawChoice(ctx, b, { color: '#2b3d4f' });
      });
    } else {
      drawText(ctx, this.mode === 'client' ? (this.heat <= 40 ? 'They send a thumbs up.' : 'They stop replying.') : 'You hang up smiling.', AREA.x + AREA.w / 2, AREA.y + 300, { size: 17, weight: 'bold', color: '#f0f0f0', align: 'center' });
    }
  }
}

/** In-gig emotional-intelligence games, by the id used in choice trees. */
export function createEIGame(kind, state) {
  if (kind === 'textback') return new ThreadGame('client', null, state);
  return new ReadClient(state);
}

/** Evening games, by the evening choice id. */
export function createEveningGame(kind, state = null) {
  if (kind === 'checkin') return new ThreadGame('friend', null, state);
  return new Breathe();
}

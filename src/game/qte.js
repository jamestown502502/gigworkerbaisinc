// 3 QTE mini-games: rhythm tap, timed sequence, steady hand.
// Each instance: update(dt), render(ctx), handleTap(pt), done, result { success, score }.
// Difficulty scales with stress (high = harder) and energy (low = harder).

import { playTick, playSuccess, playFail } from '../engine/audio.js';
import { drawText } from '../ui/text.js';

// Brief "GET READY" beat before a QTE's own update()/handleTap() go live — shared with
// loop.js (gates input) and screens.js (renders the countdown). Lives here, not in loop.js,
// so both can import it without a loop.js <-> screens.js circular dependency.
export const QTE_READY_DURATION = 0.8;

function difficultyFactor(state) {
  const stressPenalty = state.stress / 150;                    // up to +0.66
  const energyPenalty = (80 - Math.min(state.energy, 80)) / 200; // up to +0.4
  let d = Math.min(1.9, 1 + stressPenalty + energyPenalty);
  d *= 1 + (100 - (state.health ?? 100)) / 200;                // low health = harder (softened)
  d = Math.min(1.8, d);                                        // hard cap: tough, never impossible
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
    else setTimeout(() => this.startRound(), 350);
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
    // target ring
    ctx.strokeStyle = '#f5deb3';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
    // converging ring
    if (!this.tapped && !this.done) {
      ctx.strokeStyle = '#e07030';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(this.radius, 5), 0, Math.PI * 2); ctx.stroke();
    }
    if (Math.abs(this.flash) > 0.01) {
      ctx.fillStyle = this.flash > 0 ? 'rgba(46,204,113,0.4)' : 'rgba(231,76,60,0.4)';
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
    }
    drawText(ctx, `Round ${Math.min(this.round + 1, this.totalRounds)} / ${this.totalRounds}`, cx, AREA.y + 24, {
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
    // timer bar
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
    // zone band
    ctx.fillStyle = 'rgba(46, 204, 113, 0.28)';
    ctx.fillRect(AREA.x + 40, c - this.bandHalf, AREA.w - 80, this.bandHalf * 2);
    ctx.strokeStyle = '#2ecc71';
    ctx.strokeRect(AREA.x + 40, c - this.bandHalf, AREA.w - 80, this.bandHalf * 2);
    // marker
    const inside = Math.abs(this.markerY - c) <= this.bandHalf;
    ctx.fillStyle = inside ? '#f1c40f' : '#e74c3c';
    ctx.beginPath(); ctx.arc(AREA.x + AREA.w / 2, this.markerY, 14, 0, Math.PI * 2); ctx.fill();
    // progress
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

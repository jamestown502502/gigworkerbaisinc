// Minigames. Three skill QTEs (rhythm tap, timed sequence, steady hand) plus the emotional-
// intelligence / work-life-balance set added in the 2026-09 pass: Breathe (evening wind-down),
// Read the Client and Text Back (in-gig), Check In (evening call).
// Every instance: update(dt), render(ctx), handleTap(pt), done, result { success, score, ... }.
// Skill QTE difficulty scales with stress (high = harder) and energy (low = harder).

import { playTick, playSuccess, playFail, playBreathIn, playBreathOut, playBuzz, playWarm, playError } from '../engine/audio.js';
import { drawText, drawWrapped, roundRectPath } from '../ui/text.js';

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
  drawWrapped(ctx, b.label, b.x + 14, b.y + 24, b.w - 28, 18, { size: 14, color: dim ? '#8a7a63' : '#ffffff', shadow: false });
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
// Box breathing: the ring swells on the inhale and settles on the exhale. Tap at the top of
// each breath and at the bottom. Accuracy scores stress relief; a passive player still gets the
// floor amount, because a breathing exercise you can lose is not a breathing exercise.
const BREATH_HALF = 3.2;
const BREATH_CYCLES = 3;
export class Breathe {
  constructor() {
    this.name = 'WIND DOWN';
    this.hint = 'Breathe with the ring. Tap at the top and bottom of each breath.';
    this.elapsed = 0;
    this.targets = [];
    for (let i = 1; i <= BREATH_CYCLES * 2; i++) this.targets.push({ t: i * BREATH_HALF, hit: null });
    this.duration = BREATH_CYCLES * 2 * BREATH_HALF + 0.6;
    this.done = false;
    this.result = null;
    this.ripple = 0;
    this.lastCue = -1;
    this.noFail = true;
  }
  phase() { return (this.elapsed % (BREATH_HALF * 2)) / BREATH_HALF; } // 0..2 : 0-1 inhale, 1-2 exhale
  breath() { const p = this.phase(); return p < 1 ? p : 2 - p; }        // 0..1 ring size
  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.ripple = Math.max(0, this.ripple - dt * 2);
    const cue = Math.floor(this.elapsed / BREATH_HALF);
    if (cue !== this.lastCue) { this.lastCue = cue; (cue % 2 === 0 ? playBreathIn : playBreathOut)(); }
    if (this.elapsed >= this.duration) {
      const scores = this.targets.map((t) => t.hit ?? 0);
      const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      this.result = { success: true, score };
      this.done = true;
      playWarm();
    }
  }
  handleTap() {
    if (this.done) return;
    const WINDOW = 0.9;
    let best = null;
    for (const t of this.targets) {
      if (t.hit !== null) continue;
      const diff = Math.abs(this.elapsed - t.t);
      if (diff <= WINDOW && (!best || diff < Math.abs(this.elapsed - best.t))) best = t;
    }
    if (best) { best.hit = Math.round(100 - (Math.abs(this.elapsed - best.t) / WINDOW) * 100); this.ripple = 1; playTick(); }
  }
  render(ctx) {
    const cx = AREA.x + AREA.w / 2, cy = AREA.y + AREA.h / 2 + 10;
    const r = 46 + 96 * this.breath();
    const inhale = this.phase() < 1;
    ctx.fillStyle = inhale ? 'rgba(93,173,226,0.22)' : 'rgba(46,204,113,0.22)';
    ctx.beginPath(); ctx.arc(cx, cy, r + 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = inhale ? '#5dade2' : '#2ecc71';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (this.ripple > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${this.ripple * 0.7})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r + 30 * (1 - this.ripple), 0, Math.PI * 2); ctx.stroke();
    }
    drawText(ctx, inhale ? 'Breathe in...' : 'Breathe out...', cx, cy + 6, { size: 22, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true });
    const cycle = Math.min(BREATH_CYCLES, Math.floor(this.elapsed / (BREATH_HALF * 2)) + 1);
    drawText(ctx, `Breath ${cycle} of ${BREATH_CYCLES}`, cx, AREA.y + AREA.h - 30, { size: 16, color: '#f0f0f0', font: 'monospace', align: 'center' });
    ctx.fillStyle = '#3a2d1f';
    ctx.fillRect(AREA.x, AREA.y + AREA.h - 14, AREA.w, 10);
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(AREA.x, AREA.y + AREA.h - 14, AREA.w * Math.min(1, this.elapsed / this.duration), 10);
  }
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
];
const FEELING_LABEL = { rushed: 'Rushed', suspicious: 'Wary', lonely: 'Lonely', embarrassed: 'Embarrassed', angry: 'Frustrated', grateful: 'Grateful' };

export class ReadClient {
  constructor(state, scenario) {
    this.name = 'READ THE CLIENT';
    this.hint = 'Look and listen. What\'s really going on with them?';
    this.s = scenario || READ_CLIENT_SCENARIOS[Math.floor(Math.random() * READ_CLIENT_SCENARIOS.length)];
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
];

export class ThreadGame {
  constructor(mode, thread) {
    this.mode = mode; // 'client' | 'friend'
    const pool = mode === 'client' ? TEXT_BACK_THREADS : CHECK_IN_THREADS;
    this.thread = thread || pool[Math.floor(Math.random() * pool.length)];
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
    // thread
    let y = AREA.y + 62;
    const recent = this.log.slice(-3);
    for (const m of recent) {
      const mine = m.who === 'me';
      const w = 360;
      const x = mine ? AREA.x + AREA.w - w - 24 : AREA.x + 24;
      ctx.font = '14px system-ui, sans-serif';
      const lines = Math.max(1, Math.ceil(ctx.measureText(m.text).width / (w - 28)));
      const h = 16 + lines * 18;
      ctx.fillStyle = mine ? '#2c6e9e' : '#3a3a3a';
      roundRectPath(ctx, x, y, w, h, 12); ctx.fill();
      drawWrapped(ctx, m.text, x + 14, y + 22, w - 28, 18, { size: 14, color: '#ffffff', shadow: false });
      y += h + 8;
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
  if (kind === 'textback') return new ThreadGame('client');
  return new ReadClient(state);
}

/** Evening games, by the evening choice id. */
export function createEveningGame(kind) {
  if (kind === 'checkin') return new ThreadGame('friend');
  return new Breathe();
}

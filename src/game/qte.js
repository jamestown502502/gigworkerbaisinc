// Minigames. The emotional-intelligence / work-life-balance set: Breathe (evening wind-down),
// Read the Client and Text Back (in-gig), Check In (evening call). The in-gig skill challenges
// are the job-shaped microgames in microgames.js (they replaced three generic ones, 2026-09-29).
// Every instance: update(dt), render(ctx), handleTap(pt), done, result { success, score, ... }.
// Skill QTE difficulty scales with stress (high = harder) and energy (low = harder).

import { playTick, playSuccess, playFail, playBuzz, playWarm, playError, playBreathGlide, soundIsOn } from '../engine/audio.js';
import { drawText, drawWrapped, roundRectPath, wrapLines } from '../ui/text.js';
import { InputManager } from '../engine/input.js';

// Brief "GET READY" beat before a skill QTE's own update()/handleTap() go live — shared with
// loop.js (gates input) and screens.js (renders the countdown). Lives here, not in loop.js,
// so both can import it without a loop.js <-> screens.js circular dependency.
// 1.6 s, was 0.8: long enough to read the one-line goal under GET READY (QA round 2 #20).
export const QTE_READY_DURATION = 1.6;

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

export const AREA = { x: 100, y: 110, w: 600, h: 400 };

// ---------- TYPE 1: Rhythm Tap — circles converge, tap when aligned ----------
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
// Two patterns, the player's choice:
//   Calm  - 5 seconds in, 5 out: slow "resonance" breathing at six breaths a minute, the pace the
//           heart-rate-variability research centres on (e.g. JMIR Serious Games, 2021).
//   Focus - box breathing, 4 seconds each: in, hold, out, rest.
// Press and hold for the in-breath (and its hold), let go for the out-breath (and the rest). A soft
// tone rises through each in-breath and falls through each out-breath, and Android phones pulse at
// every turn, because people report more calm from cues they hear or feel than from cues they must
// watch (Frontiers in Computer Science, 2022). "Eyes closed" darkens the screen and leaves the sound.
// The score is the share of the exercise the finger matched the breath, with a grace period at each
// turn so reaction time is never scored. It cannot be failed: doing nothing still matches the let-go
// half. Replaced a tap-at-the-peak version (2026-09-28) and then a fixed 3-second box (2026-09-29).
export const BREATH_PATTERNS = {
  calm: { label: 'Calm', sub: '5 in, 5 out', cycles: 3, sides: [
    { label: 'Breathe in', short: 'IN', press: true, tone: 'up', color: '#5dade2', secs: 5 },
    { label: 'Breathe out', short: 'OUT', press: false, tone: 'down', color: '#2ecc71', secs: 5 },
  ] },
  focus: { label: 'Focus', sub: 'Box: in, hold, out, rest (4 each)', cycles: 2, sides: [
    { label: 'Breathe in', short: 'IN', press: true, tone: 'up', color: '#5dade2', secs: 4 },
    { label: 'Hold', short: 'HOLD', press: true, tone: null, color: '#9b8cd9', secs: 4 },
    { label: 'Breathe out', short: 'OUT', press: false, tone: 'down', color: '#2ecc71', secs: 4 },
    { label: 'Rest', short: 'REST', press: false, tone: null, color: '#c9a876', secs: 4 },
  ] },
};
/** Why it works, for the result card. */
export const BREATH_LESSON = 'Long, slow out-breaths calm the stress response in your body. A few minutes a day beats one long session.';
export const BREATH_GRACE = 0.45;       // seconds at the start of each side that are not scored
export const BREATH_CHOOSE_SECS = 10;   // no choice by then: Calm starts on its own

function pulse(pattern) { try { globalThis.navigator?.vibrate?.(pattern); } catch { /* not supported */ } }

export class Breathe {
  constructor() {
    this.name = 'WIND DOWN';
    this.hint = 'Choose how you want to breathe tonight.';
    this.stage = 'choose';
    this.chooseT = 0;
    this.eyesClosed = false;
    this.buttons = [];
    this.pattern = null;
    this.patternKey = null;
    this.elapsed = 0;
    this.exercise = 0;
    this.duration = 0;
    this.scored = 0;
    this.matched = 0;
    this.pressed = false;
    this.lastSide = -1;
    this.done = false;
    this.result = null;
    this.noFail = true;
  }
  start(key) {
    if (this.stage !== 'choose') return;
    this.patternKey = key;
    this.pattern = BREATH_PATTERNS[key];
    this.cycleLen = this.pattern.sides.reduce((a, s) => a + s.secs, 0);
    this.exercise = this.cycleLen * this.pattern.cycles;
    this.duration = this.exercise + 1.2;
    this.stage = 'breathe';
    this.hint = this.eyesClosed ? 'Eyes closed. Hold while the tone rises, let go while it falls.' : 'Press and hold to breathe in. Let go to breathe out.';
    playTick();
  }
  /** Which side of the pattern the breath is on, and how far through it (0..1). */
  position() {
    const t = Math.min(this.elapsed, this.exercise - 1e-6) % this.cycleLen;
    let acc = 0;
    for (let i = 0; i < this.pattern.sides.length; i++) {
      const s = this.pattern.sides[i];
      if (t < acc + s.secs) return { index: i, into: t - acc, frac: (t - acc) / s.secs };
      acc += s.secs;
    }
    return { index: this.pattern.sides.length - 1, into: 0, frac: 1 };
  }
  sideIndex() { return this.position().index; }
  side() { return this.pattern.sides[this.sideIndex()]; }
  /** 0..1 how full the lungs are: fills on in, full on hold, empties on out, empty at rest. */
  lungs() {
    const p = this.position(), s = this.pattern.sides[p.index];
    return s.tone === 'up' ? p.frac : s.tone === 'down' ? 1 - p.frac : s.press ? 1 : 0;
  }
  sync() { return this.scored > 0 ? this.matched / this.scored : 1; }
  /** `pressed` is read from the pointer each frame; tests pass it in. */
  update(dt, pressed = InputManager.pointer.down) {
    if (this.done) return;
    if (this.stage === 'choose') {
      this.chooseT += dt;
      if (this.chooseT >= BREATH_CHOOSE_SECS) this.start('calm');
      return;
    }
    this.pressed = !!pressed;
    if (this.elapsed < this.exercise) {
      const p = this.position(), s = this.pattern.sides[p.index];
      if (p.index !== this.lastSide || (p.index === 0 && this.lastSide !== 0)) {
        this.lastSide = p.index;
        if (s.tone) playBreathGlide(s.tone === 'up', s.secs); else playTick();
        pulse(s.tone === 'up' ? [50] : s.tone === 'down' ? [30, 60, 30] : [15]);
      }
      if (p.into >= BREATH_GRACE) {
        this.scored += dt;
        if (this.pressed === s.press) this.matched += dt;
      }
    }
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.result = { success: true, score: Math.round(this.sync() * 100), lesson: BREATH_LESSON };
      this.done = true;
      playWarm();
    }
  }
  handleTap(pt) {
    if (this.done || this.stage !== 'choose') return; // while breathing, holding is read in update()
    for (const b of this.buttons) if (hit(b, pt)) { b.onTap(); return; }
  }
  render(ctx) {
    this.buttons = [];
    if (this.stage === 'choose') return this.renderChoose(ctx);
    const cx = AREA.x + AREA.w / 2, cy = AREA.y + 196;
    const finished = this.elapsed >= this.exercise;
    const pos = this.position();
    const side = this.pattern.sides[pos.index];
    const progress = Math.min(1, this.elapsed / this.exercise);

    if (this.eyesClosed && !finished) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      roundRectPath(ctx, AREA.x + 20, AREA.y + 44, AREA.w - 40, AREA.h - 70, 14); ctx.fill();
      drawText(ctx, 'Eyes closed.', cx, cy - 40, { size: 22, weight: 'bold', color: '#e8dcc4', align: 'center' });
      drawText(ctx, 'Hold while the tone rises. Let go while it falls.', cx, cy - 6, { size: 15, color: '#c9c3d6', align: 'center' });
      drawText(ctx, `In sync ${Math.round(this.sync() * 100)}%`, cx, cy + 30, { size: 14, color: '#9fe0b5', align: 'center' });
    } else {
      const sky = ctx.createLinearGradient(0, AREA.y + 40, 0, AREA.y + AREA.h);
      sky.addColorStop(0, `rgba(${Math.round(30 + 40 * progress)}, ${Math.round(40 + 20 * progress)}, ${Math.round(70 - 20 * progress)}, 0.55)`);
      sky.addColorStop(1, 'rgba(20, 14, 8, 0.2)');
      ctx.fillStyle = sky;
      roundRectPath(ctx, AREA.x + 20, AREA.y + 44, AREA.w - 40, AREA.h - 70, 14); ctx.fill();
      for (let i = 0; i < 14; i++) {
        const mx = AREA.x + 40 + ((i * 97 + this.elapsed * (6 + (i % 4) * 3)) % (AREA.w - 80));
        const my = AREA.y + 60 + ((i * 53) % 280) - Math.sin(this.elapsed * 0.6 + i) * 6;
        ctx.fillStyle = `rgba(255, 240, 200, ${0.08 + 0.06 * Math.sin(this.elapsed + i)})`;
        ctx.beginPath(); ctx.arc(mx, my, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      // the path the breath travels: a box for Focus, a circle for Calm (up the left, down the right)
      let at, labelAt;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      if (this.patternKey === 'focus') {
        const half = 110, x0 = cx - half, y0 = cy - half, s = half * 2;
        const corners = [[x0, y0 + s], [x0, y0], [x0 + s, y0], [x0 + s, y0 + s]];
        ctx.strokeRect(x0, y0, s, s);
        at = (i, t) => { const a = corners[i], b = corners[(i + 1) % 4]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
        labelAt = [[x0 - 30, cy], [cx, y0 - 16], [x0 + s + 30, cy], [cx, y0 + s + 22]];
        if (!finished) {
          ctx.strokeStyle = side.color; ctx.lineWidth = 6;
          const [dx, dy] = at(pos.index, pos.frac);
          ctx.beginPath(); ctx.moveTo(...corners[pos.index]); ctx.lineTo(dx, dy); ctx.stroke();
        }
      } else {
        const r = 110;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        const angle = (i, t) => (i === 0 ? Math.PI / 2 + t * Math.PI : Math.PI * 1.5 + t * Math.PI);
        at = (i, t) => [cx + Math.cos(angle(i, t)) * r, cy + Math.sin(angle(i, t)) * r];
        labelAt = [[cx - r - 30, cy], [cx + r + 34, cy]];
        if (!finished) {
          ctx.strokeStyle = side.color; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(cx, cy, r, angle(pos.index, 0), angle(pos.index, pos.frac)); ctx.stroke();
        }
      }
      if (!finished) {
        const [dx, dy] = at(pos.index, pos.frac);
        const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, 22);
        glow.addColorStop(0, 'rgba(255,255,255,0.95)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(dx, dy, 22, 0, Math.PI * 2); ctx.fill();
      }
      this.pattern.sides.forEach((sd, i) => {
        const on = !finished && i === pos.index;
        drawText(ctx, sd.short, labelAt[i][0], labelAt[i][1], { size: 12, weight: 'bold', color: on ? sd.color : 'rgba(240,240,240,0.8)', align: 'center', baseline: 'middle', shadow: false });
      });
      const inSync = this.pressed === side.press;
      const rr = 26 + 58 * this.lungs();
      ctx.fillStyle = finished ? 'rgba(46,204,113,0.28)' : inSync ? 'rgba(255,255,255,0.16)' : 'rgba(230,126,34,0.16)';
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = finished ? '#2ecc71' : side.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      if (finished) {
        drawText(ctx, 'Settled.', cx, cy - 4, { size: 24, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true });
        drawText(ctx, `In sync ${Math.round(this.sync() * 100)}%`, cx, cy + 24, { size: 15, color: '#c9f2d6', align: 'center', baseline: 'middle', shadow: false });
      } else {
        drawText(ctx, side.label, cx, cy - 12, { size: 20, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true });
        drawText(ctx, String(Math.ceil(side.secs - pos.into)), cx, cy + 18, { size: 26, weight: 'bold', color: side.color, align: 'center', baseline: 'middle', outline: true });
      }
    }
    const cycle = Math.min(this.pattern.cycles, Math.floor(this.elapsed / this.cycleLen) + 1);
    const instruction = finished ? 'Well done.' : side.press ? 'Press and hold' : 'Let go';
    drawText(ctx, instruction, AREA.x + 44, AREA.y + AREA.h - 40, { size: 16, weight: 'bold', color: side.press && !finished ? '#8ec6ea' : '#9fe0b5', shadow: false });
    drawText(ctx, `${this.pattern.label} · breath ${cycle} of ${this.pattern.cycles} · in sync ${Math.round(this.sync() * 100)}%`, AREA.x + AREA.w - 44, AREA.y + AREA.h - 40, { size: 14, color: '#e8dcc4', align: 'right', shadow: false });
    ctx.fillStyle = '#3a2d1f';
    ctx.fillRect(AREA.x, AREA.y + AREA.h - 14, AREA.w, 10);
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(AREA.x, AREA.y + AREA.h - 14, AREA.w * progress, 10);
  }
  renderChoose(ctx) {
    const cards = [
      { key: 'calm', x: AREA.x + 40, lines: ['Six slow breaths a minute.', 'Best for winding down.'] },
      { key: 'focus', x: AREA.x + 310, lines: ['In, hold, out, rest.', 'Best for a racing mind.'] },
    ];
    for (const c of cards) {
      const p = BREATH_PATTERNS[c.key];
      const b = { x: c.x, y: AREA.y + 64, w: 250, h: 150, label: '', onTap: () => this.start(c.key) };
      this.buttons.push(b);
      ctx.fillStyle = 'rgba(20, 30, 44, 0.92)'; roundRectPath(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
      ctx.strokeStyle = c.key === 'calm' ? '#5dade2' : '#9b8cd9'; ctx.lineWidth = 2; roundRectPath(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
      drawText(ctx, p.label, b.x + b.w / 2, b.y + 40, { size: 24, weight: 'bold', color: '#ffffff', align: 'center' });
      drawText(ctx, p.sub, b.x + b.w / 2, b.y + 70, { size: 14, color: '#c9e4f5', align: 'center', maxWidth: b.w - 20 });
      c.lines.forEach((l, i) => drawText(ctx, l, b.x + b.w / 2, b.y + 100 + i * 20, { size: 13, color: '#e8dcc4', align: 'center' }));
      // A live preview of the breathing guide on each card (QA round 4 #11: the ring only appeared
      // after a choice, so the first screen read as "the ring is missing").
      const px = b.x + 28, py = b.y + 30, pr = 14, col = c.key === 'calm' ? '#5dade2' : '#9b8cd9';
      const cyc = (this.chooseT % (c.key === 'calm' ? 10 : 16)) / (c.key === 'calm' ? 10 : 16);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      let dot;
      if (c.key === 'calm') {
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
        const a = Math.PI / 2 + cyc * Math.PI * 2;
        ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(px, py, pr, Math.PI / 2, a); ctx.stroke();
        dot = [px + Math.cos(a) * pr, py + Math.sin(a) * pr];
      } else {
        ctx.strokeRect(px - pr, py - pr, pr * 2, pr * 2);
        const per = cyc * 4, side = Math.floor(per), f = per - side;
        const cs = [[px - pr, py + pr], [px - pr, py - pr], [px + pr, py - pr], [px + pr, py + pr]];
        const p0 = cs[side % 4], p1 = cs[(side + 1) % 4];
        dot = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
      }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(dot[0], dot[1], 4, 0, Math.PI * 2); ctx.fill();
    }
    const soundOn = soundIsOn();
    const t = { x: AREA.x + 150, y: AREA.y + 238, w: 300, h: 46, label: '', onTap: () => { if (soundOn) { this.eyesClosed = !this.eyesClosed; playTick(); } } };
    this.buttons.push(t);
    ctx.fillStyle = this.eyesClosed ? '#2c6e49' : 'rgba(20, 14, 8, 0.9)'; roundRectPath(ctx, t.x, t.y, t.w, t.h, 10); ctx.fill();
    ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 1.5; roundRectPath(ctx, t.x, t.y, t.w, t.h, 10); ctx.stroke();
    drawText(ctx, soundOn ? `${this.eyesClosed ? '✓ ' : ''}Eyes closed (sound only)` : 'Eyes closed needs sound on', t.x + t.w / 2, t.y + t.h / 2, { size: 15, weight: 'bold', color: soundOn ? '#ffffff' : '#c9c3d6', align: 'center', baseline: 'middle' });
    drawText(ctx, `Calm starts on its own in ${Math.max(1, Math.ceil(BREATH_CHOOSE_SECS - this.chooseT))}...`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 36, { size: 14, color: '#c9a876', align: 'center' });
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
    cues: ['Keeps checking the clock on the stove.', 'Phone face-up on the counter, buzzing.'],
    responses: [
      { text: '"Totally. Point me at what matters most and I\'ll be out of your way."', good: true, effects: { rep: 0.3, stress: -3 } },
      { text: '"Rushing me is how mistakes happen."', good: false, effects: { rep: -0.2, stress: 6 } },
      { text: '"Twenty minutes? That\'s not really enough for the full job."', good: false, effects: { rep: -0.1, stress: 3 } },
    ] },
  { seed: 8, line: '"Sorry about the mess. I meant to tidy before you came. It\'s been... a week."',
    feeling: 'embarrassed', options: ['angry', 'embarrassed', 'rushed', 'suspicious'],
    cues: ['Won\'t quite meet your eyes.', 'Pushes a pile of laundry behind the couch.'],
    responses: [
      { text: '"Honestly? You should see my place. Let\'s just start with the easy corner."', good: true, effects: { rep: 0.3, stress: -4 } },
      { text: '"Yeah, it\'s pretty bad. This\'ll take longer than the listing said."', good: false, effects: { rep: -0.3, stress: 4 } },
      { text: 'Say nothing and get to work.', good: false, effects: { rep: 0, stress: 2 } },
    ] },
  { seed: 12, line: '"The last person I hired took my deposit and never came back. So. You understand why I\'m asking for ID."',
    feeling: 'suspicious', options: ['lonely', 'rushed', 'suspicious', 'grateful'],
    cues: ['Arms crossed, standing between you and the hall.', 'The front door stays open behind you.'],
    responses: [
      { text: '"Completely fair. Here\'s my ID, and I\'m happy to be paid when you\'re satisfied."', good: true, effects: { rep: 0.4, stress: -2 } },
      { text: '"I\'m not the other guy. Can we skip the interrogation?"', good: false, effects: { rep: -0.3, stress: 6 } },
      { text: '"No ID on me, but I\'m legit, promise."', good: false, effects: { rep: -0.2, stress: 4 } },
    ] },
  { seed: 17, line: '"You can stay for tea after, if you like. My son used to help with this. He\'s in Denver now."',
    feeling: 'lonely', options: ['suspicious', 'grateful', 'lonely', 'rushed'],
    cues: ['Two mugs already set out on the table.', 'Photos of a young man on every shelf.'],
    responses: [
      { text: '"I\'d like that. Tell me about Denver while we work."', good: true, effects: { rep: 0.3, stress: -5 } },
      { text: '"I\'ve got another gig after this, sorry."', good: false, effects: { rep: -0.1, stress: 0 } },
      { text: '"Denver\'s nice. Anyway, where\'s the toolbox?"', good: false, effects: { rep: -0.1, stress: 1 } },
    ] },
  { seed: 21, line: '"This is the third quote I\'ve had today and every one of them is higher than the last. Go on then, what\'s yours?"',
    feeling: 'angry', options: ['angry', 'embarrassed', 'lonely', 'grateful'],
    cues: ['Jaw tight. Short, clipped sentences.', 'Holding a crumpled quote from another company.'],
    responses: [
      { text: '"Sounds like a frustrating day. Here\'s my number, and here\'s exactly what it covers."', good: true, effects: { rep: 0.3, stress: -2 } },
      { text: '"Maybe the job\'s just worth more than you think."', good: false, effects: { rep: -0.3, stress: 6 } },
      { text: '"I can go lower than the others, whatever they said."', good: false, effects: { rep: -0.1, stress: 3 } },
    ] },
  { seed: 6, line: '"You came! On a Sunday! I didn\'t think anyone would. Can I get you a coffee first?"',
    feeling: 'grateful', options: ['rushed', 'grateful', 'suspicious', 'angry'],
    cues: ['Waves you in before you reach the step.', 'Already telling a neighbor that you came.'],
    responses: [
      { text: '"Coffee would be great. Walk me through what you need."', good: true, effects: { rep: 0.2, stress: -4 } },
      { text: '"No time for coffee, let\'s get started."', good: false, effects: { rep: -0.1, stress: 2 } },
      { text: '"Sunday rate\'s double, just so you know."', good: false, effects: { rep: -0.3, stress: 3 } },
    ] },
  { seed: 25, line: '"Movers bailed, the truck is due back at six, and I have to get my daughter at five. Where do we even start?"',
    feeling: 'rushed', options: ['lonely', 'rushed', 'grateful', 'angry'],
    cues: ['Talking fast, pacing between rooms.', 'Car keys in hand the whole time.'],
    responses: [
      { text: '"Heavy things first while you go get her. I\'ll leave a list on the fridge."', good: true, effects: { rep: 0.3, stress: -3 } },
      { text: '"Honestly, that timeline isn\'t realistic."', good: false, effects: { rep: -0.1, stress: 3 } },
      { text: '"Calm down, it\'s just a move."', good: false, effects: { rep: -0.3, stress: 6 } },
    ] },
  { seed: 30, line: '"I watched three videos and I still can\'t get this shelf level. My dad could do this in his sleep."',
    feeling: 'embarrassed', options: ['embarrassed', 'suspicious', 'rushed', 'grateful'],
    cues: ['Laughs a little too quickly.', 'The instructions are folded and refolded.'],
    responses: [
      { text: '"These kits are badly designed. You got further than most people do."', good: true, effects: { rep: 0.3, stress: -3 } },
      { text: '"Yeah, it\'s pretty easy once you know how."', good: false, effects: { rep: -0.2, stress: 3 } },
      { text: 'Laugh and take the drill off them.', good: false, effects: { rep: -0.2, stress: 2 } },
    ] },
  { seed: 34, line: '"Why do you need to go in the bedroom? The listing only said the living room."',
    feeling: 'suspicious', options: ['angry', 'suspicious', 'embarrassed', 'lonely'],
    cues: ['Follows two steps behind you.', 'Eyes on your bag, not on you.'],
    responses: [
      { text: '"Good question. I don\'t. I was after an outlet. I\'ll stay here and use a cord."', good: true, effects: { rep: 0.4, stress: -2 } },
      { text: '"Relax, I\'m not going to steal anything."', good: false, effects: { rep: -0.3, stress: 5 } },
      { text: '"I go where the job takes me."', good: false, effects: { rep: -0.2, stress: 3 } },
    ] },
  { seed: 39, line: '"Nobody\'s visited since the funeral. You\'re the first voice I\'ve heard in days. Sorry if I talk too much."',
    feeling: 'lonely', options: ['rushed', 'lonely', 'angry', 'suspicious'],
    cues: ['Speaks softly, then keeps talking.', 'Sympathy cards still on the mantel.'],
    responses: [
      { text: '"Talk as much as you like. I\'m listening."', good: true, effects: { rep: 0.3, stress: -5 } },
      { text: '"No worries. I\'ll put my headphones in so I don\'t bother you."', good: false, effects: { rep: -0.1, stress: 1 } },
      { text: '"Sorry for your loss. So, the sink?"', good: false, effects: { rep: -0.2, stress: 2 } },
    ] },
  { seed: 44, line: '"The app charged me twice and support won\'t answer. I\'m not paying anyone until somebody fixes it."',
    feeling: 'angry', options: ['grateful', 'angry', 'embarrassed', 'rushed'],
    cues: ['Phone gripped tight, the charges on screen.', 'Voice rising with every sentence.'],
    responses: [
      { text: '"Maddening, and not your fault. Let\'s screenshot both charges and I\'ll flag it too."', good: true, effects: { rep: 0.3, stress: -2 } },
      { text: '"That\'s not my department."', good: false, effects: { rep: -0.3, stress: 5 } },
      { text: '"No pay, no work. Sorry."', good: false, effects: { rep: -0.2, stress: 4 } },
    ] },
  { seed: 48, line: '"You fixed in ten minutes what I\'ve been fighting for a month. Please, take some of these cookies. I insist."',
    feeling: 'grateful', options: ['suspicious', 'grateful', 'lonely', 'embarrassed'],
    cues: ['Beaming, holding out a plate.', 'Says thank you before you\'ve even started.'],
    responses: [
      { text: '"Thank you, that\'s really kind. Enjoy the working sink!"', good: true, effects: { rep: 0.2, stress: -4 } },
      { text: '"No thanks, I\'m on a schedule."', good: false, effects: { rep: -0.1, stress: 1 } },
      { text: '"It was easy, honestly. Anyone could have done it."', good: false, effects: { rep: -0.1, stress: 1 } },
    ] },
];
const READ_FACE_AT = 0.7, READ_CUE1_AT = 1.5, READ_CUE2_AT = 2.4;
const FEELING_LABEL = { rushed: 'Rushed', suspicious: 'Wary', lonely: 'Lonely', embarrassed: 'Embarrassed', angry: 'Frustrated', grateful: 'Grateful' };
/** The principle behind the good reply, per feeling: why it landed, so the next client with the same
 *  feeling and different words is readable too (2026-10-02). Shown on the result card. */
export const FEELING_LESSON = {
  rushed: 'Rushed people want something taken off their plate. Ask what matters most, then get out of the way.',
  suspicious: 'Wary people need proof, not promises. Offer ID or a way to check you, and never argue with the doubt.',
  lonely: 'Lonely people mostly want to be heard. Your attention is part of the service.',
  embarrassed: 'Embarrassed people need it to be normal. Make it small and move on, kindly.',
  angry: 'Name the frustration first, then give clear facts. Arguing with a feeling makes it louder.',
  grateful: 'Accept thanks warmly. Brushing it off can feel like refusing a gift.',
};
export const THREAD_LESSON = {
  client: 'Acknowledge first, then offer a next step. Defending yourself raises the temperature, even when you are right.',
  friend: 'Ask about them before talking about you. Support is built by listening, not by trading complaints.',
};

export class ReadClient {
  constructor(state, scenario) {
    this.name = 'READ THE CLIENT';
    this.hint = 'Look and listen. Faces and posture are clues, not proof: the surest read is to ask.';
    const base = scenario || READ_CLIENT_SCENARIOS[drawFromDeck(state, 'readClient', READ_CLIENT_SCENARIOS.length)];
    this.s = { ...base, responses: shuffled(base.responses) };
    this.step = 0;          // 0 = pick feeling, 1 = pick response, 2 = reveal
    // Reading them IS the game: the expression shows after a moment, then two body-language cues,
    // one at a time. The feelings can be picked once the face is visible.
    this.readT = 0;
    this.picked = null;
    this.buttons = [];
    this.done = false;
    this.result = null;
    this.revealT = 0;
    this.noFail = true;
  }
  update(dt) {
    if (this.done) return;
    this.readT += dt;
    if (this.step === 2) { this.revealT += dt; if (this.revealT > 1.6) this.finish(); }
  }
  /** How many of the reading cues are showing: 0 (just their words), 1 (face), 2-3 (body language). */
  cuesShown() { return this.readT < READ_FACE_AT ? 0 : this.readT < READ_CUE1_AT ? 1 : this.readT < READ_CUE2_AT ? 2 : 3; }
  canPick() { return this.cuesShown() >= 1; }
  handleTap(pt) {
    if (this.done) return;
    for (const b of this.buttons) if (hit(b, pt)) { b.onTap(); return; }
  }
  finish() {
    const feelingRight = this.picked === this.s.feeling;
    const resp = this.response;
    const score = (feelingRight ? 50 : 0) + (resp.good ? 50 : 0);
    this.result = { success: score >= 50, score, lesson: FEELING_LESSON[this.s.feeling], effects: { ...resp.effects }, summary: feelingRight ? `Your read matched what they told you (${FEELING_LABEL[this.s.feeling].toLowerCase()}).` : `They said they were ${FEELING_LABEL[this.s.feeling].toLowerCase()}, not ${FEELING_LABEL[this.picked].toLowerCase()}.` };
    if (!feelingRight) this.result.effects.rep = (this.result.effects.rep || 0) - 0.1;
    this.done = true;
    score >= 50 ? playWarm() : playFail();
  }
  render(ctx) {
    this.buttons = [];
    const shown = this.cuesShown();
    // Below the hint line (QA round 4 #10: the instruction ran across the top of the face).
    drawFace(ctx, AREA.x + 34, AREA.y + 60, 86, this.s.seed, shown >= 1 || this.step === 2 ? this.s.feeling : 'neutral');
    const endY = drawWrapped(ctx, this.s.line, AREA.x + 150, AREA.y + 64, AREA.w - 180, 21, { size: 15, color: '#f0f0f0', shadow: false });
    (this.s.cues || []).slice(0, Math.max(0, shown - 1)).forEach((cue, i) => {
      drawText(ctx, cue, AREA.x + 150, endY + 2 + i * 19, { size: 13, color: '#e8c98a', shadow: false, maxWidth: AREA.w - 180 });
    });
    if (this.step === 0 && !this.canPick()) {
      drawText(ctx, 'Look at them...', AREA.x + AREA.w / 2, AREA.y + 190, { size: 16, weight: 'bold', color: '#c9a876', align: 'center' });
    } else if (this.step === 0) {
      drawText(ctx, 'Your best guess: how might they be feeling?', AREA.x + AREA.w / 2, AREA.y + 190, { size: 16, weight: 'bold', color: '#f1c40f', align: 'center' });
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
      // Their own words confirm it: body language suggests, people tell (2026-10-07 critique).
      drawText(ctx, right ? `Good read: they tell you they're ${FEELING_LABEL[this.s.feeling].toLowerCase()}.` : `They tell you they're ${FEELING_LABEL[this.s.feeling].toLowerCase()}, not ${FEELING_LABEL[this.picked].toLowerCase()}.`, AREA.x + AREA.w / 2, AREA.y + 210, { size: 18, weight: 'bold', color: right ? '#2ecc71' : '#e67e22', align: 'center', maxWidth: AREA.w - 40 });
      drawText(ctx, this.response.good ? 'They relax. That landed.' : 'They stiffen. That did not land.', AREA.x + AREA.w / 2, AREA.y + 244, { size: 15, color: '#e0e0e0', align: 'center' });
      drawText(ctx, 'Cues are clues, not proof. When unsure, ask how they are doing.', AREA.x + AREA.w / 2, AREA.y + 272, { size: 13, color: '#c9a876', align: 'center', maxWidth: AREA.w - 40 });
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
  { title: 'Client texting mid-job', heat: 55, msgs: [
    { text: 'if this isnt done by 5 im leaving 1 star. you know what that does to you right', replies: [
      { text: 'I do, and I want this done right for you. Finished by 5, and I\'ll text at 4:30.', tag: 'ack', heat: -20 },
      { text: 'Threatening my rating won\'t make it go faster.', tag: 'def', heat: 16 },
      { text: 'ok', tag: 'dis', heat: 8 } ] },
    { text: 'the last guy got deactivated after my review. just saying', replies: [
      { text: 'Understood. Here\'s where I\'m at so far, with photos, so you can see it.', tag: 'ack', heat: -18 },
      { text: 'That\'s a lot of power to use on people.', tag: 'def', heat: 15 },
      { text: 'noted', tag: 'dis', heat: 8 } ] },
    { text: 'fine. photos help actually', replies: [
      { text: 'Glad they do. I\'ll send the finished shots at 4:55.', tag: 'ack', heat: -20 },
      { text: 'They always help. You could have asked.', tag: 'def', heat: 10 },
      { text: 'yep', tag: 'dis', heat: 6 } ] },
  ] },
  { title: 'Client texting mid-job', heat: 45, msgs: [
    { text: 'hey can you grab my dry cleaning on the way? ill tip $20 in the app', replies: [
      { text: 'Happy to if it fits. Can you add it as a paid stop in the app so it\'s covered?', tag: 'ack', heat: -18 },
      { text: 'Tips can be changed after. I\'ve been burned before.', tag: 'def', heat: 14 },
      { text: 'maybe', tag: 'dis', heat: 8 } ] },
    { text: 'cant add stops. trust me, the tip is real', replies: [
      { text: 'I believe you. I\'ll keep to what\'s booked today, and I\'d love it next time.', tag: 'ack', heat: -18 },
      { text: 'Everyone says that.', tag: 'def', heat: 15 },
      { text: 'we\'ll see', tag: 'dis', heat: 8 } ] },
    { text: 'ok fair. next time then', replies: [
      { text: 'Next time, booked properly. Thanks for understanding.', tag: 'ack', heat: -20 },
      { text: 'Sure, if you actually book it.', tag: 'def', heat: 10 },
      { text: 'k', tag: 'dis', heat: 6 } ] },
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

const TYPING_SECS = 1.1;   // how long "typing..." shows before their message lands
const DRAFT_CPS = 42;      // your reply types itself at about 42 characters a second
const HARSH_HOLD = 1.6;    // how long a harsh draft hovers over Send before it goes

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
    // They type before each message lands (a "typing..." bubble), and you draft before you send:
    // your reply types itself into the box, and a harsh one waits a beat with your thumb over Send,
    // long enough to delete it and say the kind thing instead. Emily Is Away's typing and Florence's
    // conversation-as-mechanic are the references; the deleted draft is the emotional-regulation beat.
    this.log = [];
    this.pending = this.thread.msgs[0].text;
    this.theyTyping = TYPING_SECS;
    this.draft = null;
    this.rewrites = 0;
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
    if (this.theyTyping > 0) {
      this.theyTyping -= dt;
      if (this.theyTyping <= 0 && this.pending) { this.log.push({ who: 'them', text: this.pending }); this.pending = null; playBuzz(); }
      return;
    }
    if (this.draft) {
      const d = this.draft;
      if (d.chars < d.reply.text.length) d.chars = Math.min(d.reply.text.length, d.chars + dt * DRAFT_CPS);
      else { d.hold -= dt; if (d.hold <= 0) { this.draft = null; this.reply(d.reply); } }
      return;
    }
    if (this.idx >= this.thread.msgs.length) { this.endT += dt; if (this.endT > 1.2) this.finish(); return; }
    if (this.mode === 'client') {
      this.timer += dt;
      if (this.timer >= this.perMsg) this.reply({ text: '(left on read)', tag: 'dis', heat: 14 });
    }
  }
  /** The kind reply to the message on screen: acknowledge (client) or ask about them (friend). */
  bestReply() { return this.thread.msgs[this.idx].replies.find((r) => r.tag === (this.mode === 'client' ? 'ack' : 'emp')); }
  /** Pick a reply: it types into the box. A harsh one then hovers over Send long enough to delete. */
  choose(r) {
    if (this.draft || this.theyTyping > 0 || this.idx >= this.thread.msgs.length) return;
    const harsh = r !== this.bestReply();
    this.draft = { reply: r, chars: 0, hold: harsh ? HARSH_HOLD : 0.35, harsh };
    playTick();
  }
  /** Delete the harsh draft and send the kind reply instead. */
  deleteDraft() {
    if (!this.draft || !this.draft.harsh) return;
    this.rewrites += 1;
    this.draft = { reply: this.bestReply(), chars: 0, hold: 0.35, harsh: false, rewritten: true };
    playWarm();
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
    if (this.idx < this.thread.msgs.length) { this.pending = this.thread.msgs[this.idx].text; this.theyTyping = TYPING_SECS; }
  }
  finish() {
    if (this.mode === 'client') {
      const success = this.heat <= 40;
      const acks = this.tags.filter((t) => t === 'ack').length;
      this.result = { success, score: Math.round(100 - this.heat), lesson: THREAD_LESSON.client, effects: { rep: success ? 0.2 + acks * 0.05 : -0.2, stress: success ? -4 : 6 }, summary: (success ? 'The client cooled off. They\'ll remember that.' : 'The client stayed hot. That review won\'t be kind.') + this.rewriteNote() };
      success ? playSuccess() : playFail();
    } else {
      const emp = this.tags.filter((t) => t === 'emp').length;
      this.result = { success: true, score: Math.round((emp / this.thread.msgs.length) * 100), lesson: THREAD_LESSON.friend, effects: { support: 4 + emp * 4, stress: -3 - emp * 2 }, summary: (emp >= 2 ? `${this.thread.title} sounded better by the end. So did you.` : `${this.thread.title} was glad you called, even if the call was mostly about you.`) + this.rewriteNote() };
      playWarm();
    }
    this.done = true;
  }
  rewriteNote() { return this.rewrites > 0 ? ` You deleted ${this.rewrites === 1 ? 'a reply' : `${this.rewrites} replies`} before sending.` : ''; }
  render(ctx) {
    this.buttons = [];
    // thread: the newest messages that fit between the hint and the meter, sized from the real
    // wrapped line count. Older messages scroll off the top, as in a real chat.
    const w = 360, top = AREA.y + 58, bottom = AREA.y + 212, gap = 8;
    const entries = this.theyTyping > 0 ? [...this.log, { who: 'them', text: '• '.repeat(1 + (Math.floor(this.theyTyping * 4) % 3)).trim(), typing: true }] : this.log;
    const sized = entries.map((m) => ({ m, lines: wrapLines(ctx, m.text, w - 28, { size: 14 }) }))
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
    // replies, the draft being typed, or who is typing
    const who = this.mode === 'client' ? 'The client' : this.thread.title;
    if (this.draft) {
      const d = this.draft;
      ctx.fillStyle = 'rgba(15, 20, 28, 0.92)'; roundRectPath(ctx, AREA.x + 24, AREA.y + 250, AREA.w - 48, 58, 10); ctx.fill();
      ctx.strokeStyle = '#5dade2'; ctx.lineWidth = 1.5; roundRectPath(ctx, AREA.x + 24, AREA.y + 250, AREA.w - 48, 58, 10); ctx.stroke();
      const typed = d.reply.text.slice(0, Math.floor(d.chars)) + (d.chars < d.reply.text.length ? '|' : '');
      drawWrapped(ctx, typed, AREA.x + 40, AREA.y + 274, AREA.w - 80, 18, { size: 14, color: '#ffffff', shadow: false });
      if (d.harsh && d.chars >= d.reply.text.length) {
        drawText(ctx, 'Your thumb hovers over Send.', AREA.x + 24, AREA.y + 336, { size: 14, color: '#e8c98a', shadow: false });
        const b = { x: AREA.x + AREA.w - 244, y: AREA.y + 318, w: 220, h: 44, label: 'Delete it', onTap: () => this.deleteDraft() };
        this.buttons.push(b); drawChoice(ctx, b, { color: '#6b3a2e' });
      } else if (d.rewritten) {
        drawText(ctx, 'You delete it and start again.', AREA.x + 24, AREA.y + 336, { size: 14, color: '#9fe0b5', shadow: false });
      }
    } else if (this.theyTyping > 0) {
      drawText(ctx, `${who} is typing...`, AREA.x + 24, AREA.y + 270, { size: 14, color: '#c9a876', shadow: false });
    } else if (this.idx < this.thread.msgs.length) {
      this.thread.msgs[this.idx].replies.forEach((r, i) => {
        const b = { x: AREA.x + 24, y: AREA.y + 250 + i * 50, w: AREA.w - 48, h: 44, label: r.text, onTap: () => this.choose(r) };
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

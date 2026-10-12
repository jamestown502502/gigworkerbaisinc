// The three "weird" gigs get hands-on challenges (publisher polish 2026-10-12). They were the only
// job templates that were choices alone; each now has a short game whose rule is a real skill,
// scored on that rule ("intrinsic integration", Habgood & Ainsworth 2011, as in microgames.js).
//
//   Water Slide Tester    -> INSPECT!  read each section against the checklist, flag what fails
//   Professional Cuddler  -> BOUNDARIES!    answer each request by the session agreement
//   Mattress Tester       -> COMPARE!       pick the mattress that fits the guest, criterion by criterion
//
// Same contract as every skill challenge (loop.js): update(dt), render(ctx), handleTap(pt),
// targets() for keyboard and gamepad, done, result { success, score, lesson }. Every timer resolves
// on its own, so an idle player always reaches the result card; difficultyFactor (stress, fatigue,
// "Reduce timing pressure") stretches or squeezes the time exactly as in the other challenges.
// BOUNDARIES! is platonic and professional: speech bubbles and an agreement card, no bodies.
import { difficultyFactor, AREA } from './qte.js';
import { drawText, drawWrapped, roundRectPath } from '../ui/text.js';
import { playTick, playSuccess, playFail, playError, haptic } from '../engine/audio.js';

/** One real-world takeaway per game, shown on the result card (microgames.js LESSONS includes these). */
export const WEIRD_LESSONS = {
  safety: 'Inspect against a checklist before you rely on anything. A checklist catches what your eyes skip.',
  boundaries: 'Agree the terms up front, then hold to them. A clear, kind no protects both people.',
  compare: 'Compare every option on the same criteria, against what the buyer needs, not your own taste.',
};
const LESSONS = WEIRD_LESSONS;

// Small copies of microgames.js helpers: that module imports this one, so importing back would be a cycle.
function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function inRect(pt, r) { return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h; }
function timerBar(ctx, frac) {
  ctx.fillStyle = '#3a2d1f';
  ctx.fillRect(AREA.x + 20, AREA.y + 52, AREA.w - 40, 6);
  ctx.fillStyle = frac > 0.3 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(AREA.x + 20, AREA.y + 52, (AREA.w - 40) * Math.max(0, frac), 6);
}

const CARD = '#2b3d4f', EDGE = '#c9a876';
function box(ctx, r, { fill = CARD, edge = EDGE, lw = 2 } = {}) {
  ctx.fillStyle = fill; roundRectPath(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lw; roundRectPath(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();
}

// ---------------------------------------------------------------- INSPECT! (Water Slide Tester)
/** Each section: what the inspector reads when it is fine, and when it fails the checklist. */
export const SLIDE_SECTIONS = [
  { name: 'Ladder', ok: 'Steps: all solid', bad: 'Steps: third one cracked' },
  { name: 'Top platform', ok: 'Railing: bolted tight', bad: 'Railing: one bolt loose' },
  { name: 'Flume', ok: 'Water: flowing all the way', bad: 'Water: dry patch midway' },
  { name: 'Curve', ok: 'Joints: smooth and sealed', bad: 'Joints: a lip sticks up' },
  { name: 'Run-out', ok: 'Exit: clear', bad: 'Exit: pool toy in the way' },
  { name: 'Splash pool', ok: 'Depth 1.2 m (min 1.0 m)', bad: 'Depth 0.7 m (min 1.0 m)' },
  { name: 'Pump', ok: 'Guard cover: on', bad: 'Guard cover: off' },
  { name: 'Lifeguard chair', ok: 'Lifeguard: on duty', bad: 'Lifeguard: chair empty' },
];

export class SafetyCheck {
  /** `plan` (tests): [{ section, hazard }] six of them. */
  constructor(state, plan) {
    this.name = 'INSPECT!';
    this.introKey = 'INSPECT!';
    this.hint = 'Read each section against the checklist. Tap any that fail. Then tap Done.';
    this.d = difficultyFactor(state);
    if (plan) this.sections = plan.map((p) => ({ ...p, flagged: false }));
    else {
      const picks = shuffle(SLIDE_SECTIONS).slice(0, 6);
      const hazards = new Set(shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3));
      this.sections = picks.map((section, i) => ({ section, hazard: hazards.has(i), flagged: false }));
    }
    this.sections.forEach((s, i) => Object.assign(s, { x: AREA.x + 20 + (i % 2) * 290, y: AREA.y + 84 + Math.floor(i / 2) * 80, w: 270, h: 70 }));
    this.doneBtn = { x: AREA.x + AREA.w / 2 - 110, y: AREA.y + AREA.h - 70, w: 220, h: 50, label: 'Done: test ride' };
    this.total = 34 / this.d; this.left = this.total; this.t = 0;
    this.done = false; this.result = null;
  }
  targets() { return [...this.sections, this.doneBtn]; }
  handleTap(pt) {
    if (this.done) return;
    if (inRect(pt, this.doneBtn)) { this.finish(); return; }
    const s = this.sections.find((x) => inRect(pt, x));
    if (!s) return;
    s.flagged = !s.flagged;
    s.flagged ? playTick() : playError();
    haptic(8);
  }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.left -= dt;
    if (this.left <= 0) this.finish();
  }
  finish() {
    if (this.done) return;
    const found = this.sections.filter((s) => s.hazard && s.flagged).length;
    const wrong = this.sections.filter((s) => !s.hazard && s.flagged).length;
    const hazards = this.sections.filter((s) => s.hazard).length;
    this.found = found; this.wrong = wrong;
    const score = Math.max(0, Math.round(((found - wrong * 0.5) / hazards) * 100));
    this.result = {
      success: found >= hazards - 1 && wrong <= 1, score, lesson: LESSONS.safety,
      why: found === hazards && !wrong ? 'Every failed check caught, nothing safe held up.' : `${found} of ${hazards} failed checks caught${wrong ? `, ${wrong} safe section${wrong === 1 ? '' : 's'} flagged` : ''}.`,
    };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.left / this.total);
    // On its own dark strip: over the painted job scene the line measured 2.43:1 (readability audit).
    ctx.fillStyle = 'rgba(20,14,8,0.9)'; roundRectPath(ctx, AREA.x + 16, AREA.y + 59, AREA.w - 32, 16, 6); ctx.fill();
    drawText(ctx, 'CHECKLIST: all solid, tight, flowing, sealed, clear, deep enough, guarded, staffed', AREA.x + AREA.w / 2, AREA.y + 67, { size: 12, color: '#f0e6d0', align: 'center', baseline: 'middle', maxWidth: AREA.w - 40, shadow: false });
    for (const s of this.sections) {
      box(ctx, s, { edge: s.flagged ? '#ff6b5e' : EDGE, lw: s.flagged ? 4 : 2 });
      drawText(ctx, s.section.name.toUpperCase(), s.x + 14, s.y + 24, { size: 13, weight: 'bold', color: '#ffd36b' });
      drawText(ctx, s.hazard ? s.section.bad : s.section.ok, s.x + 14, s.y + 48, { size: 15, color: '#ffffff', maxWidth: s.w - 70 });
      if (s.flagged) drawText(ctx, '⚑ FAIL', s.x + s.w - 12, s.y + 24, { size: 13, weight: 'bold', color: '#ff8a7e', align: 'right' });
    }
    box(ctx, this.doneBtn, { fill: '#2c6e49', edge: '#9fe3b8' });
    drawText(ctx, this.doneBtn.label, this.doneBtn.x + this.doneBtn.w / 2, this.doneBtn.y + this.doneBtn.h / 2, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle' });
  }
}

// ---------------------------------------------------------------- BOUNDARIES! (Professional Cuddler)
export const SESSION_AGREEMENT = ['60 minutes', 'side-by-side hugs, holding hands', 'clothes stay on', 'either of you can pause', 'no photos', 'booking only through the app'];
/** answer: accept (inside the agreement), redirect (fine, but not like this: book it properly), decline (outside it). */
export const REQUESTS = [
  { text: 'Can we pause? I need some water.', answer: 'accept', why: 'Either of you can pause: that is in the agreement.' },
  { text: 'Could we sit back-to-back for a while?', answer: 'accept', why: 'A position change inside the agreed ones is fine.' },
  { text: 'Can I hold your hand while we talk?', answer: 'accept', why: 'Holding hands is in the agreement.' },
  { text: 'Mind if I take a photo for my story?', answer: 'decline', why: 'No photos was agreed. A kind, clear no.' },
  { text: 'Can you take your hoodie off? It is warm.', answer: 'decline', why: 'Clothes stay on. Offer to open a window instead.' },
  { text: 'Could we go thirty more minutes? Cash is fine.', answer: 'redirect', why: 'More time is fine, but it gets booked through the app, not added off the record.' },
  { text: 'Can I text you between sessions?', answer: 'redirect', why: 'Point them to booking through the app: it keeps the work a job.' },
  { text: 'Want to grab dinner after? Off the clock.', answer: 'decline', why: 'Outside the agreement. A friendly no keeps it professional.' },
];
export const ANSWERS = [
  { id: 'accept', label: 'Sure' },
  { id: 'redirect', label: 'Book it properly' },
  { id: 'decline', label: 'Kindly, no' },
];

export class BoundariesGame {
  constructor(state, requests) {
    this.name = 'BOUNDARIES!';
    this.introKey = 'BOUNDARIES!';
    this.hint = 'Answer each request by the session agreement on the left.';
    this.d = difficultyFactor(state);
    // Five requests, at least one of each answer, so the agreement has to be read, not guessed.
    const pool = shuffle(REQUESTS);
    const oneOfEach = ['accept', 'redirect', 'decline'].map((a) => pool.find((r) => r.answer === a));
    this.requests = requests ?? shuffle([...oneOfEach, ...pool.filter((r) => !oneOfEach.includes(r)).slice(0, 2)]);
    this.idx = 0; this.correct = 0; this.per = 7 / this.d; this.left = this.per; this.t = 0;
    this.feedback = null; this.pause = 0;
    this.buttons = ANSWERS.map((a, i) => ({ ...a, x: AREA.x + 250, y: AREA.y + 190 + i * 64, w: 330, h: 54 }));
    this.done = false; this.result = null;
  }
  targets() { return this.buttons; }
  answer(id) {
    const r = this.requests[this.idx];
    const right = r.answer === id;
    if (right) { this.correct += 1; playTick(); haptic(8); } else { playError(); haptic(30); }
    this.feedback = { right, text: right ? r.why : `${id ? 'Not quite. ' : 'Time. '}${r.why}` };
    this.pause = 1.6;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.idx += 1; this.feedback = null; this.left = this.per;
        if (this.idx >= this.requests.length) this.finish();
      }
      return;
    }
    this.left -= dt;
    if (this.left <= 0) this.answer(null);
  }
  handleTap(pt) {
    if (this.done || this.pause > 0) return;
    const b = this.buttons.find((x) => inRect(pt, x));
    if (b) this.answer(b.id);
  }
  finish() {
    const n = this.requests.length;
    this.result = { success: this.correct >= n - 1, score: Math.round((this.correct / n) * 100), lesson: LESSONS.boundaries };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.pause > 0 ? 1 : this.left / this.per);
    const ag = { x: AREA.x + 16, y: AREA.y + 70, w: 214, h: 300 };
    box(ctx, ag, { fill: '#f3ead8', edge: '#8b5a2b' });
    drawText(ctx, 'SESSION AGREEMENT', ag.x + ag.w / 2, ag.y + 24, { size: 13, weight: 'bold', color: '#3a2d1f', align: 'center', shadow: false });
    let y = ag.y + 50;
    for (const line of SESSION_AGREEMENT) y = drawWrapped(ctx, `• ${line}`, ag.x + 14, y, ag.w - 24, 18, { size: 13, color: '#3a2d1f', shadow: false }) + 6;
    const r = this.requests[Math.min(this.idx, this.requests.length - 1)];
    const bubble = { x: AREA.x + 250, y: AREA.y + 70, w: 330, h: 100 };
    box(ctx, bubble, { fill: '#1c3d66', edge: '#a9d8f2' });
    drawText(ctx, 'CLIENT ASKS', bubble.x + 14, bubble.y + 20, { size: 12, weight: 'bold', color: '#a9d8f2' });
    drawWrapped(ctx, `"${r.text}"`, bubble.x + 14, bubble.y + 46, bubble.w - 28, 20, { size: 16, color: '#ffffff' });
    if (this.feedback) {
      drawWrapped(ctx, this.feedback.text, bubble.x + bubble.w / 2, AREA.y + 192, bubble.w - 10, 20, { size: 15, weight: 'bold', color: this.feedback.right ? '#9fe3b8' : '#ffb3a8', align: 'center' });
    } else {
      for (const b of this.buttons) {
        box(ctx, b);
        drawText(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle' });
      }
    }
    drawText(ctx, `Request ${Math.min(this.idx + 1, this.requests.length)} of ${this.requests.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 14, { size: 14, color: '#f0f0f0', align: 'center' });
  }
}

// ---------------------------------------------------------------- COMPARE! (Mattress Tester)
export const CRITERIA = {
  firmness: ['Soft', 'Medium', 'Firm'],
  motion: ['Low', 'High'],    // how much a partner's movement carries across
  edge: ['Weak', 'Strong'],   // support when sitting on the edge
};
/** Each guest needs two things; the third does not matter to them. */
export const GUESTS = [
  { who: 'A side sleeper who shares the bed', needs: { firmness: ['Soft', 'Medium'], motion: ['Low'] } },
  { who: 'Bad back, sits on the edge every morning', needs: { firmness: ['Firm'], edge: ['Strong'] } },
  { who: 'A light sleeper whose partner gets up early', needs: { motion: ['Low'], edge: ['Strong'] } },
  { who: 'A stomach sleeper who reads in bed', needs: { firmness: ['Firm'], motion: ['Low'] } },
];
const fits = (m, needs) => Object.entries(needs).every(([k, ok]) => ok.includes(m[k]));

/** Three mattresses for a guest: exactly one meets both needs, each other one misses one. */
export function mattressesFor(guest, rand = Math.random) {
  const pickFrom = (arr) => arr[Math.floor(rand() * arr.length)];
  const keys = Object.keys(CRITERIA);
  const make = () => Object.fromEntries(keys.map((k) => [k, pickFrom(CRITERIA[k])]));
  const winner = make();
  for (const [k, ok] of Object.entries(guest.needs)) winner[k] = pickFrom(ok);
  const decoys = Object.keys(guest.needs).map((missKey) => {
    const m = { ...make() };
    for (const [k, ok] of Object.entries(guest.needs)) m[k] = k === missKey ? pickFrom(CRITERIA[k].filter((v) => !ok.includes(v))) : pickFrom(ok);
    return m;
  });
  return shuffle([winner, ...decoys], rand).map((m, i) => ({ ...m, label: ['A', 'B', 'C'][i], right: fits(m, guest.needs) }));
}

export class CompareMattresses {
  constructor(state, rounds) {
    this.name = 'COMPARE!';
    this.introKey = 'COMPARE!';
    this.hint = 'Read what the guest needs. Pick the one mattress that has both.';
    this.d = difficultyFactor(state);
    this.rounds = rounds ?? shuffle(GUESTS).slice(0, 3).map((guest) => ({ guest, beds: mattressesFor(guest) }));
    this.idx = 0; this.correct = 0; this.per = 13 / this.d; this.left = this.per; this.t = 0;
    this.feedback = null; this.pause = 0;
    this.done = false; this.result = null;
  }
  cols() {
    return [0, 1, 2].map((i) => ({ i, x: AREA.x + 30 + i * 184, y: AREA.y + 140, w: 172, h: 200 }));
  }
  targets() { return this.cols(); }
  pick(i) {
    const round = this.rounds[this.idx];
    const right = i !== null && round.beds[i].right;
    if (right) { this.correct += 1; playTick(); haptic(8); } else { playError(); haptic(30); }
    const best = round.beds.find((b) => b.right);
    const needs = Object.entries(round.guest.needs).map(([k, v]) => `${k === 'motion' ? 'motion transfer' : k === 'edge' ? 'edge support' : k} ${v.join(' or ').toLowerCase()}`).join(' and ');
    this.feedback = { right, text: right ? `Yes: ${best.label} has ${needs}.` : `${best.label} fits: the guest needs ${needs}.` };
    this.pause = 1.7;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.idx += 1; this.feedback = null; this.left = this.per;
        if (this.idx >= this.rounds.length) this.finish();
      }
      return;
    }
    this.left -= dt;
    if (this.left <= 0) this.pick(null);
  }
  handleTap(pt) {
    if (this.done || this.pause > 0) return;
    const c = this.cols().find((x) => inRect(pt, x));
    if (c) this.pick(c.i);
  }
  finish() {
    const n = this.rounds.length;
    this.result = { success: this.correct >= n - 1, score: Math.round((this.correct / n) * 100), lesson: LESSONS.compare };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    timerBar(ctx, this.pause > 0 ? 1 : this.left / this.per);
    const round = this.rounds[Math.min(this.idx, this.rounds.length - 1)];
    const g = { x: AREA.x + 30, y: AREA.y + 66, w: AREA.w - 60, h: 62 };
    box(ctx, g, { fill: '#1c3d66', edge: '#a9d8f2' });
    drawText(ctx, `GUEST: ${round.guest.who}`, g.x + 14, g.y + 22, { size: 15, weight: 'bold', color: '#ffffff', maxWidth: g.w - 28 });
    const needs = Object.entries(round.guest.needs).map(([k, v]) => `${k === 'motion' ? 'Motion' : k === 'edge' ? 'Edge' : 'Firmness'}: ${v.join('/')}`).join('   ·   ');
    drawText(ctx, `Needs  ${needs}`, g.x + 14, g.y + 46, { size: 14, color: '#ffd36b', maxWidth: g.w - 28 });
    this.cols().forEach((c) => {
      const b = round.beds[c.i];
      const shown = this.feedback && b.right;
      box(ctx, c, { edge: shown ? '#2ecc71' : EDGE, lw: shown ? 4 : 2 });
      drawText(ctx, `MATTRESS ${b.label}`, c.x + c.w / 2, c.y + 30, { size: 15, weight: 'bold', color: '#ffd36b', align: 'center' });
      const rows = [['Firmness', b.firmness], ['Motion', b.motion], ['Edge', b.edge]];
      rows.forEach(([k, v], j) => {
        drawText(ctx, k, c.x + 14, c.y + 74 + j * 38, { size: 13, color: '#c9a876' });
        drawText(ctx, v, c.x + c.w - 14, c.y + 74 + j * 38, { size: 15, weight: 'bold', color: '#ffffff', align: 'right' });
      });
    });
    if (this.feedback) drawText(ctx, this.feedback.text, AREA.x + AREA.w / 2, AREA.y + 362, { size: 14, weight: 'bold', color: this.feedback.right ? '#9fe3b8' : '#ffb3a8', align: 'center', maxWidth: AREA.w - 20 });
    drawText(ctx, `Guest ${Math.min(this.idx + 1, this.rounds.length)} of ${this.rounds.length}`, AREA.x + AREA.w / 2, AREA.y + AREA.h - 14, { size: 14, color: '#f0f0f0', align: 'center' });
  }
}

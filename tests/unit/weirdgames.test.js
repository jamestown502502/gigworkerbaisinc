// The weird gigs' challenges (publisher polish 2026-10-12, game/weirdgames.js).
import { describe, it, expect } from 'vitest';
import { SafetyCheck, BoundariesGame, CompareMattresses, SLIDE_SECTIONS, REQUESTS, GUESTS, mattressesFor, CRITERIA, WEIRD_LESSONS } from '../../src/game/weirdgames.js';
import { seededRandom } from './helpers.js';

const CALM = { stress: 0, energy: 100, health: 100, settings: {} };
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const run = (g, seconds) => { for (let t = 0; t < seconds && !g.done; t += 0.05) g.update(0.05); };

describe('INSPECT! (Water Slide Tester)', () => {
  const plan = SLIDE_SECTIONS.slice(0, 6).map((section, i) => ({ section, hazard: i % 2 === 0 }));
  it('flagging every failed check, and nothing else, is a clean pass', () => {
    const g = new SafetyCheck(CALM, plan);
    g.sections.filter((s) => s.hazard).forEach((s) => g.handleTap(center(s)));
    g.handleTap(center(g.doneBtn));
    expect(g.result).toMatchObject({ success: true, score: 100, lesson: WEIRD_LESSONS.safety });
  });
  it('flagging safe sections costs; tapping again un-flags', () => {
    const g = new SafetyCheck(CALM, plan);
    const safe = g.sections.filter((s) => !s.hazard);
    safe.forEach((s) => g.handleTap(center(s)));
    g.handleTap(center(safe[0])); g.handleTap(center(safe[1]));
    g.sections.filter((s) => s.hazard).forEach((s) => g.handleTap(center(s)));
    g.finish();
    expect(g.wrong).toBe(1);
    expect(g.result.success).toBe(true);
  });
  it('an idle player still reaches the result', () => {
    const g = new SafetyCheck(CALM, plan);
    run(g, 60);
    expect(g.done).toBe(true);
    expect(g.result.success).toBe(false);
  });
  it('every section reads differently when it fails, and the keyboard reaches all of it', () => {
    for (const s of SLIDE_SECTIONS) expect(s.ok).not.toBe(s.bad);
    expect(new SafetyCheck(CALM, plan).targets()).toHaveLength(7);
  });
});

describe('BOUNDARIES! (Professional Cuddler)', () => {
  it('every game asks at least one of each kind of request', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const orig = Math.random; Math.random = seededRandom(seed);
      try {
        const g = new BoundariesGame(CALM);
        expect(g.requests).toHaveLength(5);
        expect(new Set(g.requests.map((r) => r.answer))).toEqual(new Set(['accept', 'redirect', 'decline']));
      } finally { Math.random = orig; }
    }
  });
  it('answering by the agreement passes; each answer explains itself', () => {
    const g = new BoundariesGame(CALM, REQUESTS.slice(0, 5));
    for (let i = 0; i < 5; i++) {
      const want = g.requests[g.idx].answer;
      g.handleTap(center(g.buttons.find((b) => b.id === want)));
      expect(g.feedback.text.length).toBeGreaterThan(15);
      run(g, 2);
    }
    expect(g.result).toMatchObject({ success: true, score: 100, lesson: WEIRD_LESSONS.boundaries });
  });
  it('an idle player times out of each request and still reaches the result', () => {
    const g = new BoundariesGame(CALM, REQUESTS.slice(0, 5));
    run(g, 60);
    expect(g.done).toBe(true);
    expect(g.result.score).toBe(0);
  });
});

describe('COMPARE! (Mattress Tester)', () => {
  it('exactly one mattress fits each guest, and each other one misses exactly one need', () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 300; i++) {
      const guest = GUESTS[i % GUESTS.length];
      const beds = mattressesFor(guest, rand);
      expect(beds.filter((b) => b.right)).toHaveLength(1);
      for (const b of beds.filter((x) => !x.right)) {
        const missed = Object.entries(guest.needs).filter(([k, ok]) => !ok.includes(b[k]));
        expect(missed).toHaveLength(1);
      }
      for (const b of beds) for (const k of Object.keys(CRITERIA)) expect(CRITERIA[k]).toContain(b[k]);
    }
  });
  it('picking the fitting mattress every round passes', () => {
    const g = new CompareMattresses(CALM);
    while (!g.done) {
      if (g.pause > 0) { g.update(0.1); continue; }
      const i = g.rounds[g.idx].beds.findIndex((b) => b.right);
      g.handleTap(center(g.cols()[i]));
    }
    expect(g.result).toMatchObject({ success: true, score: 100, lesson: WEIRD_LESSONS.compare });
  });
  it('an idle player still reaches the result', () => {
    const g = new CompareMattresses(CALM);
    run(g, 90);
    expect(g.done).toBe(true);
  });
});

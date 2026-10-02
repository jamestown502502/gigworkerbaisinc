// Job-shaped microgames: each can be won by playing it well, is lost (not crashed) by doing
// nothing, gets harder under stress, and every gig with a challenge has its own.
import { describe, expect, it } from 'vitest';
import { LiftOnThree, UntangleLeash, PackTheCar, RakeThePile, ProofreadFlyer, SortReturns, FLYERS, MICROGAME_BY_TREE, createQTE, binFor, shakeOffset } from '../../src/game/microgames.js';
import { GIG_TEMPLATES } from '../../src/game/gigs.js';
import { fakeCtx } from './setup.js';

const CALM = { stress: 0, energy: 100, health: 100, settings: {} };
const FRAZZLED = { stress: 95, energy: 10, health: 40, settings: {} };
const DT = 1 / 60;

function runIdle(g, maxSec = 120) {
  for (let t = 0; t < maxSec && !g.done; t += DT) g.update(DT);
  return g;
}

describe('every gig with a challenge plays its own job', () => {
  it('maps all nine challenge gigs to a distinct microgame', () => {
    const withQTE = GIG_TEMPLATES.filter((g) => g.hasQTE);
    expect(withQTE.map((g) => g.title).sort()).toEqual([
      'Assemble IKEA Furniture', 'Clean Out Garage', 'Dog Walking — Energetic Husky', 'Help Move Furniture', 'Logo Design — Small Business', 'Mystery Shopping — Review Store', 'Photography — Product Shots', 'Tutoring — High School Math', 'Yard Work — Leaves & Mowing',
    ].sort());
    for (const g of withQTE) expect(MICROGAME_BY_TREE[g.choiceTree], g.title).toBeTruthy();
    const classes = new Set(withQTE.map((g) => MICROGAME_BY_TREE[g.choiceTree]));
    expect(classes.size).toBe(withQTE.length);
    expect(withQTE.length).toBe(9);
  });

  it('every microgame introduces itself with one word', () => {
    for (const g of GIG_TEMPLATES.filter((x) => x.hasQTE)) {
      const m = createQTE(g, CALM);
      expect(m.name, g.title).toMatch(/^[A-Z]+!$/);
      expect(m.hint.length, g.title).toBeLessThanOrEqual(95);
    }
  });

  it('stress makes the targets drift under your finger; calm hands are steady', () => {
    const calm = shakeOffset(1, 3);
    expect(Math.hypot(calm.x, calm.y)).toBe(0);
    const s = shakeOffset(1.8, 3);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0.5);
  });
});

describe('LIFT!', () => {
  it('knees bent during the count, then lifting on three, succeeds with a high score', () => {
    const g = new LiftOnThree(CALM);
    for (let guard = 0; guard < 5000 && !g.done; guard++) {
      if (!g.tapped && g.rest <= 0 && g.t >= g.liftAt()) g.handleTap();   // the release
      g.update(DT, { down: !g.tapped });                                  // holding through the count
    }
    expect(g.result.success).toBe(true);
    expect(g.result.score).toBeGreaterThan(80);
  });
  it('lifting on three without bending is a back lift: half the score, never a clean lift', () => {
    const g = new LiftOnThree(CALM);
    for (let guard = 0; guard < 5000 && !g.done; guard++) {
      if (!g.tapped && g.rest <= 0 && g.t >= g.liftAt()) g.handleTap();
      g.update(DT, { down: false });
    }
    expect(g.result.success).toBe(false);
    expect(g.result.score).toBeLessThanOrEqual(50);
    expect(g.clean.every((c) => !c)).toBe(true);
  });
  it('tapping on "one" is too early; doing nothing drops everything', () => {
    const early = new LiftOnThree(CALM);
    runIdle(early, 0.5); early.handleTap();
    expect(early.scores[0]).toBe(0);
    const idle = runIdle(new LiftOnThree(CALM));
    expect(idle.done).toBe(true);
    expect(idle.result.success).toBe(false);
  });
  it('the lift window is tighter under stress', () => {
    expect(new LiftOnThree(FRAZZLED).window).toBeLessThan(new LiftOnThree(CALM).window);
  });
});

describe('UNTANGLE!', () => {
  it('freeing the top dog each time untangles them all', () => {
    const g = new UntangleLeash(CALM);
    while (!g.done) { const top = g.dogs[g.top()]; g.handleTap(g.dogPos(top)); }
    expect(g.result.success).toBe(true);
  });
  it('a dog from under the pile costs time; doing nothing runs out the clock', () => {
    const g = new UntangleLeash(CALM);
    const under = g.dogs[g.stack[0]];
    const before = g.timeLeft;
    g.handleTap(g.dogPos(under));
    expect(g.flashText).toMatch(/Top of the pile first/);
    expect(g.timeLeft).toBeLessThan(before);
    expect(under.free).toBe(false);
    expect(runIdle(new UntangleLeash(CALM)).result.success).toBe(false);
  });
});

describe('PACK!', () => {
  /** Backtracking search for a full packing of the queue in order (turning allowed). */
  function solve(g) {
    const grid = g.grid.map((r) => [...r]);
    const q = g.queue.map((p) => ({ ...p }));
    const moves = [];
    const fits = (w, h, c, r) => c + w <= 4 && r + h <= 3 && [...Array(h)].every((_, dy) => [...Array(w)].every((__, dx) => !grid[r + dy][c + dx]));
    const set = (w, h, c, r, v) => { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) grid[r + dy][c + dx] = v; };
    const go = (i) => {
      if (i === q.length) return true;
      for (const [w, h, rot] of [[q[i].w, q[i].h, false], [q[i].h, q[i].w, true]]) {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          if (!fits(w, h, c, r)) continue;
          set(w, h, c, r, 'x'); moves.push({ rot, c, r });
          if (go(i + 1)) return true;
          set(w, h, c, r, null); moves.pop();
        }
      }
      return false;
    };
    return go(0) ? moves : null;
  }
  it('every order the boxes can come in can be packed completely', () => {
    for (let n = 0; n < 40; n++) expect(solve(new PackTheCar(CALM))).not.toBeNull();
  });
  it('packing it right succeeds', () => {
    const g = new PackTheCar(CALM);
    for (const m of solve(g)) { if (m.rot) g.rotate(); expect(g.place(m.c, m.r)).toBe(true); }
    expect(g.result.success).toBe(true);
    expect(g.packed).toBe(6);
  });
  it('a box that does not fit is refused; running out of time fails', () => {
    const g = new PackTheCar(CALM);
    g.place(3, 2);                    // the corner: fine for a 1x1, refused for anything bigger
    const big = new PackTheCar(CALM);
    while (big.current().w * big.current().h === 1) big.queue.push(big.queue.shift());
    expect(big.place(3, 2)).toBe(false);
    expect(runIdle(new PackTheCar(CALM)).result.success).toBe(false);
  });
});

describe('RAKE!', () => {
  it('sweeping every leaf to the pile succeeds', () => {
    const g = new RakeThePile(CALM);
    g.placePile(g.wind);
    for (const l of g.leaves) {
      if (g.done) break;
      if (l.inPile) continue;
      const start = { x: l.x, y: l.y };
      g.update(DT, { ...start, down: true });
      for (let k = 1; k <= 8 && !l.inPile; k++) {
        g.update(DT, { x: start.x + (g.pile.x - start.x) * (k / 8), y: start.y + (g.pile.y - start.y) * (k / 8), down: true });
      }
      g.update(DT, { x: 0, y: 0, down: false });
    }
    runIdle(g);
    expect(g.result.success).toBe(true);
  });
  it('taps alone can do it too (no dragging needed)', () => {
    const g = new RakeThePile(CALM);
    g.handleTap(g.spots.find((sp) => sp.side === g.wind));   // the first tap places the pile
    expect(g.downwind).toBe(true);
    for (let k = 0; k < 400 && !g.done; k++) {
      const loose = g.leaves.find((l) => !l.inPile);
      if (!loose) break;
      g.handleTap({ x: loose.x, y: loose.y });
      g.update(DT, { down: false });
    }
    runIdle(g);
    expect(g.inPileCount()).toBeGreaterThanOrEqual(Math.ceil(g.leaves.length * 0.7));
  });
  it('doing nothing fails when the clock runs out', () => {
    expect(runIdle(new RakeThePile(CALM)).result.success).toBe(false);
  });
  it('the wind decides: a pile downwind collects what the gusts carry, one upwind does not', () => {
    const collected = (side) => {
      const g = new RakeThePile(CALM);
      g.wind = 1;
      g.placePile(side);
      // every loose leaf sits just upwind of the right-hand spot, so a gust can reach it
      for (const l of g.leaves) { l.x = g.spots[1].x - 70; l.y = g.spots[1].y; }
      for (let t = 0; t < 12 && !g.done; t += DT) g.update(DT, { down: false });
      return g.inPileCount();
    };
    expect(collected(1)).toBeGreaterThan(0);
    expect(collected(-1)).toBe(0);
  });
  it('no choice in four seconds: the pile goes on the left, so the game always goes on', () => {
    const g = new RakeThePile(CALM);
    for (let t = 0; t < 4.2; t += DT) g.update(DT, { down: false });
    expect(g.pile).toBeTruthy();
    expect(g.pile.x).toBe(g.spots[0].x);
  });
});

describe('PROOFREAD!', () => {
  it('every flyer really has three typos, each a misspelling of a word in the text', () => {
    for (const f of FLYERS) {
      const words = f.text.split(' ');
      expect(f.typos).toHaveLength(3);
      for (const [right, wrong] of f.typos) {
        expect(words, right).toContain(right);
        expect(wrong).not.toBe(right);
        expect(wrong[0].toLowerCase()).toBe(right[0].toLowerCase());
      }
    }
  });
  it('catching all three succeeds; a correct word costs time', () => {
    for (const f of FLYERS) {
      const g = new ProofreadFlyer(CALM, f);
      g.render(fakeCtx());
      const fine = g.words.find((w) => !w.typo);
      const before = g.timeLeft;
      g.handleTap({ x: fine.box.x + 2, y: fine.box.y + 2 });
      expect(g.timeLeft).toBeLessThan(before);
      for (const w of g.words.filter((x) => x.typo)) g.handleTap({ x: w.box.x + 2, y: w.box.y + 2 });
      expect(g.result.success, f.text).toBe(true);
    }
  });
});

describe('SORT!', () => {
  it('the rule: receipt + tags refund, receipt only exchange, no receipt store credit', () => {
    expect(binFor({ receipt: true, tags: true })).toBe('refund');
    expect(binFor({ receipt: true, tags: false })).toBe('exchange');
    expect(binFor({ receipt: false, tags: true })).toBe('credit');
    expect(binFor({ receipt: false, tags: false })).toBe('credit');
  });
  it('sorting every return right succeeds; doing nothing fails', () => {
    const g = new SortReturns(CALM);
    while (!g.done) {
      if (g.pause <= 0) { const b = g.bins.find((x) => x.id === binFor(g.items[g.idx])); g.handleTap({ x: b.x + 10, y: b.y + 10 }); }
      g.update(DT);
    }
    expect(g.result.success).toBe(true);
    expect(g.correct).toBe(6);
    expect(runIdle(new SortReturns(CALM)).result.success).toBe(false);
  });
});

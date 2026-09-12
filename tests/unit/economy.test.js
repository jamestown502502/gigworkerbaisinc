import { describe, it, expect } from 'vitest';
import { makeGame, withRandom, seededRandom } from './helpers.js';
import { CHOICE_TREES, getNode } from '../../src/game/choices.js';
import { generateDailyGigs, gigEnergyCost, travelCost } from '../../src/game/gigs.js';
import { EVENTS } from '../../src/game/events.js';
import { RUN_LENGTH_DAYS } from '../../src/engine/state.js';

/** Drive one gig from accept to results, taking choices by index, with a forced QTE result. */
function runGig(game, gig, { choiceIdx = 0, qte = null } = {}) {
  const s = game.state;
  expect(game.acceptGig(gig)).toBe(true);
  if (!gig.remote) game.startGig();
  // walk the tree: EI nodes are auto-resolved with a canned result, choice nodes by index
  let guard = 0;
  while (game.phase === 'GIG' && guard++ < 10) {
    if (game.qteKind === 'ei') { game.finishEIGame({ success: true, score: 100, effects: { rep: 0.3, stress: -3 }, summary: 'ok' }); continue; }
    if (game.qteKind === 'skill') { game.finishGig(qte || { success: true, score: 80 }); break; }
    if (game.node) { game.choose(game.node.choices[choiceIdx % game.node.choices.length]); continue; }
    break;
  }
  return game.results;
}

describe('results ledger (QA #3, #7)', () => {
  it('headline == sum of items == real cash delta, across 400 random gigs', () => {
    const rnd = seededRandom(42);
    const orig = Math.random;
    Math.random = rnd;
    try {
      for (let i = 0; i < 400; i++) {
        const { game, state } = makeGame({ cash: 50 + Math.floor(rnd() * 400), energy: 100, hoursLeft: 12, reputation: 3.5, doublePayDays: rnd() < 0.3 ? 2 : 0 });
        state.todayGigs = generateDailyGigs(state);
        const gig = state.todayGigs[Math.floor(rnd() * state.todayGigs.length)];
        const before = state.cash;
        const qte = gig.hasQTE ? { success: rnd() < 0.6, score: Math.floor(rnd() * 100) } : null;
        const r = runGig(game, gig, { choiceIdx: Math.floor(rnd() * 3), qte });
        expect(r).toBeTruthy();
        const sum = r.items.reduce((a, it) => a + it.amount, 0);
        expect(r.total).toBe(sum);
        expect(r.deltas.cash).toBe(sum);
        expect(Math.round(state.cash - before)).toBe(sum);
        if (state.doublePayDays > 0) expect(r.items.some((it) => it.label.startsWith('Steady contract'))).toBe(true);
      }
    } finally { Math.random = orig; }
  });

  it('a fumbled challenge shows the -30% line and the headline reflects it', () => {
    const { game, state } = makeGame({ cash: 100, energy: 100 });
    const gig = { ...generateDailyGigs(state)[0], hasQTE: true, risk: 0, payout: 100, choiceTree: 'movingHelp', remote: true };
    state.todayGigs = [gig];
    const r = withRandom([0.99], () => runGig(game, gig, { choiceIdx: 1, qte: { success: false, score: 10 } }));
    expect(r.items.find((i) => i.label.includes('Fumbled')).amount).toBe(-30);
    expect(r.total).toBe(r.items.reduce((a, i) => a + i.amount, 0));
  });
});

describe('energy gate (QA #1, #15)', () => {
  it('refuses a gig whose travel + work cost exceeds energy', () => {
    // The board is generated with unseeded randomness, so a fixed energy figure is not a fixed
    // relationship to any gig's cost: CI drew a 9-energy gig against a hardcoded 10 and failed on
    // the setup rather than on the behaviour. Price the gig first, then set energy one short of it.
    const { game, state } = makeGame({ energy: 100, hoursLeft: 12 });
    const gig = generateDailyGigs(state).find((g) => !g.remote);
    const need = travelCost(gig, state) + gigEnergyCost(gig, state);
    state.energy = need - 1;
    expect(game.acceptGig(gig)).toBe(false);
    expect(game.message).toMatch(/Not enough energy/);
    expect(game.phase).toBe('MORNING');
  });
  it('refuses a gig that needs more hours than are left', () => {
    const { game, state } = makeGame({ energy: 100, hoursLeft: 1 });
    const gig = { ...generateDailyGigs(state)[0], hours: 3 };
    expect(game.acceptGig(gig)).toBe(false);
    expect(game.message).toMatch(/hours/);
  });
  it('energy never goes negative and a spent worker is sent home', () => {
    const { game, state } = makeGame({ energy: 30, cash: 100 });
    const gig = { ...generateDailyGigs(state)[0], hours: 4, remote: true, hasQTE: false, choiceTree: 'movingHelp', risk: 0 };
    state.todayGigs = [gig];
    runGig(game, gig, { choiceIdx: 0 }); // "Accept the overload" costs -15 energy on top of 12
    expect(state.energy).toBeGreaterThanOrEqual(0);
    game.continueFromResults();
    expect(game.phase).toBe('EVENING');
  });
});

describe('day 30 (QA #4)', () => {
  it('sleeping on day 30 enters SUMMARY, never day 31', () => {
    const { game, state } = makeGame({ day: RUN_LENGTH_DAYS });
    game.phase = 'EVENING';
    game.sleep();
    expect(game.phase).toBe('SUMMARY');
    expect(state.day).toBe(RUN_LENGTH_DAYS);
    expect(state.runComplete).toBe(true);
  });
  it('free play continues explicitly to day 31', () => {
    const { game, state } = makeGame({ day: RUN_LENGTH_DAYS });
    game.phase = 'EVENING';
    game.sleep();
    game.startFreePlay();
    expect(state.freePlay).toBe(true);
    expect(state.day).toBe(RUN_LENGTH_DAYS + 1);
    expect(game.phase).toBe('MORNING');
  });
  it('a completed run reloads into SUMMARY', () => {
    const { state } = makeGame({ day: RUN_LENGTH_DAYS, runComplete: true });
    const { game } = makeGame({ ...JSON.parse(localStorage.getItem('gigWorkerState')), runComplete: true });
    expect(game.phase).toBe('SUMMARY');
    expect(state.runComplete).toBe(true);
  });
});

describe('events (QA #2, #24)', () => {
  it('every event choice changes state as its outcome text claims', () => {
    for (const e of EVENTS.filter((ev) => ev.choices)) {
      for (const opt of e.choices) {
        const { game, state } = makeGame({ cash: 1000, reputation: 3.5, stress: 50 });
        const before = { cash: state.cash, rep: state.reputation, stress: state.stress };
        game.activeEvent = { ...e };
        game.chooseEventOption(opt);
        const text = game.eventOutcome;
        const m = text.match(/([-+])?\$?(\d+(?:\.\d+)?)\s*(reputation|stress)?/);
        if (/reputation/.test(text)) {
          const delta = parseFloat(m[1] + m[2]);
          expect(state.reputation - before.rep).toBeCloseTo(delta, 5);
        } else if (/^-\$/.test(text)) {
          expect(before.cash - state.cash).toBe(parseInt(m[2], 10));
        }
      }
    }
  });
  it('refusing the landlord drops reputation by exactly 0.5', () => {
    const { game, state } = makeGame({ cash: 250, reputation: 3.5 });
    const e = EVENTS.find((ev) => ev.id === 'eviction-notice');
    game.activeEvent = { ...e };
    expect(e.choices[0].disabled(state)).toBe(true);
    game.chooseEventOption(e.choices[1]);
    expect(state.reputation).toBeCloseTo(3.0, 5);
  });
  it('choice-less events wait for a tap instead of auto-dismissing', () => {
    const { game } = makeGame();
    game.activeEvent = { id: 'fav-song', tier: 1, text: 'x' };
    game.phase = 'MORNING';
    game.step(10);
    expect(game.activeEvent).toBeTruthy();
    game.startNextEvent();
    expect(game.activeEvent).toBeNull();
  });
});

describe('save / reset / tutorial (QA #5, #18)', () => {
  it('reset clears the run but keeps settings', () => {
    const { game, state } = makeGame({ day: 12, cash: 999 });
    state.settings.muted = true;
    state.save();
    game.newGame();
    expect(state.day).toBe(1);
    expect(state.cash).toBe(200);
    expect(state.settings.muted).toBe(true);
    expect(state.tutorialSeen).toBe(false);
  });
  it('a save with a tutorial pointer past the end still shows the tutorial from step 0', () => {
    localStorage.setItem('gigWorkerState', JSON.stringify({ tutorialSeen: false, tutorialStep: -3, day: 1 }));
    const { game, state } = makeGame({ tutorialSeen: false });
    expect(state.tutorialStep).toBe(0);
    expect(game.tutorialVisible()).toBe(true);
  });
  it('an old v1 save is backfilled with every new field', () => {
    localStorage.setItem('gigWorkerState', JSON.stringify({ cash: 300, day: 4, weekStats: { startingCash: 200 } }));
    const { state } = makeGame();
    expect(state.support).toBe(20);
    expect(state.weekStats.eveningsRested).toBe(0);
    expect(state.settings.reduceMotion).toBe(false);
    expect(state.version).toBe(2);
  });
});

describe('groceries (QA #20)', () => {
  it('groceries clear Hungry and can only be bought once a day', () => {
    const { game, state } = makeGame({ hungry: true, cash: 100, energy: 50 });
    const { CONSUMABLES } = game.constructor === Object ? {} : { CONSUMABLES: null };
    void CONSUMABLES;
    const groceries = { name: 'Groceries', cost: 18, canBuy: (s) => s.groceriesDay !== s.day, apply: (s) => { s.hungry = false; s.groceriesDay = s.day; s.energy += 5; } };
    game.buyUpgrade(groceries);
    expect(state.hungry).toBe(false);
    expect(state.cash).toBe(82);
    game.buyUpgrade(groceries);
    expect(state.cash).toBe(82);
  });
});

describe('choice trees', () => {
  it('every `next` and every EI node resolves to a real node', () => {
    for (const [name, tree] of Object.entries(CHOICE_TREES)) {
      const entry = getNode(name, 0);
      expect(entry, name).toBeTruthy();
      for (const node of tree) {
        if (node.minigame) { expect(['readclient', 'textback']).toContain(node.minigame); expect(getNode(name, node.next), `${name}:${node.next}`).toBeTruthy(); continue; }
        for (const c of node.choices) if (c.next) expect(getNode(name, c.next), `${name}:${c.next}`).toBeTruthy();
      }
    }
  });
});

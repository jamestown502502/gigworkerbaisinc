// QA round 3 (2026-10-06): one test per tester row that changed game logic.
import { describe, it, expect } from 'vitest';
import { makeGame, seededRandom } from './helpers.js';
import { GameState, saveLock } from '../../src/engine/state.js';
import { Game, RENT } from '../../src/game/loop.js';
import { TUTORIAL_STEPS } from '../../src/ui/tutorial.js';
import { UI, rentStatusLine } from '../../src/ui/screens.js';
import { InputManager } from '../../src/engine/input.js';
import { EVENTS, rollDailyEvents } from '../../src/game/events.js';
import { PERCENT_PROBLEMS, drawPercentProblems, PercentTutor } from '../../src/game/microgames.js';

const stepIndex = (phase) => TUTORIAL_STEPS.findIndex((s) => s.phase === phase);

describe('#2 paying a bill you cannot afford says why', () => {
  it('no payment, and a hint with the shortfall', () => {
    const { game, state } = makeGame({ cash: 30, daysUntilBills: 0 });
    game.goEvening();
    game.payBill('rent');
    expect(state.cash).toBe(30);
    expect(game.billsPaid.rent).toBe(false);
    expect(game.billsHint.kind).toBe('rent');
    expect(game.billsHint.text).toContain(`$${RENT - 30} short`);
    game.payBill('food');
    expect(game.billsHint.text).toContain('Shop');
  });
});

describe('#4 the tutorial lets real buttons through', () => {
  it('Back on the evening screen goes back, and the morning shows no tutorial', () => {
    const { game, state } = makeGame({ tutorialSeen: false, tutorialStep: stepIndex('EVENING') });
    game.phase = 'EVENING';
    game.ping = null;
    expect(game.tutorialVisible()).toBe(true);
    game.render(game.ctx);
    InputManager.clicks.push({ x: 300, y: 550, type: 'click' }); // the "← Back" button
    game.render(game.ctx);
    expect(game.phase).toBe('MORNING');
    expect(game.tutorialVisible()).toBe(false);
    expect(state.tutorialStep).toBe(stepIndex('EVENING') + 1); // the rest waits for the next evening
  });

  it('pressing the highlighted button jumps to that screen’s steps', () => {
    const { game, state } = makeGame({ tutorialSeen: false, tutorialStep: 0 });
    game.render(game.ctx);
    InputManager.clicks.push({ x: 160, y: 550, type: 'click' }); // Check Listings
    game.render(game.ctx);
    expect(game.phase).toBe('BROWSE');
    expect(state.tutorialStep).toBe(stepIndex('BROWSE'));
    expect(game.tutorialVisible()).toBe(true);
  });

  it('a tap on empty space (or the bubble) still only turns the page', () => {
    const { game, state } = makeGame({ tutorialSeen: false, tutorialStep: 0 });
    game.render(game.ctx);
    InputManager.clicks.push({ x: 400, y: 300, type: 'click' });
    game.render(game.ctx);
    expect(game.phase).toBe('MORNING');
    expect(state.tutorialStep).toBe(1);
  });
});

describe('#5 PERCENT! does not repeat questions', () => {
  it('a visit never repeats, and the whole bank comes round before any repeat', () => {
    const state = { eiDecks: {} };
    const seen = [];
    for (let v = 0; v < 5; v++) {
      const picks = drawPercentProblems(state, 3);
      expect(new Set(picks).size).toBe(3);
      seen.push(...picks);
    }
    expect(new Set(seen).size).toBe(15); // 5 visits x 3 from a bank of 16: no repeats
    for (let v = 0; v < 200; v++) expect(new Set(drawPercentProblems(state, 3)).size).toBe(3);
  });

  it('the tutor game uses the saved deck', () => {
    const state = new GameState();
    new PercentTutor(state);
    expect(state.eiDecks.percent.length).toBe(PERCENT_PROBLEMS.length - 3);
  });
});

describe('#6 the late ping can wait', () => {
  it('Decide later hides it; sleeping on it lets it go with a note', () => {
    const { game, state } = makeGame({ day: 5 });
    game.phase = 'EVENING';
    game.ping = { gig: { title: 'Early call: Moving Help', payout: 80 }, resolved: false, text: '' };
    game.resolvePing('later');
    expect(game.ping.snoozed).toBe(true);
    expect(game.ping.resolved).toBe(false);
    const cash = state.cash;
    game.sleep();
    expect(state.lateGigTomorrow).toBeNull();
    expect(state.cash).toBe(cash);
    expect(game.message).toContain('never answered');
  });
});

describe('#8 rent can be paid early', () => {
  it('pays once, and the bills screen shows it paid', () => {
    const { game, state } = makeGame({ cash: 800, daysUntilBills: 3 });
    expect(game.canPayRentEarly()).toBe(true);
    game.payRentEarly();
    expect(state.cash).toBe(800 - RENT);
    expect(state.rentPrepaid).toBe(true);
    expect(game.canPayRentEarly()).toBe(false);
    game.payRentEarly();
    expect(state.cash).toBe(800 - RENT);
    state.daysUntilBills = 0;
    game.goEvening();
    expect(game.billsPaid.rent).toBe(true);
    expect(game.billsPaidEarly).toBe(true);
    expect(state.rentPrepaid).toBe(false);
    game.closeBills();
    expect(state.unpaidRent).toBe(0);
  });

  it('not offered while rent is overdue or the cash is short', () => {
    expect(makeGame({ cash: 100, daysUntilBills: 3 }).game.canPayRentEarly()).toBe(false);
    expect(makeGame({ cash: 2000, unpaidRent: RENT, daysUntilBills: 3 }).game.canPayRentEarly()).toBe(false);
  });
});

describe('#10 / #11 Welcome back says what is due and which run this is', () => {
  it('the rent line carries the amount', () => {
    const { game } = makeGame({ daysUntilBills: 2 });
    expect(rentStatusLine(game).text).toBe(`Rent $${RENT} due in 2 days`);
    const overdue = makeGame({ unpaidRent: 600, rentOverdueDays: 3 }).game;
    expect(rentStatusLine(overdue).text).toContain('Overdue rent $600');
  });

  it('starting over counts the run and remembers how the last one ended', () => {
    const { game, state } = makeGame({ day: 30, cash: 1234, runComplete: true, gigsCompleted: 60 });
    game.newGame();
    expect(state.runNumber).toBe(2);
    expect(state.lastRun).toEqual({ day: 30, cash: 1234, complete: true, evicted: false });
    const reloaded = new GameState();
    expect(reloaded.runNumber).toBe(2);
    expect(reloaded.savedAt).toBeGreaterThan(0);
    expect(reloaded.savedAt).toBe(reloaded.lastPlayed);
  });
});

describe('#3 / #11 a second tab cannot save over the first', () => {
  it('a stale tab stops saving and freezes', () => {
    const { game, state } = makeGame({ cash: 500 });
    state.save();
    const before = localStorage.getItem('gigWorkerState');
    saveLock.stale = true;
    game.staleTab = true;
    try {
      state.cash = 1;
      state.save();
      expect(localStorage.getItem('gigWorkerState')).toBe(before);
      game.ticker = { lines: ['a'], idx: 0, t: 0 };
      for (let i = 0; i < 400; i++) game.update(1 / 60);
      expect(game.ticker.idx).toBe(0);
    } finally {
      saveLock.stale = false;
    }
  });
});

describe('#12 morning events say each thing once, and fit the weather', () => {
  it('no event text repeats a number from its own outcome line', () => {
    for (const e of EVENTS.filter((x) => x.effect)) {
      const s = new GameState();
      s.cash = 500; s.todayGigs = [];
      const out = e.effect(s);
      for (const n of out.match(/\d+%?/g) || []) expect(e.text, `${e.id}: "${out}"`).not.toMatch(new RegExp(`(^|[^\\d])${n}`));
    }
  });

  it('no heatwave on a cold or rainy day, no rainstorm on a rainy one', () => {
    const rand = seededRandom(9);
    const orig = Math.random;
    Math.random = rand;
    try {
      for (const id of ['cold', 'rainy']) {
        for (let i = 0; i < 300; i++) {
          const ev = rollDailyEvents({ day: 10, weather: { id } });
          expect(ev.map((e) => e.id)).not.toContain('heatwave');
          if (id === 'rainy') expect(ev.map((e) => e.id)).not.toContain('rainstorm');
        }
      }
    } finally { Math.random = orig; }
  });
});

describe('#1 Accept with nothing picked explains itself', () => {
  it('a tap on the disabled Accept button asks for a pick', () => {
    const { game } = makeGame({ energy: 100 });
    game.goBrowse();
    game.render(game.ctx);
    InputManager.clicks.push({ x: 310, y: 550, type: 'click' });
    game.render(game.ctx);
    expect(game.phase).toBe('BROWSE');
    expect(game.message).toContain('Pick a gig first');
    expect(UI.hotspots.length).toBeGreaterThan(0);
  });
});

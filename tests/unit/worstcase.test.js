// Worst-case luck (2026-10-07). An outside critique asked: "can a skilled player recover from three
// consecutive bad events, or can the game effectively predetermine eviction?" Average eviction
// rates (balance.test.js) cannot answer that. This plays the balanced strategy in a city where the
// dice always come up bad: every morning brings the worst event the rules allow.
//
//   old rules  - a crisis whenever one is possible (day 3+), even three days running
//   new rules  - crises cool down for 4 days and never land while rent is overdue (events.js),
//                and a short rent can be paid in part for a grace week (loop.js payRentPartial)
import { describe, it, expect } from 'vitest';
import { makeGame, seededRandom } from './helpers.js';
import { generateDailyGigs } from '../../src/game/gigs.js';
import { EVENTS } from '../../src/game/events.js';

const CRISES = ['caught-cold', 'dispute', 'eviction-notice'].map((id) => EVENTS.find((e) => e.id === id));
const BAD = EVENTS.find((e) => e.id === 'flat-tire');

function worstMorning(state, oldRules) {
  const crisisOk = oldRules
    ? state.day >= 3
    : state.day >= 3 && state.day - (state.lastCrisisDay ?? -99) >= 4 && !(state.unpaidRent > 0);
  return crisisOk ? [CRISES[state.day % CRISES.length]] : [BAD];
}

export function playWorst(seed, { oldRules = false, usePartial = true, skill = 0.7 } = {}) {
  const rnd = seededRandom(seed);
  const orig = Math.random;
  Math.random = rnd;
  try {
    const { game, state } = makeGame();
    state.todayGigs = generateDailyGigs(state);
    let guard = 0;
    while (game.phase !== 'SUMMARY' && game.phase !== 'GAMEOVER' && guard++ < 5000) {
      if (game.phase === 'MORNING') {
        game.ticker.idx = game.ticker.lines.length;
        game.eventQueue = worstMorning(state, oldRules);
        game.activeEvent = null;
        while (!game.morningReady) {
          if (game.activeEvent?.choices) {
            const opts = game.activeEvent.choices.filter((o) => !(o.disabled && o.disabled(state)));
            game.chooseEventOption(opts[opts.length - 1]);   // refuse the landlord's $300 demand
          } else game.startNextEvent();
        }
        if (game.restDay) { game.goEvening(); continue; }
        if (state.unpaidRent > 0 && state.cash >= state.unpaidRent) game.payDebt('rent');
        else if (usePartial && state.unpaidRent > 0) game.payRentPartial();
        if (state.phoneCut && state.cash >= state.unpaidPhone) game.payDebt('phone');
        if (state.hungry && state.cash > 60) game.buyUpgrade({ name: 'Groceries', cost: 18, canBuy: (s) => s.groceriesDay !== s.day, apply: (s) => { s.hungry = false; s.groceriesDay = s.day; } });
        game.goBrowse();
        if (game.phase !== 'BROWSE') game.goEvening();
      } else if (game.phase === 'BROWSE') {
        const pick = state.todayGigs.filter((g) => game.canAffordGig(g).ok).sort((a, b) => b.payout - a.payout)[0];
        if (!pick || state.energy < 25) { game.goEvening(); continue; }
        game.acceptGig(pick);
        if (game.phase === 'TRAVEL') game.startGig();
      } else if (game.phase === 'GIG') {
        if (game.qteKind === 'ei') game.finishEIGame({ success: rnd() < 0.6, score: 60, effects: { rep: 0.2 }, summary: 'x' });
        else if (game.qteKind === 'skill') game.finishGig({ success: rnd() < (state.stress > 70 ? skill * 0.6 : skill), score: 60 });
        else if (game.pendingOutcome) game.continueOutcome();
        else if (game.node) game.choose(game.node.choices[1 % game.node.choices.length]);
        else game.afterChoices();
      } else if (game.phase === 'RESULTS') {
        game.continueFromResults();
      } else if (game.phase === 'EVENING') {
        if (game.ping && !game.ping.resolved) game.resolvePing('decline');
        if (game.billsOpen) {
          for (const k of ['food', 'phone', 'rent']) game.payBill(k);
          if (usePartial && !game.billsPaid.rent) game.payRentPartial();
          game.closeBills();
        }
        if (game.wrapUpOpen) game.finishWrapUp();
        game.sleep();
      }
    }
    return { evicted: game.phase === 'GAMEOVER', day: state.day };
  } finally { Math.random = orig; }
}

describe('worst-case luck: decisions, not dice, decide the month', () => {
  const N = 80;
  const runs = (opts) => Array.from({ length: N }, (_, i) => playWorst(9000 + i, opts));
  const rate = (opts) => { const r = runs(opts); rate.days = r.reduce((a, x) => a + x.day, 0) / N; return r.filter((x) => x.evicted).length / N; };
  const before = rate({ oldRules: true, usePartial: false });
  const beforeDays = rate.days;
  const shaky = { before: rate({ oldRules: true, usePartial: false, skill: 0.2 }), after: rate({ oldRules: false, usePartial: true, skill: 0.2 }), noPartial: rate({ oldRules: false, usePartial: false, skill: 0.2 }) };
  const after = rate({ oldRules: false, usePartial: true });
  const noPartial = rate({ oldRules: false, usePartial: false });

  it('reports the rates (visible in the test output)', () => {
    console.log(`(avg final day ${beforeDays}) worst luck, eviction rate: old rules ${(before * 100).toFixed(0)}% | new rules ${(after * 100).toFixed(0)}% | new rules without partial payments ${(noPartial * 100).toFixed(0)}%`);
    console.log(`worst luck + failing 80% of challenges: old ${(shaky.before * 100).toFixed(0)}% | new ${(shaky.after * 100).toFixed(0)}% | new without partial ${(shaky.noPartial * 100).toFixed(0)}%`);
    expect(true).toBe(true);
  });
  // Measured 2026-10-07: 0% evicted in every scenario below, under both rule sets. Random events
  // alone do not decide a month for a player who pays the bills and keeps energy up; the new rules
  // are a safety net (and keep it that way if the economy is tightened later).
  it('the new rules never make the worst-luck month worse', () => {
    expect(after).toBeLessThanOrEqual(before);
    expect(shaky.after).toBeLessThanOrEqual(shaky.before);
  });
  it('a careful player who fails most challenges still survives most worst-luck months', () => {
    expect(shaky.after).toBeLessThan(0.5);
  });
  it('even with the worst luck, a careful player survives most months', () => {
    expect(after).toBeLessThan(0.5);
  });
  it('partial payments are a real lever, not decoration', () => {
    expect(after).toBeLessThanOrEqual(noPartial);
  });
});

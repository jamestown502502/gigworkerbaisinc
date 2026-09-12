// Monte Carlo balance bands: three scripted strategies over full 30-day runs. The assertions
// are bands, not point values — the game is random by design; what must hold is that the
// balanced strategy is survivable, greed burns out more than caution, and the evening loop
// changes outcomes by a measurable but not dominating margin.
import { describe, it, expect } from 'vitest';
import { makeGame, seededRandom } from './helpers.js';
import { generateDailyGigs } from '../../src/game/gigs.js';
import { RUN_LENGTH_DAYS } from '../../src/engine/state.js';

function playRun(seed, strategy) {
  const rnd = seededRandom(seed);
  const orig = Math.random;
  Math.random = rnd;
  try {
    const { game, state } = makeGame();
    state.todayGigs = generateDailyGigs(state);
    let guard = 0;
    while (game.phase !== 'SUMMARY' && game.phase !== 'GAMEOVER' && guard++ < 5000) {
      if (game.phase === 'MORNING') {
        // resolve the intro
        while (!game.morningReady) {
          if (game.ticker.idx < game.ticker.lines.length) game.ticker.idx += 1;
          else if (game.activeEvent) {
            if (game.activeEvent.choices) {
              const opts = game.activeEvent.choices.filter((o) => !(o.disabled && o.disabled(state)));
              game.chooseEventOption(opts[strategy === 'greedy' ? 0 : opts.length - 1]);
            } else game.startNextEvent();
          } else game.startNextEvent();
        }
        if (game.restDay) { game.goEvening(); continue; }
        if (state.unpaidRent > 0 && state.cash >= state.unpaidRent) game.payDebt('rent');
        if (state.phoneCut && state.cash >= state.unpaidPhone) game.payDebt('phone');
        if (state.hungry && state.cash > 60) game.buyUpgrade({ name: 'Groceries', cost: 18, canBuy: (s) => s.groceriesDay !== s.day, apply: (s) => { s.hungry = false; s.groceriesDay = s.day; } });
        game.goBrowse();
        if (game.phase !== 'BROWSE') game.goEvening();
      } else if (game.phase === 'BROWSE') {
        const affordable = state.todayGigs.filter((g) => game.canAffordGig(g).ok);
        const minEnergy = strategy === 'greedy' ? 0 : strategy === 'cautious' ? 45 : 25;
        const pick = affordable.sort((a, b) => b.payout - a.payout)[0];
        if (!pick || state.energy < minEnergy) { game.goEvening(); continue; }
        game.acceptGig(pick);
        if (game.phase === 'TRAVEL') game.startGig();
      } else if (game.phase === 'GIG') {
        if (game.qteKind === 'ei') game.finishEIGame({ success: rnd() < (strategy === 'cautious' ? 0.8 : 0.5), score: 60, effects: { rep: 0.2 }, summary: 'x' });
        else if (game.qteKind === 'skill') game.finishGig({ success: rnd() < (state.stress > 70 ? 0.4 : 0.7), score: 60 });
        else if (game.node) game.choose(game.node.choices[strategy === 'greedy' ? 0 : 1 % game.node.choices.length]);
        else game.afterChoices();
      } else if (game.phase === 'RESULTS') {
        game.continueFromResults();
      } else if (game.phase === 'EVENING') {
        if (game.ping && !game.ping.resolved) game.resolvePing(strategy === 'greedy' ? 'accept' : 'decline');
        if (game.billsOpen) { for (const k of ['rent', 'phone', 'food']) game.payBill(k); game.closeBills(); }
        if (game.wrapUpOpen) game.finishWrapUp();
        if (state.eveningDoneDay !== state.day) {
          if (strategy === 'greedy') game.eveningChoice('hustle');
          else if (strategy === 'cautious') { game.eveningChoice('winddown'); }
        }
        if (game.phase === 'EVENING_GAME') game.finishEveningGame({ success: true, score: 70, effects: { support: 8, stress: -5 }, summary: 'x' });
        game.sleep();
      }
    }
    return { evicted: game.phase === 'GAMEOVER', day: state.day, cash: state.cash, health: state.health, stress: state.stress, gigs: state.gigsCompleted, done: game.phase === 'SUMMARY' };
  } finally { Math.random = orig; }
}

describe('30-day balance bands (Monte Carlo)', () => {
  const N = 120;
  const runs = {};
  for (const strat of ['greedy', 'cautious', 'balanced']) runs[strat] = Array.from({ length: N }, (_, i) => playRun(1000 + i, strat));

  it('every run terminates at SUMMARY or GAMEOVER, never past day 30', () => {
    for (const strat of Object.keys(runs)) for (const r of runs[strat]) {
      expect(r.done || r.evicted).toBe(true);
      expect(r.day).toBeLessThanOrEqual(RUN_LENGTH_DAYS);
    }
  });
  it('the balanced strategy survives most of the time', () => {
    const evictions = runs.balanced.filter((r) => r.evicted).length / N;
    expect(evictions).toBeLessThan(0.35);
  });
  it('greed ends with worse balance than caution', () => {
    const avg = (arr, k) => arr.reduce((a, r) => a + r[k], 0) / arr.length;
    expect(avg(runs.greedy, 'health')).toBeLessThan(avg(runs.cautious, 'health'));
  });
  it('the evening loop moves outcomes measurably without deciding them', () => {
    const avg = (arr, k) => arr.reduce((a, r) => a + r[k], 0) / arr.length;
    const dh = avg(runs.cautious, 'health') - avg(runs.balanced, 'health');
    expect(Math.abs(dh)).toBeGreaterThan(1);
    expect(Math.abs(dh)).toBeLessThan(45);
  });
});

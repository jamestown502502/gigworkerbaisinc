// Replayability (2026-10-02): month twists and side goals.
import { describe, it, expect } from 'vitest';
import { makeGame, seededRandom, withRandom } from './helpers.js';
import { GameState } from '../../src/engine/state.js';
import { Game, monthCard, RENT } from '../../src/game/loop.js';
import { MONTH_TWISTS, SIDE_GOALS, rollMonth, weatherWeights, goalOf } from '../../src/game/twists.js';
import { generateDailyGigs } from '../../src/game/gigs.js';
import { rollWeather } from '../../src/game/weather.js';

describe('month twists', () => {
  it('a brand-new run draws a twist and a side goal; an old save without them is left alone', () => {
    localStorage.clear();
    const fresh = new Game(new GameState());
    expect(MONTH_TWISTS.map((t) => t.id)).toContain(fresh.state.twist);
    expect(SIDE_GOALS.map((g) => g.id)).toContain(fresh.state.sideGoal);
    const { state } = makeGame();          // existing tests' saves: mid-run, no twist
    expect(state.twist).toBeNull();
  });

  it('a new run never repeats the previous run’s twist', () => {
    const rand = seededRandom(3);
    for (let i = 0; i < 50; i++) {
      const s = { lastTwist: MONTH_TWISTS[i % MONTH_TWISTS.length].id };
      rollMonth(s, rand);
      expect(s.twist).not.toBe(s.lastTwist);
    }
  });

  it('starting over remembers the twist just played, so the next one differs', () => {
    const { game, state } = makeGame({ twist: 'heatwave' });
    game.newGame();
    expect(state.lastTwist).toBe('heatwave');
    expect(state.twist).not.toBe('heatwave');
  });

  it('rent hike adds $60 to the rent bill', () => {
    const { game } = makeGame({ twist: 'rentHike' });
    expect(game.billAmount('rent')).toBe(RENT + 60);
    const plain = makeGame().game;
    expect(plain.billAmount('rent')).toBe(RENT);
  });

  it('new app in town puts two more listings on the board', () => {
    const a = withRandom([0.5], () => generateDailyGigs({ ...new GameState(), weather: { id: 'sunny' }, twist: 'appBoom' }).length);
    const b = withRandom([0.5], () => generateDailyGigs({ ...new GameState(), weather: { id: 'sunny' } }).length);
    expect(a).toBe(b + 2);
  });

  it('heat wave doubles hot days, rainy season doubles rain', () => {
    expect(weatherWeights('heatwave')[2]).toBe(2 * weatherWeights(null)[2]);
    expect(weatherWeights('rainySeason')[1]).toBe(2 * weatherWeights(null)[1]);
    const orig = Math.random; const rand = seededRandom(9); Math.random = rand;
    try {
      const hot = Array.from({ length: 2000 }, () => rollWeather('heatwave')).filter((w) => w.id === 'hot').length;
      const base = Array.from({ length: 2000 }, () => rollWeather()).filter((w) => w.id === 'hot').length;
      expect(hot).toBeGreaterThan(base * 1.5);
    } finally { Math.random = orig; }
  });

  it('the Day 1 card names the twist and the goal, and fits the morning modal', () => {
    const card = monthCard({ twist: 'touristSeason', sideGoal: 'stars' });
    expect(card.label).toBe('THIS MONTH');
    expect(card.text).toContain('Tourist Season');
    expect(card.subtext).toContain('Side goal');
    expect(monthCard({ twist: null, sideGoal: null })).toBeNull();
  });
});

describe('side goals', () => {
  it('a mid-month goal is called out once, the moment it is met', () => {
    const { game, state } = makeGame({ sideGoal: 'stars', reputation: 2.5 });
    game.update(1 / 60);
    expect(state.sideGoalDone).toBe(false);
    state.reputation = 3;
    game.update(1 / 60);
    expect(state.sideGoalDone).toBe(true);
    expect(game.message).toContain('Side goal complete');
  });

  it('an end-of-month goal is not marked early', () => {
    const { game, state } = makeGame({ sideGoal: 'savings', cash: 900 });
    game.update(1 / 60);
    expect(state.sideGoalDone).toBe(false);
    expect(goalOf(state).check(state)).toBe(true);
  });

  it('every goal has text and a progress line', () => {
    const s = new GameState();
    for (const g of SIDE_GOALS) {
      expect(g.text.length).toBeGreaterThan(10);
      expect(typeof g.progress(s)).toBe('string');
    }
  });
});

describe('Dee across the hall (story thread)', () => {
  it('opens weeks 2, 3, 4 and the last week, with a different line for a rough month', async () => {
    const { NEIGHBOR_BEATS, neighborBeat } = await import('../../src/game/neighbor.js');
    expect(Object.keys(NEIGHBOR_BEATS).map(Number)).toEqual([8, 15, 22, 29]);
    const good = neighborBeat({ ...new GameState(), day: 15, cash: 400, health: 80 });
    const rough = neighborBeat({ ...new GameState(), day: 15, cash: 20, health: 30 });
    expect(good.text).not.toBe(rough.text);
    expect(neighborBeat({ ...new GameState(), day: 9 })).toBeNull();
  });

  it('arrives as the first morning card of the week', () => {
    const { game, state } = makeGame({ day: 8 });
    game.beginMorning();
    expect(game.eventQueue[0].label).toBe('ACROSS THE HALL');
    game.startNextEvent();
    expect(game.eventOutcome.length).toBeGreaterThan(0);
    expect(state.day).toBe(8);
  });
});

describe('settings is a pause (round 3)', () => {
  it('a timed challenge does not advance while settings is open, and resumes after', () => {
    const { game } = makeGame({ energy: 100 });
    game.phase = 'GIG';
    game.currentGig = { title: 'Yard Work', type: 'physical', choiceTree: 'yardWork', hasQTE: true, payout: 60, hours: 2 };
    game.afterChoices();
    game.qteIntroHold = false;
    game.qteReadyT = 99;
    const before = game.qte.timeLeft;
    game.settingsOpen = true;
    for (let i = 0; i < 300; i++) game.update(1 / 60); // five seconds behind the panel
    expect(game.qte.timeLeft).toBe(before);
    game.settingsOpen = false;
    game.update(1 / 60);
    expect(game.qte.timeLeft).toBeLessThan(before);
  });

  it('the morning ticker and events hold for the welcome-back prompt too', () => {
    const { game } = makeGame();
    game.ticker = { lines: ['a', 'b'], idx: 0, t: 0 };
    game.resumePrompt = true;
    for (let i = 0; i < 400; i++) game.update(1 / 60);
    expect(game.ticker.idx).toBe(0);
    game.resumePrompt = false;
    for (let i = 0; i < 400; i++) game.update(1 / 60);
    expect(game.ticker.idx).toBeGreaterThan(0);
  });
});

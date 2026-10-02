// The math of the month: the job's own numbers from this run, shown at the end (Spent research:
// structural causes, not just personal choices, are what build understanding).
import { describe, expect, it } from 'vitest';
import { makeGame } from './helpers.js';
import { monthMath } from '../../src/ui/screens.js';
import { GameState } from '../../src/engine/state.js';

describe('the math of the month', () => {
  it('reports hourly pay, rent share and the hours a week of rent took, from real run numbers', () => {
    const { state } = makeGame();
    state.totalEarned = 1200;
    state.monthMath = { paidHours: 80, gigs: 20, lostToNonPayment: 135, rentPaid: 600, phonePaid: 40, travelEnergy: 60, sickDays: 2 };
    const k = monthMath(state);
    expect(k.rate).toBe(15);
    expect(k.rentShare).toBe(50);
    expect(k.hoursForRent).toBe(40);
    expect(k.lost).toBe(135);
    expect(k.sickDays).toBe(2);
  });

  it('never divides by zero on a run with no paid work', () => {
    const { state } = makeGame();
    state.totalEarned = 0;
    const k = monthMath(state);
    expect(k.rate).toBe(0);
    expect(k.hoursForRent).toBeNull();
    expect(k.rentShare).toBe(0);
  });

  it('a real gig adds its paid hours', () => {
    const { game, state } = makeGame({ cash: 500, energy: 100, hoursLeft: 12 });
    const gig = { ...state.todayGigs[0], hasQTE: false, risk: 0, remote: true };
    state.todayGigs = [gig];
    expect(game.acceptGig(gig)).toBe(true);
    let guard = 0;
    while (game.phase === 'GIG' && guard++ < 10) {
      if (game.qteKind === 'ei') { game.finishEIGame({ success: true, score: 100, effects: {}, summary: 'ok' }); continue; }
      if (game.pendingOutcome) { game.continueOutcome(); continue; }
      if (game.node) { game.choose(game.node.choices[0]); continue; }
      break;
    }
    expect(state.monthMath.paidHours).toBe(gig.hours);
    expect(state.monthMath.gigs).toBe(1);
  });

  it('an old save without the new fields gets them, zeroed', () => {
    localStorage.clear();
    localStorage.setItem('gigWorkerState', JSON.stringify({ day: 3, tutorialSeen: true }));
    const s = new GameState();
    expect(s.monthMath.paidHours).toBe(0);
    expect(s.monthMath.rentPaid).toBe(0);
  });
});

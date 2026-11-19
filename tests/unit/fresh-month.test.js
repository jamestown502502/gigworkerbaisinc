// Fresh months (2026-11-19): a new month never repeats last month's twist or side goal, and the
// next summary knows who the last month made you.
import { describe, expect, it } from 'vitest';
import { makeGame, seededRandom } from './helpers.js';

describe('fresh months', () => {
  it('ten new months in a row: the twist and the side goal always change', () => {
    const orig = Math.random;
    Math.random = seededRandom(5);
    try {
      const { game, state } = makeGame();
      let prev = { twist: state.twist, goal: state.sideGoal };
      for (let i = 0; i < 10; i++) {
        state.day = 3;
        game.newGame();
        expect(state.twist).not.toBe(prev.twist);
        expect(state.sideGoal).not.toBe(prev.goal);
        prev = { twist: state.twist, goal: state.sideGoal };
        state.characterCreated = true;
      }
    } finally { Math.random = orig; }
  });

  it('the title the last month earned is kept for the next summary', () => {
    const { game, state } = makeGame({ day: 12, mastery: { movingHelp: 5 } });
    game.newGame();
    expect(typeof state.prevTitle).toBe('string');
    expect(state.prevTitle).toBe('The Mover');
  });
});

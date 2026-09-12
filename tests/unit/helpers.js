import { GameState } from '../../src/engine/state.js';
import { Game } from '../../src/game/loop.js';
import { InputManager } from '../../src/engine/input.js';
import { fakeCtx } from './setup.js';

/** A fresh game with the tutorial already seen, a rendering context attached, and a seeded RNG. */
export function makeGame(overrides = {}) {
  localStorage.clear();
  const state = new GameState();
  state.tutorialSeen = true;
  Object.assign(state, overrides);
  const game = new Game(state);
  game.ctx = fakeCtx();
  // Kill any transition immediately in tests unless a test wants one.
  game.setPhase = function (next, kind, meta) {
    if (this._keepTransitions) return Game.prototype.setPhase.call(this, next, kind, meta);
    this.phase = next;
  };
  return { game, state };
}

/** Deterministic Math.random for a test body. */
export function withRandom(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => { const v = values[i % values.length]; i += 1; return v; };
  try { return fn(); } finally { Math.random = orig; }
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function tap(game, x, y) {
  InputManager.clicks.push({ x, y, type: 'click' });
  game.step(2 / 60);
}

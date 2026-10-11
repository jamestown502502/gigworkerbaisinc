import { describe, it, expect, vi } from 'vitest';
import { nearest, firstTarget, pickInDirection, center } from '../../src/engine/keys.js';
import { createQTE } from '../../src/game/microgames.js';
import { GameState } from '../../src/engine/state.js';
import { GIG_TEMPLATES } from '../../src/game/gigs.js';

// Keyboard and gamepad play (web pivot, 2026-10-11): the focus ring moves between tap targets.
const box = (x, y, w = 40, h = 40) => ({ x, y, w, h });

describe('keyboard focus navigation', () => {
  const grid = [box(100, 100), box(200, 100), box(300, 100), box(100, 200), box(200, 200), box(300, 200)];

  it('moves to the neighbour in the pressed direction', () => {
    expect(pickInDirection(grid[0], grid, 1, 0)).toBe(grid[1]);
    expect(pickInDirection(grid[0], grid, 0, 1)).toBe(grid[3]);
    expect(pickInDirection(grid[4], grid, -1, 0)).toBe(grid[3]);
    expect(pickInDirection(grid[4], grid, 0, -1)).toBe(grid[1]);
  });

  it('stays put at an edge (no target ahead)', () => {
    expect(pickInDirection(grid[2], grid, 1, 0)).toBeNull();
    expect(pickInDirection(grid[0], grid, 0, -1)).toBeNull();
  });

  it('prefers a straight line over a closer diagonal', () => {
    const from = box(100, 100);
    const straight = box(260, 100), diagonal = box(160, 170);
    expect(pickInDirection(from, [from, straight, diagonal], 1, 0)).toBe(straight);
  });

  it('starts in reading order below the HUD strip', () => {
    const gear = box(752, 8), a = box(300, 300), b = box(100, 300), c = box(500, 120);
    expect(firstTarget([gear, a, b, c])).toBe(c);
    expect(firstTarget([gear])).toBeNull();
    expect(firstTarget([gear, box(0, 0, 800, 600)]).h).toBe(600);
  });

  it('follows a moving target by nearest center', () => {
    const leaves = [box(100, 100), box(400, 400)];
    expect(nearest(center(box(110, 95)), leaves)).toBe(leaves[0]);
  });
});

describe('every job challenge exposes keyboard targets inside the play area', () => {
  const state = new GameState();
  const trees = [...new Set(GIG_TEMPLATES.map((g) => g.choiceTree).filter(Boolean))];
  for (const tree of trees) {
    const gig = GIG_TEMPLATES.find((g) => g.choiceTree === tree);
    const q = createQTE(gig, state);
    if (!q) continue;
    it(`${q.name}`, () => {
      if (q.render) { try { q.render(fakeCtx()); } catch { /* drawing is not under test */ } }
      const targets = q.targets ? q.targets() : (q.buttons?.length ? q.buttons : null);
      if (targets === null) return; // hold games (LIFT!) use the whole play area
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) {
        expect(t.w).toBeGreaterThan(0);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w).toBeLessThanOrEqual(800);
        expect(t.y + t.h).toBeLessThanOrEqual(600);
      }
    });
  }
});

function fakeCtx() {
  return new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

describe('gamepad (standard mapping) feeds the same queue as the keyboard', () => {
  it('D-pad moves with repeat, A presses and releases, B and Start go back', async () => {
    const { Keys } = await import('../../src/engine/keys.js');
    const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
    vi.stubGlobal('navigator', { getGamepads: () => [null, pad] });
    Keys.consume();
    pad.buttons[15].pressed = true;              // D-pad right
    Keys.pollGamepad(1 / 60);
    expect(Keys.consume()).toEqual([{ type: 'move', dx: 1, dy: 0 }]);
    Keys.pollGamepad(0.2);                        // still held, before the repeat delay
    expect(Keys.consume()).toEqual([]);
    Keys.pollGamepad(0.4);                        // held past it: repeats
    expect(Keys.consume()).toEqual([{ type: 'move', dx: 1, dy: 0 }]);
    pad.buttons[15].pressed = false;
    pad.axes[1] = -0.9;                           // left stick up
    Keys.pollGamepad(1 / 60);
    expect(Keys.consume()).toEqual([{ type: 'move', dx: 0, dy: -1 }]);
    pad.axes[1] = 0;
    pad.buttons[0].pressed = true; Keys.pollGamepad(1 / 60);
    pad.buttons[0].pressed = false; Keys.pollGamepad(1 / 60);
    expect(Keys.consume()).toEqual([{ type: 'down' }, { type: 'up' }]);
    pad.buttons[1].pressed = true; Keys.pollGamepad(1 / 60); Keys.pollGamepad(1 / 60);
    expect(Keys.consume()).toEqual([{ type: 'back' }]);  // once per press, not every frame
  });
});

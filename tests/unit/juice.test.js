// The polish kit (2026-10-04): easing lands where it should, the receipt prints in order, Five
// Stars is rare, tokens fly to real meters and the meters answer, haptics stay short.
import { describe, expect, it } from 'vitest';
import { easeOutBack, easeOutBounce, easeOutCubic, receiptState, RECEIPT_LINE_SECS, isFiveStars, FIVE_STAR_SCORE, HAPTIC, heartbeat, effectTokens, METER_POS } from '../../src/ui/juice.js';
import { spawnFlyToken, updateFX, meterBulge, tokenCount, spawnBurst, MAX_PARTICLES, particleCount } from '../../src/ui/fx.js';
import { makeGame } from './helpers.js';

describe('easing', () => {
  it('every curve starts at 0 and lands at 1; back overshoots on the way', () => {
    for (const f of [easeOutBack, easeOutBounce, easeOutCubic]) { expect(f(0)).toBeCloseTo(0); expect(f(1)).toBeCloseTo(1); }
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1);
  });
});

describe('the receipt printer', () => {
  it('prints one line at a time, then the total, then the stamp', () => {
    expect(receiptState(0, 4).shown).toBe(1);
    expect(receiptState(RECEIPT_LINE_SECS * 2.5, 4).shown).toBe(3);
    const done = receiptState(4 * RECEIPT_LINE_SECS + 0.11, 4);
    expect(done.shown).toBe(4); expect(done.total).toBe(true); expect(done.stamp).toBe(false);
    expect(receiptState(4 * RECEIPT_LINE_SECS + 0.5, 4).stamp).toBe(true);
  });
  it('the results screen prints, stamps once, and then the deltas fly to the meters', () => {
    const { game, state } = makeGame();
    const gig = { title: 'Help Move Furniture', type: 'physical', payout: 80, hours: 2, risk: 0, location: 'safe', hasQTE: false, choiceTree: 'movingHelp', client: 'Walt', clientReliability: 5, isRepeat: false, remote: true };
    state.todayGigs = [gig];
    game.acceptGig(gig); game.choose(game.node.choices[1]); game.continueOutcome();
    expect(game.phase).toBe('RESULTS');
    for (let i = 0; i < 90; i++) game.update(1 / 60);
    expect(game.receiptShown).toBe(game.results.items.length);
    expect(game.receiptStamped).toBe(true);
  });
});

describe('Five Stars is rare on purpose', () => {
  it('only a skill challenge, only a success, only near-perfect', () => {
    expect(isFiveStars('skill', { success: true, score: FIVE_STAR_SCORE })).toBe(true);
    expect(isFiveStars('skill', { success: true, score: FIVE_STAR_SCORE - 1 })).toBe(false);
    expect(isFiveStars('ei', { success: true, score: 100 })).toBe(false);
    expect(isFiveStars('skill', { success: false, score: 100 })).toBe(false);
  });
});

describe('tokens fly to real meters, and the meters answer', () => {
  it('one labelled token per changed stat, pointed at a meter that exists', () => {
    const tk = effectTokens({ cash: 20, energy: -15, stress: 10, rep: 0 });
    expect(tk.map((t) => t.key)).toEqual(['cash', 'stress', 'energy']);
    expect(tk[0].text).toBe('+$20');
    for (const t of tk) expect(METER_POS[t.key]).toBeTruthy();
  });
  it('a landing token makes its meter bulge; Reduce Motion skips the flight but keeps the bulge', () => {
    spawnFlyToken(100, 300, 'cash', '+$5');
    expect(tokenCount()).toBeGreaterThan(0);
    for (let i = 0; i < 44; i++) updateFX(1 / 60);
    expect(meterBulge('cash')).toBeGreaterThan(0);
    const before = tokenCount();
    spawnFlyToken(100, 300, 'stress', '+3', '#fff', { calm: true });
    expect(tokenCount()).toBe(before);
    expect(meterBulge('stress')).toBeGreaterThan(0);
  });
  it('particles are capped so a busy moment cannot tank a phone', () => {
    for (let i = 0; i < 20; i++) spawnBurst(400, 300, { count: 40 });
    expect(particleCount()).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(particleCount()).toBe(MAX_PARTICLES);   // it filled, and stopped there
  });
});

describe('touch and heartbeat', () => {
  it('haptics are short and clear: no pulse over 40 ms', () => {
    for (const v of Object.values(HAPTIC)) for (const ms of [].concat(v)) expect(ms).toBeLessThanOrEqual(40);
  });
  it('the heartbeat thumps twice per cycle and rests in between', () => {
    expect(heartbeat(0.08)).toBeCloseTo(1);
    expect(heartbeat(0.28)).toBeCloseTo(0.7);
    expect(heartbeat(0.6)).toBe(0);
  });
});

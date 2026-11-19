// Money worry (QA round 4 #9, 2026-11-19): low cash against the coming bills raises stress.
import { describe, expect, it } from 'vitest';
import { worryFor, applyMorningWorry, applySpendWorry, worryLine } from '../../src/game/worry.js';

describe('money worry', () => {
  it('no worry when cash covers half the bills or more', () => {
    expect(worryFor(400, 690)).toBe(0);
    expect(worryFor(345, 690)).toBe(0);
  });
  it('more worry the less is covered, and more again with rent overdue', () => {
    expect(worryFor(300, 690)).toBe(4);
    expect(worryFor(100, 690)).toBe(8);
    expect(worryFor(100, 690, 200)).toBe(11);
  });
  it('the morning worry lands in stress, capped at 100', () => {
    const s = { cash: 50, stress: 95, day: 3, unpaidRent: 0 };
    expect(applyMorningWorry(s, 690)).toBe(8);
    expect(s.stress).toBe(100);
  });
  it('spending under the line worries once a day, and the line says why', () => {
    const s = { cash: 300, stress: 20, day: 4 };
    expect(applySpendWorry(s, 690, 400)).toBe(4);
    expect(s.stress).toBe(24);
    s.cash = 100;
    expect(applySpendWorry(s, 690, 300)).toBe(0);
    expect(worryLine(6)).toMatch(/^Money is tight: stress \+6\./);
    expect(worryLine(0)).toBe('');
  });
});

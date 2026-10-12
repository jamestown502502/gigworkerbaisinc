// Player feedback 2026-10-12 reported a percent question ("25% of 60") offered without its answer.
// No such question exists in the game (the options quoted, $12/$8/$4, belong to "Dinner is $40.
// What is a 20% tip?", answer $8). This guards every multiple-choice question in the game anyway:
// the answer is always on screen, among distinct options, and the percent answers are right.
import { describe, it, expect } from 'vitest';
import { PERCENT_PROBLEMS, PercentTutor } from '../../src/game/microgames.js';
import { RECALL_BANK } from '../../src/game/recall.js';

// Each problem's answer, worked independently of the game's own text.
const WORKED = {
  'A $80 jacket is 25% off. What does it cost now?': 80 * 0.75,
  'Dinner is $40. What is a 20% tip?': 40 * 0.2,
  'You earn $120 and save 15% of it. How much is saved?': 120 * 0.15,
  'Rent goes from $600 to $660. What percent increase?': (60 / 600) * 100,
  'A $50 game is on sale for $35. What percent off?': (15 / 50) * 100,
  'Sales tax is 8%. What is the tax on $25?': 25 * 0.08,
  'You got 30 of 40 questions right. What is your score?': (30 / 40) * 100,
  'A $200 phone drops 50%, then 10% more off that price. Final?': 200 * 0.5 * 0.9,
  'A $30 shirt is 10% off. What is the sale price?': 30 * 0.9,
  'Lunch is $60. What is a 15% tip?': 60 * 0.15,
  'Your $400 rent goes up 5%. What is the new rent?': 400 * 1.05,
  'You save $45 of your $300 pay. What percent is that?': (45 / 300) * 100,
  'A $90 coat is 20% off. How much do you save?': 90 * 0.2,
  'Gas goes from $3.00 to $3.30 a gallon. What percent rise?': (0.3 / 3) * 100,
  'You got 18 of 20 questions right. What is your score?': (18 / 20) * 100,
  'A $150 bike is 40% off. What does it cost now?': 150 * 0.6,
};
const num = (s) => Number(String(s).replace(/[$%]/g, ''));

describe('percent problems', () => {
  it('every problem is worked here, and its answer matches', () => {
    expect(PERCENT_PROBLEMS.map((p) => p.q).sort()).toEqual(Object.keys(WORKED).sort());
    for (const p of PERCENT_PROBLEMS) expect(num(p.answer), p.q).toBeCloseTo(WORKED[p.q], 6);
  });
  it('the answer is always one of three distinct options on screen, and no wrong option is also right', () => {
    for (const p of PERCENT_PROBLEMS) {
      const g = new PercentTutor({ stress: 0, energy: 100, health: 100, settings: {} }, [p]);
      const opts = g.problems[0].options;
      expect(opts).toContain(p.answer);
      expect(new Set(opts).size).toBe(3);
      for (const w of p.wrong) expect(num(w), `${p.q}: ${w}`).not.toBeCloseTo(WORKED[p.q], 6);
    }
  });
});

describe('recall questions', () => {
  it('every recall card has three distinct options, the first being the answer', () => {
    for (const r of RECALL_BANK) {
      expect(r.options).toHaveLength(3);
      expect(new Set(r.options).size, r.q).toBe(3);
      expect(r.lesson, r.q).toBeTruthy();
    }
  });
  it('the recall tip question is right: 20% of $35 is $7', () => {
    const r = RECALL_BANK.find((x) => x.q.includes('20% of $35'));
    expect(r.options[0]).toBe('$7');
  });
});

// game/week.js (publisher polish 2026-10-12): the week board shows what the game knows, on the
// same days the bills card and the eviction clock use.
import { describe, it, expect } from 'vitest';
import { weekPlan } from '../../src/game/week.js';
import { GameState } from '../../src/engine/state.js';
import { daysToEviction } from '../../src/game/depth.js';

const bills = { rent: 600, phone: 40, food: 50 };
function state(day, daysUntilBills, extra = {}) {
  const s = new GameState();
  Object.assign(s, { day, daysUntilBills, unpaidRent: 0, contracts: [] }, extra);
  return s;
}
const itemsOn = (plan, day) => plan.find((d) => d.day === day)?.items.map((i) => i.text) ?? [];

describe('week board', () => {
  for (const [day, until] of [[1, 7], [6, 2], [7, 1], [13, 2], [28, 1]]) {
    it(`day ${day}: bills land where the bills card says (day + ${until})`, () => {
      const plan = weekPlan(state(day, until), bills);
      expect(plan).toHaveLength(8);
      expect(plan[0]).toMatchObject({ day, today: true });
      const due = day + until;
      if (due <= 30) expect(itemsOn(plan, due)).toEqual(expect.arrayContaining(['Bills $690', 'rent $600']));
      for (const d of plan) if (d.day !== due) expect(d.items.map((i) => i.text)).not.toContain('Bills $690');
    });
  }
  it('bills due tonight show on today', () => {
    expect(itemsOn(weekPlan(state(14, 0), bills), 14)).toContain('Bills $690');
  });
  it('rent paid early: the bills night shows phone and food only', () => {
    expect(itemsOn(weekPlan(state(3, 4), { ...bills, rent: 0 }), 7)).toEqual(['Bills $90']);
  });
  it('rent overdue: the eviction day is marked on the same day the eviction clock says', () => {
    const s = state(10, 4, { unpaidRent: 600, rentOverdueDays: 9 });
    expect(itemsOn(weekPlan(s, bills), 10 + daysToEviction(s))).toContain('Eviction if rent is unpaid');
  });
  it('standing bookings, story and recall mornings, Dee, and the month end', () => {
    const plan = weekPlan(state(24, 4, { contracts: [{ client: 'Otis', payout: 90, every: 5, nextDay: 25 }] }), bills);
    expect(itemsOn(plan, 25)).toContain('Otis: booked $90');
    expect(itemsOn(plan, 30)).toEqual(expect.arrayContaining(['Otis: booked $90', 'Last day']));
    expect(itemsOn(plan, 24)).toContain('Recall quiz');
    expect(itemsOn(plan, 29)).toContain('Dee drops by');
    expect(weekPlan(state(4, 3), bills).find((d) => d.day === 6).items.map((i) => i.text)).toContain('Story morning');
  });
  it('never shows money it can only estimate as a cell', () => {
    for (const d of weekPlan(state(9, 6), bills)) for (const it of d.items) expect(it.text).not.toMatch(/earn|pace|estimate/i);
  });
});

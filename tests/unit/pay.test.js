// game/pay.js (publisher polish 2026-10-12): one formula for "kept" and "per hour", shared by the
// receipt, the job card and the month's math.
import { describe, it, expect } from 'vitest';
import { netFor, listingRate, perHourOf } from '../../src/game/pay.js';
import { monthMath } from '../../src/ui/screens.js';

describe('netFor', () => {
  it('a plain job: kept = paid, no costs', () => {
    expect(netFor([{ label: 'Clean Out Garage', amount: 69 }, { label: 'Tip from Otis', amount: 12 }], 3))
      .toEqual({ paid: 81, costs: 0, kept: 81, hours: 3, perHour: 27 });
  });
  it('a delivery shift: gas is a cost you paid', () => {
    const n = netFor([{ label: 'Clean', amount: 0 }, { label: 'Order pay (9 orders)', amount: 96 }, { label: 'Gas and wear (40 mi)', amount: -14 }], 4);
    expect(n).toMatchObject({ paid: 96, costs: 14, kept: 82, perHour: 21 });
  });
  it('a pay cut or a short-changing client is not a cost', () => {
    const n = netFor([{ label: 'Dog Walk', amount: 40 }, { label: 'Fumbled the challenge (-30%)', amount: -12 }, { label: 'Client short-changed you', amount: -10 }], 2);
    expect(n).toMatchObject({ costs: 0, kept: 18, paid: 18, perHour: 9 });
  });
  it('the receipt, the card and the month use the same per-hour formula', () => {
    expect(netFor([{ label: 'x', amount: 70 }], 4).perHour).toBe(Math.round(perHourOf(70, 4)));
    expect(listingRate({ payout: 70, hours: 4 })).toBe(Math.round(perHourOf(70, 4)));
    const s = { totalEarned: 700, monthMath: { paidHours: 56 } };
    expect(monthMath(s).rate).toBe(perHourOf(700, 56));
  });
  it('no hours, no rate', () => {
    expect(netFor([{ label: 'x', amount: 10 }], 0).perHour).toBe(0);
  });
});

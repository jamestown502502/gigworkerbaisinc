// Money worry (QA round 4 #9, 2026-11-19). Stress used to come only from work: a player down to
// their last few dollars with rent due felt nothing in the stress meter. Real financial strain is
// one of the most reported sources of stress, so the meter now answers to it, at most once a day
// in the morning and once more the moment a purchase drops cash under the line.

/** How much stress cash on hand adds, given what the next bills night needs. */
export function worryFor(cash, due, unpaidRent = 0) {
  if (due <= 0) return 0;
  const share = Math.max(0, cash) / due;
  let add = share < 0.25 ? 8 : share < 0.5 ? 4 : 0;
  if (unpaidRent > 0) add += 3;
  return add;
}

/** One line for the player, or '' when nothing was added. */
export function worryLine(add) {
  return add > 0 ? `Money is tight: stress +${add}. Bills are coming and the cash will not cover them.` : '';
}

/** Applies the morning worry to the state. Returns the stress added. */
export function applyMorningWorry(s, due) {
  const add = worryFor(s.cash, due, s.unpaidRent || 0);
  s.stress = Math.min(100, s.stress + add);
  s.worryDay = s.day;
  return add;
}

/** After spending: the first time today that cash falls under half of what is due, worry once. */
export function applySpendWorry(s, due, cashBefore) {
  if (s.spendWorryDay === s.day) return 0;
  const before = worryFor(cashBefore, due), after = worryFor(s.cash, due);
  if (after <= before) return 0;
  const add = after - before;
  s.stress = Math.min(100, s.stress + add);
  s.spendWorryDay = s.day;
  return add;
}

// Rent that bites (2026-11-10). The worst-luck test (tests/unit/worstcase.test.js) measured zero
// evictions: the game said "survive" and the month could not really be lost. A run now picks how
// tight the month is. Steady is the game as it shipped, so its balance bands hold unchanged.
// Tight and Brutal raise the rent, thin the starting cash, and bring a surprise cost every week:
// a card with a real choice between paying now, putting it off at a price, or paying in effort.
//
// Pure rules. loop.js reads rentSurcharge() wherever it reads the rent, applies startFor() when a
// run begins, and queues surpriseCard() in beginMorning.

export const MONTH_TYPES = [
  { id: 'steady', name: 'Steady month', rent: 0, cash: 200, pay: 1, surprises: false,
    text: 'The standard month. Rent is $600 a week and jobs pay in full.' },
  { id: 'tight', name: 'Tight month', rent: 150, cash: 140, pay: 0.5, surprises: true,
    text: 'Slow season: jobs pay half, rent is $750 a week, and a surprise cost lands every week.' },
  { id: 'brutal', name: 'Brutal month', rent: 300, cash: 90, pay: 0.4, surprises: true,
    text: 'Jobs pay 60% less, rent is $900 a week, and surprise costs are bigger. Few make it.' },
];

export function monthTypeOf(state) {
  return MONTH_TYPES.find((m) => m.id === state?.monthType) || MONTH_TYPES[0];
}

/** Dollars a week this month type adds to the rent. */
export function rentSurcharge(state) {
  return monthTypeOf(state).rent;
}

/** What a listing pays this month, as a share of its ordinary pay. */
export function monthPay(state) {
  return monthTypeOf(state).pay;
}

/** A new run's starting cash for its month type (a background can still change it after). */
export function applyMonthStart(state) {
  const m = monthTypeOf(state);
  state.cash = m.cash;
  state.weekStats = { ...state.weekStats, startingCash: m.cash };
}

// The surprise costs. One a week, on the fourth day of the week, so there are always three days
// to see the bills coming after it. Each has three ways out and none is free.
export const SURPRISE_DAYS = [4, 11, 18, 25];
export const SURPRISES = [
  { id: 'tooth', text: 'A cracked filling. The clinic can see you today for $90.',
    pay: 90, payText: 'Pay the clinic', putOff: { stress: 12, health: -8, text: 'Live with it: +12 stress' },
    effort: { energy: 0, hours: 0, health: -4, stress: 6, cost: 30, text: 'Pharmacy fix: $30, +6 stress' } },
  { id: 'bike', text: 'Your bike chain snaps on the way out. The shop wants $70.',
    pay: 70, payText: 'Pay the shop', putOff: { travel: 3, text: 'Walk for 3 days: +3 energy a trip' },
    effort: { energy: 15, hours: 2, text: 'Fix it yourself: 2h, 15 energy' } },
  { id: 'deposit', text: 'The building wants a $80 key deposit by tonight, or a late fee is added to rent.',
    pay: 80, payText: 'Pay the deposit', putOff: { rent: 110, text: 'Let it ride: +$110 on rent' },
    effort: { energy: 10, hours: 3, text: 'Paint hallways: 3h, 10 energy' } },
  { id: 'phone', text: 'Your phone screen shatters. A repair is $100.',
    pay: 100, payText: 'Pay for the repair', putOff: { listings: 2, text: 'Squint: 2 fewer jobs, 3 days' },
    effort: { cost: 45, stress: 8, text: 'Used screen: $45, +8 stress' } },
];

/** The surprise for this morning, or null. Brutal months cost half as much again. */
export function surpriseFor(state) {
  const m = monthTypeOf(state);
  const week = SURPRISE_DAYS.indexOf(state.day);
  if (!m.surprises || week < 0) return null;
  const done = state.surprisesSeen || [];
  const open = SURPRISES.filter((x) => !done.includes(x.id));
  if (!open.length) return null;
  const base = open[(week + (state.runNumber || 1)) % open.length];
  const k = m.id === 'brutal' ? 1.5 : 1;
  return { ...base, pay: Math.round(base.pay * k) };
}

/** The surprise as a morning card with three choices (the shape events.js cards use). */
export function surpriseCard(state) {
  const x = surpriseFor(state);
  if (!x) return null;
  const mark = (s) => { s.surprisesSeen = [...(s.surprisesSeen || []), x.id]; };
  const e = x.effort, p = x.putOff;
  return {
    id: `surprise-${x.id}`, tier: 2, surprise: true, text: x.text,
    choices: [
      { text: `${x.payText} ($${x.pay})`, disabled: (s) => s.cash < x.pay,
        apply: (s) => { mark(s); s.cash -= x.pay; s.monthMath.surprises = (s.monthMath.surprises || 0) + x.pay; return `-$${x.pay}. Done, and off your mind.`; } },
      { text: e.text, disabled: (s) => (e.cost || 0) > s.cash || (e.energy || 0) >= s.energy || (e.hours || 0) > s.hoursLeft,
        apply: (s) => {
          mark(s);
          s.cash -= e.cost || 0; s.energy -= e.energy || 0; s.hoursLeft -= e.hours || 0;
          s.stress += e.stress || 0; s.health += e.health || 0;
          s.monthMath.surprises = (s.monthMath.surprises || 0) + (e.cost || 0);
          return 'Handled the hard way.';
        } },
      { text: p.text,
        apply: (s) => {
          mark(s);
          s.stress += p.stress || 0; s.health += p.health || 0;
          if (p.rent) s.unpaidRent += p.rent;
          if (p.travel) { s.walkDays = 3; s.walkExtra = p.travel; }
          if (p.listings) { s.fewerListingsDays = 3; s.fewerListings = p.listings; }
          return 'Put off. It will cost you a different way.';
        } },
    ],
  };
}

/** Fewer listings while a cracked phone is put off. */
export function listingsPenalty(state) {
  return (state.fewerListingsDays || 0) > 0 ? state.fewerListings || 0 : 0;
}

/** Extra travel energy while the bike is broken. */
export function travelPenalty(state) {
  return (state.walkDays || 0) > 0 ? state.walkExtra || 0 : 0;
}

/** One night passes: the put-off penalties count down. */
export function tickMonth(state) {
  if ((state.walkDays || 0) > 0) state.walkDays -= 1;
  if ((state.fewerListingsDays || 0) > 0) state.fewerListingsDays -= 1;
}

/** How full the bills jar is: cash against everything due on the next bills night, 0 to 1, for
 *  the ring on the morning screen. `due` is the total owed that night. */
export function billsMeter(cash, due) {
  if (due <= 0) return { share: 1, short: 0 };
  return { share: Math.max(0, Math.min(1, cash / due)), short: Math.max(0, Math.round(due - cash)) };
}

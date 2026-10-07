// Replayability (2026-10-02): every run draws one MONTH TWIST that bends the city's rules for all
// thirty days, and one SIDE GOAL to chase on top of rent. Daily gigs, weather and events were
// already random, but the month itself always played by the same rules, so a second run felt like
// the first with different dice. A twist changes which strategy is best; a goal changes what a
// good month means. Both are shown on the Day 1 card, on the morning panel, and on the summary.
//
// Pure data + small hook functions, so balance tests can run every twist through the Monte Carlo.

export const MONTH_TWISTS = [
  { id: 'heatwave', name: 'Heat Wave Month', text: 'Hot days come twice as often. Indoor gigs pay 10% more, and your first gig each day pays 15% more, before the heat peaks.' },
  { id: 'appBoom', name: 'New App in Town', text: 'A new gig app launched: two extra listings every day, but pay is 10% lower. Every third app gig in a week (delivery, dog walking, mystery shopping) pays a $40 streak bonus.' },
  { id: 'touristSeason', name: 'Tourist Season', text: 'Weird gigs open at 2 stars instead of 3 and pay 15% more. Weekends bring two extra listings, and odd jobs pay 30% more on them.' },
  { id: 'rentHike', name: 'Rent Hike', text: 'Rent went up $60 a week. Repeat clients pay 20% more, not 10%. Each week the super offers $40 off rent for an evening of building chores.' },
  { id: 'rainySeason', name: 'Rainy Season', text: 'Rain is twice as likely, so outdoor work dries up, but on rainy days indoor gigs pay 20% more. Winding down clears 50% more stress.' },
  { id: 'tightKnit', name: 'Tight-Knit Block', text: "Neighbors look out for each other: calls build 50% more support, fewer clients skip out on paying, and once this month Dee covers up to $100 of rent you can't make." },
];

export const SIDE_GOALS = [
  { id: 'savings', text: 'Finish the month with $500 or more in cash.', atEnd: true, check: (s) => s.cash >= 500, progress: (s) => `$${Math.round(s.cash)} now` },
  { id: 'stars', text: 'Reach 3 stars of reputation.', check: (s) => s.reputation >= 3, progress: (s) => `${Math.round(s.reputation * 2) / 2} stars now` },
  { id: 'rested', text: 'Rest on 8 evenings.', check: (s) => restedCount(s) >= 8, progress: (s) => `${restedCount(s)} so far` },
  { id: 'laptop', text: 'Buy the Laptop and take remote work.', check: (s) => s.upgradesOwned.includes('Laptop'), progress: (s) => `$${Math.round(s.cash)} of $200` },
  { id: 'reader', text: 'Read 6 clients well.', check: (s) => s.eiWins >= 6, progress: (s) => `${s.eiWins} so far` },
  { id: 'debtFree', text: 'End the month owing nothing: no overdue rent or phone bill.', atEnd: true, check: (s) => !s.unpaidRent && !s.unpaidPhone, progress: (s) => (s.unpaidRent || s.unpaidPhone ? 'behind right now' : 'on track') },
];

function restedCount(s) {
  return s.eveningsRested || 0;
}

export function twistOf(state) {
  return MONTH_TWISTS.find((t) => t.id === state?.twist) || null;
}

export function goalOf(state) {
  return SIDE_GOALS.find((g) => g.id === state?.sideGoal) || null;
}

/** Draw a twist and a goal for a brand-new run. Never repeats the previous run's twist. */
export function rollMonth(state, rand = Math.random) {
  const twists = MONTH_TWISTS.filter((t) => t.id !== state.lastTwist);
  state.twist = twists[Math.floor(rand() * twists.length)].id;
  state.sideGoal = SIDE_GOALS[Math.floor(rand() * SIDE_GOALS.length)].id;
  state.sideGoalDone = false;
}

// ---- hooks the game calls ----

export function weatherWeights(twistId) {
  // sunny, rainy, hot, cold, perfect  (the base table in weather.js: 30/20/15/15/10, +10 sunny)
  const w = [40, 20, 15, 15, 10];
  if (twistId === 'heatwave') w[2] *= 2;
  if (twistId === 'rainySeason') w[1] *= 2;
  return w;
}

/** Weekends are days 6 and 7 of each week (day 6, 7, 13, 14...). */
export function isWeekend(day) {
  const d = ((day - 1) % 7) + 1;
  return d === 6 || d === 7;
}

export function extraListings(twistId, day = 1) {
  if (twistId === 'appBoom') return 2;
  if (twistId === 'touristSeason' && isWeekend(day)) return 2;
  return 0;
}

/** Twist rules that depend on the day itself (2026-10-07): they reward a different plan, not
 *  just a bigger number. */
export function twistDayMultiplier(state, template) {
  if (state.twist === 'touristSeason' && template.type === 'weird' && isWeekend(state.day)) return 1.3;
  if (state.twist === 'rainySeason' && state.weather?.id === 'rainy' && !template.outdoor) return 1.2;
  return 1;
}

export function weirdGigStars(twistId) {
  return twistId === 'touristSeason' ? 2 : 3;
}

export function payMultiplier(twistId, template) {
  if (twistId === 'appBoom') return 0.9;
  if (twistId === 'heatwave' && !template.outdoor) return 1.1;
  if (twistId === 'touristSeason' && template.type === 'weird') return 1.15;
  return 1;
}

export function repeatClientBonus(twistId) {
  return twistId === 'rentHike' ? 1.2 : 1.1;
}

export function rentExtra(twistId) {
  return twistId === 'rentHike' ? 60 : 0;
}

export function supportMultiplier(twistId) {
  return twistId === 'tightKnit' ? 1.5 : 1;
}

export function windDownMultiplier(twistId) {
  return twistId === 'rainySeason' ? 1.5 : 1;
}

export function scamMultiplier(twistId) {
  return twistId === 'tightKnit' ? 0.7 : 1;
}

// Depth pass (2026-10-07), from an external design critique: make the systems that already exist
// interact more, rather than adding raw content. Pure functions over the save state, so every rule
// here is unit-tested and runs through the Monte Carlo in tests/unit/balance.test.js.
//
//  - Backgrounds: horizontal progression. A new one opens each run; each is a trade-off, never a
//    straight bonus, so run 4 is different rather than easier (the critique's "avoid permanent
//    stat bonuses").
//  - Clients with consequences: regulars refer friends, tip, and offer standing contracts; a
//    client you let down pays less, and after two bad jobs stops hiring you.
//  - Rent forecast: "at your pace you will be $X short", the one number that turns a slow day
//    into a decision.
//  - Month insights: why the month went the way it did, from the run's own numbers.

// ---------------------------------------------------------------- backgrounds
export const BACKGROUNDS = [
  { id: 'fresh', name: 'Fresh Start', unlockRun: 1,
    text: 'New in town. No edge, no handicap.' },
  { id: 'mover', name: 'Ex-Mover', unlockRun: 2,
    text: 'Starts with Work Gloves; physical gigs pay 10% more. Creative work needs 3 stars.' },
  { id: 'artschool', name: 'Art School Dropout', unlockRun: 3,
    text: 'Creative gigs open at 1 star. You start with $120 instead of $200.' },
  { id: 'nightowl', name: 'Night Owl', unlockRun: 4,
    text: 'Late hustles pay 50% more and tire you less, but mornings start 10 energy lower.' },
  { id: 'local', name: 'Neighborhood Kid', unlockRun: 5,
    text: 'Clients skip out less (scam risk -20%), and Dee covers one short bill. Calls build less support.' },
];

export function backgroundOf(state) {
  return BACKGROUNDS.find((b) => b.id === state?.background) || BACKGROUNDS[0];
}

export function backgroundsOpen(state) {
  return BACKGROUNDS.filter((b) => b.unlockRun <= (state?.runNumber || 1));
}

/** One-time effects when a run starts with this background. */
export function applyBackgroundStart(state) {
  const b = backgroundOf(state).id;
  if (b === 'mover' && !state.upgradesOwned.includes('Work Gloves')) { state.upgradesOwned.push('Work Gloves'); state.hasGloves = true; }
  if (b === 'artschool') { state.cash = 120; state.weekStats.startingCash = 120; }
}

/** Reputation needed before creative gigs reach the board. */
export function creativeStars(state) {
  const b = backgroundOf(state).id;
  return b === 'mover' ? 3 : b === 'artschool' ? 1 : 2;
}

export function backgroundPayMultiplier(state, template) {
  return backgroundOf(state).id === 'mover' && template.type === 'physical' ? 1.1 : 1;
}

export function backgroundScamMultiplier(state) {
  return backgroundOf(state).id === 'local' ? 0.8 : 1;
}

// ---------------------------------------------------------------- clients with consequences
/** 'new' | 'known' | 'regular' | 'wary' | 'done' */
export function clientStanding(state, name) {
  const log = state?.clientLog?.[name];
  if (!log || !log.visits) return 'new';
  if ((log.bad || 0) >= 2 && !log.lastGood) return 'done';
  if (!log.lastGood) return 'wary';
  if ((log.good || 0) >= 2) return 'regular';
  return 'known';
}

export const STANDING_LABEL = { regular: 'regular', wary: 'wary, pays 10% less', known: 'knows you', new: '' };

/** A morning offer from a happy client, or null: a standing contract (3 good jobs) or a referral
 *  (a regular, at most every 5 days). */
export function clientMorningOffer(state, rand = Math.random) {
  const book = state.clientLog || {};
  const names = Object.keys(book).filter((n) => clientStanding(state, n) === 'regular');
  const contracts = state.contracts || [];
  for (const name of names) {
    const log = book[name];
    if ((log.good || 0) >= 3 && !log.contractOffered && contracts.length < 2 && !contracts.some((c) => c.client === name)) {
      return { kind: 'contract', client: name, job: log.lastJob };
    }
  }
  const due = names.filter((n) => state.day - (book[n].lastReferral ?? -99) >= 5);
  if (due.length && rand() < 0.35) return { kind: 'referral', client: due[Math.floor(rand() * due.length)] };
  return null;
}

/** A contract's pay: the job's usual top rate, a little over, every 5 days, no risk. */
export function contractTerms(state, name, template) {
  const pay = Math.round(((template?.payout?.[1]) || 80) * 1.1);
  return { client: name, title: template?.title || 'Standing job', payout: pay, every: 5, nextDay: state.day + 2 };
}

// ---------------------------------------------------------------- rent forecast
/** Days until eviction, counting a grace week bought by a partial payment. */
export function daysToEviction(state) {
  return Math.max(0, 14 - (state.rentOverdueDays || 0) + (state.rentGraceDays || 0));
}

/** Bills due next, the daily need, and how the player's recent pace compares.
 *  `billTotal` is everything due on the next bills evening (rent counted only if not prepaid). */
export function rentForecast(state, billTotal) {
  const days = Math.max(1, state.daysUntilBills);
  const need = Math.max(0, billTotal - state.cash);
  const perDayNeeded = Math.ceil(need / days);
  const recent = (state.paceLog || []).slice(-5);
  const pace = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
  const projected = pace === null ? null : Math.round(state.cash + pace * days);
  const shortBy = projected === null ? null : Math.max(0, billTotal - projected);
  let line;
  if (need === 0) line = `Bills of $${billTotal} in ${days} day${days === 1 ? '' : 's'}: already covered.`;
  else if (pace === null) line = `Bills of $${billTotal} in ${days} days: about $${perDayNeeded} a day.`;
  else if (shortBy > 0) line = `At your pace (${pace >= 0 ? '+' : '-'}$${Math.abs(pace)} a day) you'll be $${shortBy} short when $${billTotal} of bills come due.`;
  else line = `On pace (+$${pace} a day): about $${projected - billTotal} spare when $${billTotal} of bills come due.`;
  return { days, need, perDayNeeded, pace, projected, shortBy, warn: shortBy !== null && shortBy > 0, line };
}

// ---------------------------------------------------------------- why the month went this way
const TYPE_NAME = { physical: 'Physical work', service: 'Service work', creative: 'Creative work', weird: 'Odd jobs' };

/** Up to six plain-language reasons, from the run's own numbers. */
export function monthInsights(state) {
  const m = state.monthMath || {};
  const out = [];
  const types = Object.entries(m.byType || {}).filter(([, v]) => v.hours > 0)
    .map(([k, v]) => ({ k, rate: v.earned / v.hours, ...v })).sort((a, b) => b.rate - a.rate);
  if (types.length >= 2) {
    const best = types[0], worst = types[types.length - 1];
    out.push(`${TYPE_NAME[best.k] || best.k} paid best: $${best.rate.toFixed(0)} an hour over ${best.gigs} gig${best.gigs === 1 ? '' : 's'}. ${TYPE_NAME[worst.k] || worst.k} paid least: $${worst.rate.toFixed(0)} an hour.`);
  } else if (types.length === 1) {
    out.push(`All your paid work was ${(TYPE_NAME[types[0].k] || types[0].k).toLowerCase()}, at $${types[0].rate.toFixed(0)} an hour.`);
  }
  const earned = Math.max(1, Math.round(state.totalEarned || 0));
  if (m.lostToNonPayment > 0) out.push(`Clients who didn't pay cost you $${Math.round(m.lostToNonPayment)}, ${Math.round((m.lostToNonPayment / earned) * 100)}% of what you earned. Regulars and safe streets lower that risk.`);
  if ((state.upgradesOwned || []).includes('Tool Belt')) {
    const x = Math.round(m.toolBeltExtra || 0);
    out.push(x >= 80 ? `The Tool Belt earned $${x} extra: it paid for itself${x >= 160 ? ' twice' : ''}.` : `The Tool Belt earned $${x} extra of its $80 cost.`);
  }
  if ((m.travelSaved || 0) > 0) out.push(`Better travel saved ${Math.round(m.travelSaved)} energy getting to gigs.`);
  if ((m.lateHustles || 0) > 0) out.push(`${m.lateHustles} late hustle${m.lateHustles === 1 ? '' : 's'} brought $${Math.round(m.hustleCash || 0)}, and ${m.lateHustles * 8} stress with tired mornings after.`);
  if ((m.tips || 0) > 0) out.push(`Regulars tipped you $${Math.round(m.tips)}.`);
  if ((m.partialRent || 0) > 0) out.push(`Partial rent payments of $${Math.round(m.partialRent)} kept the landlord patient.`);
  if (m.firstOverdueDay) out.push(`The month turned on day ${m.firstOverdueDay}, the first time rent went unpaid.`);
  if ((m.sickDays || 0) > 0) out.push(`${m.sickDays} day${m.sickDays === 1 ? '' : 's'} lost to being run down. Rest is part of the job.`);
  if (out.length === 0) out.push('Not enough work this month to read a pattern yet.');
  return out.slice(0, 6);
}

// Random daily events + morning flavor ticker text.
// Rolled once per morning in Game.beginMorning(), never per frame.
import { makeReferralGig } from './gigs.js';

// Tier 1 = flavor (texture only), tier 2 = gameplay (effects/choices), tier 3 = crisis (rare, high impact).
// effect(state) applies immediately and returns a short outcome line.
// choices[].apply(state) does the same; choices[].disabled(state) greys the option out.
export const EVENTS = [
  // ---- TIER 1: flavor ----
  { id: 'stray-cat', tier: 1, weight: 3, text: 'A stray cat follows you for two blocks before giving up.' },
  { id: 'free-veg', tier: 1, weight: 3, text: 'Your neighbor leaves a box of free vegetables on the stoop.' },
  { id: 'fav-song', tier: 1, weight: 3, text: 'Your favorite song plays on the radio. You smile.' },
  { id: 'rainbow', tier: 1, weight: 2, text: 'A double rainbow arches over the city. You take a moment.' },
  { id: 'sunrise', tier: 1, weight: 2, text: 'The sunrise hits the brick just right this morning.' },

  // ---- TIER 2: gameplay ----
  { id: 'found-cash', tier: 2, weight: 3, text: 'You find $5 in an old jacket pocket.',
    effect: (s) => { s.cash += 5; return '+$5'; } },
  { id: 'free-coffee', tier: 2, weight: 3, text: 'Free coffee day at the corner cafe. You needed that.',
    effect: (s) => { s.stress -= 5; return '-5 stress'; } },
  { id: 'heatwave', tier: 2, weight: 2, text: 'Heatwave rolls in. Outdoor gigs cost +5 energy today.',
    effect: (s) => { s.eventOutdoorEnergyMod += 5; return 'Outdoor gigs +5 energy today'; } },
  { id: 'rainstorm', tier: 2, weight: 2, text: 'Sudden rainstorm! Travel is slower, but indoor clients pay a little extra.',
    effect: (s) => {
      s.eventTravelMod += 2;
      s.todayGigs.forEach((g) => { if (!g.outdoor) g.payout = Math.round(g.payout * 1.1); });
      return 'Travel +2 energy, indoor gigs +10% pay';
    } },
  { id: 'referral', tier: 2, weight: 2, text: 'A regular client refers you. A high-paying gig hits the board!',
    effect: (s) => { s.todayGigs.unshift(makeReferralGig(s)); return 'Referral gig added to listings'; } },
  { id: 'flat-tire', tier: 2, weight: 2, text: "Flat tire on the way out. The patch kit isn't free.",
    effect: (s) => { s.cash = Math.max(0, s.cash - 40); return '-$40'; } },
  { id: 'phone-dies', tier: 2, weight: 1, text: 'Your phone gives up completely. No listings until you get it working tonight.',
    effect: (s) => { s.listingsLockedToday = true; return 'Listings unavailable today'; } },
  { id: 'car-trouble', tier: 2, weight: 2, text: "Your car won't start. The mechanic quotes $150.",
    choices: [
      { text: 'Pay the mechanic ($150)', disabled: (s) => s.cash < 150,
        apply: (s) => { s.cash -= 150; return '-$150. At least it runs.'; } },
      { text: 'Take the bus today',
        apply: (s) => { s.eventTravelMod += 2; return 'Travel +2 energy today.'; } },
    ] },

  // ---- TIER 3: crisis ----
  { id: 'caught-cold', tier: 3, weight: 1, text: "That chill you ignored? It's a full-blown cold. You'll feel it for days.",
    effect: (s) => { s.coldDays = 3; s.health -= 10; return 'Sick: recovering for 3 days'; } },
  { id: 'dispute', tier: 3, weight: 1, text: 'A client disputes a payment. Part of your balance is frozen for 24 hours.',
    effect: (s) => {
      const hold = Math.min(100, Math.floor(s.cash));
      s.cash -= hold;
      s.heldCash = (s.heldCash || 0) + hold;
      return `-$${hold} held until tomorrow`;
    } },
  { id: 'eviction-notice', tier: 3, weight: 1, text: 'The landlord tapes a notice to your door: pay $300 today or it goes on your record.',
    choices: [
      { text: 'Pay $300 now', disabled: (s) => s.cash < 300,
        apply: (s) => { s.cash -= 300; return '-$300. Crisis averted.'; } },
      { text: 'Refuse to pay',
        apply: (s) => { s.reputation -= 0.5; return '-0.5 reputation. Word gets around.'; } },
    ] },
  { id: 'steady-offer', tier: 3, weight: 1, text: 'A former client offers a stretch of steady double-pay work. It means dropping everything else.',
    choices: [
      { text: 'Take the offer',
        apply: (s) => { s.doublePayDays = 3; return 'All gig payouts doubled for 3 days!'; } },
      { text: 'Stay independent',
        apply: (s) => { s.stress -= 3; return 'You keep your freedom. -3 stress.'; } },
    ] },
];

export function rollDailyEvents(state) {
  // Days 1-2 are a safe onboarding window: crisis events can't fire yet.
  const pool = state.day < 3 ? EVENTS.filter((e) => e.tier < 3) : EVENTS;
  const events = [];
  const roll = Math.random();
  if (roll < 0.30) return events;                      // 30%: no events
  if (roll < 0.70) events.push(pickWeighted(pool));    // 40%: 1 event
  else {                                               // 30%: 2 events
    const e1 = pickWeighted(pool);
    let e2 = pickWeighted(pool);
    while (e2.id === e1.id) e2 = pickWeighted(pool);
    events.push(e1, e2);
  }
  events.sort((a, b) => a.tier - b.tier);              // crisis always last
  return events;
}

function pickWeighted(pool) {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
  return pool[0];
}

// ---- Morning flavor ticker ----
const HEADLINES = [
  'City council debates gig worker protections.',
  'Local coffee shop hires only gig workers now.',
  'Study finds 1 in 3 gig workers skip meals to save money.',
  "New app promises better pay. You've heard that before.",
  'Neighborhood watch reports uptick in package thefts.',
  'Gas prices tick up again.',
  'A heat advisory is in effect for the afternoon.',
  'The city is testing a new bike lane on 5th Street.',
  'Your favorite food truck is on Main Street today.',
  'A local nonprofit offers free breakfast to workers.',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const TIPS = [
  'Tip: high stress makes quick-time events harder. Keep it under 70.',
  'Tip: build reputation (★) — creative gigs unlock at 2★, weird ones at 3★.',
  'Tip: upgrades pay for themselves. A Bike or Laptop early goes a long way.',
  'Tip: sketchy listings pay more, but the scam risk is real.',
  'Tip: feeling run down? A day of rest beats collapsing at zero.',
  'Tip: repeat clients (♥) pay 10% extra. Keep them happy.',
  'Tip: rainy days pull outdoor work off the board — plan around the weather.',
];

export function generateMorningFlavor(state, weather) {
  const lines = [pick(HEADLINES)];
  if (weather?.flavor) lines.push(weather.flavor);
  if (state.health < 30) lines.push('You feel run down. Rest recommended.');
  lines.push(TIPS[(state.day - 1) % TIPS.length]);
  if (state.cash < 200) lines.push(`Rent's due in ${Math.max(0, state.daysUntilBills)} days. You're stretched thin.`);
  if (state.reputation > 3) lines.push('A regular left you a 5-star review!');
  return lines.slice(0, 4);   // keep mornings snappy
}

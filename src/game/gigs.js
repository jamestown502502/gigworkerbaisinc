import { extraListings, weirdGigStars, payMultiplier, repeatClientBonus, twistDayMultiplier } from './twists.js';
import { creativeStars, backgroundPayMultiplier, clientStanding } from './depth.js';
import { CLIENT_NAMES } from './clients.js';

export const GIG_TEMPLATES = [
  { title: 'Help Move Furniture', type: 'physical', payout: [60, 120], hours: [2, 4], risk: [10, 30], location: 'okay', skillReq: 'strength', hasQTE: true, choiceTree: 'movingHelp', outdoor: true },
  { title: 'Yard Work — Leaves & Mowing', type: 'physical', payout: [40, 80], hours: [2, 3], risk: [5, 15], location: 'safe', skillReq: 'none', hasQTE: true, choiceTree: 'yardWork', outdoor: true },
  { title: 'Dog Walking — Energetic Husky', type: 'service', payout: [25, 50], hours: [1, 2], risk: [5, 20], location: 'safe', skillReq: 'none', hasQTE: true, choiceTree: 'dogWalking', outdoor: true },
  { title: 'Assemble IKEA Furniture', type: 'service', payout: [50, 100], hours: [2, 4], risk: [5, 10], location: 'okay', skillReq: 'tech', hasQTE: true, choiceTree: 'furnitureAssembly', outdoor: false },
  { title: 'Logo Design — Small Business', type: 'creative', payout: [80, 150], hours: [3, 5], risk: [15, 30], location: 'safe', skillReq: 'tech', hasQTE: true, choiceTree: 'creativeGig', outdoor: false },
  { title: 'Photography — Product Shots', type: 'creative', payout: [60, 120], hours: [2, 4], risk: [10, 25], location: 'okay', skillReq: 'tech', hasQTE: true, choiceTree: 'photoGig', outdoor: false },
  { title: 'Water Slide Tester', type: 'weird', payout: [80, 150], hours: [1, 3], risk: [5, 15], location: 'safe', skillReq: 'none', hasQTE: false, choiceTree: 'waterSlide', outdoor: true },
  { title: 'Professional Cuddler', type: 'weird', payout: [60, 80], hours: [1, 2], risk: [20, 40], location: 'okay', skillReq: 'social', hasQTE: false, choiceTree: 'cuddler', outdoor: false },
  { title: 'Mattress Tester — Hotel Review', type: 'weird', payout: [50, 100], hours: [6, 8], risk: [5, 10], location: 'safe', skillReq: 'none', hasQTE: false, choiceTree: 'mattressTest', outdoor: false },
  { title: 'Clean Out Garage', type: 'physical', payout: [50, 90], hours: [3, 4], risk: [10, 20], location: 'okay', skillReq: 'strength', hasQTE: true, choiceTree: 'garageClean', outdoor: true },
  { title: 'Tutoring — High School Math', type: 'service', payout: [30, 60], hours: [1, 2], risk: [5, 10], location: 'safe', skillReq: 'social', hasQTE: true, choiceTree: 'tutoring', outdoor: false },
  // Long-form jobs (2026-10-03): the payout is the guaranteed part; what you earn in the shift
  // itself (RUSH! / MARKET! in game/longform.js) lands on the receipt as extra lines.
  { title: 'Delivery Driver — Rush Shift', type: 'service', payout: [20, 30], hours: [3, 3], risk: [5, 10], location: 'okay', skillReq: 'none', hasQTE: true, choiceTree: 'rushShift', outdoor: true },
  { title: 'Flea Market Stall — Weekend', type: 'service', payout: [15, 25], hours: [4, 5], risk: [5, 10], location: 'safe', skillReq: 'social', hasQTE: true, choiceTree: 'marketDay', outdoor: true },
  { title: 'Mystery Shopping — Review Store', type: 'weird', payout: [40, 70], hours: [1, 2], risk: [5, 15], location: 'okay', skillReq: 'none', hasQTE: true, choiceTree: 'mysteryShop', outdoor: false },
];

const FLAVOR = {
  safe: ['Quiet residential street.', 'Sunny neighborhood, friendly faces.', 'Well-lit block near the park.'],
  okay: ['Busy part of town, keep your wits.', 'The address checks out... mostly.', 'A little out of the way, but fine.'],
  sketchy: ['The listing has three typos and no photo.', 'Cash only. No questions.', 'The neighbors are watching from windows.'],
};

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateDailyGigs(state) {
  const weather = state.weather;
  // Reputation gates gig types (PRD progression table)
  let pool = GIG_TEMPLATES.filter((t) => {
    if (t.type === 'creative') return state.reputation >= creativeStars(state) || state.hasLaptop;
    if (t.type === 'weird') return state.reputation >= weirdGigStars(state.twist);
    return true;
  });
  // Rainy days: all outdoor work is off the board — the pool visibly reshapes
  if (weather?.id === 'rainy') {
    const filtered = pool.filter((t) => !t.outdoor);
    if (filtered.length > 0) pool = filtered;
  }

  const count = (weather?.id === 'perfect' ? 8 : 6) + extraListings(state.twist, state.day);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const gigs = [];
  // Standing contracts due today go first (game/depth.js): a regular's booked job, no risk.
  for (const c of state.contracts || []) {
    if (c.nextDay !== state.day) continue;
    c.nextDay += c.every;
    const t = GIG_TEMPLATES.find((x) => x.title === c.title) || GIG_TEMPLATES[0];
    const g = instantiate(t, state);
    Object.assign(g, { title: `Contract: ${t.title}`, payout: c.payout, risk: 0, location: 'safe', client: c.client, isRepeat: true, clientReliability: 5, contract: true, standing: 'regular', description: `${c.client}'s standing booking, every ${c.every} days.` });
    gigs.push(g);
  }
  for (let i = 0; i < count; i++) {
    const t = shuffled[i % shuffled.length];
    gigs.push(instantiate(t, state));
  }
  return gigs;
}

function instantiate(t, state) {
  // 70% chance to keep template location, otherwise surprise
  const location = Math.random() < 0.7 ? t.location : pick(['safe', 'okay', 'sketchy']);
  let payout = randInt(t.payout[0], t.payout[1]);
  let risk = randInt(t.risk[0], t.risk[1]);
  if (location === 'sketchy') { payout = Math.round(payout * 1.2); risk += 10; }
  if (t.type === 'physical' && state.hasToolBelt) payout = Math.round(payout * 1.3);
  if (state.reputation >= 4) payout = Math.round(payout * 1.25);
  payout = Math.round(payout * payMultiplier(state.twist, t) * twistDayMultiplier(state, t) * backgroundPayMultiplier(state, t));

  // A client you let down twice stops hiring you; one you let down once pays less (depth.js).
  const hiring = CLIENT_NAMES.filter((n) => clientStanding(state, n) !== 'done');
  const client = pick(hiring.length ? hiring : CLIENT_NAMES);
  const standing = clientStanding(state, client);
  const isRepeat = state.repeatClients.includes(client);
  if (isRepeat) payout = Math.round(payout * repeatClientBonus(state.twist));
  if (standing === 'wary') payout = Math.round(payout * 0.9);

  return {
    title: t.title,
    type: t.type,
    payout,
    hours: randInt(t.hours[0], t.hours[1]),
    risk,
    location,
    skillReq: t.skillReq,
    hasQTE: t.hasQTE,
    choiceTree: t.choiceTree,
    outdoor: !!t.outdoor,
    clientReliability: randInt(1, 5),
    client,
    isRepeat,
    standing,
    description: pick(FLAVOR[location]),
    remote: t.type === 'creative' && state.hasLaptop,
  };
}

// High-paying bonus gig injected by the "referral" daily event.
export function makeReferralGig(state) {
  const t = pick(GIG_TEMPLATES);
  const gig = instantiate(t, state);
  gig.title = 'Referral: ' + gig.title;
  gig.payout = Math.round(gig.payout * 1.8);
  gig.risk = 5;
  gig.clientReliability = 5;
  gig.isRepeat = true;
  gig.description = 'Personally recommended. This one pays.';
  return gig;
}

// Weather's energy penalty/bonus for a specific gig (also shown on gig cards).
export function weatherGigEnergyMod(gig, weather) {
  if (!weather) return 0;
  if (weather.id === 'hot') return 3;
  if (weather.id === 'cold') return gig.outdoor ? 2 : 0;
  if (weather.id === 'rainy') return gig.outdoor ? 2 : 0;
  if (weather.id === 'perfect') return -2;
  return 0;
}

// Cost to actually do the gig (beyond travel)
export function gigEnergyCost(gig, state) {
  let cost = gig.hours * 3;
  if (gig.type === 'physical' && state.hasGloves) cost = Math.max(0, cost - 5);
  cost += weatherGigEnergyMod(gig, state.weather);
  if (gig.outdoor) cost += state.eventOutdoorEnergyMod || 0;
  if (state.hungry) cost *= 2;
  return Math.max(1, cost);
}

/** Gig types the New App counts toward its weekly streak. */
export const APP_GIGS = ['rushShift', 'dogWalking', 'mysteryShop'];

export function travelCost(gig, state) {
  if (gig.remote) return 0;
  let cost = state.energyPerTravel + (state.eventTravelMod || 0);
  if (state.hungry) cost *= 2;
  return cost;
}

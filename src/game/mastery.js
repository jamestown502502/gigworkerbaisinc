// Get good at something (2026-11-10). A job you do well, again and again, makes you better at it:
// it pays more, and at the top level a specialist version of the job starts turning up on the
// board. What you got good at becomes the month's title on the summary ("The Mover"), so two
// months played differently end as two different people.
//
// Pure rules. loop.js calls noteJobDone() from finishGig and masteryPay() for the receipt line;
// gigs.js calls specialistGig() when the day's board is rolled.

/** Good runs of a job needed for each level. Level 0 is everyone's first day. */
export const LEVEL_AT = [0, 2, 5];
export const LEVEL_NAMES = ['New', 'Steady', 'Pro'];
/** Extra pay per level, as a share of the listed pay. */
export const LEVEL_PAY = [0, 0.1, 0.2];

// One trade per job (keyed by the job's choice tree): what the board calls it, the title it earns
// on the summary, and the specialist job a Pro gets offered.
export const TRADES = {
  movingHelp:        { trade: 'Moving',        title: 'The Mover',        specialist: 'Piano Move — Third Floor' },
  yardWork:          { trade: 'Yard work',     title: 'The Groundskeeper', specialist: 'Storm Cleanup — Whole Street' },
  dogWalking:        { trade: 'Dog walking',   title: 'The Dog Whisperer', specialist: 'Pack Walk — Six Dogs' },
  furnitureAssembly: { trade: 'Assembly',      title: 'The Builder',      specialist: 'Office Fit-Out — Twelve Desks' },
  creativeGig:       { trade: 'Design',        title: 'The Designer',     specialist: 'Brand Refresh — Local Chain' },
  photoGig:          { trade: 'Photography',   title: 'The Photographer', specialist: 'Catalog Shoot — Forty Products' },
  waterSlide:        { trade: 'Inspection',    title: 'The Inspector',    specialist: 'Park Opening — Full Inspection' },
  cuddler:           { trade: 'Care work',     title: 'The Steady Hand',  specialist: 'Care Home Visit — Afternoon' },
  mattressTest:      { trade: 'Reviewing',     title: 'The Reviewer',     specialist: 'Hotel Chain — Three Rooms' },
  garageClean:       { trade: 'Clear-outs',    title: 'The Organizer',    specialist: 'Estate Clear-Out — Whole House' },
  tutoring:          { trade: 'Tutoring',      title: 'The Tutor',        specialist: 'Exam Week — Group Session' },
  rushShift:         { trade: 'Delivery',      title: 'The Courier',      specialist: 'Catering Run — Downtown' },
  marketDay:         { trade: 'Selling',       title: 'The Trader',       specialist: 'Antique Fair — Corner Stall' },
  mysteryShop:       { trade: 'Auditing',      title: 'The Auditor',      specialist: 'Store Audit — Flagship' },
};

export function levelFor(goodRuns) {
  let lvl = 0;
  for (let i = 0; i < LEVEL_AT.length; i++) if (goodRuns >= LEVEL_AT[i]) lvl = i;
  return lvl;
}

/** The player's level in a job (by choice tree). Saves from before mastery read as level 0. */
export function masteryLevel(state, tree) {
  return levelFor((state.mastery || {})[tree] || 0);
}

/** Good runs still needed for the next level, or 0 at the top. */
export function runsToNext(state, tree) {
  const n = (state.mastery || {})[tree] || 0;
  const next = LEVEL_AT[levelFor(n) + 1];
  return next === undefined ? 0 : next - n;
}

/** Extra dollars a job pays for the level the player already holds in it. */
export function masteryPay(state, gig) {
  return Math.round(gig.payout * LEVEL_PAY[masteryLevel(state, gig.choiceTree)]);
}

/** Record a finished job. Only a job done well counts. Returns the level-up, if this one made it:
 *  { trade, level, name } so the receipt can say so. */
export function noteJobDone(state, gig, wentWell) {
  if (!wentWell || !TRADES[gig.choiceTree]) return null;
  state.mastery = state.mastery || {};
  const before = masteryLevel(state, gig.choiceTree);
  state.mastery[gig.choiceTree] = (state.mastery[gig.choiceTree] || 0) + 1;
  const after = masteryLevel(state, gig.choiceTree);
  return after > before ? { trade: TRADES[gig.choiceTree].trade, level: after, name: LEVEL_NAMES[after] } : null;
}

/** A Pro's specialist job for today, or null. At most one a day, on every third day per trade so
 *  it stays an event; it pays 60% over the ordinary job and comes with no scam risk (they asked
 *  for you by name). `make(template)` builds an ordinary listing for a template title. */
export function specialistGig(state, templates, make) {
  const pros = Object.keys(TRADES).filter((t) => masteryLevel(state, t) >= 2);
  if (!pros.length) return null;
  const tree = pros[state.day % pros.length];
  if ((state.day + pros.indexOf(tree)) % 3 !== 0) return null;
  const template = templates.find((t) => t.choiceTree === tree);
  if (!template) return null;
  const g = make(template);
  return { ...g, title: `Specialist: ${TRADES[tree].specialist}`, payout: Math.round(g.payout * 1.6), risk: 0, location: 'safe', clientReliability: 5, specialist: true, description: 'They asked for you by name.' };
}

/** Who the month made you: the trade you took furthest, or a generalist's title. */
export function monthTitle(state) {
  const m = state.mastery || {};
  const ranked = Object.keys(m).filter((t) => TRADES[t]).sort((a, b) => m[b] - m[a]);
  if (!ranked.length || m[ranked[0]] < LEVEL_AT[1]) return { title: 'The Newcomer', line: 'No trade yet: a job done well twice starts one.' };
  const top = ranked[0];
  const steady = ranked.filter((t) => levelFor(m[t]) >= 1);
  if (levelFor(m[top]) < 2 && steady.length >= 4) return { title: 'Jack of All Trades', line: `Steady at ${steady.length} trades, master of none. Yet.` };
  return { title: TRADES[top].title, line: `${TRADES[top].trade}: ${LEVEL_NAMES[levelFor(m[top])]}, ${m[top]} jobs done well.` };
}

/** Every trade the player has started, best first, for the summary. */
export function tradeList(state) {
  const m = state.mastery || {};
  return Object.keys(m).filter((t) => TRADES[t] && m[t] > 0).sort((a, b) => m[b] - m[a])
    .map((t) => ({ tree: t, trade: TRADES[t].trade, runs: m[t], level: levelFor(m[t]), name: LEVEL_NAMES[levelFor(m[t])] }));
}

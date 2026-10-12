// What a job really paid (publisher polish 2026-10-12): the one place the game turns a receipt into
// "kept after costs" and "per hour". The results receipt, the job card estimate and the month's
// math all call it, so the three can never disagree. Nothing here changes a payout: it only reads
// the receipt lines finishGig() already wrote (game/loop.js).
//
// Costs are the money the job took out of your own pocket: spending on the job, gas and wear on a
// delivery shift, thrift stock at the market. A pay cut or a client who short-changed you is not a
// cost you paid; it is pay you did not get, and stays in the receipt as its own line.
const COST_LINE = /^(Spent on the job|Gas and wear|Thrift stock)/;

/** Dollars per hour, exact (the month's math shows cents). 0 for no hours. */
export function perHourOf(dollars, hours) {
  return hours > 0 ? dollars / hours : 0;
}

/** A finished gig's receipt: what it paid before your costs, what the costs were, what you kept,
 *  and what that is per hour of the gig's hours. */
export function netFor(items, hours) {
  const kept = items.reduce((a, i) => a + i.amount, 0);
  const costs = items.filter((i) => i.amount < 0 && COST_LINE.test(i.label)).reduce((a, i) => a - i.amount, 0);
  return { paid: kept + costs, costs, kept, hours, perHour: Math.round(perHourOf(kept, hours)) };
}

/** A job card's honest estimate: per hour IF it pays as listed. Never a promise. */
export function listingRate(gig) {
  return Math.round(perHourOf(gig.payout, gig.hours));
}

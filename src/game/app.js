// The app plays you (2026-11-10). Real gig apps talk to their workers in game language: quests,
// streaks, surge, priority. Each one is a nudge toward more hours, and whether a nudge is worth
// taking is a sum the app never shows. This is the job board's own app ("Hustl") doing the same
// four things, every month, with the sum shown at the end.
//
//   APP PICK   one listing a day is "picked for you": always the longest job on the board.
//   STREAK     take the pick three days running for a bonus; skip a day and it resets.
//   PRIORITY   work two days without taking the pick and tomorrow's board is one listing shorter,
//              until you take one again.
//   SURGE      one listing a day pays 30% more: always the one that paid the least per hour.
//   QUEST      a weekly job count for a bonus, all or nothing, and the bar rises every week.
//
// None of it is random, so the board and the balance tests stay reproducible. Pure rules: gigs.js
// calls markOffers() when the board is rolled, loop.js calls noteAppJob() from finishGig,
// appNight() from sleep, and appWeekEnd() when the week wraps.
import { listingRate } from './pay.js';

export const APP_NAME = 'Hustl';
export const STREAK_LENGTH = 3;
export const STREAK_BONUS = 30;
export const SURGE = 1.3;
/** Jobs to finish in the week, and the bonus for it. The bar rises every week. */
export const QUESTS = [{ jobs: 10, bonus: 40 }, { jobs: 14, bonus: 60 }, { jobs: 17, bonus: 80 }, { jobs: 20, bonus: 100 }];

const fresh = () => ({ streak: 0, lastPickDay: 0, missed: 0, priorityDrop: false, questPaidWeek: 0,
  bonus: 0, streaksHit: 0, questsHit: 0, questsMissed: 0, pickJobs: 0, pickHours: 0, pickPay: 0, otherHours: 0, otherPay: 0, surgeJobs: 0, dropDays: 0 });

/** The run's app record. Saves from before the app existed start one. */
export function appOf(state) {
  if (!state.app) state.app = fresh();
  return state.app;
}

export function questFor(state) {
  return QUESTS[Math.min(QUESTS.length, Math.max(1, state.weekNumber || 1)) - 1];
}

/** The week's quest as the board shows it. */
export function questStatus(state) {
  const q = questFor(state);
  const done = state.weekStats?.gigsDone || 0;
  const paid = appOf(state).questPaidWeek === (state.weekNumber || 1);
  return { ...q, done: Math.min(done, q.jobs), left: Math.max(0, q.jobs - done), paid };
}

/** Mark today's board: the pick, the surge, and a listing removed while priority is dropped.
 *  Contracts, specialist jobs and story jobs are the player's own and are never touched. */
export function markOffers(state, gigs) {
  const app = appOf(state);
  const open = gigs.filter((g) => !g.contract && !g.specialist);
  if (app.priorityDrop && open.length > 3) {
    gigs.splice(gigs.indexOf(open[open.length - 1]), 1);
    open.pop();
  }
  if (open.length < 2) return gigs;
  // The pick keeps you on the clock longest; ties go to the one that pays least per hour.
  const pick = open.reduce((a, g) => (g.hours > a.hours || (g.hours === a.hours && listingRate(g) < listingRate(a)) ? g : a));
  pick.appPick = true;
  // Surge goes where nobody wants to go: the lowest pay per hour of what is left.
  const rest = open.filter((g) => g !== pick);
  const surge = rest.reduce((a, g) => (listingRate(g) < listingRate(a) ? g : a));
  surge.surge = true;
  surge.basePayout = surge.payout;
  surge.payout = Math.round(surge.payout * SURGE);
  return gigs;
}

/** A finished job, for the app's books. Returns receipt lines for any bonus it just earned. */
export function noteAppJob(state, gig, kept) {
  const app = appOf(state);
  const lines = [];
  if (gig.surge) app.surgeJobs += 1;
  if (gig.appPick) {
    app.pickJobs += 1; app.pickHours += gig.hours; app.pickPay += kept;
    if (app.lastPickDay !== state.day) {
      app.streak = app.lastPickDay === state.day - 1 || app.streak === 0 ? app.streak + 1 : 1;
      app.lastPickDay = state.day;
      app.missed = 0;
      app.priorityDrop = false;
      if (app.streak % STREAK_LENGTH === 0) {
        lines.push({ label: `${APP_NAME} streak: ${STREAK_LENGTH} picks in a row`, amount: STREAK_BONUS });
        app.streaksHit += 1;
      }
    }
  } else {
    app.otherHours += gig.hours; app.otherPay += kept;
  }
  // The quest pays the moment the count is reached, once a week. gigsDone has not been raised
  // for this job yet when finishGig calls this, hence the + 1.
  const q = questFor(state);
  const week = state.weekNumber || 1;
  if (app.questPaidWeek !== week && (state.weekStats?.gigsDone || 0) + 1 >= q.jobs) {
    app.questPaidWeek = week;
    app.questsHit += 1;
    lines.push({ label: `${APP_NAME} quest: ${q.jobs} jobs this week`, amount: q.bonus });
  }
  for (const l of lines) app.bonus += l.amount;
  return lines;
}

/** Night falls. A day you worked without taking the pick is a miss; two in a row drop your
 *  priority. Returns a line for the morning when the priority has just dropped. */
export function appNight(state, jobsToday) {
  const app = appOf(state);
  if (app.priorityDrop) app.dropDays += 1;
  if (app.lastPickDay === state.day || jobsToday === 0) return '';
  app.streak = 0;
  app.missed += 1;
  if (app.missed >= 2 && !app.priorityDrop) {
    app.priorityDrop = true;
    return `${APP_NAME}: "Your priority dropped." One fewer listing until you take an App Pick.`;
  }
  return '';
}

/** The week wraps: a quest not reached pays nothing, however close it was. */
export function appWeekEnd(state) {
  const app = appOf(state);
  const q = questStatus(state);
  if (q.paid) return '';
  app.questsMissed += 1;
  return q.done > 0 ? `${APP_NAME} quest missed by ${q.left} job${q.left === 1 ? '' : 's'}: no bonus.` : '';
}

/** What the app's offers really paid, for the month in review. */
export function appReport(state) {
  const a = appOf(state);
  const rate = (pay, hours) => (hours > 0 ? pay / hours : 0);
  const pickRate = rate(a.pickPay, a.pickHours), otherRate = rate(a.otherPay, a.otherHours);
  const lines = [];
  lines.push(a.bonus > 0
    ? `${APP_NAME}'s bonuses paid you $${a.bonus} this month: ${a.streaksHit} streak${a.streaksHit === 1 ? '' : 's'} and ${a.questsHit} quest${a.questsHit === 1 ? '' : 's'}.`
    : `${APP_NAME}'s bonuses paid you nothing this month.`);
  if (a.questsMissed > 0) lines.push(`${a.questsMissed} quest${a.questsMissed === 1 ? '' : 's'} missed. A quest pays all or nothing, so the jobs you did toward it earned no bonus at all.`);
  if (a.pickHours > 0 && a.otherHours > 0) {
    lines.push(`The jobs the app picked for you paid $${pickRate.toFixed(2)} an hour. The jobs you picked yourself paid $${otherRate.toFixed(2)}.`);
    if (a.bonus > 0 || pickRate < otherRate) {
      const withBonus = rate(a.pickPay + a.streaksHit * STREAK_BONUS, a.pickHours);
      lines.push(withBonus >= otherRate
        ? `With the streak bonus counted, the picks came to $${withBonus.toFixed(2)} an hour: this month the streak was worth chasing.`
        : `Even with the streak bonus counted, the picks came to $${withBonus.toFixed(2)} an hour: the streak cost you more than it paid.`);
    }
  } else if (a.pickHours === 0) {
    lines.push('You never took an App Pick. The app always picks the longest job on the board, not the best paid.');
  }
  if (a.surgeJobs > 0) lines.push(`You took ${a.surgeJobs} surge job${a.surgeJobs === 1 ? '' : 's'}. Surge goes on the listing that paid least per hour, so check the hourly figure, not the badge.`);
  if (a.dropDays > 0) lines.push(`Your priority was dropped for ${a.dropDays} day${a.dropDays === 1 ? '' : 's'}: fewer listings, for choosing your own jobs.`);
  return { lines, bonus: a.bonus, pickRate, otherRate };
}

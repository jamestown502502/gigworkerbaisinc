// The app plays you (game/app.js, 2026-11-10): the pick, the streak, priority, surge and the
// weekly quest, and the sum of what they paid at the end of the month.
import { describe, it, expect } from 'vitest';
import { makeGame, withRandom } from './helpers.js';
import { generateDailyGigs } from '../../src/game/gigs.js';
import { listingRate } from '../../src/game/pay.js';
import { markOffers, noteAppJob, appNight, appWeekEnd, appReport, appOf, questFor, questStatus, QUESTS, STREAK_BONUS, STREAK_LENGTH, SURGE } from '../../src/game/app.js';

const g = (title, payout, hours, over = {}) => ({ title, payout, hours, choiceTree: 'yardWork', type: 'physical', ...over });
const board = () => [g('A', 100, 2), g('B', 60, 4), g('C', 40, 1), g('D', 30, 3), g('E', 90, 3)];
const st = (over = {}) => ({ day: 1, weekNumber: 1, weekStats: { gigsDone: 0 }, ...over });

describe('the board the app shows you', () => {
  it('the pick is always the longest job, never the best paid', () => {
    const gigs = markOffers(st(), board());
    const pick = gigs.find((x) => x.appPick);
    expect(pick.title).toBe('B');
    expect(gigs.filter((x) => x.appPick).length).toBe(1);
    expect(listingRate(pick)).toBeLessThan(Math.max(...gigs.map(listingRate)));
  });
  it('surge lands on the lowest pay per hour of the rest, and its old price is kept', () => {
    const gigs = markOffers(st(), board());
    const surge = gigs.find((x) => x.surge);
    expect(surge.title).toBe('D');
    expect(surge.basePayout).toBe(30);
    expect(surge.payout).toBe(Math.round(30 * SURGE));
    expect(gigs.filter((x) => x.surge).length).toBe(1);
    expect(surge.appPick).toBeUndefined();
  });
  it('contracts and specialist jobs are yours: the app never marks or removes them', () => {
    const s = st(); appOf(s).priorityDrop = true;
    const gigs = markOffers(s, [g('Contract', 80, 9, { contract: true }), g('Special', 200, 8, { specialist: true }), ...board()]);
    expect(gigs.find((x) => x.contract).appPick).toBeUndefined();
    expect(gigs.find((x) => x.specialist).surge).toBeUndefined();
    expect(gigs.length).toBe(6);                       // one ordinary listing gone
    expect(gigs.some((x) => x.contract) && gigs.some((x) => x.specialist)).toBe(true);
  });
  it('a real day’s board carries exactly one pick and one surge', () => {
    const { state } = makeGame();
    const gigs = withRandom([0.3, 0.7, 0.1, 0.9, 0.5], () => generateDailyGigs(state));
    expect(gigs.filter((x) => x.appPick).length).toBe(1);
    expect(gigs.filter((x) => x.surge).length).toBe(1);
  });
});

describe('the streak and the priority drop', () => {
  it('three picks on three days in a row pay the bonus once; a second pick the same day does not count', () => {
    const s = st();
    const pick = g('B', 60, 4, { appPick: true });
    expect(noteAppJob(s, pick, 60)).toEqual([]);
    expect(noteAppJob(s, pick, 60)).toEqual([]);          // same day
    expect(appOf(s).streak).toBe(1);
    s.day = 2; expect(noteAppJob(s, pick, 60)).toEqual([]);
    s.day = 3;
    const lines = noteAppJob(s, pick, 60);
    expect(lines.length).toBe(1);
    expect(lines[0].amount).toBe(STREAK_BONUS);
    expect(appOf(s).bonus).toBe(STREAK_BONUS);
  });
  it('a worked day without the pick resets the streak; a day off does not', () => {
    const s = st();
    noteAppJob(s, g('B', 60, 4, { appPick: true }), 60);
    appNight(s, 1);
    s.day = 2;
    expect(appNight(s, 0)).toBe('');                    // stayed home: no miss
    expect(appOf(s).streak).toBe(1);
    s.day = 3;
    noteAppJob(s, g('A', 100, 2), 100);
    appNight(s, 1);                                      // worked, skipped the pick
    expect(appOf(s).streak).toBe(0);
    expect(appOf(s).missed).toBe(1);
  });
  it('two worked days without the pick drop priority, and one pick restores it', () => {
    const s = st();
    expect(appNight(s, 2)).toBe('');
    s.day = 2;
    expect(appNight(s, 2)).toMatch(/priority dropped/);
    expect(appOf(s).priorityDrop).toBe(true);
    expect(markOffers(s, board()).length).toBe(4);
    s.day = 3;
    noteAppJob(s, g('B', 60, 4, { appPick: true }), 60);
    expect(appOf(s).priorityDrop).toBe(false);
    expect(markOffers(s, board()).length).toBe(5);
  });
  it('a dropped board never falls under three listings', () => {
    const s = st(); appOf(s).priorityDrop = true;
    expect(markOffers(s, board().slice(0, 3)).length).toBe(3);
  });
});

describe('the weekly quest', () => {
  it('the bar rises every week', () => {
    const jobs = [1, 2, 3, 4, 5].map((w) => questFor({ weekNumber: w }).jobs);
    expect(jobs).toEqual([QUESTS[0].jobs, QUESTS[1].jobs, QUESTS[2].jobs, QUESTS[3].jobs, QUESTS[3].jobs]);
    expect(jobs[1]).toBeGreaterThan(jobs[0]);
  });
  it('pays once, on the job that reaches the count', () => {
    const s = st({ weekStats: { gigsDone: QUESTS[0].jobs - 2 } });
    expect(noteAppJob(s, g('A', 100, 2), 100)).toEqual([]);
    s.weekStats.gigsDone += 1;
    const lines = noteAppJob(s, g('A', 100, 2), 100);
    expect(lines[0].amount).toBe(QUESTS[0].bonus);
    s.weekStats.gigsDone += 1;
    expect(noteAppJob(s, g('A', 100, 2), 100)).toEqual([]);
    expect(questStatus(s).paid).toBe(true);
    expect(appWeekEnd(s)).toBe('');
  });
  it('one job short pays nothing, and the week says so', () => {
    const s = st({ weekStats: { gigsDone: QUESTS[0].jobs - 1 } });
    expect(appWeekEnd(s)).toMatch(/missed by 1 job: no bonus/);
    expect(appOf(s).questsMissed).toBe(1);
    expect(appOf(s).bonus).toBe(0);
  });
});

describe('what the app paid', () => {
  it('compares the picks with your own choices, with and without the bonus', () => {
    const s = st();
    for (let d = 1; d <= 3; d++) { s.day = d; noteAppJob(s, g('B', 40, 4, { appPick: true }), 40); noteAppJob(s, g('A', 100, 2), 100); }
    const r = appReport(s);
    expect(r.pickRate).toBe(10);
    expect(r.otherRate).toBe(50);
    expect(r.bonus).toBe(STREAK_BONUS);
    expect(r.lines.join(' ')).toMatch(/picked for you paid \$10\.00 an hour/);
    expect(r.lines.join(' ')).toMatch(/cost you more than it paid/);
  });
  it('two months played differently read differently', () => {
    const chaser = st(), chooser = st();
    for (let d = 1; d <= 6; d++) {
      chaser.day = d; noteAppJob(chaser, g('B', 60, 4, { appPick: true }), 60); appNight(chaser, 1);
      chooser.day = d; noteAppJob(chooser, g('A', 100, 2), 100); appNight(chooser, 1);
    }
    expect(appOf(chaser).streaksHit).toBe(Math.floor(6 / STREAK_LENGTH));
    expect(appOf(chooser).dropDays).toBeGreaterThan(0);
    expect(appReport(chaser).lines.join(' ')).not.toBe(appReport(chooser).lines.join(' '));
    expect(appReport(chooser).lines.join(' ')).toMatch(/never took an App Pick/);
  });
  it('in the real loop a finished pick lands on the receipt and in the books', () => {
    const { game, state } = makeGame();
    appOf(state).streak = 2; appOf(state).lastPickDay = state.day - 1;
    game.currentGig = { title: 'Yard Work — Leaves & Mowing', type: 'physical', payout: 60, hours: 4, risk: 0, location: 'safe', choiceTree: 'yardWork', client: 'Ana', clientReliability: 5, outdoor: true, appPick: true };
    game.snapshot = { cash: state.cash, stress: state.stress, rep: state.reputation, energy: state.energy };
    game.outcomeTexts = [];
    withRandom([0.99], () => game.finishGig(null));
    expect(game.results.items.some((i) => /streak/.test(i.label) && i.amount === STREAK_BONUS)).toBe(true);
    expect(appOf(state).pickHours).toBe(4);
  });
});

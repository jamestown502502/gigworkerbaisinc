// Upgrade round 2026-11-10: skill levels (game/mastery.js), month types and surprise costs
// (game/month.js), the board's sort and best-per-hour badge, and the five-hint tutorial.
import { describe, it, expect } from 'vitest';
import { makeGame, withRandom } from './helpers.js';
import { GIG_TEMPLATES, generateDailyGigs, travelCost } from '../../src/game/gigs.js';
import { levelFor, masteryLevel, masteryPay, noteJobDone, monthTitle, specialistGig, runsToNext, TRADES, LEVEL_AT } from '../../src/game/mastery.js';
import { MONTH_TYPES, monthTypeOf, rentSurcharge, applyMonthStart, surpriseFor, surpriseCard, SURPRISES, SURPRISE_DAYS, billsMeter, tickMonth } from '../../src/game/month.js';
import { sortedListings, bestPerHour } from '../../src/ui/listings.js';
import { TUTORIAL_STEPS } from '../../src/ui/tutorial.js';
import { RENT } from '../../src/game/loop.js';

const gig = (over = {}) => ({ title: 'Help Move Furniture', type: 'physical', payout: 100, hours: 2, risk: 0, location: 'safe', choiceTree: 'movingHelp', client: 'Ana', clientReliability: 5, hasQTE: true, outdoor: true, ...over });

function finish(game, state) {
  game.currentGig = gig();
  game.snapshot = { cash: state.cash, stress: state.stress, rep: state.reputation, energy: state.energy };
  game.outcomeTexts = [];
  withRandom([0.99], () => game.finishGig(null));
}

describe('skill levels', () => {
  it('every job on the board has a trade, a title and a specialist job', () => {
    for (const t of GIG_TEMPLATES) {
      const tr = TRADES[t.choiceTree];
      expect(tr, t.title).toBeTruthy();
      expect(tr.title.length).toBeGreaterThan(3);
      expect(tr.specialist.length).toBeGreaterThan(3);
    }
  });
  it('levels come at 2 and 5 good runs, and only good runs count', () => {
    expect([0, 1, 2, 4, 5, 9].map(levelFor)).toEqual([0, 0, 1, 1, 2, 2]);
    const s = { mastery: {} };
    expect(noteJobDone(s, gig(), false)).toBeNull();
    expect(s.mastery.movingHelp).toBeUndefined();
    expect(noteJobDone(s, gig(), true)).toBeNull();
    expect(runsToNext(s, 'movingHelp')).toBe(1);
    expect(noteJobDone(s, gig(), true)).toEqual({ trade: 'Moving', level: 1, name: 'Steady' });
  });
  it('a level pays more on the receipt, as its own line, on the next job', () => {
    const { game, state } = makeGame({ mastery: { movingHelp: LEVEL_AT[1] } });
    finish(game, state);
    const line = game.results.items.find((i) => /Steady at moving/.test(i.label));
    expect(line.amount).toBe(10);
    expect(masteryPay(state, gig())).toBe(10);
  });
  it('the fifth good run says so and a specialist job comes up once in three days', () => {
    const { game, state } = makeGame({ mastery: { movingHelp: 4 } });
    finish(game, state);
    expect(masteryLevel(state, 'movingHelp')).toBe(2);
    expect(game.results.outcomeTexts.join(' ')).toMatch(/Level up: Pro at moving/);
    const days = [1, 2, 3].map((d) => specialistGig({ ...state, day: d }, GIG_TEMPLATES, () => gig()));
    const special = days.find(Boolean);
    expect(special.title).toMatch(/^Specialist: Piano Move/);
    expect(special.payout).toBe(160);
    expect(special.risk).toBe(0);
    expect(days.filter(Boolean).length).toBe(1);
  });
  it('no specialist job without a Pro trade, so a fresh run rolls the board as before', () => {
    expect(specialistGig({ day: 3, mastery: { movingHelp: 4 } }, GIG_TEMPLATES, () => gig())).toBeNull();
  });
  it('the month title names what you took furthest: different months, different titles', () => {
    expect(monthTitle({ mastery: {} }).title).toBe('The Newcomer');
    expect(monthTitle({ mastery: { movingHelp: 6, tutoring: 2 } }).title).toBe('The Mover');
    expect(monthTitle({ mastery: { tutoring: 5, movingHelp: 1 } }).title).toBe('The Tutor');
    expect(monthTitle({ mastery: { movingHelp: 2, tutoring: 2, dogWalking: 3, yardWork: 2 } }).title).toBe('Jack of All Trades');
  });
});

describe('month types', () => {
  it('Steady is the game as it shipped: same rent, same cash, no surprises', () => {
    const s = { monthType: 'steady', day: 4, weekStats: {} };
    expect(rentSurcharge(s)).toBe(0);
    applyMonthStart(s);
    expect(s.cash).toBe(200);
    for (const d of SURPRISE_DAYS) expect(surpriseFor({ ...s, day: d })).toBeNull();
    expect(monthTypeOf({}).id).toBe('steady');   // a save from before month types
  });
  it('Tight and Brutal raise the rent everywhere the rent is read', () => {
    for (const [id, extra] of [['tight', 150], ['brutal', 300]]) {
      const { game } = makeGame({ monthType: id, cash: 2000, daysUntilBills: 0 });
      expect(game.rentEarlyAmount()).toBe(RENT + extra);
      game.goEvening();
      expect(game.billAmount('rent')).toBe(RENT + extra);
      game.closeBills();
      expect(game.state.unpaidRent).toBe(RENT + extra);
    }
  });
  it('one surprise a week, never the same one twice, and Brutal costs half as much again', () => {
    const s = { monthType: 'tight', runNumber: 1, surprisesSeen: [], cash: 500, energy: 80, hoursLeft: 12, stress: 0, health: 100, unpaidRent: 0, monthMath: {} };
    const seen = [];
    for (const d of SURPRISE_DAYS) {
      const card = surpriseCard({ ...s, day: d, surprisesSeen: seen.slice() });
      expect(card.choices.length).toBe(3);
      const id = card.id.replace('surprise-', '');
      expect(seen).not.toContain(id);
      seen.push(id);
    }
    expect([1, 2, 3, 5, 10].map((d) => surpriseFor({ ...s, day: d }))).toEqual([null, null, null, null, null]);
    const t = surpriseFor({ ...s, day: 4 }), b = surpriseFor({ ...s, day: 4, monthType: 'brutal' });
    expect(b.pay).toBe(Math.round(t.pay * 1.5));
  });
  it('every way out of a surprise costs something, and paying is off when you cannot', () => {
    const snap = (s) => JSON.stringify([s.cash, s.energy, s.hoursLeft, s.stress, s.health, s.unpaidRent, s.walkDays, s.fewerListingsDays]);
    for (const x of SURPRISES) {
      const base = () => ({ monthType: 'tight', day: 4, runNumber: 1, surprisesSeen: SURPRISES.filter((y) => y.id !== x.id).map((y) => y.id), cash: 500, energy: 80, hoursLeft: 12, stress: 10, health: 100, unpaidRent: 0, monthMath: {} });
      for (let i = 0; i < 3; i++) {
        const s = base();
        const before = snap(s);
        const choice = surpriseCard(s).choices[i];
        expect(choice.text.length, choice.text).toBeLessThanOrEqual(36);   // fits the card's button
        expect(typeof choice.apply(s)).toBe('string');
        expect(snap(s), `${x.id} choice ${i}`).not.toBe(before);
        expect(s.surprisesSeen).toContain(x.id);
      }
      const broke = { ...base(), cash: 0 };
      expect(surpriseCard(broke).choices[0].disabled(broke)).toBe(true);
      expect(surpriseCard(broke).choices[2].disabled).toBeUndefined();   // putting it off is always possible
    }
  });
  it('put-off penalties bite for three days, then end', () => {
    const { state } = makeGame({ walkDays: 3, walkExtra: 3, fewerListingsDays: 3, fewerListings: 2 });
    const base = travelCost(gig(), { ...state, walkDays: 0 });
    expect(travelCost(gig(), state)).toBe(base + 3);
    const full = withRandom([0.5], () => generateDailyGigs({ ...state, fewerListingsDays: 0 }).length);
    expect(withRandom([0.5], () => generateDailyGigs(state).length)).toBe(full - 2);
    tickMonth(state); tickMonth(state); tickMonth(state);
    expect(travelCost(gig(), state)).toBe(base);
  });
  it('the bills ring fills with cash and never passes full', () => {
    expect(billsMeter(0, 690)).toEqual({ share: 0, short: 690 });
    expect(billsMeter(345, 690).share).toBeCloseTo(0.5);
    expect(billsMeter(900, 690)).toEqual({ share: 1, short: 0 });
    expect(billsMeter(50, 0).share).toBe(1);
  });
  it('there are three month types and each says what it changes', () => {
    expect(MONTH_TYPES.map((m) => m.id)).toEqual(['steady', 'tight', 'brutal']);
    for (const m of MONTH_TYPES) expect(m.text).toMatch(/\$\d+/);
  });
  it('the harder months pay less per job: the board shows it', () => {
    const pay = (monthType) => withRandom([0.5], () => generateDailyGigs({ ...makeGame({ monthType }).state }).reduce((x, g) => x + g.payout, 0));
    const steady = pay('steady');
    expect(pay('tight') / steady).toBeCloseTo(0.5, 1);
    expect(pay('brutal') / steady).toBeCloseTo(0.4, 1);
  });
});

describe('the job board', () => {
  const a = gig({ title: 'A', payout: 100, hours: 4 }), b = gig({ title: 'B', payout: 60, hours: 1 }), c = gig({ title: 'C', payout: 90, hours: 3 });
  it('sorting is a view: the saved order is untouched', () => {
    const list = [a, b, c];
    expect(sortedListings(list, 'rate').map((g) => g.title)).toEqual(['B', 'C', 'A']);
    expect(sortedListings(list, 'pay').map((g) => g.title)).toEqual(['A', 'C', 'B']);
    expect(sortedListings(list, 'short').map((g) => g.title)).toEqual(['B', 'C', 'A']);
    expect(sortedListings(list, 'board')).toBe(list);
    expect(list.map((g) => g.title)).toEqual(['A', 'B', 'C']);
  });
  it('the badge goes to the best pay per hour you can actually take', () => {
    expect(bestPerHour([a, b, c], () => true)).toBe(b);
    expect(bestPerHour([a, b, c], (g) => g !== b)).toBe(c);
    expect(bestPerHour([a, b, c], (g) => g === a)).toBeNull();
  });
});

describe('the first job comes fast', () => {
  it('five hints, none longer than 20 words, one per screen it is about', () => {
    expect(TUTORIAL_STEPS.length).toBe(5);
    for (const st of TUTORIAL_STEPS) expect(st.text.split(/\s+/).length, st.text).toBeLessThanOrEqual(20);
    expect(TUTORIAL_STEPS.map((s) => s.phase)).toEqual(['MORNING', 'BROWSE', 'GIG', 'EVENING', 'EVENING']);
  });
});

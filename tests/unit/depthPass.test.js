// Depth pass (2026-10-07): systems that interact, from an outside design critique.
import { describe, it, expect } from 'vitest';
import { makeGame, withRandom } from './helpers.js';
import { GameState } from '../../src/engine/state.js';
import { Game, RENT, PHONE, FOOD, resultHold } from '../../src/game/loop.js';
import { BACKGROUNDS, backgroundsOpen, applyBackgroundStart, creativeStars, clientStanding, clientMorningOffer, rentForecast, monthInsights, daysToEviction } from '../../src/game/depth.js';
import { generateDailyGigs, GIG_TEMPLATES } from '../../src/game/gigs.js';
import { rememberClient } from '../../src/game/clients.js';
import { isWeekend, extraListings, twistDayMultiplier } from '../../src/game/twists.js';
import { PackTheCar, SortReturns, RakeThePile, binFor, variantFor, LESSONS } from '../../src/game/microgames.js';
import { apartmentProps } from '../../src/ui/screens.js';

describe('backgrounds: horizontal progression', () => {
  it('one more opens each run, and every one is a trade-off', () => {
    expect(backgroundsOpen({ runNumber: 1 }).map((b) => b.id)).toEqual(['fresh']);
    expect(backgroundsOpen({ runNumber: 3 }).length).toBe(3);
    expect(backgroundsOpen({ runNumber: 9 }).length).toBe(BACKGROUNDS.length);
    for (const b of BACKGROUNDS.slice(1)) expect(b.text).toMatch(/but|instead|needs|less|lower/i);
  });
  it('start effects and rule hooks', () => {
    const { state } = makeGame({ background: 'mover' });
    applyBackgroundStart(state);
    expect(state.upgradesOwned).toContain('Work Gloves');
    expect(creativeStars(state)).toBe(3);
    const art = makeGame({ background: 'artschool' }).state;
    applyBackgroundStart(art);
    expect(art.cash).toBe(120);
    expect(creativeStars(art)).toBe(1);
  });
  it('a night owl hustles for more and wakes slower', () => {
    const { game, state } = makeGame({ background: 'nightowl', day: 4, energy: 80, cash: 100 });
    game.phase = 'EVENING';
    withRandom([0], () => game.eveningChoice('hustle'));
    expect(state.cash).toBe(130);           // $20 x 1.5
    expect(state.tiredTomorrow).toBe('light');
  });
  it('the background survives a new run', () => {
    const { game, state } = makeGame({ background: 'local' });
    game.newGame();
    expect(state.background).toBe('local');
  });
});

describe('clients with consequences', () => {
  it('standing moves from new to regular to wary to done', () => {
    const s = { clientLog: {} };
    expect(clientStanding(s, 'Marge')).toBe('new');
    rememberClient(s, 'Marge', 'Yard Work', true);
    expect(clientStanding(s, 'Marge')).toBe('known');
    rememberClient(s, 'Marge', 'Yard Work', true);
    expect(clientStanding(s, 'Marge')).toBe('regular');
    rememberClient(s, 'Marge', 'Yard Work', false);
    expect(clientStanding(s, 'Marge')).toBe('wary');
    rememberClient(s, 'Marge', 'Yard Work', false);
    expect(clientStanding(s, 'Marge')).toBe('done');
  });
  it('a client you let down twice stops hiring you', () => {
    const { state } = makeGame();
    for (let i = 0; i < 2; i++) rememberClient(state, 'Tony', 'Garage', false);
    for (let i = 0; i < 20; i++) expect(generateDailyGigs(state).some((g) => g.client === 'Tony')).toBe(false);
  });
  it('three good jobs bring a contract offer; taking it books a no-risk job every 5 days', () => {
    const { game, state } = makeGame({ day: 6 });
    for (let i = 0; i < 3; i++) rememberClient(state, 'Rosa', 'Help Move Furniture', true);
    expect(clientMorningOffer(state, () => 0.9).kind).toBe('contract');
    const card = game.clientOfferCard();
    game.activeEvent = card;
    game.chooseEventOption(card.choices[0]);
    expect(state.contracts.length).toBe(1);
    const c = state.contracts[0];
    state.day = c.nextDay;
    const gigs = generateDailyGigs(state);
    expect(gigs[0].contract).toBe(true);
    expect(gigs[0].client).toBe('Rosa');
    expect(gigs[0].risk).toBe(0);
    expect(c.nextDay).toBe(state.day + 5);
    expect(clientMorningOffer(state, () => 0.9)?.kind).not.toBe('contract');   // offered once
  });
  it('a regular can refer a friend: a referral gig in their name', () => {
    const { game, state } = makeGame({ day: 9 });
    for (let i = 0; i < 2; i++) rememberClient(state, 'Dev', 'Logo Design', true);
    const offer = withRandom([0.1, 0], () => clientMorningOffer(state));
    expect(offer).toEqual({ kind: 'referral', client: 'Dev' });
    const card = withRandom([0.1, 0], () => game.clientOfferCard());
    const before = state.todayGigs.length;
    card.effect(state);
    expect(state.todayGigs.length).toBe(before + 1);
    expect(state.todayGigs[0].title).toMatch(/^Referral from Dev: /);
  });
});

describe('rent forecast', () => {
  it('day 1: the daily need; later: pace against the bills', () => {
    const total = RENT + PHONE + FOOD;
    const s = { cash: 200, daysUntilBills: 7, paceLog: [] };
    expect(rentForecast(s, total).line).toBe(`Bills of $${total} in 7 days: about $${Math.ceil((total - 200) / 7)} a day.`);
    const slow = rentForecast({ cash: 200, daysUntilBills: 4, paceLog: [40, 60] }, total);
    expect(slow.warn).toBe(true);
    expect(slow.line).toMatch(/you'll be \$290 short/);
    const fast = rentForecast({ cash: 300, daysUntilBills: 3, paceLog: [150, 170] }, total);
    expect(fast.warn).toBe(false);
    expect(fast.line).toMatch(/^On pace/);
  });
  it('the day log records what each day earned', () => {
    const { game, state } = makeGame({ totalEarned: 0 });
    game.beginMorning();
    state.totalEarned = 135;
    game.phase = 'EVENING';
    game.sleep();
    expect(state.paceLog.slice(-1)[0]).toBe(135);
  });
});

describe('partial rent and the grace week', () => {
  it('paying half or more of overdue rent buys 7 days', () => {
    const { game, state } = makeGame({ unpaidRent: 600, cash: 420, rentOverdueDays: 5 });
    expect(game.partialRentAmount()).toBe(400);
    game.payRentPartial();
    expect(state.unpaidRent).toBe(200);
    expect(state.rentGraceDays).toBe(7);
    expect(daysToEviction(state)).toBe(16);
    game.phase = 'EVENING';
    game.sleep();
    expect(state.rentOverdueDays).toBe(5);   // the grace week, not the clock
    expect(state.rentGraceDays).toBe(6);
  });
  it('at the bills: put part down, the rest becomes debt', () => {
    const { game, state } = makeGame({ cash: 400, daysUntilBills: 0 });
    game.goEvening();
    game.payRentPartial();
    expect(state.cash).toBe(20);
    game.closeBills();
    expect(state.unpaidRent).toBe(RENT - 380);
    expect(state.monthMath.partialRent).toBe(380);
  });
});

describe('twist rules that change the plan', () => {
  it('weekends and day multipliers', () => {
    expect([6, 7, 13, 14].every(isWeekend)).toBe(true);
    expect([1, 5, 8].some(isWeekend)).toBe(false);
    expect(extraListings('touristSeason', 6)).toBe(2);
    expect(extraListings('touristSeason', 3)).toBe(0);
    expect(twistDayMultiplier({ twist: 'rainySeason', weather: { id: 'rainy' }, day: 3 }, { outdoor: false })).toBe(1.2);
    expect(twistDayMultiplier({ twist: 'touristSeason', day: 7 }, { type: 'weird' })).toBe(1.3);
  });
  it('Rent Hike: the super takes $40 off rent for an evening of chores, once a week', () => {
    const { game, state } = makeGame({ twist: 'rentHike', day: 3, weekNumber: 1 });
    const card = game.choresCard();
    expect(card).not.toBeNull();
    game.activeEvent = card;
    game.chooseEventOption(card.choices[0]);
    expect(state.rentCredit).toBe(40);
    expect(game.billAmount('rent')).toBe(RENT + 60 - 40);
    expect(game.choresCard()).toBeNull();
  });
  it('Tight-Knit Block: Dee covers up to $100 of a short rent, once', () => {
    const { game, state } = makeGame({ twist: 'tightKnit', cash: 0, daysUntilBills: 0 });
    game.goEvening();
    game.closeBills();
    expect(state.unpaidRent).toBe(RENT - 100);
    expect(state.deeCovered).toBe(true);
  });
});

describe('the app closing mid-gig loses nothing', () => {
  it('reopening puts the job back and rolls the day back', () => {
    const { game, state } = makeGame({ energy: 90, cash: 250 });
    const gig = state.todayGigs.find((g) => !g.remote);
    game.acceptGig(gig);
    state.cash = 999; state.energy = 3;   // whatever happened mid-job
    state.save();
    const reopened = new Game(new GameState());
    expect(reopened.state.cash).toBe(250);
    expect(reopened.state.energy).toBe(90);
    expect(reopened.state.todayGigs[0].title).toBe(gig.title);
    expect(reopened.state.activeGig).toBeNull();
    expect(reopened.message).toMatch(/rescheduled/);
  });
});

describe('why the month went this way', () => {
  it('reads the month back as reasons', () => {
    const s = new GameState();
    Object.assign(s.monthMath, { byType: { physical: { earned: 600, hours: 30, gigs: 8 }, creative: { earned: 500, hours: 15, gigs: 4 } }, lostToNonPayment: 110, toolBeltExtra: 95, lateHustles: 3, hustleCash: 90, firstOverdueDay: 15 });
    s.totalEarned = 1100; s.upgradesOwned = ['Tool Belt'];
    const lines = monthInsights(s);
    expect(lines[0]).toMatch(/Creative work paid best: \$33 an hour/);
    expect(lines.join(' ')).toMatch(/cost you \$110/);
    expect(lines.join(' ')).toMatch(/Tool Belt earned \$95 extra: it paid for itself/);
    expect(lines.join(' ')).toMatch(/3 late hustles/);
    expect(lines.join(' ')).toMatch(/day 15/);
  });
});

describe('pacing: lessons already seen are compact', () => {
  it('a known lesson holds the result card for less, and reaction cards say known', () => {
    expect(resultHold('skill', { lesson: 'x' }, true)).toBeLessThan(resultHold('skill', { lesson: 'x' }, false));
    const { game, state } = makeGame();
    state.lessonsKnown = [LESSONS.lift];
    expect(game.lessonKnown(LESSONS.lift)).toBe(true);
    expect(game.lessonKnown(LESSONS.pack)).toBe(false);
  });
  it('lessons carry into the next run', () => {
    const { game, state } = makeGame();
    state.lessonsSeen = ['A lesson'];
    game.newGame();
    expect(state.lessonsKnown).toContain('A lesson');
  });
});

describe('challenge variants', () => {
  it('only after two plays', () => {
    expect(variantFor({ microgamePlays: { 'PACK!': 1 } }, 'PACK!', () => 0)).toBe(false);
    expect(variantFor({ microgamePlays: { 'PACK!': 2 } }, 'PACK!', () => 0)).toBe(true);
  });
  it('PACK! fragile: fragile items below the top row cost points', () => {
    const g = new PackTheCar({}, { variant: true });
    expect(g.introKey).toBe('PACK!:fragile');
    g.queue = [{ w: 1, h: 1, label: 'Fan', color: '#fff' }, { w: 1, h: 1, label: 'Box', color: '#fff' }];
    g.place(0, 2);
    expect(g.fragileLow).toBe(1);
  });
  it('SORT! final sale goes in NO RETURN', () => {
    expect(binFor({ receipt: true, tags: true, finalSale: true })).toBe('none');
    const g = new SortReturns({}, null, { variant: true });
    expect(g.bins.length).toBe(4);
    expect(g.items.filter((i) => i.finalSale).length).toBe(2);
  });
  it('RAKE! the wind turns halfway', () => {
    const g = new RakeThePile(new GameState(), { variant: true });
    const w = g.wind;
    g.placePile(1);
    g.timeLeft = g.timeMax / 2 - 0.01;
    g.update(0.01, { down: false });
    expect(g.wind).toBe(-w);
    expect(g.shifted).toBe(true);
  });
});

describe('the apartment shows the month', () => {
  it('conditions first, then what you bought', () => {
    const p = apartmentProps({ unpaidRent: 600, rentOverdueDays: 3, health: 20, upgradesOwned: ['Bike', 'Laptop'], twist: 'heatwave', hungry: true });
    expect(p.map((x) => x[0])).toEqual(['propNotice', 'propPlantWilt', 'propFan', 'propBike', 'propLaptop']);
  });
});

describe('Android Back', () => {
  it('closes what is on top, steps back a screen, and pauses a job', () => {
    const { game } = makeGame({ energy: 100 });
    game.settingsOpen = true;
    expect(game.handleBack()).toBe(true);
    expect(game.settingsOpen).toBe(false);
    game.goBrowse();
    expect(game.handleBack()).toBe(true);
    expect(game.phase).toBe('MORNING');
    expect(game.handleBack()).toBe(false);   // root: Back may leave
    game.phase = 'GIG';
    expect(game.handleBack()).toBe(true);
    expect(game.settingsOpen).toBe(true);
  });
});

describe('templates still sane', () => {
  it('every template has a challenge mapping or is choice-only on purpose', () => {
    expect(GIG_TEMPLATES.length).toBe(14);
  });
});

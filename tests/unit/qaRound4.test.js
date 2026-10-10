// QA round 4 (2026-10-10): one test per tester row that changed game logic, plus the depth pass
// that came with it (your story, named skills, the month's debrief).
import { describe, it, expect } from 'vitest';
import { makeGame, seededRandom } from './helpers.js';
import { RENT, PHONE, FOOD } from '../../src/game/loop.js';
import { TUTORIAL_STEPS } from '../../src/ui/tutorial.js';
import { forecastFor, billsCardHeight, largeTextOn } from '../../src/ui/screens.js';
import { RushShift, RUSH_TARGET, makeOrder } from '../../src/game/longform.js';
import { STORIES, STORY_DAYS, storyBeatCard, storyIntroCard, storyDueCard, storyEnding } from '../../src/game/story.js';
import { BACKGROUNDS } from '../../src/game/depth.js';
import { SKILLS, skillFor } from '../../src/game/skills.js';
import { scaledSize, setTextScale } from '../../src/ui/text.js';

describe('#2 overdue rent: pay any part of it', () => {
  it('a partial amount takes only that amount and leaves the rest owed', () => {
    const { game, state } = makeGame({ cash: 500, unpaidRent: 420, rentOverdueDays: 3 });
    game.openRentPay();
    expect(game.rentPay.amount).toBe(420);           // opens on everything that can be paid
    game.adjustRentPay(0, 150);
    game.confirmRentPay();
    expect(state.cash).toBe(350);
    expect(state.unpaidRent).toBe(270);
    expect(state.rentGraceDays).toBe(0);              // under half: no grace week
    expect(game.message).toContain('Paid $150');
  });
  it('half or more buys the grace week; all of it clears the debt', () => {
    const { game, state } = makeGame({ cash: 500, unpaidRent: 420, rentOverdueDays: 3 });
    game.openRentPay(); game.adjustRentPay(0, 210); game.confirmRentPay();
    expect(state.unpaidRent).toBe(210);
    expect(state.rentGraceDays).toBe(7);
    game.openRentPay(); game.confirmRentPay();
    expect(state.unpaidRent).toBe(0);
    expect(state.rentOverdueDays).toBe(0);
  });
  it('the amount stays between $10 and what the player can pay', () => {
    const { game } = makeGame({ cash: 120, unpaidRent: 420 });
    game.openRentPay();
    expect(game.rentPay.amount).toBe(120);
    game.adjustRentPay(+50);
    expect(game.rentPay.amount).toBe(120);
    for (let i = 0; i < 30; i++) game.adjustRentPay(-10);
    expect(game.rentPay.amount).toBe(10);
  });
  it('on the bills screen the panel pays this week\'s rent, in part or in full', () => {
    const { game, state } = makeGame({ cash: 700, daysUntilBills: 0 });
    game.goEvening();
    game.openRentPay();
    game.adjustRentPay(0, 400);
    game.confirmRentPay();
    expect(state.cash).toBe(300);
    expect(game.billsPaid.rent).toBe(false);
    game.closeBills();
    expect(state.unpaidRent).toBe(RENT - 400);
  });
  it('Back closes the panel without paying', () => {
    const { game, state } = makeGame({ cash: 500, unpaidRent: 420 });
    game.openRentPay();
    expect(game.handleBack()).toBe(true);
    expect(game.rentPay).toBe(null);
    expect(state.cash).toBe(500);
  });
});

describe('#8 pay rent early asks first', () => {
  it('the button only opens a confirmation; Pay pays, Not now and Back do not', () => {
    const { game, state } = makeGame({ cash: 900, daysUntilBills: 4 });
    game.askPayRentEarly();
    expect(game.confirmRentEarly).toBe(true);
    expect(state.cash).toBe(900);
    expect(game.handleBack()).toBe(true);
    expect(game.confirmRentEarly).toBe(false);
    game.askPayRentEarly();
    game.payRentEarly();
    expect(state.rentPrepaid).toBe(true);
    expect(state.cash).toBe(900 - RENT);
    expect(game.confirmRentEarly).toBe(false);
  });
});

describe('#6 the tutorial only points at what is on screen', () => {
  const listings = TUTORIAL_STEPS.findIndex((s) => s.text.includes('Check Listings'));
  it('the Check Listings step waits while the morning news and events are up', () => {
    const { game, state } = makeGame({ tutorialSeen: false, tutorialStep: listings });
    game.phase = 'MORNING';
    game.ticker = { lines: ['Rain later.'], idx: 0, t: 0 };
    game.eventQueue = [];
    game.activeEvent = { text: 'news' };
    expect(game.tutorialVisible()).toBe(false);
    game.activeEvent = null;
    expect(game.tutorialVisible()).toBe(false);       // the news ticker is still running
    game.ticker.idx = 1;
    expect(game.tutorialVisible()).toBe(true);
    game.shopOpen = true;
    expect(game.tutorialVisible()).toBe(false);
    expect(state.tutorialStep).toBe(listings);       // waiting does not skip it
  });
  it('the evening steps wait for the bills screen to close', () => {
    const ev = TUTORIAL_STEPS.findIndex((s) => s.phase === 'EVENING');
    const { game } = makeGame({ tutorialSeen: false, tutorialStep: ev });
    game.phase = 'EVENING'; game.ping = null;
    game.billsOpen = true;
    expect(game.tutorialVisible()).toBe(false);
    game.billsOpen = false;
    expect(game.tutorialVisible()).toBe(true);
  });
  it('the Sleep step highlights where Sleep is drawn now', () => {
    const sleep = TUTORIAL_STEPS.find((s) => s.text.startsWith('Sleep ends'));
    expect(sleep.rect).toEqual([180, 526, 210, 52]);
  });
});

describe('#4 and #13: bills and the rent forecast, labelled, morning and evening', () => {
  it('the forecast covers the whole week of bills', () => {
    const { game } = makeGame({ cash: 200, daysUntilBills: 5, paceLog: [] });
    const fc = forecastFor(game);
    expect(fc.line).toContain(`$${RENT + PHONE + FOOD}`);
  });
  it('with rent overdue the forecast becomes the plan to clear it, instead of disappearing', () => {
    const { game } = makeGame({ cash: 100, unpaidRent: 400, rentOverdueDays: 2 });
    const fc = forecastFor(game);
    expect(fc).not.toBe(null);
    expect(fc.overdue).toBe(true);
    expect(fc.line).toContain('$400 overdue');
  });
  it('the bills card grows by one row per debt', () => {
    const { game, state } = makeGame({ cash: 100 });
    const base = billsCardHeight(game.ctx, game, 370);
    state.unpaidRent = 300; state.unpaidPhone = 40;
    expect(billsCardHeight(game.ctx, game, 370)).toBeGreaterThanOrEqual(base + 32);
  });
});

describe('#3 RUSH!: the result says why', () => {
  // Accept every order, the tester's strategy (the $1-a-mile comparison lives in longform.test.js).
  const acceptAll = (seed) => {
    const { state } = makeGame();
    const shift = new RushShift(state, seededRandom(seed));
    for (let i = 0; i < 20000 && !shift.done; i++) {
      if (shift.order && shift.decideLeft < shift.decideMax - 0.5) shift.accept();
      shift.update(1 / 60);
    }
    return shift.result;
  };
  it('every result names the $13 target, and a miss counts the orders that cost it', () => {
    let misses = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const r = acceptAll(seed);
      expect(r.target).toBe(RUSH_TARGET);
      expect(r.why).toContain(`$${RUSH_TARGET}/hr target`);
      if (!r.success && r.badTaken > 0) { misses++; expect(r.why).toContain(`${r.badTaken} of your ${r.accepted} orders paid under $1 a mile`); }
    }
    expect(misses).toBeGreaterThan(0);   // taking everything does miss, which is the lesson
  });
  it('orders still mix good and bad pay', () => {
    const rand = seededRandom(3);
    const pms = Array.from({ length: 200 }, () => makeOrder(rand)).map((o) => o.pay / o.miles);
    expect(pms.some((x) => x >= 1)).toBe(true);
    expect(pms.some((x) => x < 1)).toBe(true);
  });
});

describe('your story: each background is its own month', () => {
  it('every background has a goal, three choice mornings, a lesson on every choice, and two endings', () => {
    for (const b of BACKGROUNDS) {
      const st = STORIES[b.id];
      expect(st, b.id).toBeTruthy();
      expect(st.intro.length).toBeGreaterThan(40);
      expect(Object.keys(st.beats).map(Number)).toEqual(STORY_DAYS);
      for (const d of STORY_DAYS) {
        expect(st.beats[d].choices.length).toBe(2);
        for (const c of st.beats[d].choices) { expect(c.after.length).toBeGreaterThan(20); expect(c.flag).toBeTruthy(); }
      }
      expect(st.endings.met).not.toBe(st.endings.missed);
    }
  });
  it('story days never collide with Dee (8, 15, 22, 29) or the recall cards (10, 17, 24)', () => {
    for (const d of STORY_DAYS) expect([8, 15, 22, 29, 10, 17, 24]).not.toContain(d);
  });
  it('each background\'s goal is something different', () => {
    const goals = BACKGROUNDS.map((b) => STORIES[b.id].goal.text);
    expect(new Set(goals).size).toBe(BACKGROUNDS.length);
  });
  it('a choice is remembered, applied once, and read back at the end', () => {
    const { game, state } = makeGame({ background: 'mover', day: 6, cash: 100, health: 80 });
    const card = storyBeatCard(state);
    expect(card.label).toBe('YOUR STORY');
    game.activeEvent = card;
    game.chooseEventOption(card.choices[0]);          // the piano job
    expect(state.cash).toBe(190);
    expect(state.health).toBe(68);
    expect(storyBeatCard(state)).toBe(null);          // answered: no second card today
    const e = storyEnding(state);
    expect(e.choices).toEqual([{ day: 6, text: 'Take the piano job' }]);
    expect(e.met).toBe(true);                         // balance 68 >= 60, so far
  });
  it('the payday advance comes due seven days later', () => {
    const { game, state } = makeGame({ background: 'fresh', day: 13, cash: 50 });
    const card = storyBeatCard(state);
    game.activeEvent = card;
    game.chooseEventOption(card.choices[0]);
    expect(state.cash).toBe(150);
    state.day = 20;
    const due = storyDueCard(state);
    expect(due.text).toContain('$115');
    due.effect(state);
    expect(state.cash).toBe(35);
    expect(storyDueCard(state)).toBe(null);
  });
  it('the opening card comes once, on the first morning out of the tutorial', () => {
    const { game, state } = makeGame({ background: 'artschool', day: 1 });
    game.beginMorning();
    expect(game.eventQueue[0].label).toBe('YOUR STORY: ART SCHOOL DROPOUT');
    game.beginMorning();
    expect(game.eventQueue.some((e) => e.label && e.label.startsWith('YOUR STORY:'))).toBe(false);
    expect(storyIntroCard({ ...state, day: 1 }).effect()).toContain('portfolio');
  });
  it('last month\'s pinned takeaway opens the next one, and survives a new run', () => {
    const { state } = makeGame({ pinnedTakeaway: 'Ask before you start.' });
    expect(storyIntroCard({ ...state, day: 1 }).text).toContain('Ask before you start.');
    state.reset();
    expect(state.pinnedTakeaway).toBe('Ask before you start.');
    expect(state.story).toEqual({});
  });
});

describe('named skills', () => {
  it('every challenge in the game has a skill name', () => {
    for (const n of ['PACK!', 'LIFT!', 'UNTANGLE!', 'RAKE!', 'PROOFREAD!', 'SORT!', 'ASSEMBLE!', 'PERCENT!', 'FRAME!', 'RUSH!', 'MARKET!', 'READ THE CLIENT', 'TEXT BACK', 'WIND DOWN']) {
      expect(skillFor(n), n).toBeTruthy();
    }
    expect(skillFor('CALL YOUR MOM')).toBe('Listening to a friend');
    expect(new Set(Object.values(SKILLS)).size).toBe(Object.keys(SKILLS).length);
  });
});

describe('#15 large text', () => {
  it('scales small reading text up to 18 px and leaves headings alone', () => {
    setTextScale(1.2);
    try {
      expect(scaledSize(12)).toBe(14.5);
      expect(scaledSize(15)).toBe(18);
      expect(scaledSize(16)).toBe(18);
      expect(scaledSize(22)).toBe(22);
    } finally { setTextScale(1); }
    expect(scaledSize(13)).toBe(13);
  });
  it('the player\'s own choice wins over the device', () => {
    expect(largeTextOn({ largeText: true })).toBe(true);
    expect(largeTextOn({ largeText: false })).toBe(false);
  });
});

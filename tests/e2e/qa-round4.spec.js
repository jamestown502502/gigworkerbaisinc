// QA round 4 (2026-10-10): every new or changed screen passes the readability audit (no overlap,
// nothing off-canvas or under 11 px, WCAG AA contrast), at normal AND large text; the rent panel and
// the pay-early confirmation work by real taps; the a11y layer shows where focus is.
import { test, expect } from './fixtures.js';
import { boot, settleMorning, auditText as audit, tapLogical } from './helpers.js';

const SAVE = { tutorialSeen: true, characterCreated: true, energy: 100, cash: 500, day: 13, daysUntilBills: 2, gigsCompleted: 20, runNumber: 5,
  twist: 'tightKnit', health: 70, paceLog: [60, 80, 40], lessonsSeen: [
    'Heavy items ride low and forward. Up high, they slide and crush what is under them when you brake.',
    'Judge an order by pay per mile and per hour, not the headline. Many drivers want about $1 a mile or more.',
    'Read slowly, one word at a time. Reading for meaning lets your eye skip right over typos.',
  ] };

async function screens(page, label) {
  const problems = [];
  const shot = async (fn, name) => {
    await page.evaluate(fn);
    await page.evaluate(() => { window.__game.transition = null; window.__game.step(1 / 60); });
    problems.push(...await audit(page, `${label}: ${name}`));
  };
  const morning = () => { const g = window.__game; g.phase = 'MORNING'; g.ping = null; g.rentPay = null; g.confirmRentEarly = false; g.ticker = { lines: [], idx: 0, t: 0 }; g.eventQueue = []; g.activeEvent = null; g.message = ''; };
  await shot(morning, 'morning bills card');
  await shot(() => { const s = window.__state; s.unpaidRent = 420; s.rentOverdueDays = 3; s.unpaidPhone = 40; s.phoneCut = true; s.hungry = true; s.calm = true; }, 'morning, everything overdue');
  await shot(() => { window.__game.openRentPay(); window.__game.adjustRentPay(0, 300); }, 'pay rent panel, grace');
  await shot(() => { window.__game.adjustRentPay(0, 60); }, 'pay rent panel, under half');
  await shot(() => { const g = window.__game, s = g.state; g.rentPay = null; s.unpaidRent = 0; s.rentOverdueDays = 0; s.unpaidPhone = 0; s.phoneCut = false; s.hungry = false; s.cash = 900; g.askPayRentEarly(); }, 'pay early confirmation');
  await shot(() => { const g = window.__game; g.confirmRentEarly = false; g.phase = 'EVENING'; g.ping = null; g.state.eveningDoneDay = 0; }, 'evening forecast');
  await shot(() => { const s = window.__state; s.unpaidRent = 300; s.rentOverdueDays = 6; s.cash = 80; }, 'evening forecast, overdue');
  await shot(() => { const g = window.__game, s = g.state; s.unpaidRent = 0; s.cash = 900; s.daysUntilBills = 0; g.goEvening(); g.openRentPay(); }, 'bills, pay rent panel');
  await page.evaluate(() => { const g = window.__game; g.rentPay = null; g.closeBills(); g.finishWrapUp(); });
  // your story: every background's opening and its three choice mornings
  for (const bg of ['fresh', 'mover', 'artschool', 'nightowl', 'local']) {
    await shot(new Function(`const g = window.__game, s = g.state; s.background = '${bg}'; s.story = {}; s.day = 1; s.pinnedTakeaway = 'Read slowly, one word at a time.'; g.beginMorning(); g.ticker = { lines: [], idx: 0, t: 0 }; g.eventQueue = g.eventQueue.filter((e) => e.label && e.label.startsWith('YOUR STORY')); g.startNextEvent(); g.eventT = 1; g.phase = 'MORNING';`), `${bg} opening`);
    for (const day of [6, 13, 20]) {
      await shot(new Function(`const g = window.__game, s = g.state, St = window.__story; s.day = ${day}; s.story = { introShown: true }; g.eventQueue = []; g.activeEvent = { ...St.storyBeatCard(s) }; g.eventT = 1;`), `${bg} day ${day}`);
      await shot(() => { const g = window.__game; g.chooseEventOption(g.activeEvent.choices[0]); g.eventT = 1; }, `${bg} day chosen`);
    }
  }
  await page.evaluate(() => { const g = window.__game; g.activeEvent = null; g.eventQueue = []; });
  // the month in review: story and debrief
  await shot(() => { const g = window.__game, s = g.state; s.day = 30; g.phase = 'SUMMARY'; g.mathOpen = false; }, 'summary with your goal');
  await shot(() => { const g = window.__game; g.mathOpen = true; g.mathPage = 0; }, 'month in review 1');
  await shot(() => { window.__game.mathPage = 2; }, 'your story page');
  await shot(() => { window.__game.mathPage = 3; window.__state.pinnedTakeaway = window.__state.lessonsSeen[1]; }, 'what you learned, one pinned');
  await page.evaluate(() => { const g = window.__game; g.mathOpen = false; g.mathPage = 0; });
  // challenges: count-in with the skill, RUSH! result with its why, breathing chooser, read the client
  await shot(() => { const g = window.__game, Q = window.__qte; g.phase = 'GIG'; g.currentGig = g.state.todayGigs[0]; g.qteKind = 'ei'; g.qteReadyT = 0.2; g.qte = new Q.ReadClient(g.state, Q.READ_CLIENT_SCENARIOS[2]); }, 'count-in names the skill');
  await shot(() => { const g = window.__game; g.qteReadyT = 99; g.qte.readT = 3; }, 'read the client, face clear of the hint');
  await shot(() => {
    const g = window.__game, L = window.__longform;
    g.qteKind = 'skill'; g.qte = new L.RushShift(g.state); g.qte.accepted = 9; g.qte.badTaken = 5; g.qte.pay = 52; g.qte.miles = 60; g.qte.clock = 180; g.qte.finish(); g.qteEndTimer = 2;
  }, 'RUSH! below target, with the why');
  await shot(() => { const g = window.__game, Q = window.__qte; g.phase = 'EVENING_GAME'; g.qteKind = 'evening'; g.qteEndTimer = 0; g.qte = new Q.Breathe(); g.qte.chooseT = 3; }, 'breathing chooser with previews');
  await shot(() => { const g = window.__game; g.qte = null; g.phase = 'MORNING'; g.settingsOpen = true; }, 'settings with large text and full screen');
  await page.evaluate(() => { window.__game.settingsOpen = false; });
  return problems;
}

test('QA round 4 screens are readable, at normal and at large text', async ({ page }) => {
  test.setTimeout(300000);
  await boot(page, { save: SAVE });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = await screens(page, 'normal');
  await page.evaluate(() => { const g = window.__game, s = g.state; s.settings.largeText = true; window.__applyTextSize(s.settings);
    Object.assign(s, { day: 13, unpaidRent: 0, rentOverdueDays: 0, cash: 500, daysUntilBills: 2, unpaidPhone: 0, phoneCut: false, hungry: false }); });
  problems.push(...await screens(page, 'large'));
  expect(problems, problems.join('\n')).toEqual([]);
});

test('overdue rent: a part payment by taps takes only that part (QA round 4 #2)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, cash: 500, unpaidRent: 420, rentOverdueDays: 3, day: 9, daysUntilBills: 5 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; window.__game.step(1 / 60); });
  // open the panel from its real button: the a11y layer mirrors it with its label
  await page.locator('#a11y-layer button', { hasText: 'Pay overdue rent' }).first().click({ force: true });
  await page.evaluate(() => window.__game.step(1 / 60));
  for (let i = 0; i < 12; i++) await tapLogical(page, 252, 224);   // -$10, twelve times: $300
  expect(await page.evaluate(() => window.__game.rentPay.amount)).toBe(300);
  await tapLogical(page, 305, 446);                                   // Pay $300
  const s = await page.evaluate(() => ({ cash: window.__state.cash, owed: window.__state.unpaidRent, grace: window.__state.rentGraceDays }));
  expect(s).toEqual({ cash: 200, owed: 120, grace: 7 });
});

test('pay rent early asks first, and Not now keeps the money (QA round 4 #8)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, cash: 900, day: 3, daysUntilBills: 4 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; window.__game.askPayRentEarly(); window.__game.step(1 / 60); });
  await tapLogical(page, 490, 350);   // Not now
  expect(await page.evaluate(() => ({ cash: window.__state.cash, open: window.__game.confirmRentEarly }))).toEqual({ cash: 900, open: false });
  await page.evaluate(() => { window.__game.askPayRentEarly(); window.__game.step(1 / 60); });
  await tapLogical(page, 310, 350);   // Pay
  expect(await page.evaluate(() => window.__state.rentPrepaid)).toBe(true);
});

test('focus on a mirrored button draws a ring on the canvas (QA round 4 #14)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, cash: 300, day: 3, daysUntilBills: 4 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; window.__game.step(1 / 60); });
  const label = 'Shop';
  await page.locator('#a11y-layer button', { hasText: label }).first().focus();
  const ring = await page.evaluate(() => { window.__game.step(1 / 60); return window.__a11yFocus(); });
  expect(ring && ring.label).toBe(label);
  const outline = await page.locator('#a11y-layer button', { hasText: label }).first().evaluate((b) => getComputedStyle(b).outlineStyle);
  expect(outline).toBe('solid');
});

test('the game falls silent when the page loses focus, and sounds again on return (QA round 4 #7)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'needs Web Audio: Playwright WebKit on Windows has none, Firefox differs (see audio-output.spec.js)');
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, cash: 300, day: 3, daysUntilBills: 4 } });
  await tapLogical(page, 400, 300);   // a real tap opens the audio
  await page.waitForFunction(() => window.__audioState() === 'running');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));          // address bar, shade, another window
  await page.waitForFunction(() => window.__audioState() === 'suspended');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => window.__audioState() === 'running');
});

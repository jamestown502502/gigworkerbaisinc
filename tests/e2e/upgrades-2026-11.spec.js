// Upgrade round 2026-11-10 on the real build: the app's offers on the board, sorting by real tap,
// the month type on the creator, a surprise cost card, the travel skip, the skill level on a
// receipt, and the new month-in-review page. Every new screen also goes through the readability
// audit (overlap, off-canvas, text under 11 px, WCAG AA contrast on the real pixels).
import { test, expect } from './fixtures.js';
import { boot, tapLabel, tapLogical, settleMorning, step, auditText, phase } from './helpers.js';

test('the board carries one app pick, one surge and a best-per-hour badge, and reads cleanly', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  await tapLabel(page, 'Check Listings');
  await step(page, 1);
  const marks = await page.evaluate(() => {
    const gigs = window.__game.state.todayGigs;
    return { picks: gigs.filter((g) => g.appPick).length, surges: gigs.filter((g) => g.surge).length, surgeUp: gigs.filter((g) => g.surge).every((g) => g.payout > g.basePayout) };
  });
  expect(marks).toEqual({ picks: 1, surges: 1, surgeUp: true });
  const audit = await auditText(page, 'board with app offers');
  expect(audit, audit.join('\n')).toEqual([]);
  await page.screenshot({ path: 'test-results/board-app-offers.png' });
});

test('sorting by a real tap reorders the view and never the saved board', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  await tapLabel(page, 'Check Listings');
  await step(page, 1);
  const before = await page.evaluate(() => window.__game.state.todayGigs.map((g) => g.title + g.payout));
  await tapLabel(page, 'Best $/hour');
  expect(await page.evaluate(() => window.__game.listSort)).toBe('rate');
  const after = await page.evaluate(() => window.__game.state.todayGigs.map((g) => g.title + g.payout));
  expect(after).toEqual(before);
  // the first card on screen is now the best payer per hour: tapping it selects that job
  await tapLogical(page, 300, 130);
  const top = await page.evaluate(() => {
    const g = window.__game, gigs = g.state.todayGigs;
    const rate = (x) => x.payout / x.hours;
    return { picked: rate(g.selectedGig), best: Math.max(...gigs.map(rate)) };
  });
  expect(Math.round(top.picked)).toBe(Math.round(top.best));
  const audit = await auditText(page, 'board sorted');
  expect(audit, audit.join('\n')).toEqual([]);
});

test('the creator picks the month, and a Tight month starts as it says', async ({ page }) => {
  await boot(page, { tutorialSeen: false });
  expect(await phase(page)).toBe('CREATE');
  await tapLabel(page, 'Steady month');
  expect(await page.evaluate(() => window.__game.state.monthType)).toBe('tight');
  const audit = await auditText(page, 'creator, tight month');
  expect(audit, audit.join('\n')).toEqual([]);
  await tapLabel(page, 'Start Day 1');
  await step(page, 3);
  // The month's twist is rolled at random, and Rent Hike adds its own $60 on top.
  const s = await page.evaluate(() => ({ cash: window.__game.state.cash, rent: window.__game.rentEarlyAmount() - (window.__game.state.twist === 'rentHike' ? 60 : 0) }));
  expect(s).toEqual({ cash: 140, rent: 750 });
});

test('a surprise cost is a card with three ways out, and it reads cleanly', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, monthType: 'tight', day: 3, cash: 300, daysUntilBills: 4 } });
  await page.evaluate(() => { const g = window.__game; g.phase = 'EVENING'; g.ping = null; g.state.eveningDoneDay = g.state.day; g.sleep(); g.step(2); });
  expect(await page.evaluate(() => window.__game.state.day)).toBe(4);
  await page.evaluate(() => {
    const g = window.__game; let guard = 0;
    while (!(g.activeEvent && g.activeEvent.surprise) && guard++ < 20) {
      if (g.ticker.idx < g.ticker.lines.length) g.ticker.idx += 1;
      else if (g.activeEvent && g.activeEvent.choices) g.chooseEventOption(g.activeEvent.choices[g.activeEvent.choices.length - 1]);
      else g.startNextEvent();
    }
    g.step(0.5);
  });
  const card = await page.evaluate(() => ({ surprise: !!window.__game.activeEvent?.surprise, choices: window.__game.activeEvent?.choices.length }));
  expect(card).toEqual({ surprise: true, choices: 3 });
  const audit = await auditText(page, 'surprise cost card');
  expect(audit, audit.join('\n')).toEqual([]);
  await page.screenshot({ path: 'test-results/surprise-cost.png' });
  const cash = await page.evaluate(() => window.__game.state.cash);
  await tapLabel(page, 'Pay the');
  expect(await page.evaluate(() => window.__game.state.cash)).toBeLessThan(cash);
});

test('a tap finishes the walk to a job', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  await page.evaluate(() => { const g = window.__game; g.goBrowse(); g.step(1); g.acceptGig(g.state.todayGigs.find((x) => !x.remote && g.canAffordGig(x).ok)); g.step(0.7); });
  expect(await phase(page)).toBe('TRAVEL');
  expect(await page.evaluate(() => window.__game.travelT)).toBeLessThan(2);
  await tapLogical(page, 400, 150);
  expect(await page.evaluate(() => window.__game.travelT)).toBe(2);
  await tapLabel(page, 'Start Gig');
  await step(page, 1);
  expect(await phase(page)).toBe('GIG');
});

test('the month in review has the app page, and the summary names who you became', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, day: 30, cash: 900, mastery: { movingHelp: 6 }, eveningDoneDay: 30,
    app: { streak: 0, lastPickDay: 0, missed: 0, priorityDrop: false, questPaidWeek: 0, bonus: 70, streaksHit: 1, questsHit: 1, questsMissed: 2, pickJobs: 3, pickHours: 12, pickPay: 120, otherHours: 20, otherPay: 800, surgeJobs: 2, dropDays: 3 } } });
  await page.evaluate(() => { const g = window.__game; g.phase = 'EVENING'; g.ping = null; g.sleep(); g.step(2); });
  expect(await phase(page)).toBe('SUMMARY');
  const summary = await auditText(page, 'summary with title');
  expect(summary, summary.join('\n')).toEqual([]);
  await page.evaluate(() => { const g = window.__game; g.mathOpen = true; g.mathPage = 4; g.step(0.2); });
  const audit = await auditText(page, 'what the app paid');
  expect(audit, audit.join('\n')).toEqual([]);
  await page.screenshot({ path: 'test-results/what-the-app-paid.png' });
  await tapLabel(page, 'Close');
  expect(await page.evaluate(() => window.__game.mathOpen)).toBe(false);
});

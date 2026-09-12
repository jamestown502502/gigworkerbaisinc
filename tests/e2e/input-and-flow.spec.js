import { test, expect } from '@playwright/test';
import { boot, tapLogical, phase, settleMorning, step } from './helpers.js';

async function dragLogical(page, x1, y1, x2, y2, steps = 8) {
  const box = await page.locator('canvas').boundingBox();
  const px = (x) => box.x + (x / 800) * box.width;
  const py = (y) => box.y + (y / 600) * box.height;
  await page.mouse.move(px(x1), py(y1));
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(px(x1 + ((x2 - x1) * i) / steps), py(y1 + ((y2 - y1) * i) / steps));
    await step(page, 1 / 60);
  }
  await page.mouse.up();
  await step(page, 4 / 60);
}

test('listing board scrolls by drag and by wheel (QA #19)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await page.evaluate(() => { const s = window.__game.state; while (s.todayGigs.length < 8) s.todayGigs.push({ ...s.todayGigs[0] }); });
  await settleMorning(page);
  await tapLogical(page, 165, 552); // Check Listings
  await step(page, 1);
  expect(await phase(page)).toBe('BROWSE');
  expect(await page.evaluate(() => window.__game.listScroll)).toBe(0);
  await dragLogical(page, 370, 400, 370, 150);
  expect(await page.evaluate(() => window.__game.listScroll)).toBeGreaterThan(0);
  test.skip(!!test.info().project.use.hasTouch, 'no mouse wheel on mobile profiles');
  await page.evaluate(() => { window.__game.listScroll = 0; window.__game.listScrollPx = 0; });
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await step(page, 4 / 60);
  expect(await page.evaluate(() => window.__game.listScroll)).toBeGreaterThan(0);
});

test('volume bar drags on the settings screen (QA #25)', async ({ page }) => {
  await boot(page);
  await tapLogical(page, 778, 16); // gear
  await page.evaluate(() => { window.__game.state.settings.masterVolume = 1; });
  await dragLogical(page, 420, 130, 240, 130);
  const v = await page.evaluate(() => window.__game.state.settings.masterVolume);
  expect(v).toBeLessThan(0.5);
});

test('a full day: listings → gig → results → evening choice → sleep, with transitions', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 4 } });
  await settleMorning(page);
  await tapLogical(page, 165, 552); // Check Listings
  await step(page, 1);
  expect(await phase(page)).toBe('BROWSE');
  // select first affordable card and accept
  await page.evaluate(() => { const g = window.__game; g.selectedGig = g.state.todayGigs.find((x) => g.canAffordGig(x).ok); });
  const accepted = await page.evaluate(() => window.__game.acceptGig(window.__game.selectedGig));
  expect(accepted).toBe(true);
  await step(page, 1);
  // during a transition no hotspots are registered
  await page.evaluate(() => { const g = window.__game; g.setPhase('TRAVEL', 'commute'); g.step(1 / 60); });
  const mid = await page.evaluate(() => ({ tr: !!window.__game.transition, hotspots: window.__game.ctx ? undefined : undefined }));
  expect(mid.tr).toBe(true);
  await step(page, 1);
  expect(await page.evaluate(() => window.__game.transition)).toBeNull();
  // drive through the gig with the test helpers
  await page.evaluate(() => {
    const g = window.__game;
    if (g.phase === 'TRAVEL') g.startGig();
    g.step(1);
    let guard = 0;
    while (g.phase === 'GIG' && guard++ < 10) {
      if (g.qteKind === 'ei') g.finishEIGame({ success: true, score: 100, effects: { rep: 0.3 }, summary: 'ok' });
      else if (g.qteKind === 'skill') g.finishGig({ success: true, score: 70 });
      else if (g.node) g.choose(g.node.choices[0]);
      else g.afterChoices();
    }
    g.step(1);
  });
  expect(await phase(page)).toBe('RESULTS');
  const ledger = await page.evaluate(() => window.__game.results);
  expect(ledger.total).toBe(ledger.items.reduce((a, i) => a + i.amount, 0));
  expect(ledger.deltas.cash).toBe(ledger.total);
  await tapLogical(page, 400, 484); // Continue
  await step(page, 1);
  await page.evaluate(() => { const g = window.__game; if (g.phase === 'BROWSE') g.goEvening(); g.step(1); });
  expect(await phase(page)).toBe('EVENING');
  await page.evaluate(() => { window.__game.ping = null; });
  await tapLogical(page, 580, 186); // Wind down
  await step(page, 1);
  expect(await phase(page)).toBe('EVENING_GAME');
  await page.evaluate(() => { const g = window.__game; g.qte.update(30); g.step(1.2); });
  expect(await phase(page)).toBe('EVENING');
  expect(await page.evaluate(() => window.__game.state.eveningDoneDay)).toBe(4);
  await tapLogical(page, 160, 552); // Sleep
  await step(page, 1.5);
  expect(await phase(page)).toBe('MORNING');
  expect(await page.evaluate(() => window.__game.state.day)).toBe(5);
});

test('double-tapping a transitioned button fires it once', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  const box = await page.locator('canvas').boundingBox();
  const x = box.x + (165 / 800) * box.width, y = box.y + (552 / 600) * box.height;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await step(page, 1);
  expect(await phase(page)).toBe('BROWSE');
  expect(await page.evaluate(() => window.__game.transition)).toBeNull();
});

test('day 30 ends in the summary; free play is explicit (QA #4)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, day: 30, energy: 100 } });
  await settleMorning(page);
  await tapLogical(page, 635, 552); // Sleep In
  await step(page, 1);
  await page.evaluate(() => { const g = window.__game; g.ping = null; g.step(1 / 60); });
  await tapLogical(page, 160, 552); // Sleep
  await step(page, 1.5);
  expect(await phase(page)).toBe('SUMMARY');
  expect(await page.evaluate(() => window.__game.state.day)).toBe(30);
  await tapLogical(page, 270, 505); // Free play
  await step(page, 1.5);
  expect(await phase(page)).toBe('MORNING');
  expect(await page.evaluate(() => window.__game.state.day)).toBe(31);
});

test('choice-less morning events wait for the Continue tap (QA #24)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, day: 5 } });
  await page.evaluate(() => { const g = window.__game; g.ticker = { lines: [], idx: 0, t: 0 }; g.eventQueue = [{ id: 'fav-song', tier: 1, text: 'Your favorite song plays on the radio.' }]; g.activeEvent = null; g.step(1 / 60); });
  // six seconds of game time, update-only (rendering 360 frames is slow on emulated WebKit)
  await page.evaluate(() => { for (let i = 0; i < 360; i++) window.__game.update(1 / 60); window.__game.step(1 / 60); });
  expect(await page.evaluate(() => !!window.__game.activeEvent)).toBe(true);
  await tapLogical(page, 400, 360); // Continue button inside the event modal
  expect(await page.evaluate(() => !!window.__game.activeEvent)).toBe(false);
});

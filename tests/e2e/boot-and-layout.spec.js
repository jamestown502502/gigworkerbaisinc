import { test, expect } from '@playwright/test';
import { boot, tapLogical, phase, settleMorning, step } from './helpers.js';

test('boots to a rendered first frame within 5 s (QA #6)', async ({ page }) => {
  const t0 = Date.now();
  await boot(page);
  expect(Date.now() - t0).toBeLessThan(5000);
  expect(await phase(page)).toBe('MORNING');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await step(page, 1);
  expect(errors).toEqual([]);
});

test('canvas keeps a 4:3 aspect and fills the viewport (QA #8, #12)', async ({ page }) => {
  await boot(page);
  const box = await page.locator('canvas').boundingBox();
  const ratio = box.width / box.height;
  expect(Math.abs(ratio - 4 / 3)).toBeLessThan(0.02);
  const vp = page.viewportSize();
  // fills the limiting axis (within the safe-area padding)
  const fillsW = Math.abs(box.width - vp.width) < 40;
  const fillsH = Math.abs(box.height - vp.height) < 40;
  expect(fillsW || fillsH).toBe(true);
});

test('first pointer activation unlocks audio (QA #9)', async ({ page, browserName }) => {
  await boot(page);
  const hasWebAudio = await page.evaluate(() => typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined');
  test.skip(!hasWebAudio, 'this Playwright browser build has no Web Audio (real iOS Safari does)');
  await tapLogical(page, 400, 300);
  const state = await page.evaluate(async () => {
    const mod = await import('/src/engine/audio.js').catch(() => null);
    return mod ? mod.contextState() : 'n/a';
  });
  // In the built bundle the module path differs; fall back to the unlock flag exposed by the game.
  if (state === 'n/a') {
    const running = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__audioState && window.__audioState()), 200)));
    test.skip(running === undefined, 'audio probe not exposed in this build');
    // the context must exist after activation everywhere; Chromium/Firefox also report it running.
    // Playwright's WebKit does not always treat synthetic input as a user activation.
    expect(running).not.toBe('none');
    if (browserName !== 'webkit') expect(running).toBe('running');
  } else {
    expect(['running', 'suspended']).toContain(state);
    if (browserName === 'chromium') expect(state).toBe('running');
  }
});

test('tutorial shows on first launch, Skip is visible on every step (QA #5, #11, #16)', async ({ page }) => {
  await boot(page, { tutorialSeen: false });
  const visible = await page.evaluate(() => window.__game.tutorialVisible());
  expect(visible).toBe(true);
  for (let i = 0; i < 3; i++) {
    const rect = await page.evaluate(() => window.__game.tutorialSkipRect);
    expect(rect).toBeTruthy();
    expect(rect[0]).toBeGreaterThan(600);
    await tapLogical(page, 400, 560); // advance (below the bubble)
  }
  // Skip from step 4
  const rect = await page.evaluate(() => window.__game.tutorialSkipRect);
  await tapLogical(page, rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
  expect(await page.evaluate(() => window.__game.state.tutorialSeen)).toBe(true);
});

test('debt buttons work during the morning ticker (QA #10)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, cash: 900, unpaidRent: 600, rentOverdueDays: 2, day: 9 } });
  await page.evaluate(() => { const g = window.__game; g.ticker = { lines: ['a', 'b', 'c'], idx: 0, t: 0 }; g.step(2 / 60); });
  expect(await page.evaluate(() => window.__game.morningReady)).toBe(false);
  await tapLogical(page, 485, 370); // Pay Overdue Rent
  expect(await page.evaluate(() => window.__game.state.unpaidRent)).toBe(0);
  expect(await page.evaluate(() => window.__game.state.cash)).toBe(300);
});

test('every screen has a way back or forward; evening has Back (QA #21)', async ({ page }) => {
  await boot(page);
  await settleMorning(page);
  await tapLogical(page, 635, 552); // Sleep In → evening
  await step(page, 1);
  expect(await phase(page)).toBe('EVENING');
  await tapLogical(page, 325, 552); // Back
  await step(page, 1);
  expect(await phase(page)).toBe('MORNING');
});

test('settings: reset progress needs a confirm and keeps settings (QA #18)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, day: 7, cash: 777, settings: { muted: true } } });
  await tapLogical(page, 778, 16); // gear
  expect(await page.evaluate(() => window.__game.settingsOpen)).toBe(true);
  await tapLogical(page, 495, 482); // Reset progress
  expect(await page.evaluate(() => window.__game.confirmReset)).toBe(true);
  expect(await page.evaluate(() => window.__game.state.day)).toBe(7);
  await tapLogical(page, 495, 482); // YES
  await step(page, 1);
  expect(await page.evaluate(() => window.__game.state.day)).toBe(1);
  expect(await page.evaluate(() => window.__game.state.settings.muted)).toBe(true);
});

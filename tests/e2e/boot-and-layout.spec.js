import { test, expect } from './fixtures.js';
import { boot, tapLogical, phase, settleMorning, step } from './helpers.js';

test('boots to a rendered first frame without hanging (QA #6)', async ({ page }) => {
  await boot(page);
  // The real guard against the reported hang is boot() itself: it waits for window.__booted and
  // throws at 15 s if the game never starts, which is exactly the "stuck loading, restart the
  // site" symptom. The number below is the app's own measured boot time (see main.js), not wall
  // clock around the harness, so it catches a pathological regression without failing because the
  // machine running the suite is busy.
  const bootMs = await page.evaluate(() => window.__bootMs);
  expect(bootMs).toBeLessThan(10000);
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
  // Read the game's own probe. (This used to try import('/src/engine/audio.js') first, which only
  // exists on a dev server: against the real build it fetched index.html as a module and logged a
  // console error, surfaced by the error fixture on 2026-10-08.)
  const running = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__audioState && window.__audioState()), 200)));
  test.skip(running === undefined, 'audio probe not exposed in this build');
  // The regression this guards is that unlock() was wired to `touchstart`, which Android Chrome
  // does not count as a user activation — when that happens no AudioContext is ever constructed
  // and the probe reads 'none'. So "not none" is the assertion that actually catches the bug,
  // and it holds on every browser.
  //
  // Reaching 'running' additionally requires a working audio output device. GitHub's headless
  // Linux runners have none, so Firefox there resumes to 'suspended' (it reaches 'running' on a
  // real desktop Firefox, confirmed locally). Keep the strict check on Chromium only.
  expect(running).not.toBe('none');
  if (browserName === 'chromium') expect(running).toBe('running');
});

test('first launch opens the character creator, then the tutorial; Skip is visible on every step (QA #5, #11, #16)', async ({ page }) => {
  await boot(page, { tutorialSeen: false });
  expect(await page.evaluate(() => window.__game.phase)).toBe('CREATE');
  // "Start Day 1" by real tap. Retried because the first tap after boot can land while WebKit is
  // still settling the canvas box under a loaded runner; a broken button fails every attempt.
  await expect.poll(async () => {
    if (await page.evaluate(() => window.__game.phase) === 'CREATE') await tapLogical(page, 665, 525);
    await step(page, 2);
    return page.evaluate(() => window.__game.phase);
  }, { timeout: 15_000 }).toBe('MORNING');
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
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  await tapLogical(page, 165, 552); // Check Listings
  await step(page, 1);
  await tapLogical(page, 550, 552); // Call It a Day → evening
  await step(page, 1);
  await page.evaluate(() => { window.__game.ping = null; window.__game.step(1 / 60); });
  expect(await phase(page)).toBe('EVENING');
  await tapLogical(page, 325, 552); // Back
  await step(page, 1);
  expect(await phase(page)).toBe('MORNING');
});

test('after Sleep In (skip day) the evening has no Back to the morning (QA round 2 #18)', async ({ page }) => {
  await boot(page);
  await settleMorning(page);
  await tapLogical(page, 635, 552); // Sleep In → evening
  await step(page, 1);
  await page.evaluate(() => { window.__game.ping = null; window.__game.step(1 / 60); });
  expect(await phase(page)).toBe('EVENING');
  await tapLogical(page, 325, 552); // where Back used to be
  await step(page, 1);
  expect(await phase(page)).toBe('EVENING');
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

// "Starting a new game got stuck" (2026-09-28): at the start of a fresh run the tutorial took every
// tap, including the settings gear and every button inside settings. These drive real taps.
test('during the tutorial, settings open, and New game / Close inside them work', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: false, characterCreated: true, day: 1 } });
  expect(await page.evaluate(() => window.__game.tutorialVisible())).toBe(true);
  await tapLogical(page, 778, 16); // gear, while the tutorial is up
  expect(await page.evaluate(() => window.__game.settingsOpen)).toBe(true);
  expect(await page.evaluate(() => window.__game.tutorialVisible())).toBe(false); // settings on top
  await tapLogical(page, 400, 547); // Close
  expect(await page.evaluate(() => window.__game.settingsOpen)).toBe(false);
  expect(await page.evaluate(() => window.__game.tutorialVisible())).toBe(true); // tutorial resumes
  await tapLogical(page, 778, 16);
  await tapLogical(page, 495, 482); // Start new game
  await tapLogical(page, 495, 482); // Start over? YES
  await step(page, 1);
  expect(await phase(page)).toBe('CREATE');
});

test('reopening a run offers Continue or New game, and New game reaches a playable Day 1', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, day: 6, cash: 480, gigsCompleted: 9 }, keepResumePrompt: true });
  expect(await page.evaluate(() => window.__game.resumePrompt)).toBe(true);
  await tapLogical(page, 400, 400); // New game
  expect(await page.evaluate(() => window.__game.confirmNewGame)).toBe(true);
  expect(await page.evaluate(() => window.__game.state.day)).toBe(6); // nothing deleted yet
  await tapLogical(page, 477, 400); // Start over
  await step(page, 1);
  expect(await phase(page)).toBe('CREATE');
  expect(await page.evaluate(() => window.__game.state.day)).toBe(1);
  await tapLogical(page, 665, 525); // Start Day 1
  await step(page, 2);
  expect(await phase(page)).toBe('MORNING');
  expect(await page.evaluate(() => window.__game.tutorialVisible())).toBe(false); // already seen
  await settleMorning(page);
  await tapLogical(page, 165, 552); // Check Listings
  await step(page, 1);
  expect(await phase(page)).toBe('BROWSE');
});

test('Continue closes the prompt and keeps the run', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, day: 6, cash: 480, gigsCompleted: 9 }, keepResumePrompt: true });
  await tapLogical(page, 400, 328); // Continue
  expect(await page.evaluate(() => window.__game.resumePrompt)).toBe(false);
  expect(await page.evaluate(() => window.__game.state.day)).toBe(6);
  expect(await phase(page)).toBe('MORNING');
});

// Google Play expects a wrapped web app to work offline at a basic level. Before public/sw.js the
// game showed the browser's offline page. Chromium only: it is the engine inside an Android TWA.
test.describe('offline', () => {
  // Offline on purpose: the service worker's background refresh of a cached file fails, and the
  // browser logs that as net::ERR_FAILED. That is the expected sound of being offline, not a bug.
  test.use({ allowConsoleErrors: [/net::ERR_(FAILED|INTERNET_DISCONNECTED)/] });

  test('boots offline after one online visit (Android TWA readiness)', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Android wraps Chromium; other engines differ in offline SW support under Playwright');
    await page.goto('/');
    await page.waitForFunction(() => window.__booted === true, null, { timeout: 15_000 });
    // Wait until EVERY file this first visit loaded is cached (2026-10-08: this used to go offline
    // once any one /assets/ file was cached, racing the worker's caching of the rest, which made
    // the offline reload fail now and then; a real player goes offline long after this finishes).
    await page.waitForFunction(async () => {
      if (!navigator.serviceWorker.controller) return false;
      const c = await caches.open('gigworker-v1');
      const cached = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
      const loaded = performance.getEntriesByType('resource')
        .map((e) => new URL(e.name))
        .filter((u) => u.origin === location.origin && !u.pathname.endsWith('.mp3'))
        .map((u) => u.pathname);
      return loaded.length > 0 && cached.has(location.pathname) && loaded.every((p) => cached.has(p)) && cached.has('/media/apartment.png');
    }, null, { timeout: 30_000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__booted === true, null, { timeout: 15_000 });
    const art = await page.evaluate(async () => !!(await caches.match('/media/apartment.png')));
    expect(art).toBe(true);
    await context.setOffline(false);
  });
});

test('settings closes on a tap outside the panel, not inside it (QA round 2 #10)', async ({ page }) => {
  await boot(page);
  await tapLogical(page, 778, 16); // gear
  expect(await page.evaluate(() => window.__game.settingsOpen)).toBe(true);
  await tapLogical(page, 400, 300); // inside the panel, on no button
  expect(await page.evaluate(() => window.__game.settingsOpen)).toBe(true);
  await tapLogical(page, 60, 300); // outside
  expect(await page.evaluate(() => window.__game.settingsOpen)).toBe(false);
});

test('the shop hides the day\u2019s buttons and closes from inside its own panel (QA round 2 #22, #26)', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  await tapLogical(page, 400, 552); // Shop
  expect(await page.evaluate(() => window.__game.shopOpen)).toBe(true);
  await tapLogical(page, 165, 552); // where Check Listings was: now the dimmed backdrop, outside the panel
  expect(await phase(page)).toBe('MORNING');
  expect(await page.evaluate(() => window.__game.shopOpen)).toBe(false); // outside tap closed it, nothing else fired
  await tapLogical(page, 400, 552); // Shop again
  await tapLogical(page, 400, 556); // Close Shop, inside the panel
  expect(await page.evaluate(() => window.__game.shopOpen)).toBe(false);
});

// Visual baselines: twelve screens compared pixel-for-pixel against approved reference images.
//
// Why (2026-10-08 review): this game once shipped with every image 404ing and stayed "playable",
// because every test read state and none looked at a pixel. A picture catches that whole class.
//
// Determinism: Math.random is seeded (the job board and events are random), the page clock is
// fixed and paused (page.clock), and the game loop is paused (__loopPaused) and advanced only by
// game.step, so every capture is the same frame on every run.
//
// Baselines are Linux-only and generated IN CI, never on a laptop (fonts and rasterizing differ
// per OS). To approve new pictures after an intended visual change, run the "Update visual
// baselines" workflow on your branch; it commits the new PNGs for review.
import { test, expect } from './fixtures.js';
import { boot, settleMorning } from './helpers.js';

test.skip(process.platform !== 'linux' && !process.env.VISUAL_LOCAL, 'visual baselines are Linux/CI-only; see the header');
test.skip(({ browserName, isMobile }) => !(browserName === 'chromium' && !isMobile) && !(browserName === 'webkit'),
  'baselines kept for desktop Chromium and iPhone WebKit only');

/** Each screen: a setup run in the page, then one frame drawn. */
const SCREENS = [
  ['creator', () => { const g = window.__game; g.phase = 'CREATE'; g.creatorEditing = false; }],
  ['morning-board', () => { window.__game.phase = 'MORNING'; }],
  ['settings', () => { const g = window.__game; g.phase = 'MORNING'; g.settingsOpen = true; }],
  ['welcome-back', () => { const g = window.__game; g.settingsOpen = false; g.resumePrompt = true; }],
  ['read-client', () => {
    const g = window.__game, Q = window.__qte;
    g.resumePrompt = false; g.phase = 'GIG'; g.currentGig = g.state.todayGigs[0]; g.qteKind = 'ei'; g.qteReadyT = 99;
    g.qte = new Q.ReadClient(g.state, Q.READ_CLIENT_SCENARIOS[0]);
  }],
  ['text-back', () => {
    const g = window.__game, Q = window.__qte;
    g.phase = 'GIG'; g.qteKind = 'ei'; g.qteReadyT = 99; g.qte = new Q.ThreadGame('client', Q.TEXT_BACK_THREADS[0]);
  }],
  ['microgame', () => {
    const g = window.__game, M = window.__micro;
    const tree = Object.keys(M.MICROGAME_BY_TREE)[0];
    g.phase = 'GIG'; g.qteKind = 'skill'; g.qteReadyT = 99; g.currentGig = g.state.todayGigs[0];
    g.qte = new M.MICROGAME_BY_TREE[tree](g.state);
  }],
  ['reaction-card', () => {
    const g = window.__game, C = window.__choices;
    const tree = Object.keys(C.CHOICE_TREES)[0];
    const ch = C.CHOICE_TREES[tree][0].choices[0];
    g.qte = null; g.qteKind = null; g.node = null; g.phase = 'GIG';
    g.currentGig = { ...g.state.todayGigs[0], client: 'Marge', choiceTree: tree };
    g.pendingOutcome = { choice: ch.text, text: C.fillClient(ch.win || ch.say, 'Marge'), lesson: ch.lesson, effects: { cash: 40, energy: -10, stress: 5, rep: 0.2 }, landed: true, next: null };
  }],
  ['evening-breathe', () => {
    const g = window.__game, Q = window.__qte;
    g.pendingOutcome = null; g.phase = 'EVENING_GAME'; g.qteKind = 'evening'; g.qte = new Q.Breathe();
  }],
  ['month-summary', () => {
    const g = window.__game;
    g.qte = null; g.qteKind = null;
    g.state.totalEarned = 1432; g.state.monthMath = { paidHours: 96, gigs: 24, lostToNonPayment: 185, rentPaid: 1800, phonePaid: 120, travelEnergy: 84, sickDays: 2 };
    g.phase = 'SUMMARY'; g.mathOpen = false;
  }],
  ['math-of-the-month', () => { window.__game.mathOpen = true; }],
  ['game-over', () => { const g = window.__game; g.mathOpen = false; g.phase = 'GAMEOVER'; }],
];

test('twelve screens match their approved baselines', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    let a = 0x2f6b9e1d;                                // mulberry32: same "random" every run
    Math.random = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await page.clock.install({ time: new Date('2026-01-15T12:00:00Z') });
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 3000));

  for (const [name, setup] of SCREENS) {
    await page.evaluate(setup);
    await page.evaluate(() => window.__game.step(1 / 60));
    // maxDiffPixels 50: these screens are pixel-identical run to run. The first setting, 1% of the
    // image, was too loose to catch a covered button (found on Tour Life, 2026-10-08).
    await expect.soft(page.locator('canvas'), `${name} looks different from its baseline`)
      .toHaveScreenshot(`${name}.png`, { maxDiffPixels: 50 });
  }
});

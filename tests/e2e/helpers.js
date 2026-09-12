import { expect } from '@playwright/test';

/** Boot the game with a clean save and the tutorial already seen (unless asked otherwise). */
export async function boot(page, { tutorialSeen = true, save = null } = {}) {
  await page.addInitScript(({ tutorialSeen: ts, save: sv }) => {
    try {
      window.localStorage.clear();
      if (sv) window.localStorage.setItem('gigWorkerState', JSON.stringify(sv));
      else if (ts) window.localStorage.setItem('gigWorkerState', JSON.stringify({ tutorialSeen: true }));
    } catch { /* ignore */ }
  }, { tutorialSeen, save });
  await page.goto('/');
  await page.waitForFunction(() => window.__booted === true, null, { timeout: 15_000 });
  await page.evaluate(() => { window.__game.step(4 / 60); });
}

/** Tap at logical (800x600) coordinates by converting to the canvas's on-screen box. */
export async function tapLogical(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (x / 800) * box.width, box.y + (y / 600) * box.height);
  await step(page, 6 / 60);
}

export async function step(page, seconds) {
  await page.evaluate((s) => window.__game.step(s), seconds);
}

export async function phase(page) {
  return page.evaluate(() => window.__game.phase);
}

export async function game(page, fn) {
  return page.evaluate(fn);
}

/** Resolve the morning ticker/events so the phase buttons appear. */
export async function settleMorning(page) {
  await page.evaluate(() => {
    const g = window.__game;
    let guard = 0;
    while (!g.morningReady && guard++ < 20) {
      if (g.ticker.idx < g.ticker.lines.length) g.ticker.idx += 1;
      else if (g.activeEvent && g.activeEvent.choices) {
        const s = g.state;
        const opt = g.activeEvent.choices.find((o) => !(o.disabled && o.disabled(s)));
        g.chooseEventOption(opt);
      } else g.startNextEvent();
    }
    g.step(2 / 60);
  });
  expect(await page.evaluate(() => window.__game.morningReady)).toBe(true);
}

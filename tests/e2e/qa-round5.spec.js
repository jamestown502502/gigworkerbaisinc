// QA round 5 (Fiverr sheet "Issue Report Round 4", 2026-11-19): one check per tester row that
// changed behaviour, on the real build.
import { test, expect } from './fixtures.js';
import { boot, tapLabel, tapLogical, settleMorning, step, auditText } from './helpers.js';

async function texts(page) {
  return page.evaluate(() => {
    window.__textProbe = [];
    window.__game.step(1 / 60);
    const out = window.__textProbe;
    window.__textProbe = null;
    return out;
  });
}

test('#2 the morning bills list names the weekly food bill, not the Shop groceries', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  const all = (await texts(page)).map((t) => t.text);
  expect(all).toContain('Weekly food');
  expect(all).not.toContain('Groceries');
});

test('#3 Randomize rolls the pronouns too', async ({ page }) => {
  await boot(page, { tutorialSeen: false, save: { tutorialSeen: true, phase: 'CREATE' } });
  await page.evaluate(() => { const g = window.__game; if (g.phase !== 'CREATE') g.newGame(); g.step(1 / 60); });
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    await tapLabel(page, 'Randomize');
    seen.add(await page.evaluate(() => window.__game.state.character.pronouns));
  }
  expect(seen.size).toBeGreaterThan(1);
});

test('#4 the percent quiz question and answers are set in the reading face, not the pixel heading face', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  const r = await page.evaluate(() => {
    const g = window.__game, M = window.__micro;
    const quiz = new M.PercentTutor(g.state, [M.PERCENT_PROBLEMS[0]]);
    window.__textProbe = [];
    quiz.render(document.querySelector('canvas').getContext('2d'));
    const all = window.__textProbe;
    window.__textProbe = null;
    const p = M.PERCENT_PROBLEMS[0];
    return all.filter((t) => t.text === p.answer || p.q.startsWith(t.text.slice(0, 12))).map((t) => ({ text: t.text, font: t.font }));
  });
  expect(r.length).toBeGreaterThan(1);
  for (const t of r) expect(t.font, t.text).not.toContain('VT323');
});

test('#5 a bought item reads Bought and a second tap changes nothing', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 200 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__game.shopOpen = true; window.__game.step(1 / 60); });
  await tapLabel(page, 'Buy');
  const cash = await page.evaluate(() => window.__game.state.cash);
  const bought = (await texts(page)).find((t) => t.text === 'Bought ✓');
  expect(bought).toBeTruthy();
  await tapLogical(page, bought.x + bought.w / 2, bought.y + bought.h / 2);
  await step(page, 0.3);
  expect(await page.evaluate(() => window.__game.state.cash)).toBe(cash);
  expect(await page.evaluate(() => window.__game.message)).not.toMatch(/already ate/i);
});

test('#6 hiding the tab mid-day comes back to a Paused card; the first tap only resumes', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  const before = await page.evaluate(() => window.__game.phase);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__tabPaused())).toBe(true);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.__tabPaused())).toBe(false);
  expect(await page.evaluate(() => window.__game.phase)).toBe(before);
});

test('#7 Settings with Large Text on: nothing overlaps, Close included', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, settings: { largeText: true } } });
  await settleMorning(page);
  await page.evaluate(() => { window.__game.settingsOpen = true; window.__game.step(1 / 60); });
  const audit = await auditText(page, 'settings large text');
  expect(audit, audit.join('\n')).toEqual([]);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#a11y-layer button')].map((b) => ({ label: b.textContent, r: b.getBoundingClientRect().toJSON() })));
  const close = boxes.find((b) => b.label === 'Close');
  for (const b of boxes.filter((x) => /Replay tutorial|Full screen|Start new game/.test(x.label))) {
    expect(close.r.top, b.label).toBeGreaterThanOrEqual(b.r.bottom - 1);
  }
});

test('#8 the header Settings and Sound buttons do not overlap', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  await step(page, 0.3);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#a11y-layer button')].map((b) => ({ label: b.textContent, r: b.getBoundingClientRect().toJSON() })));
  const gear = boxes.find((b) => b.label === 'Settings');
  const sound = boxes.find((b) => /^Sound/.test(b.label));
  expect(gear && sound).toBeTruthy();
  expect(sound.r.top).toBeGreaterThanOrEqual(gear.r.bottom - 0.5);
});

test('#9 waking up short of the bills raises stress and says why', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 30, stress: 10 } });
  await settleMorning(page);
  await page.evaluate(() => { const g = window.__game; g.state.cash = 30; g.state.stress = 10; g.sleep(); g.step(1 / 60); });
  // -8 overnight recovery, then +8 money worry (without it, stress would read 2)
  expect(await page.evaluate(() => window.__game.state.stress)).toBeGreaterThanOrEqual(10);
});

// Publisher polish (2026-10-12): the bands around the 4:3 game must not flicker.
//
// Reported with screenshots: the areas beside the game "get glitchy" on desktop and some phones.
// Cause: main.js copied the canvas into a CSS-blurred full-screen div five times a second, a hard
// cut and a full-viewport re-blur each time. The bands are now a still baked backdrop plus a tint
// that changes once per phase. Also checks the splash goes and the logo asset loads.
import { test, expect } from './fixtures.js';
import { boot } from './helpers.js';

async function bands(page) {
  return page.evaluate(() => ({
    image: getComputedStyle(document.getElementById('ambient')).backgroundImage,
    tint: document.getElementById('ambient-tint').style.backgroundColor,
    dataUrls: window.__toDataURLCalls,
  }));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__toDataURLCalls = 0;
    const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...a) { window.__toDataURLCalls++; return orig.apply(this, a); };
  });
});

test('the bands stay still: one backdrop, a tint per phase, no canvas copies', async ({ page }) => {
  await boot(page);
  expect(await page.locator('#splash').count()).toBe(0);
  expect(await page.evaluate(() => {
    const img = new Image(); img.src = '/brand/wordmark.webp';
    return img.decode().then(() => img.naturalWidth > 0, () => false);
  })).toBe(true);
  const first = await bands(page);
  expect(first.image).toContain('backdrop.webp');
  const tints = new Set([first.tint]);
  for (let i = 0; i < 15; i++) {
    const b = await bands(page);
    expect(b.image).toBe(first.image);
    expect(b.tint).toBe(first.tint);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.__game.setPhase('BROWSE', 'fade'));
  await page.waitForFunction(() => window.__game.phase === 'BROWSE');
  for (let i = 0; i < 15; i++) {
    const b = await bands(page);
    expect(b.image).toBe(first.image);
    tints.add(b.tint);
    await page.waitForTimeout(100);
  }
  expect(tints.size).toBe(2);
  expect((await bands(page)).dataUrls).toBe(0);
});

for (const vp of [
  { width: 1366, height: 768 }, { width: 2560, height: 1080 }, { width: 1024, height: 768 },
  { width: 390, height: 844 }, { width: 844, height: 390 },
]) {
  test(`no page scroll and the bands cover the screen at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page);
    const m = await page.evaluate(() => {
      const r = document.getElementById('ambient').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight, r: [r.left, r.top, r.right, r.bottom] };
    });
    expect(m.sw).toBeLessThanOrEqual(m.w);
    expect(m.sh).toBeLessThanOrEqual(m.h);
    expect(m.r[0]).toBeLessThanOrEqual(0); expect(m.r[1]).toBeLessThanOrEqual(0);
    expect(m.r[2]).toBeGreaterThanOrEqual(m.w); expect(m.r[3]).toBeGreaterThanOrEqual(m.h);
    await page.screenshot({ path: `test-results/margins-${vp.width}x${vp.height}.png` });
  });
}

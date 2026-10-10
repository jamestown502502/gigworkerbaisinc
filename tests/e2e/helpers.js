import { expect } from '@playwright/test';

/** Boot the game with a clean save and the tutorial already seen (unless asked otherwise). */
export async function boot(page, { tutorialSeen = true, save = null, keepResumePrompt = false } = {}) {
  await page.addInitScript(({ tutorialSeen: ts, save: sv }) => {
    try {
      window.localStorage.clear();
      if (sv) window.localStorage.setItem('gigWorkerState', JSON.stringify(sv));
      else if (ts) window.localStorage.setItem('gigWorkerState', JSON.stringify({ tutorialSeen: true }));
    } catch { /* ignore */ }
  }, { tutorialSeen, save });
  await page.goto('/');
  await page.waitForFunction(() => window.__booted === true, null, { timeout: 15_000 });
  // A seeded mid-run save opens on the Welcome back prompt; tests start past it unless they ask
  // (boot-and-layout.spec.js covers the prompt itself).
  await page.evaluate((keep) => { if (!keep) window.__game.resumePrompt = false; window.__game.step(4 / 60); }, keepResumePrompt);
}

/** Tap at logical (800x600) coordinates by converting to the canvas's on-screen box. */
export async function tapLogical(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (x / 800) * box.width, box.y + (y / 600) * box.height);
  await step(page, 6 / 60);
}

/** Tap a button by its label, wherever the layout puts it. The accessibility layer (ui/a11y.js)
 *  mirrors every labelled button at its drawn position, so its box is the button's box; the tap is a
 *  real one on the canvas underneath (the mirror never takes pointer events). */
export async function tapLabel(page, label) {
  await step(page, 1 / 60);
  const box = await page.locator('#a11y-layer button', { hasText: label }).first().boundingBox();
  if (!box) throw new Error(`tapLabel: no button labelled "${label}"`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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

/** Readability audit of one rendered frame: overlap, off-canvas, size under 11 px, and WCAG AA
 *  contrast against the real pixels behind each string. See readability.spec.js. */
export async function auditText(page, label) {
  return page.evaluate((label) => {
    window.__textProbe = [];
    window.__game.step(1 / 60);
    const all = window.__textProbe;
    window.__textProbe = null;
    let cut = 0;
    all.forEach((t, i) => { if (t.layer) cut = i + 1; });
    const texts = all.slice(cut).filter((t) => !t.layer && t.w > 0 && t.text.trim());

    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const sc = canvas.width / 800;
    const lum = (r, g, b) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (c) => {
      const s = String(c).trim();
      let m = s.match(/^#([0-9a-f]{6})$/i);
      if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
      m = s.match(/^#([0-9a-f]{3})$/i);
      if (m) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1);
      m = s.match(/^rgba?\(([^)]+)\)$/i);
      if (m) { const p = m[1].split(',').map((v) => parseFloat(v)); return [p[0], p[1], p[2], p[3] ?? 1]; }
      return null;
    };
    const problems = [];
    const key = (t) => `${label}: "${t.text.slice(0, 40)}" @${Math.round(t.x)},${Math.round(t.y)}`;
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (t.x < -1 || t.y < -1 || t.x + t.w > 801 || t.y + t.h > 601) problems.push(`${key(t)} is off-canvas`);
      if (t.size < 11) problems.push(`${key(t)} is ${t.size}px (min 11)`);
      for (let j = i + 1; j < texts.length; j++) {
        const u = texts[j];
        if (t.text === u.text && Math.abs(t.x - u.x) < 1 && Math.abs(t.y - u.y) < 1) continue;
        const pad = -2;
        if (t.x < u.x + u.w + pad && t.x + t.w + pad > u.x && t.y < u.y + u.h + pad && t.y + t.h + pad > u.y) {
          problems.push(`${key(t)} overlaps "${u.text.slice(0, 40)}"`);
        }
      }
      if (t.outline) continue;
      const fg = parse(t.color);
      if (!fg) continue;
      // The background is sampled on a ring just OUTSIDE the string's box, not inside it: small bold
      // text covers enough of its own box that an inside sample reads the glyphs as background.
      const pad = 3 * sc;
      const x0 = Math.max(0, Math.floor(t.x * sc - pad)), y0 = Math.max(0, Math.floor(t.y * sc - pad));
      const x1 = Math.min(canvas.width - 1, Math.ceil((t.x + t.w) * sc + pad)), y1 = Math.min(canvas.height - 1, Math.ceil((t.y + t.h) * sc + pad));
      const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data, rw = x1 - x0 + 1, rh = y1 - y0 + 1;
      const ls = [];
      const px = (i, j) => { const k = (j * rw + i) * 4; ls.push(lum(d[k], d[k + 1], d[k + 2])); };
      for (let i = 0; i < rw; i += 2) { px(i, 0); px(i, rh - 1); }
      for (let j = 0; j < rh; j += 2) { px(0, j); px(rw - 1, j); }
      ls.sort((a, b) => a - b);
      const bgL = ls[Math.floor(ls.length / 2)];
      // a translucent text color is seen blended over that background
      const bgC = Math.round(255 * Math.min(1, bgL ** (1 / 2.2)));
      const eff = fg.slice(0, 3).map((c) => c * fg[3] + bgC * (1 - fg[3]));
      const fgL = lum(...eff);
      const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
      const large = t.size >= 24 || (t.bold && t.size >= 18.66);
      const need = large ? 3 : 4.5;
      if (ratio < need) problems.push(`${key(t)} contrast ${ratio.toFixed(2)}:1 (needs ${need}:1)`);
    }
    return problems;
  }, label);
}

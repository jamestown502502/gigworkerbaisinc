// iPhone audio (2026-10-08): the defect Tour Life had, checked here by what comes OUT of the game.
// The audio unit tests spy on a fake context, and headless Playwright never enforces an autoplay
// rule, so a game that is silent on a real phone could pass all of them.
//
// An AnalyserNode is spliced in front of the speakers and each test asserts a real signal peak. The
// probe also applies two iPhone rules a Chromium run otherwise never sees:
//   - a context may only start or resume inside a live user activation (WebKit's rule);
//   - the Ring/Silent switch: with it on, iOS mutes web audio unless the page asked for a 'playback'
//     audio session (navigator.audioSession, Safari 17+). The probe models the switch as a real
//     GainNode that passes nothing unless the session type is 'playback'.
//
// Chromium profiles only: Playwright's WebKit build has no Web Audio on Windows, and Firefox's
// prototypes differ enough that the splice is not worth maintaining twice.
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

function installProbe({ silentSwitchOn }) {
  const P = (window.__probe = { ctxs: [], log: [] });
  const t0 = performance.now();
  const note = (s) => P.log.push(`${Math.round(performance.now() - t0)}ms ${s}`);
  for (const type of ['touchstart', 'touchend', 'pointerup', 'click', 'visibilitychange', 'pagehide', 'blur']) {
    window.addEventListener(type, () => note(`${type} active=${navigator.userActivation.isActive} hidden=${document.hidden}`), true);
  }
  Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = this.src.split('/').pop();
    return play.call(this).then(() => note(`play ${src} ok`), (e) => { note(`play ${src} ${e.name}`); throw e; });
  };
  const Orig = window.AudioContext;
  const allowed = () => navigator.userActivation.isActive;
  const suspend = Orig.prototype.suspend;
  const resume = Orig.prototype.resume;
  Orig.prototype.resume = function () { note(`resume allowed=${allowed()}`); return allowed() ? resume.call(this) : new Promise(() => {}); };
  const connect = AudioNode.prototype.connect;
  window.AudioContext = function (...a) {
    const ctx = new Orig(...a);
    note(`new context allowed=${allowed()}`);
    ctx.addEventListener('statechange', () => note(`state ${ctx.state}`));
    if (!allowed()) suspend.call(ctx);
    const ringer = ctx.createGain();   // the Silent switch
    const an = ctx.createAnalyser();
    connect.call(ringer, an);
    connect.call(an, ctx.destination);
    const rec = { ctx, an, ringer };
    rec.applySwitch = () => { ringer.gain.value = silentSwitchOn && navigator.audioSession.type !== 'playback' ? 0 : 1; };
    rec.applySwitch();
    P.ctxs.push(rec);
    return ctx;
  };
  window.AudioContext.prototype = Orig.prototype;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      const rec = P.ctxs.find((r) => r.ctx === dest.context);
      if (rec) return connect.call(this, rec.ringer, ...rest);
    }
    return connect.call(this, dest, ...rest);
  };
}

/** Peak output level of the game's context over `ms` (4 s: a starved renderer can underrun the music for a while). */
async function peak(page, ms = 4000) {
  return page.evaluate((ms) => new Promise((resolve) => {
    const recs = window.__probe.ctxs;
    if (recs.length !== 1) return resolve({ state: `${recs.length} contexts`, peak: 0, log: window.__probe.log });
    const rec = recs[0];
    rec.applySwitch();
    window.__probe.log.push(`ringer gain ${rec.ringer.gain.value} session ${navigator.audioSession.type}`);
    const buf = new Float32Array(2048);
    let p = 0;
    const t0 = performance.now();
    const tick = () => {
      rec.an.getFloatTimeDomainData(buf);
      for (const v of buf) p = Math.max(p, Math.abs(v));
      if (performance.now() - t0 < ms) setTimeout(tick, 20); else resolve({ state: rec.ctx.state, peak: p, log: window.__probe.log });
    };
    tick();
  }), ms);
}

/** A real tap (touchend on touch profiles) at logical 800x600 coordinates, then wait until the
 *  context runs and the music track has started (not a fixed sleep: on a loaded machine the mp3 can
 *  take seconds), and measure. The game loop is left running on its own clock. */
async function tapAndListen(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  const px = box.x + (x / 800) * box.width, py = box.y + (y / 600) * box.height;
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
  await page.waitForFunction(() => window.__probe.ctxs[0]?.ctx.state === 'running' && window.__probe.log.some((l) => / ok$/.test(l)), null, { timeout: 20_000 }).catch(() => {});
  const r = await peak(page);
  console.log(`[audio-output] ${test.info().title}`, JSON.stringify(r));
  return r;
}

const AUDIBLE = 0.005;

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'needs Web Audio (see header)');
});

test('the first tap of the session makes sound', async ({ page }) => {
  await page.addInitScript(installProbe, { silentSwitchOn: false });
  await boot(page);
  const r = await tapAndListen(page, 400, 300);
  expect(r.state, r.log.join(' | ')).toBe('running');
  expect(r.peak, `silent after the first tap: ${r.log.join(' | ')}`).toBeGreaterThan(AUDIBLE);
});

test('iPhone with the Ring/Silent switch on still hears the game', async ({ page }) => {
  await page.addInitScript(installProbe, { silentSwitchOn: true });
  await boot(page);
  const r = await tapAndListen(page, 400, 300);
  expect(await page.evaluate(() => navigator.audioSession.type)).toBe('playback');
  expect(r.state, r.log.join(' | ')).toBe('running');
  expect(r.peak, `muted by the Silent switch: ${r.log.join(' | ')}`).toBeGreaterThan(AUDIBLE);
});

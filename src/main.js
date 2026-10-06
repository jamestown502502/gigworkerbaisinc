// Bootstrap: canvas init → InputManager → asset load (with a visible bar) → state.load() → loop
import { setupGameCanvas } from './engine/canvas.js';
import { InputManager } from './engine/input.js';
import { GameState, saveLock } from './engine/state.js';
import { Game } from './game/loop.js';
import { initAudio, unlock as unlockAudio, contextState, setBackgrounded } from './engine/audio.js';
import { loadAssets } from './engine/sprites.js';
import * as qte from './game/qte.js';
import * as micro from './game/microgames.js';
import * as choices from './game/choices.js';
import * as clients from './game/clients.js';
import * as recall from './game/recall.js';
import * as longform from './game/longform.js';
import * as events from './game/events.js';
import { drawText, roundRectPath } from './ui/text.js';

export { drawSprite, imageCache } from './engine/sprites.js';

function drawLoading(ctx, pct) {
  ctx.fillStyle = '#1d150d';
  ctx.fillRect(0, 0, 800, 600);
  drawText(ctx, 'GIG WORKER SIMULATOR', 400, 250, { size: 28, weight: 'bold', color: '#ffd700', align: 'center', outline: true });
  drawText(ctx, 'Loading the neighborhood...', 400, 290, { size: 15, color: '#c9a876', align: 'center' });
  ctx.fillStyle = '#3a2d1f';
  roundRectPath(ctx, 250, 320, 300, 14, 7); ctx.fill();
  ctx.fillStyle = '#e07030';
  roundRectPath(ctx, 250, 320, Math.max(14, 300 * pct), 14, 7); ctx.fill();
}

async function boot() {
  const container = document.getElementById('game');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = setupGameCanvas(canvas, 800, 600, false); // painted 1024-1200px art: smooth filtering
  drawLoading(ctx, 0);

  InputManager.init(canvas);
  // Real user-activation events only — see engine/input.js for why not touchstart.
  const activate = () => unlockAudio();
  InputManager.onActivate = activate;
  for (const ev of ['pointerup', 'touchend', 'keydown', 'click']) window.addEventListener(ev, activate, { passive: true });
  for (const ev of ['pointerup', 'touchend', 'click']) canvas.addEventListener(ev, activate, { passive: true });

  await loadAssets((pct) => drawLoading(ctx, pct));

  const state = new GameState();
  initAudio(state.settings);
  const game = new Game(state);
  game.ctx = ctx;
  window.__game = game;   // dev/e2e hook
  window.__state = state;
  window.__audioState = contextState;
  window.__qte = qte;     // e2e hook: the readability audit renders every EI scenario
  window.__micro = micro; // e2e hook: ...and every job microgame
  window.__choices = choices; // e2e hook: ...and every choice's reaction card
  window.__clients = clients; // e2e hook: ...and every client greeting
  window.__recall = recall;   // e2e hook: ...and every recall question
  window.__longform = longform; // e2e hook: ...and the long-form jobs
  window.__events = events;     // e2e hook: ...and every morning event (QA round 3 #12)

  // Another tab or window of the game saved (the storage event only fires in the OTHER tabs): this
  // copy is now out of date. It stops saving and offers to reload onto the newer save.
  window.addEventListener('storage', (e) => {
    if (e.key === 'gigWorkerState' && e.newValue && !game.staleTab) {
      saveLock.stale = true;
      game.staleTab = true;
    }
  });

  let last = performance.now();
  let rafId = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // e2e hook: audits that drive time themselves by game.step() pause the real-time loop, so the
    // game cannot move on between two measurements (see tests/e2e/readability.spec.js).
    if (!window.__loopPaused) {
      game.update(dt);
      game.render(ctx);
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  // Battery/hygiene: actually stop the loop while the tab is backgrounded, rather than relying
  // on browser rAF throttling alone. `last` is re-stamped on resume so the first frame back
  // doesn't see a multi-second dt.
  // Back from another page (bfcache) or app: the same as becoming visible again (QA round 3 #7).
  window.addEventListener('pageshow', (e) => { if (e.persisted && !document.hidden) setBackgrounded(false); });
  window.addEventListener('focus', () => { if (!document.hidden) setBackgrounded(false); });
  document.addEventListener('visibilitychange', () => {
    setBackgrounded(document.hidden); // the music and SFX stop with the app, not just the frames
    if (document.hidden) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (rafId === null) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
  // The app's own boot duration (navigation start to first playable frame), for the e2e boot
  // budget. Measured in-page so the assertion is about the game, not about Playwright's
  // round-trips or how loaded the machine running the test happens to be.
  window.__bootMs = Math.round(performance.now());
  window.__booted = true;
  registerServiceWorker();
}

/** Offline support (public/sw.js). Production builds only: in dev it would cache modules that the
 *  dev server is busy hot-replacing. Hands the worker every file this first load fetched, so the
 *  game works offline from the first launch, not the second. */
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
    const urls = [location.href, ...performance.getEntriesByType('resource').map((e) => e.name)];
    reg.active?.postMessage({ type: 'cache-urls', urls });
  }).catch((err) => console.warn('Service worker registration failed; the game still works online.', err));
}

boot().catch((err) => {
  console.error('Boot failed', err);
  const el = document.getElementById('game');
  if (el) el.insertAdjacentHTML('beforeend', `<p style="color:#fff;font-family:system-ui;padding:16px">The game failed to start: ${String(err.message || err)}. Please reload.</p>`);
});

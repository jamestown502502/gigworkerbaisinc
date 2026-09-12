// Bootstrap: canvas init → InputManager → asset load (with a visible bar) → state.load() → loop
import { setupGameCanvas } from './engine/canvas.js';
import { InputManager } from './engine/input.js';
import { GameState } from './engine/state.js';
import { Game } from './game/loop.js';
import { initAudio, unlock as unlockAudio, contextState } from './engine/audio.js';
import { loadAssets } from './engine/sprites.js';
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
  const ctx = setupGameCanvas(canvas, 800, 600, true);
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

  let last = performance.now();
  let rafId = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.render(ctx);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  // Battery/hygiene: actually stop the loop while the tab is backgrounded, rather than relying
  // on browser rAF throttling alone. `last` is re-stamped on resume so the first frame back
  // doesn't see a multi-second dt.
  document.addEventListener('visibilitychange', () => {
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
}

boot().catch((err) => {
  console.error('Boot failed', err);
  const el = document.getElementById('game');
  if (el) el.insertAdjacentHTML('beforeend', `<p style="color:#fff;font-family:system-ui;padding:16px">The game failed to start: ${String(err.message || err)}. Please reload.</p>`);
});

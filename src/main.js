// Bootstrap: canvas init → InputManager → state.load() → game loop
import { ASSET_MANIFEST } from './assets/manifest.js';
import { setupGameCanvas } from './engine/canvas.js';
import { InputManager } from './engine/input.js';
import { GameState } from './engine/state.js';
import { Game } from './game/loop.js';
import { initAudio } from './engine/audio.js';

export const imageCache = {};
const USE_FILE_ASSETS = true;

async function loadAssets() {
  const promises = [];
  for (const [key, path] of Object.entries(ASSET_MANIFEST.files)) {
    promises.push(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { imageCache[key] = img; resolve(); };
      img.onerror = () => { console.warn(`Failed: ${path}`); resolve(); };
      img.src = '/' + path;
    }));
  }
  await Promise.all(promises);
}

// Draws a sprite from the manifest. Handles single images, horizontal strips,
// and square N-frame grids (the generated icon sheets are 2x2 grids).
export function drawSprite(ctx, key, x, y, w, h, frame = 0) {
  const asset = ASSET_MANIFEST[key];
  const img = USE_FILE_ASSETS ? imageCache[key] : null;
  if (img) {
    const frames = asset?.frames || 1;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (frames > 1) {
      if (img.naturalWidth >= img.naturalHeight * 2) {
        // horizontal strip
        sw = img.naturalWidth / frames;
        sx = frame * sw;
      } else {
        // square grid (e.g. 2x2 for 4 frames)
        const cols = Math.ceil(Math.sqrt(frames));
        sw = img.naturalWidth / cols;
        sh = img.naturalHeight / Math.ceil(frames / cols);
        sx = (frame % cols) * sw;
        sy = Math.floor(frame / cols) * sh;
      }
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  } else if (asset?.procedural) {
    asset.procedural(ctx, x, y, w, h);
  }
}

async function boot() {
  const container = document.getElementById('game');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = setupGameCanvas(canvas, 800, 600, true);

  InputManager.init(canvas);
  await loadAssets();

  const state = new GameState();
  initAudio(state.settings);
  const game = new Game(state);
  window.__game = game; // handy for debugging

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
  // doesn't see a multi-second dt (update(dt) clamps to 0.05s regardless, but there's no reason
  // to spend that clamp on time that never should have counted).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (rafId === null) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
}

boot();

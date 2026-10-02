// Image cache + sprite blitter. Lives apart from main.js so UI modules (and unit tests) can
// import drawSprite without executing the boot sequence as a side effect.
import { ASSET_MANIFEST } from '../assets/manifest.js';

export const imageCache = {};
const USE_FILE_ASSETS = true;
const LOAD_TIMEOUT_MS = 6000;

/** Loads every manifest image. Never rejects: a failed or stalled image falls back to the
 *  procedural drawer (or nothing) rather than holding the whole game on a spinner. */
export async function loadAssets(onProgress) {
  const entries = Object.entries(ASSET_MANIFEST.files);
  let done = 0;
  const one = ([key, path]) => new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; done += 1; onProgress?.(done / entries.length); resolve(); };
    const img = new Image();
    img.onload = () => { imageCache[key] = img; finish(); };
    img.onerror = () => { console.warn(`Failed: ${path}`); finish(); };
    setTimeout(() => { if (!settled) console.warn(`Timed out: ${path}`); finish(); }, LOAD_TIMEOUT_MS);
    img.src = '/' + path;
  });
  await Promise.all(entries.map(one));
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
        sw = img.naturalWidth / frames;
        sx = frame * sw;
      } else {
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

// Full-screen paintings, pre-scaled once to the canvas's real pixel size. Resampling a 1200 px
// painting to the screen every frame (twice, with a weather overlay) is the single most expensive
// thing the game drew, and on a software-rendered canvas it showed up as multi-second stalls. A
// cached copy at exactly the backing size makes each frame a 1:1 copy. The cache is rebuilt when
// the canvas is resized (rotation, window resize).
const fullscreenCache = new Map();
export function drawFullscreen(ctx, key, logicalW = 800, logicalH = 600) {
  const canvas = ctx.canvas;
  const img = USE_FILE_ASSETS ? imageCache[key] : null;
  if (!img || !canvas || !canvas.width || typeof document === 'undefined' || !document.createElement) {
    drawSprite(ctx, key, 0, 0, logicalW, logicalH);
    return;
  }
  const id = `${key}@${canvas.width}x${canvas.height}`;
  let cached = fullscreenCache.get(id);
  if (!cached) {
    for (const k of fullscreenCache.keys()) if (k.startsWith(`${key}@`)) fullscreenCache.delete(k);
    cached = document.createElement('canvas');
    cached.width = canvas.width;
    cached.height = canvas.height;
    const c = cached.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.scale(canvas.width / logicalW, canvas.height / logicalH);
    drawSprite(c, key, 0, 0, logicalW, logicalH);
    fullscreenCache.set(id, cached);
  }
  ctx.drawImage(cached, 0, 0, logicalW, logicalH);
}

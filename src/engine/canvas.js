// Canvas setup + responsive fit. The game draws in a fixed 800x600 logical space; the
// element is scaled uniformly to the largest 4:3 box that fits its container, and re-fit on
// resize/orientation change. Setting CSS width and height independently (the old approach,
// with max-width/max-height clamping each axis on its own) let a phone squash the canvas to
// 360x600 — a ~1.8x vertical stretch that read as "the landing page is distorted".
export const LOGICAL_W = 800;
export const LOGICAL_H = 600;

export function setupGameCanvas(canvas, logicalWidth = LOGICAL_W, logicalHeight = LOGICAL_H, isPixelArt = true) {
  const ctx = canvas.getContext('2d');
  // Capped at 2x: an uncapped devicePixelRatio (3-4x on many phones) renders far more pixels
  // than a mobile screen can distinguish, for a real fillrate cost every frame.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  ctx.scale(dpr, dpr);
  if (isPixelArt) { ctx.imageSmoothingEnabled = false; canvas.style.imageRendering = 'pixelated'; }
  fitCanvas(canvas, logicalWidth, logicalHeight);
  const refit = () => fitCanvas(canvas, logicalWidth, logicalHeight);
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  return ctx;
}

/** Uniform scale to the largest 4:3 box inside the parent (falls back to the window). */
export function fitCanvas(canvas, logicalWidth = LOGICAL_W, logicalHeight = LOGICAL_H) {
  const parent = canvas.parentElement;
  const availW = (parent && parent.clientWidth) || window.innerWidth;
  const availH = (parent && parent.clientHeight) || window.innerHeight;
  const scale = Math.min(availW / logicalWidth, availH / logicalHeight);
  const w = Math.floor(logicalWidth * scale);
  const h = Math.floor(logicalHeight * scale);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  return { w, h, scale };
}

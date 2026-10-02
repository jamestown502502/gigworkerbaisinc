// Canvas setup + responsive fit. The game draws in a fixed 800x600 logical space; the
// element is scaled uniformly to the largest 4:3 box that fits its container, and re-fit on
// resize/orientation change. Setting CSS width and height independently (the old approach,
// with max-width/max-height clamping each axis on its own) let a phone squash the canvas to
// 360x600 — a ~1.8x vertical stretch that read as "the landing page is distorted".
//
// The backing store follows the size the canvas is SHOWN at (times the device pixel ratio), not
// the 800x600 logical size. It used to be a fixed 800x600 bitmap stretched by CSS, so a 1080p
// desktop window blew every glyph up 1.8x with nearest-neighbour filtering: the "pixelated
// modal text" in QA round 2 #9. Drawing code is unchanged; one base transform maps logical units
// onto however many real pixels there are.
export const LOGICAL_W = 800;
export const LOGICAL_H = 600;

// Upper bound on backing pixels per logical pixel: 3 covers a 4K desktop and every phone at its
// real density, while keeping fill cost bounded.
const MAX_SCALE = 3;

export function setupGameCanvas(canvas, logicalWidth = LOGICAL_W, logicalHeight = LOGICAL_H, isPixelArt = false) {
  const ctx = canvas.getContext('2d');
  const refit = () => {
    const { scale } = fitCanvas(canvas, logicalWidth, logicalHeight);
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.min(MAX_SCALE, scale * dpr));
    const bw = Math.round(logicalWidth * k), bh = Math.round(logicalHeight * k);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;   // resizing resets the context state, so the transform is set after
      canvas.height = bh;
    }
    ctx.setTransform(bw / logicalWidth, 0, 0, bh / logicalHeight, 0, 0);
    ctx.imageSmoothingEnabled = !isPixelArt;
    if (!isPixelArt) ctx.imageSmoothingQuality = 'low';
  };
  refit();
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

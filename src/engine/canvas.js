export function setupGameCanvas(canvas, logicalWidth = 800, logicalHeight = 600, isPixelArt = true) {
  const ctx = canvas.getContext('2d');
  // Capped at 2x: an uncapped devicePixelRatio (3-4x on many phones) renders far more pixels
  // than a mobile screen can distinguish, for a real fillrate cost every frame.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  ctx.scale(dpr, dpr);
  if (isPixelArt) { ctx.imageSmoothingEnabled = false; canvas.style.imageRendering = 'pixelated'; }
  return ctx;
}

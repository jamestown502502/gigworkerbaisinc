export function setupGameCanvas(canvas, logicalWidth = 800, logicalHeight = 600, isPixelArt = true) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  ctx.scale(dpr, dpr);
  if (isPixelArt) { ctx.imageSmoothingEnabled = false; canvas.style.imageRendering = 'pixelated'; }
  return ctx;
}

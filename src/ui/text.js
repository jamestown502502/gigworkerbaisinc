// Shared canvas drawing helpers: crisp text, rounded rects, gradient meters.

// Draw readable text with an optional drop shadow / outline.
// baseline defaults to 'alphabetic' so existing y coordinates (which are
// baseline positions) keep working after the migration from raw fillText.
export function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 18,
    color = '#e0e0e0',
    font = 'system-ui, sans-serif',
    weight = '',
    align = 'left',
    baseline = 'alphabetic',
    shadow = true,
    outline = false,
    maxWidth = undefined,
  } = options;

  ctx.font = `${weight ? weight + ' ' : ''}${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (outline) {
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = Math.max(2, size / 7);
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y, maxWidth);
  }

  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.textBaseline = 'alphabetic';
}

// Word-wrap with shadow. Returns the y just below the last line.
export function drawWrapped(ctx, text, x, y, maxW, lineH, options = {}) {
  const words = String(text).split(' ');
  let line = '', cy = y;
  ctx.font = `${options.size || 16}px ${options.font || 'system-ui, sans-serif'}`;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      drawText(ctx, line, x, cy, options);
      line = word;
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line) drawText(ctx, line, x, cy, options);
  return cy + lineH;
}

// Measure text width without call sites touching ctx.font directly.
export function textWidth(ctx, text, size = 16, font = 'system-ui, sans-serif', weight = '') {
  ctx.font = `${weight ? weight + ' ' : ''}${size}px ${font}`;
  return ctx.measureText(text).width;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Gradient-filled, bordered meter bar.
export function drawMeter(ctx, x, y, w, h, pct, color) {
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = '#161018';
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.fill();
  if (pct > 0) {
    const fw = Math.max(4, (w - 2) * pct);
    const grad = ctx.createLinearGradient(x, y, x + fw, y);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '99');
    ctx.fillStyle = grad;
    roundRectPath(ctx, x + 1, y + 1, fw, h - 2, 3);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.stroke();
}

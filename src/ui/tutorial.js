// First-play guided walkthrough. 9 steps across four phases.
// Rendered as a full-screen overlay with a highlight cutout; any click advances.
// Adds zero overhead once state.tutorialSeen is true (loop skips the render call).
import { drawText, drawWrapped, roundRectPath } from './text.js';

export const TUTORIAL_STEPS = [
  { phase: 'MORNING', rect: null, text: 'Welcome to the gig economy. Survive the month: pay rent, stay healthy, build your reputation.' },
  { phase: 'MORNING', rect: [0, 0, 800, 56], text: 'Your four meters: cash, stress, reputation, energy. Keep them all in check.' },
  { phase: 'MORNING', rect: [60, 526, 210, 52], text: 'Tap "Check Listings" to see today\'s available gigs.' },
  { phase: 'BROWSE', rect: [90, 100, 560, 340], text: 'Each gig shows payout, hours, location, and risk. Tap a card to select it.' },
  { phase: 'BROWSE', rect: [200, 526, 220, 52], text: 'Selected a gig? Accept it here to head out.' },
  { phase: 'GIG', rect: [80, 120, 640, 140], text: 'Your choices matter. They affect your cash, stress, reputation, and energy.' },
  { phase: 'GIG', rect: null, text: 'Some gigs have quick-time events. High stress and low energy make them harder.' },
  { phase: 'EVENING', rect: [50, 100, 340, 300], text: "Rent is due every 7 days. Miss it for 14 days and you're evicted — game over." },
  { phase: 'EVENING', rect: [60, 526, 200, 52], text: 'Sleep ends the day. Energy recovers, fresh gigs appear tomorrow.' },
];

export function renderTutorial(ctx, game) {
  const step = TUTORIAL_STEPS[game.state.tutorialStep];
  if (!step) return;
  const r = step.rect;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  if (r) {
    const [x, y, w, h] = r;
    // dim everything except the highlight cutout
    ctx.fillRect(0, 0, 800, y);
    ctx.fillRect(0, y + h, 800, 600 - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, 800 - x - w, h);
    // pulsing highlight border
    const pulse = Math.sin(Date.now() / 300) * 3;
    ctx.strokeStyle = '#5dade2';
    ctx.lineWidth = 2;
    roundRectPath(ctx, x - 4 - pulse, y - 4 - pulse, w + 8 + pulse * 2, h + 8 + pulse * 2, 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(93, 173, 226, 0.35)';
    ctx.lineWidth = 6;
    roundRectPath(ctx, x - 7 - pulse, y - 7 - pulse, w + 14 + pulse * 2, h + 14 + pulse * 2, 10);
    ctx.stroke();
  } else {
    ctx.fillRect(0, 0, 800, 600);
  }

  // speech bubble positioned away from the highlight
  let by = 230;
  if (r) by = r[1] + r[3] < 300 ? Math.min(420, r[1] + r[3] + 40) : Math.max(90, r[1] - 200);
  const bx = 150, bw = 500, bh = 150;
  ctx.fillStyle = 'rgba(15, 20, 28, 0.95)';
  roundRectPath(ctx, bx, by, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = '#5dade2';
  ctx.lineWidth = 2;
  roundRectPath(ctx, bx, by, bw, bh, 14); ctx.stroke();

  drawWrapped(ctx, step.text, bx + 30, by + 46, bw - 60, 26, { size: 18, color: '#ffffff', outline: true, shadow: false });
  drawText(ctx, `${game.state.tutorialStep + 1} / ${TUTORIAL_STEPS.length}  •  Tap anywhere to continue`, bx + bw / 2, by + bh - 18, {
    size: 13, color: '#aaaaaa', align: 'center', shadow: false,
  });

  // skip link (first step only) — veterans jump straight in
  game.tutorialSkipRect = null;
  if (game.state.tutorialStep === 0) {
    const sx = bx + bw - 118, sy = by + 10;
    ctx.fillStyle = 'rgba(93, 173, 226, 0.12)';
    roundRectPath(ctx, sx, sy, 106, 26, 13); ctx.fill();
    drawText(ctx, 'Skip tutorial ✕', sx + 53, sy + 13, { size: 12, color: '#8ec6ea', align: 'center', baseline: 'middle', shadow: false });
    game.tutorialSkipRect = [sx, sy, 106, 26];
  }
}

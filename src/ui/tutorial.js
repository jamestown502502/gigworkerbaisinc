// First-play guided walkthrough. 11 steps across four phases.
// Rendered as a full-screen overlay with a highlight cutout; any click advances.
// Adds zero overhead once state.tutorialSeen is true (loop skips the render call).
import { drawText, drawWrapped, roundRectPath } from './text.js';

export const TUTORIAL_STEPS = [
  { phase: 'MORNING', rect: null, text: 'Welcome to the gig economy. Survive 30 days: pay rent, stay healthy, build your reputation.' },
  { phase: 'MORNING', rect: [0, 0, 800, 56], text: 'Five meters: cash, stress, reputation, energy, and balance (your overall wellbeing). Tap any of them for a hint.' },
  { phase: 'MORNING', rect: [0, 0, 800, 56], text: 'Energy is the hard limit. A gig shows its full energy cost before you accept, and you cannot take one you cannot afford. Hit zero and the day ends.' },
  { phase: 'MORNING', rect: [60, 526, 210, 52], text: 'Tap "Check Listings" to see today\'s available gigs.' },
  { phase: 'BROWSE', rect: [90, 100, 560, 340], text: 'Each gig shows payout, hours, location, risk, and energy cost. Tap a card to select it. Drag or use the arrows to scroll.' },
  { phase: 'BROWSE', rect: [200, 526, 220, 52], text: 'Selected a gig? Accept it here to head out.' },
  { phase: 'GIG', rect: [80, 120, 640, 140], text: 'Your choices matter. They affect your cash, stress, reputation, and energy.' },
  { phase: 'GIG', rect: null, text: 'Some gigs have timed challenges; social gigs start by reading the client. High stress makes challenges harder, and reading people well makes regulars.' },
  { phase: 'EVENING', rect: [50, 100, 340, 300], text: "Rent is due every 7 days. Miss it for 14 days and you're evicted — game over." },
  { phase: 'EVENING', rect: [410, 100, 340, 300], text: 'Evenings are a choice: wind down, call someone, or hustle late. What you do at night sets up tomorrow.' },
  { phase: 'EVENING', rect: [60, 526, 200, 52], text: 'Sleep ends the day. Energy recovers (more with good balance), fresh gigs appear tomorrow.' },
];

// Lerped highlight so the cutout glides between steps instead of jumping.
let shownRect = null;

export function renderTutorial(ctx, game) {
  const step = TUTORIAL_STEPS[game.state.tutorialStep];
  if (!step) return;
  const target = step.rect;
  if (target) {
    if (!shownRect) shownRect = [...target];
    else for (let i = 0; i < 4; i++) shownRect[i] += (target[i] - shownRect[i]) * 0.2;
  } else shownRect = null;
  const r = shownRect;
  if (globalThis.__textProbe) globalThis.__textProbe.push({ layer: true });

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  if (r) {
    const [x, y, w, h] = r;
    ctx.fillRect(0, 0, 800, y);
    ctx.fillRect(0, y + h, 800, 600 - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, 800 - x - w, h);
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
  if (target) by = target[1] + target[3] < 300 ? Math.min(400, target[1] + target[3] + 40) : Math.max(100, target[1] - 210);
  const bx = 150, bw = 500, bh = 160;
  ctx.fillStyle = 'rgba(15, 20, 28, 0.95)';
  roundRectPath(ctx, bx, by, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = '#5dade2';
  ctx.lineWidth = 2;
  roundRectPath(ctx, bx, by, bw, bh, 14); ctx.stroke();

  drawWrapped(ctx, step.text, bx + 30, by + 40, bw - 60, 24, { size: 17, color: '#ffffff', outline: true, shadow: false });
  drawText(ctx, `${game.state.tutorialStep + 1} / ${TUTORIAL_STEPS.length}  •  Tap anywhere to continue`, bx + bw / 2, by + bh - 16, {
    size: 13, color: '#aaaaaa', align: 'center', shadow: false,
  });

  // Skip: a fixed top-right pill on EVERY step, outside the bubble, so it never overlaps the
  // step text and is never missing on page 2 (QA #11, #16).
  const sx = 800 - 132, sy = 64;
  ctx.fillStyle = 'rgba(15, 20, 28, 0.95)';
  roundRectPath(ctx, sx, sy, 118, 32, 16); ctx.fill();
  ctx.strokeStyle = '#5dade2'; ctx.lineWidth = 1.5;
  roundRectPath(ctx, sx, sy, 118, 32, 16); ctx.stroke();
  drawText(ctx, 'Skip tutorial ✕', sx + 59, sy + 16, { size: 13, color: '#8ec6ea', align: 'center', baseline: 'middle', shadow: false });
  game.tutorialSkipRect = [sx - 6, sy - 6, 130, 44];
}

// First-play hints. Five short steps across four phases, each shown on the screen it is about.
// Rendered as a full-screen overlay with a highlight cutout; any click advances.
// Adds zero overhead once state.tutorialSeen is true (loop skips the render call).
import { drawText, drawWrapped, roundRectPath } from './text.js';
import { InputManager } from '../engine/input.js';

export const TUTORIAL_STEPS = [
  // Learn by doing (2026-11-10): five short hints, each on the screen it is about, instead of
  // eleven pages before the first job. The meters explain themselves when tapped (hud.js), the
  // count-in before each challenge says what to do, and the evening choices carry their own text.
  // `ready`: a step waits until what it points at is on screen (QA round 4 #6: this one used to
  // highlight an empty spot while the morning's news and events were still up).
  { phase: 'MORNING', rect: [60, 526, 210, 52], text: 'Rent is due every 7 days. Tap "Check Listings" to find work for today.', ready: (g) => g.morningReady && !g.shopOpen && !g.restDay && !g.activeEvent && !g.rentPay && !g.confirmRentEarly },
  { phase: 'BROWSE', rect: [90, 100, 560, 340], text: 'Tap a job, then Accept. The bolt is its energy cost, and $/h is what it pays per hour.' },
  { phase: 'GIG', rect: [80, 120, 640, 140], text: 'Your choices on the job change your pay, stress and reputation.' },
  { phase: 'EVENING', rect: [50, 100, 340, 300], text: "Bills are paid here on the day they are due. Rent unpaid for 14 days ends the run.", ready: (g) => !g.billsOpen && !g.wrapUpOpen && !g.shopOpen && !g.rentPay && !(g.ping && !g.ping.resolved && !g.ping.snoozed) },
  { phase: 'EVENING', rect: [180, 526, 210, 52], text: 'Sleep ends the day and refills your energy.', ready: (g) => !g.billsOpen && !g.wrapUpOpen && !g.shopOpen && !g.rentPay && !(g.ping && !g.ping.resolved && !g.ping.snoozed) },
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
  game.tutorialBubbleRect = [bx, by, bw, bh];   // a tap on the bubble only turns the page
  ctx.strokeStyle = '#5dade2';
  ctx.lineWidth = 2;
  roundRectPath(ctx, bx, by, bw, bh, 14); ctx.stroke();

  drawWrapped(ctx, step.text, bx + 30, by + 40, bw - 60, 24, { size: 17, color: '#ffffff', outline: true, shadow: false });
  drawText(ctx, `${game.state.tutorialStep + 1} / ${TUTORIAL_STEPS.length}  •  ${InputManager.mode === 'keys' ? 'Enter' : `${InputManager.tapWord()} anywhere`} to continue`, bx + bw / 2, by + bh - 16, {
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

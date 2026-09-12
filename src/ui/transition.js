// Phase transitions for an immediate-mode canvas game.
//
// A transition is a short (0.3-0.45 s) cover animation with the phase switch applied at its
// midpoint: before the midpoint the outgoing screen is drawn, after it the incoming one, and a
// themed cover drawn on top hides the cut. Input is dropped for the duration (loop.js clears the
// hotspot list while one is active), so no button can double-fire across a phase change.
//
// There are no retained objects to destroy and no timers racing tweens — it is a pure function
// of (kind, progress) drawn every frame — which is what makes it safe to layer on a game whose
// input and state are otherwise simple.
import { drawText, roundRectPath } from './text.js';

export const KINDS = ['fade', 'phone', 'commute', 'doorway', 'receipt', 'dusk', 'sunrise', 'paper'];

const DURATION = { fade: 0.24, phone: 0.38, commute: 0.42, doorway: 0.4, receipt: 0.45, dusk: 0.42, sunrise: 0.6, paper: 0.4 };

export function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/** Create a transition record. `apply` runs exactly once at the midpoint. */
export function createTransition(kind, apply, { reduceMotion = false, meta = {} } = {}) {
  const k = reduceMotion || !DURATION[kind] ? 'fade' : kind;
  return { kind: k, t: 0, dur: reduceMotion ? 0.14 : DURATION[k], applied: false, apply, meta, skyline: k === 'commute' ? makeSkyline() : null };
}

/** Advance; returns true when finished. */
export function stepTransition(tr, dt) {
  tr.t += dt;
  if (!tr.applied && tr.t >= tr.dur / 2) { tr.applied = true; tr.apply(); }
  return tr.t >= tr.dur;
}

function makeSkyline() {
  const bars = [];
  let x = 0;
  while (x < 1000) { const w = 30 + Math.random() * 70; bars.push({ x, w, h: 60 + Math.random() * 160 }); x += w + 6; }
  return bars;
}

/** Draw the cover for the current progress. Called after the screen is drawn. */
export function renderTransition(ctx, tr) {
  const p = Math.min(1, tr.t / tr.dur);          // 0..1 over the whole transition
  const cover = p < 0.5 ? easeInOut(p * 2) : easeInOut((1 - p) * 2); // 0 → 1 → 0, peak at midpoint
  ctx.save();
  switch (tr.kind) {
    case 'phone': {
      // A dark slab rises from the bottom to cover, then lifts off the top — the listings "phone" being raised.
      const y = p < 0.5 ? 600 - 600 * easeInOut(p * 2) : -600 * easeInOut((p - 0.5) * 2);
      ctx.fillStyle = '#0f1620';
      roundRectPath(ctx, -4, y, 808, 640, 26); ctx.fill();
      ctx.fillStyle = 'rgba(93,173,226,0.65)';
      roundRectPath(ctx, 360, y + 14, 80, 6, 3); ctx.fill();
      break;
    }
    case 'commute': {
      // Horizontal wipe carrying a skyline silhouette across the screen.
      const x = p < 0.5 ? -820 + 820 * easeInOut(p * 2) : 820 * easeInOut((p - 0.5) * 2);
      ctx.fillStyle = '#12100c';
      ctx.fillRect(x, 0, 820, 600);
      ctx.fillStyle = '#1f1a12';
      for (const b of tr.skyline) ctx.fillRect(x + b.x - 100, 600 - b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(241,196,15,0.5)';
      for (const b of tr.skyline) if (b.h > 140) ctx.fillRect(x + b.x - 100 + b.w / 2 - 3, 600 - b.h + 24, 6, 6);
      break;
    }
    case 'doorway': {
      // Iris: a circular opening shrinks to nothing then opens on the new screen.
      const r = 700 * (1 - cover);
      ctx.fillStyle = '#080604';
      ctx.beginPath();
      ctx.rect(0, 0, 800, 600);
      ctx.arc(400, 300, Math.max(0.01, r), 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      break;
    }
    case 'receipt': {
      // A receipt prints down from the top edge, then tears away upward.
      const h = 640 * cover;
      ctx.fillStyle = '#f3ead8';
      ctx.fillRect(120, 0, 560, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      for (let y = 40; y < h - 20; y += 34) { ctx.beginPath(); ctx.moveTo(150, y); ctx.lineTo(650 - (y * 7) % 200, y); ctx.stroke(); }
      if (h > 60) drawText(ctx, 'RECEIPT', 400, 34, { size: 16, weight: 'bold', color: '#3a2d1f', align: 'center', font: 'monospace', shadow: false });
      break;
    }
    case 'dusk': {
      // Warm-to-cool wash, peaking at the cut.
      const g = ctx.createLinearGradient(0, 0, 0, 600);
      g.addColorStop(0, `rgba(20,24,48,${0.95 * cover})`);
      g.addColorStop(1, `rgba(224,112,48,${0.85 * cover})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 800, 600);
      break;
    }
    case 'sunrise': {
      // Fade to black with the day counter rolling over like an odometer, then a warm sunrise ramp.
      ctx.fillStyle = `rgba(8,6,4,${Math.min(1, cover * 1.6)})`;
      ctx.fillRect(0, 0, 800, 600);
      if (cover > 0.55 && tr.meta.fromDay !== undefined) {
        const roll = Math.min(1, Math.max(0, (p - 0.35) / 0.3));
        const e = easeInOut(roll);
        ctx.save();
        ctx.beginPath(); ctx.rect(200, 250, 400, 100); ctx.clip();
        drawText(ctx, `Day ${tr.meta.fromDay}`, 400, 315 - 80 * e, { size: 44, weight: 'bold', color: '#c9a876', align: 'center', font: 'monospace' });
        drawText(ctx, `Day ${tr.meta.toDay}`, 400, 395 - 80 * e, { size: 44, weight: 'bold', color: '#ffd700', align: 'center', font: 'monospace' });
        ctx.restore();
      }
      if (p > 0.5) {
        const g = ctx.createLinearGradient(0, 600, 0, 0);
        g.addColorStop(0, `rgba(255,170,80,${0.6 * cover})`);
        g.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 600);
      }
      break;
    }
    case 'paper': {
      // A sheet slides in from the right and out to the left — for summary / tutorial pages.
      const x = p < 0.5 ? 800 - 800 * easeInOut(p * 2) : -800 * easeInOut((p - 0.5) * 2);
      ctx.fillStyle = '#efe6d3';
      ctx.fillRect(x, 0, 800, 600);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x - 10, 0, 10, 600);
      break;
    }
    default: {
      ctx.fillStyle = `rgba(8,6,4,${cover})`;
      ctx.fillRect(0, 0, 800, 600);
    }
  }
  ctx.restore();
}

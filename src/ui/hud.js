// Top bar: cash / stress / rep / energy meters + day counter.
import { drawSprite } from '../main.js';
import { drawText, drawMeter } from './text.js';

const HUD_H = 56;

// Smoothed display values so meters glide toward their targets instead of snapping.
const disp = { cash: null, stress: null, energy: null };
function ease(key, target) {
  if (disp[key] === null) disp[key] = target;
  disp[key] += (target - disp[key]) * 0.12;
  if (Math.abs(disp[key] - target) < 0.5) disp[key] = target;
  return disp[key];
}

export function renderHUD(ctx, state) {
  ctx.fillStyle = 'rgba(12, 9, 6, 0.92)';
  ctx.fillRect(0, 0, 800, HUD_H);
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(800, HUD_H); ctx.stroke();

  const iconY = 14, iconS = 28;

  // Cash (icon frame 0) — value ticks toward target
  const cashD = ease('cash', state.cash);
  drawSprite(ctx, 'uiIcons', 14, iconY, iconS, iconS, 0);
  drawText(ctx, `$${Math.round(cashD)}`, 48, HUD_H / 2, { size: 18, weight: 'bold', color: '#2ecc71', font: 'monospace', baseline: 'middle' });

  // Stress (icon frame 1) — bar
  const stressD = ease('stress', state.stress);
  drawSprite(ctx, 'uiIcons', 150, iconY, iconS, iconS, 1);
  drawMeter(ctx, 184, 20, 90, 14, stressD / 100, state.stress > 70 ? '#e74c3c' : '#e67e22');
  drawText(ctx, `${Math.round(stressD)}`, 280, HUD_H / 2, { size: 13, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });

  // Reputation (icon frame 2) — stars
  drawSprite(ctx, 'uiIcons', 330, iconY, iconS, iconS, 2);
  const full = Math.floor(state.reputation);
  const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
  drawText(ctx, stars, 364, HUD_H / 2 - 1, { size: 16, color: '#f1c40f', font: 'monospace', baseline: 'middle' });
  drawText(ctx, state.reputation.toFixed(1), 452, HUD_H / 2, { size: 12, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });

  // Energy (icon frame 3) — bar
  const energyD = ease('energy', state.energy);
  drawSprite(ctx, 'uiIcons', 500, iconY, iconS, iconS, 3);
  drawMeter(ctx, 534, 20, 90, 14, energyD / 100, state.energy < 25 ? '#e74c3c' : '#2ecc71');
  drawText(ctx, `${Math.round(energyD)}`, 630, HUD_H / 2, { size: 13, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });

  // Day counter + weather + bills (three-line right block)
  drawText(ctx, `Day ${state.day}`, 786, 13, { size: 15, weight: 'bold', color: '#f0f0f0', font: 'monospace', align: 'right', baseline: 'middle' });
  const w = state.weather;
  if (w) {
    drawText(ctx, `${w.emoji} ${w.name}`, 786, 29, { size: 13, weight: 'bold', color: w.color, align: 'right', baseline: 'middle' });
  }
  drawText(ctx, `Bills in ${Math.max(0, state.daysUntilBills)}d`, 786, 45, {
    size: 11, color: state.daysUntilBills <= 2 ? '#ff6b5e' : '#c9a876', font: 'monospace', align: 'right', baseline: 'middle',
  });

  // Health stays a hidden number, but very low health is *felt*: a breathing red frame
  if (state.health < 30) {
    const pulse = 0.25 + 0.15 * Math.sin(Date.now() / 250);
    ctx.strokeStyle = `rgba(231, 76, 60, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 797, HUD_H - 3);
  }
}

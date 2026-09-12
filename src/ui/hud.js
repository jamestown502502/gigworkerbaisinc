// Top bar: cash / stress / rep / energy / balance meters + day counter + mute + settings.
import { drawSprite } from '../engine/sprites.js';
import { drawText, drawMeter } from './text.js';
import { UI } from './screens.js';
import { applyAudioSettings } from '../engine/audio.js';

export const HUD_H = 56;

const METER_TOOLTIPS = {
  cash: 'Cash on hand. Runs out fast if bills go unpaid.',
  stress: 'Stress. High stress makes timed challenges harder. Wind down in the evening to lower it.',
  rep: 'Reputation. Unlocks creative gigs at 2 stars and "weird" gigs at 3. Reading clients well raises it.',
  energy: 'Energy. Gigs and travel cost it, sleep restores it. Every gig shows its cost up front.',
  balance: 'Balance. Your overall wellbeing: hunger, stress, and late nights wear it down; rest, food, and friends build it. Low balance means slower recovery and sick days.',
};

// Smoothed display values so meters glide toward their targets instead of snapping.
const disp = { cash: null, stress: null, energy: null, balance: null };
function ease(key, target) {
  if (disp[key] === null) disp[key] = target;
  disp[key] += (target - disp[key]) * 0.12;
  if (Math.abs(disp[key] - target) < 0.5) disp[key] = target;
  return disp[key];
}

function showTooltip(game, key) {
  game.hudTooltip = METER_TOOLTIPS[key];
  game.hudTooltipT = 0;
}

/** Five stars with real half-star fills. `Math.floor` alone made 3.5 and 3.0 look identical (QA #2). */
export function drawStars(ctx, x, y, rep, size = 15) {
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const cw = ctx.measureText('★').width;
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, rep - i));
    const sx = x + i * cw;
    ctx.fillStyle = '#5a4a2a';
    ctx.fillText('★', sx, y);
    if (fill > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx, y - size, cw * fill, size * 2); ctx.clip();
      ctx.fillStyle = '#f1c40f';
      ctx.fillText('★', sx, y);
      ctx.restore();
    }
  }
  ctx.textBaseline = 'alphabetic';
  return cw * 5;
}

export function rentDueLabel(days) {
  if (days <= 0) return 'Rent due today';
  if (days === 1) return 'Rent due tomorrow';
  return `Rent due in ${days} days`;
}

export function renderHUD(ctx, game) {
  const state = game.state;
  ctx.fillStyle = 'rgba(12, 9, 6, 0.92)';
  ctx.fillRect(0, 0, 800, HUD_H);
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(800, HUD_H); ctx.stroke();

  const iconY = 14, iconS = 28, mid = HUD_H / 2;

  // Cash
  const cashD = ease('cash', state.cash);
  drawSprite(ctx, 'uiIcons', 10, iconY, iconS, iconS, 0);
  drawText(ctx, `$${Math.round(cashD)}`, 42, mid, { size: 17, weight: 'bold', color: '#2ecc71', font: 'monospace', baseline: 'middle' });
  UI.register(6, 4, 100, 48, () => showTooltip(game, 'cash'));

  // Stress
  const stressD = ease('stress', state.stress);
  drawSprite(ctx, 'uiIcons', 118, iconY, iconS, iconS, 1);
  drawMeter(ctx, 150, 21, 64, 13, stressD / 100, state.stress > 70 ? '#e74c3c' : '#e67e22');
  drawText(ctx, `${Math.round(stressD)}`, 218, mid, { size: 12, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });
  UI.register(114, 4, 130, 48, () => showTooltip(game, 'stress'));

  // Reputation — stars with half fills
  drawSprite(ctx, 'uiIcons', 252, iconY, iconS, iconS, 2);
  const starsW = drawStars(ctx, 284, mid, state.reputation, 15);
  drawText(ctx, state.reputation.toFixed(1), 284 + starsW + 6, mid, { size: 11, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });
  UI.register(248, 4, 136, 48, () => showTooltip(game, 'rep'));

  // Energy
  const energyD = ease('energy', state.energy);
  drawSprite(ctx, 'uiIcons', 392, iconY, iconS, iconS, 3);
  drawMeter(ctx, 424, 21, 64, 13, energyD / 100, state.energy < 25 ? '#e74c3c' : '#2ecc71');
  drawText(ctx, `${Math.round(energyD)}`, 492, mid, { size: 12, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });
  UI.register(388, 4, 130, 48, () => showTooltip(game, 'energy'));

  // Balance (the wellbeing meter that used to be hidden)
  const balD = ease('balance', state.health);
  ctx.fillStyle = state.health < 30 ? '#e74c3c' : '#8fb7c9';
  ctx.beginPath(); ctx.arc(538, mid, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d150d';
  ctx.beginPath(); ctx.arc(538, mid, 9, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  drawMeter(ctx, 556, 21, 64, 13, balD / 100, state.health < 30 ? '#e74c3c' : '#8fb7c9');
  drawText(ctx, `${Math.round(balD)}`, 624, mid, { size: 12, color: '#f0f0f0', font: 'monospace', baseline: 'middle' });
  UI.register(524, 4, 124, 48, () => showTooltip(game, 'balance'));

  // Day counter + weather + rent (three-line right block)
  const dayLabel = state.freePlay && state.day > 30 ? `Day ${state.day} · free play` : `Day ${state.day}`;
  drawText(ctx, dayLabel, 728, 13, { size: 14, weight: 'bold', color: '#f0f0f0', font: 'monospace', align: 'right', baseline: 'middle' });
  const w = state.weather;
  if (w) {
    drawText(ctx, `${w.emoji} ${w.name}`, 728, 29, { size: 12, weight: 'bold', color: w.color, align: 'right', baseline: 'middle' });
  }
  drawText(ctx, rentDueLabel(Math.max(0, state.daysUntilBills)), 728, 45, {
    size: 11, color: state.daysUntilBills <= 2 ? '#ff6b5e' : '#c9a876', font: 'monospace', align: 'right', baseline: 'middle',
  });

  // Mute (one tap) and Settings, top-right corner
  const gearX = 768, gearY = 6, gearS = 20;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(gearX + gearS / 2, gearY + gearS / 2, gearS / 2 + 3, 0, Math.PI * 2); ctx.fill();
  drawText(ctx, '⚙', gearX + gearS / 2, gearY + gearS / 2, { size: 16, align: 'center', baseline: 'middle', shadow: false });
  UI.register(gearX - 6, gearY - 6, gearS + 12, gearS + 12, () => { game.settingsOpen = !game.settingsOpen; game.confirmReset = false; });

  const muteX = 768, muteY = 30;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(muteX + gearS / 2, muteY + gearS / 2, gearS / 2 + 3, 0, Math.PI * 2); ctx.fill();
  drawText(ctx, state.settings.muted ? '🔇' : '🔊', muteX + gearS / 2, muteY + gearS / 2, { size: 14, align: 'center', baseline: 'middle', shadow: false });
  UI.register(muteX - 6, muteY - 6, gearS + 12, gearS + 12, () => { state.settings.muted = !state.settings.muted; applyAudioSettings(); state.save(); });

  // Very low balance is *felt*: a breathing red frame
  if (state.health < 30) {
    const pulse = 0.25 + 0.15 * Math.sin(Date.now() / 250);
    ctx.strokeStyle = `rgba(231, 76, 60, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 797, HUD_H - 3);
  }

  // Meter tooltip — tap a meter to see a one-line explanation, auto-fades (see Game.update()).
  if (game.hudTooltip) {
    const alpha = Math.max(0, 1 - Math.max(0, game.hudTooltipT - 2) / 1);
    ctx.globalAlpha = alpha;
    ctx.font = '13px system-ui, sans-serif';
    const lines = [];
    let line = '';
    for (const word of game.hudTooltip.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > 560) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
    const tw = Math.min(600, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28);
    const th = 14 + lines.length * 18;
    ctx.fillStyle = 'rgba(10, 8, 5, 0.95)';
    ctx.fillRect(400 - tw / 2, HUD_H + 6, tw, th);
    ctx.strokeStyle = '#8b5a2b';
    ctx.strokeRect(400 - tw / 2, HUD_H + 6, tw, th);
    lines.forEach((l, i) => drawText(ctx, l, 400, HUD_H + 20 + i * 18, { size: 13, color: '#f0f0f0', align: 'center', baseline: 'middle', shadow: false }));
    ctx.globalAlpha = 1;
  }
}

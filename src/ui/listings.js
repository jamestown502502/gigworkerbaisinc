// Craigslist-style listing board: scrollable gig cards + accept button.
import { UI, button, drawBackground, TYPE_COLORS } from './screens.js';
import { drawText, roundRectPath, textWidth } from './text.js';
import { gigEnergyCost, travelCost, weatherGigEnergyMod } from '../game/gigs.js';
import { playError } from '../engine/audio.js';
import { InputManager } from '../engine/input.js';

const CARD_H = 78;
const CARD_PITCH = CARD_H + 6;
const VISIBLE = 5;
const LIST_X = 90, LIST_Y = 100, LIST_W = 560;

function totalCost(gig, state) {
  return travelCost(gig, state) + gigEnergyCost(gig, state);
}

function riskColor(risk) {
  return risk > 25 ? '#e74c3c' : risk > 15 ? '#f39c12' : '#2ecc71';
}

const LOC_ICON = { safe: '📍', okay: '📍', sketchy: '📍' };

export function renderListings(ctx, game) {
  const s = game.state;
  drawBackground(ctx, 'listingsBoard', 0.5);

  drawText(ctx, `TODAY'S LISTINGS — ${s.hoursLeft}h left in the day`, 400, 78, { size: 20, weight: 'bold', color: '#ffffff', align: 'center', outline: true });

  // weather banner: the board visibly reacts to the day's weather
  const wthr = s.weather;
  let bannerY = 94;
  if (wthr && wthr.id !== 'sunny') {
    const notes = {
      rainy: 'outdoor work is off the board',
      hot: 'all gigs cost +3 energy',
      cold: 'outdoor gigs cost +2 energy',
      perfect: 'bonus listings today!',
    };
    drawText(ctx, `${wthr.emoji} ${wthr.name} — ${notes[wthr.id]}`, 400, bannerY, { size: 12, weight: 'bold', color: wthr.color, align: 'center' });
    bannerY += 16;
  }
  if (s.stress > 60 && s.todayGigs.some((g) => g.hasQTE)) {
    drawText(ctx, "⚠ Your stress is high — timed challenges will feel a lot harder today.", 400, bannerY, {
      size: 12, weight: 'bold', color: '#ff6b5e', align: 'center',
    });
  }

  const gigs = s.todayGigs;
  if (gigs.length === 0) {
    ctx.fillStyle = 'rgba(30, 22, 14, 0.92)';
    roundRectPath(ctx, 200, 220, 400, 120, 12); ctx.fill();
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
    roundRectPath(ctx, 200, 220, 400, 120, 12); ctx.stroke();
    drawText(ctx, 'The board is picked clean for today.', 400, 282, { size: 15, color: '#e0e0e0', align: 'center' });
  }

  // Scroll: arrows, wheel, and finger drag (QA #19). Drag/wheel accumulate in pixels and
  // convert to whole cards so the arrows and the drag agree on where the list is.
  const maxScroll = Math.max(0, gigs.length - VISIBLE);
  const drag = InputManager.consumeDrag();
  const wheel = InputManager.consumeWheel();
  game.listScrollPx = (game.listScrollPx || 0) - drag.y + wheel * 0.5;
  while (game.listScrollPx >= CARD_PITCH * 0.6) { game.listScrollPx -= CARD_PITCH; game.listScroll += 1; }
  while (game.listScrollPx <= -CARD_PITCH * 0.6) { game.listScrollPx += CARD_PITCH; game.listScroll -= 1; }
  if (!InputManager.pointer.dragging) game.listScrollPx = 0;
  game.listScroll = Math.max(0, Math.min(game.listScroll, maxScroll));

  const shown = gigs.slice(game.listScroll, game.listScroll + VISIBLE);
  ctx.save();
  ctx.beginPath(); ctx.rect(LIST_X - 4, LIST_Y - 4, LIST_W + 8, VISIBLE * CARD_PITCH); ctx.clip();
  shown.forEach((gig, i) => {
    const y = LIST_Y + i * CARD_PITCH;
    drawGigCard(ctx, LIST_X, y, LIST_W, CARD_H, gig, game, s);
  });
  ctx.restore();

  // scroll buttons
  if (maxScroll > 0) {
    button(ctx, 670, LIST_Y, 50, 50, '▲', { color: '#2c3e50', disabled: game.listScroll === 0, onClick: () => { game.listScroll = Math.max(0, game.listScroll - 1); } });
    button(ctx, 670, LIST_Y + 60, 50, 50, '▼', { color: '#2c3e50', disabled: game.listScroll >= maxScroll, onClick: () => { game.listScroll = Math.min(maxScroll, game.listScroll + 1); } });
    drawText(ctx, `${game.listScroll + 1}-${Math.min(gigs.length, game.listScroll + VISIBLE)} of ${gigs.length}`, 695, LIST_Y + 132, { size: 11, color: '#c9a876', align: 'center', font: 'monospace' });
  }

  // footer actions
  const sel = game.selectedGig;
  const check = sel ? game.canAffordGig(sel) : null;
  button(ctx, 200, 526, 220, 52, sel ? `Accept: $${sel.payout}` : 'Accept Gig', {
    color: '#2c6e49',
    disabled: !sel || !check.ok,
    onClick: () => sel && game.acceptGig(sel),
    onDisabled: () => { playError(); if (check && !check.ok) game.message = check.reason; },
  });
  if (sel && check && check.ok) {
    drawText(ctx, `Energy after: ${Math.round(s.energy - check.need)}  ·  Hours after: ${s.hoursLeft - sel.hours}`, 310, 596, { size: 12, color: '#c9a876', align: 'center', font: 'monospace' });
  }
  button(ctx, 450, 526, 200, 52, 'Call It a Day', { color: '#5d4023', onClick: () => game.goEvening() });
  if (game.message) {
    drawText(ctx, game.message, 400, 512, { size: 13, color: '#f1c40f', align: 'center' });
  }
}

function drawGigCard(ctx, x, y, w, h, gig, game, s) {
  const selected = game.selectedGig === gig;
  const cost = totalCost(gig, s);
  const tooTired = s.energy < cost;
  const noTime = gig.hours > s.hoursLeft;
  const blocked = tooTired || noTime;
  const dim = blocked ? 0.45 : 1;

  ctx.fillStyle = selected ? '#2c3e50' : '#1e2a3a';
  roundRectPath(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = selected ? '#5dade2' : '#34495e';
  ctx.lineWidth = selected ? 3 : 1;
  roundRectPath(ctx, x, y, w, h, 8); ctx.stroke();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 8); ctx.clip();
  ctx.fillStyle = TYPE_COLORS[gig.type];
  ctx.globalAlpha = dim;
  ctx.fillRect(x, y, 8, h);
  ctx.restore();

  ctx.globalAlpha = dim;

  drawText(ctx, gig.title + (gig.isRepeat ? '  ♥' : ''), x + 20, y + 24, { size: 16, weight: 'bold', color: '#ffd700' });

  let details = `💰 $${gig.payout}   ⏱ ${gig.hours}h   ${LOC_ICON[gig.location]} ${gig.location}`;
  if (gig.remote) details += '   ✦ REMOTE';
  if (s.canSeeReliability) details += `   ${'★'.repeat(gig.clientReliability)}`;
  drawText(ctx, details, x + 20, y + 46, { size: 13, color: '#b8c4d0', font: 'monospace' });

  // full energy cost (travel + work + weather/event), visible before accepting (QA #1)
  const wmod = weatherGigEnergyMod(gig, s.weather) + (gig.outdoor ? (s.eventOutdoorEnergyMod || 0) : 0);
  drawText(ctx, `⚡ ${cost} energy${wmod !== 0 ? ` (${wmod > 0 ? '+' : ''}${wmod} ${s.weather ? s.weather.name.toLowerCase() : 'event'})` : ''}`, x + w - 16, y + 46, {
    size: 12, weight: 'bold', color: tooTired ? '#ff6b5e' : wmod > 0 ? '#ff9d5c' : '#2ecc71', font: 'monospace', align: 'right',
  });

  drawText(ctx, gig.description, x + 20, y + 65, { size: 11, color: '#8a99a8' });

  const rlabel = `⚠ ${gig.risk}%`;
  const tw = textWidth(ctx, rlabel, 12, 'monospace', 'bold');
  const pillW = tw + 16, pillX = x + w - pillW - 12, pillY = y + 10;
  ctx.fillStyle = riskColor(gig.risk);
  roundRectPath(ctx, pillX, pillY, pillW, 22, 11); ctx.fill();
  drawText(ctx, rlabel, pillX + pillW / 2, pillY + 11, { size: 12, weight: 'bold', color: '#0d0906', align: 'center', baseline: 'middle', shadow: false });

  ctx.globalAlpha = 1;

  if (game.cardFlash && game.cardFlash.gig === gig && Date.now() - game.cardFlash.at < 400) {
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, x, y, w, h, 8); ctx.stroke();
  }

  if (blocked) {
    drawText(ctx, noTime ? 'NO TIME' : 'TOO TIRED', x + w - 51, y + 62, { size: 11, weight: 'bold', color: '#ff6b5e', align: 'center' });
    UI.register(x, y, w, h, () => { playError(); game.cardFlash = { gig, at: Date.now() }; game.message = noTime ? `Needs ${gig.hours}h, you have ${s.hoursLeft}h left.` : `Needs ${cost} energy, you have ${Math.round(s.energy)}.`; });
  } else {
    UI.register(x, y, w, h, () => { game.selectedGig = gig; game.message = ''; });
  }
}

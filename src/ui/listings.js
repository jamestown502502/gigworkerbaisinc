// Craigslist-style listing board: scrollable gig cards + accept button.
import { UI, button, drawBackground, TYPE_COLORS } from './screens.js';
import { drawText, roundRectPath, textWidth } from './text.js';
import { gigEnergyCost, travelCost, weatherGigEnergyMod } from '../game/gigs.js';
import { playError } from '../engine/audio.js';

const CARD_H = 78;
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
  if (wthr && wthr.id !== 'sunny') {
    const notes = {
      rainy: 'outdoor work is off the board',
      hot: 'all gigs cost +3 energy',
      cold: 'outdoor gigs cost +2 energy',
      perfect: 'bonus listings today!',
    };
    drawText(ctx, `${wthr.emoji} ${wthr.name} — ${notes[wthr.id]}`, 400, 94, { size: 12, weight: 'bold', color: wthr.color, align: 'center' });
  }

  const gigs = s.todayGigs;
  if (gigs.length === 0) {
    ctx.fillStyle = 'rgba(30, 22, 14, 0.92)';
    roundRectPath(ctx, 200, 220, 400, 120, 12); ctx.fill();
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
    roundRectPath(ctx, 200, 220, 400, 120, 12); ctx.stroke();
    drawText(ctx, 'The board is picked clean for today.', 400, 282, { size: 15, color: '#e0e0e0', align: 'center' });
  }

  const maxScroll = Math.max(0, gigs.length - VISIBLE);
  game.listScroll = Math.min(game.listScroll, maxScroll);

  const shown = gigs.slice(game.listScroll, game.listScroll + VISIBLE);
  shown.forEach((gig, i) => {
    const y = LIST_Y + i * (CARD_H + 6);
    drawGigCard(ctx, LIST_X, y, LIST_W, CARD_H, gig, game, s);
  });

  // scroll buttons
  if (maxScroll > 0) {
    button(ctx, 670, LIST_Y, 50, 50, '▲', { color: '#2c3e50', disabled: game.listScroll === 0, onClick: () => { game.listScroll = Math.max(0, game.listScroll - 1); } });
    button(ctx, 670, LIST_Y + 60, 50, 50, '▼', { color: '#2c3e50', disabled: game.listScroll >= maxScroll, onClick: () => { game.listScroll = Math.min(maxScroll, game.listScroll + 1); } });
  }

  // footer actions
  const sel = game.selectedGig;
  button(ctx, 200, 526, 220, 52, sel ? `Accept: $${sel.payout}` : 'Accept Gig', {
    color: '#2c6e49',
    disabled: !sel,
    onClick: () => sel && game.acceptGig(sel),
    onDisabled: () => playError(),
  });
  button(ctx, 450, 526, 200, 52, 'Call It a Day', { color: '#5d4023', onClick: () => game.goEvening() });
}

function drawGigCard(ctx, x, y, w, h, gig, game, s) {
  const selected = game.selectedGig === gig;
  const tooTired = s.energy < totalCost(gig, s) + 2;
  const noTime = gig.hours > s.hoursLeft;
  const blocked = tooTired || noTime;
  const dim = blocked ? 0.45 : 1;

  // card body
  ctx.fillStyle = selected ? '#2c3e50' : '#1e2a3a';
  roundRectPath(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = selected ? '#5dade2' : '#34495e';
  ctx.lineWidth = selected ? 3 : 1;
  roundRectPath(ctx, x, y, w, h, 8); ctx.stroke();

  // type stripe (left, rounded via clip)
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 8); ctx.clip();
  ctx.fillStyle = TYPE_COLORS[gig.type];
  ctx.globalAlpha = dim;
  ctx.fillRect(x, y, 8, h);
  ctx.restore();

  ctx.globalAlpha = dim;

  // title
  drawText(ctx, gig.title + (gig.isRepeat ? '  ♥' : ''), x + 20, y + 24, { size: 16, weight: 'bold', color: '#ffd700' });

  // details row with icons
  let details = `💰 $${gig.payout}   ⏱ ${gig.hours}h   ${LOC_ICON[gig.location]} ${gig.location}`;
  if (gig.remote) details += '   ✦ REMOTE';
  if (s.canSeeReliability) details += `   ${'★'.repeat(gig.clientReliability)}`;
  drawText(ctx, details, x + 20, y + 46, { size: 13, color: '#b8c4d0', font: 'monospace' });

  // weather / event energy modifier, visible before accepting
  const wmod = weatherGigEnergyMod(gig, s.weather) + (gig.outdoor ? (s.eventOutdoorEnergyMod || 0) : 0);
  if (wmod !== 0) {
    drawText(ctx, `⚡${wmod > 0 ? '+' : ''}${wmod} energy (${s.weather ? s.weather.name.toLowerCase() : 'event'})`, x + w - 16, y + 46, {
      size: 12, weight: 'bold', color: wmod > 0 ? '#ff9d5c' : '#2ecc71', font: 'monospace', align: 'right',
    });
  }

  // flavor
  drawText(ctx, gig.description, x + 20, y + 65, { size: 11, color: '#8a99a8' });

  // risk badge (top-right pill)
  const rlabel = `⚠ ${gig.risk}%`;
  const tw = textWidth(ctx, rlabel, 12, 'monospace', 'bold');
  const pillW = tw + 16, pillX = x + w - pillW - 12, pillY = y + 10;
  ctx.fillStyle = riskColor(gig.risk);
  roundRectPath(ctx, pillX, pillY, pillW, 22, 11); ctx.fill();
  drawText(ctx, rlabel, pillX + pillW / 2, pillY + 11, { size: 12, weight: 'bold', color: '#0d0906', align: 'center', baseline: 'middle', shadow: false });

  ctx.globalAlpha = 1;

  // error flash: tapping a blocked card buzzes and flashes its border red
  if (game.cardFlash && game.cardFlash.gig === gig && Date.now() - game.cardFlash.at < 400) {
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, x, y, w, h, 8); ctx.stroke();
  }

  if (blocked) {
    drawText(ctx, noTime ? 'NO TIME' : 'TOO TIRED', x + w - 51, y + 62, { size: 11, weight: 'bold', color: '#ff6b5e', align: 'center' });
    UI.register(x, y, w, h, () => { playError(); game.cardFlash = { gig, at: Date.now() }; });
  } else {
    UI.register(x, y, w, h, () => { game.selectedGig = gig; });
  }
}

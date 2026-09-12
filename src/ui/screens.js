// Screen renderers + immediate-mode UI helpers.
import { drawSprite } from '../engine/sprites.js';
import { InputManager } from '../engine/input.js';
import { drawCharacter, renderCustomizer } from './character.js';
import { travelCost } from '../game/gigs.js';
import { UPGRADES, CONSUMABLES, EVENING_OPTIONS } from '../game/loop.js';
import { drawText, drawWrapped, roundRectPath } from './text.js';
import { playError, applyAudioSettings } from '../engine/audio.js';
import { QTE_READY_DURATION } from '../game/qte.js';
import { RUN_LENGTH_DAYS } from '../engine/state.js';
import { drawStars } from './hud.js';

// ---------- immediate-mode UI ----------
export const UI = {
  hotspots: [],
  begin() { this.hotspots.length = 0; }, // reuse the array instead of allocating a new one every frame
  register(x, y, w, h, onClick) { this.hotspots.push({ x, y, w, h, onClick }); },
  /** A modal's backdrop: swallows every tap that misses the modal's own buttons, so nothing
   *  underneath (customizer swatches, phase buttons) can be hit through it. */
  absorb() {
    this.hotspots.push({ x: 0, y: 0, w: 800, h: 600, onClick: null });
    // text-probe layer marker: anything drawn before this is under the modal backdrop
    if (globalThis.__textProbe) globalThis.__textProbe.push({ layer: true });
  },
  handleClick(pt) {
    for (let i = this.hotspots.length - 1; i >= 0; i--) {
      const b = this.hotspots[i];
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        b.onClick?.();
        return true;
      }
    }
    return false;
  },
};

const TYPE_COLORS = { physical: '#e07030', creative: '#9b59b6', service: '#3498db', weird: '#2ecc71' };
export { TYPE_COLORS };

function isHovered(x, y, w, h) {
  const h2 = InputManager.hover;
  return h2 && h2.x >= x && h2.x <= x + w && h2.y >= y && h2.y <= y + h;
}

// Rounded, styled button. Signature preserved so existing call sites work. A held press
// squashes the button slightly (0.96) — the one micro-interaction every tap gets.
export function button(ctx, x, y, w, h, label, { color = '#5d4023', textColor = '#ffffff', disabled = false, onClick = null, onDisabled = null, fontSize = 16, border = '#c9a876' } = {}) {
  const hov = !disabled && isHovered(x, y, w, h);
  const pressed = !disabled && InputManager.isPressedIn(x, y, w, h);
  ctx.save();
  if (pressed) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.96, 0.96); ctx.translate(-(x + w / 2), -(y + h / 2)); }
  const base = disabled ? '#3a3128' : color;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, hov ? lighten(base, 28) : lighten(base, 12));
  grad.addColorStop(1, hov ? lighten(base, 8) : base);
  ctx.fillStyle = grad;
  roundRectPath(ctx, x, y, w, h, 9);
  ctx.fill();

  ctx.strokeStyle = disabled ? '#5a4c3a' : (hov ? '#f1c40f' : border);
  ctx.lineWidth = 2;
  roundRectPath(ctx, x, y, w, h, 9);
  ctx.stroke();

  drawText(ctx, label, x + w / 2, y + h / 2, {
    size: fontSize,
    weight: 'bold',
    color: disabled ? '#8a7a63' : textColor,
    align: 'center',
    baseline: 'middle',
    outline: !disabled,
    maxWidth: w - 12,
  });
  ctx.restore();

  if (!disabled && onClick) UI.register(x, y, w, h, onClick);
  else if (disabled && onDisabled) UI.register(x, y, w, h, onDisabled);   // error feedback, never silent
}

// Lighten a #rrggbb hex by amount (0-255).
function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

export function panel(ctx, x, y, w, h, { alpha = 0.9 } = {}) {
  ctx.fillStyle = `rgba(30, 22, 14, ${alpha})`;
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 2;
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.stroke();
}

// Cover-fit a background sprite, then a dark overlay so text stays readable.
export function drawBackground(ctx, key, dim = 0.5) {
  drawSprite(ctx, key, 0, 0, 800, 600);
  ctx.fillStyle = `rgba(8, 6, 4, ${dim})`;
  ctx.fillRect(0, 0, 800, 600);
}

const WORK_BG_BY_TYPE = { physical: 'workPhysical', service: 'workService', creative: 'workCreative', weird: 'workWeird' };
export function workBackgroundKey(gig) {
  return (gig && WORK_BG_BY_TYPE[gig.type]) || 'workLocation';
}

const WEATHER_OVERLAY_BY_ID = { rainy: 'weatherRainy', hot: 'weatherHot', cold: 'weatherCold', sunny: 'weatherSunny', perfect: 'weatherPerfect' };
export function drawWeatherOverlay(ctx, weather) {
  const key = weather && WEATHER_OVERLAY_BY_ID[weather.id];
  if (!key) return;
  ctx.globalAlpha = 0.28;
  drawSprite(ctx, key, 0, 0, 800, 600);
  ctx.globalAlpha = 1;
}

function messageBar(ctx, game) {
  if (!game.message) return;
  ctx.fillStyle = 'rgba(20, 14, 8, 0.92)';
  roundRectPath(ctx, 60, 62, 680, 32, 8);
  ctx.fill();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 1;
  roundRectPath(ctx, 60, 62, 680, 32, 8);
  ctx.stroke();
  drawText(ctx, game.message, 400, 83, { size: 14, color: '#f1c40f', align: 'center', baseline: 'middle', maxWidth: 660 });
}

/** Modal panel entrance: a quick scale-in from 0.94. `t` is seconds since it opened. */
function modalScale(ctx, t, cx = 400, cy = 300) {
  const k = Math.min(1, t / 0.22);
  const s = 0.94 + 0.06 * (1 - Math.pow(1 - k, 3));
  ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
}

// ---------- APARTMENT (morning) ----------
export function apartmentScreen(ctx, game) {
  const s = game.state;
  drawBackground(ctx, 'apartment', 0.45);
  messageBar(ctx, game);

  // character + customizer panel (customizer is inert while an event is up — QA #14)
  panel(ctx, 30, 120, 300, 360);
  drawText(ctx, 'YOU', 180, 146, { size: 18, weight: 'bold', color: '#ffffff', align: 'center' });
  drawCharacter(ctx, 130, 160, 100, 200, s.character);
  renderCustomizer(ctx, 55, 378, s, (x, y, w, h, cb) => { if (!game.activeEvent) UI.register(x, y, w, h, cb); });

  // stats summary panel
  panel(ctx, 360, 120, 410, 220);
  drawText(ctx, `Morning — Day ${s.day}${s.freePlay && s.day > RUN_LENGTH_DAYS ? ' (free play)' : ''}`, 380, 152, { size: 22, weight: 'bold', color: '#ffffff' });
  const lines = [
    `Hours available today: ${s.hoursLeft}`,
    `Gigs on the board: ${s.todayGigs.length}`,
    `Gigs completed so far: ${s.gigsCompleted}`,
    `Lifetime earnings: $${Math.round(s.totalEarned)}`,
  ];
  if (s.calm) lines.push('Rested: timed challenges are easier today');
  if (s.unpaidRent > 0) lines.push(`OVERDUE RENT: $${s.unpaidRent} (${14 - s.rentOverdueDays} days to eviction!)`);
  if (s.phoneCut) lines.push(`Phone cut — pay $${s.unpaidPhone} to restore listings`);
  if (s.hungry) lines.push('Hungry — energy costs are doubled. Buy groceries in the Shop.');
  let ly = 180;
  for (const line of lines) {
    const warn = /OVERDUE|Phone cut|Hungry/.test(line);
    ly = drawWrapped(ctx, warn ? '⚠ ' + line : line, 380, ly, 370, 20, { size: 14, color: warn ? '#ff6b5e' : line.startsWith('Rested') ? '#2ecc71' : '#e0e0e0' });
  }

  // debt quick-pay
  let by = 350;
  if (s.unpaidRent > 0 && s.cash >= s.unpaidRent) {
    button(ctx, 360, by, 250, 40, `Pay Overdue Rent $${s.unpaidRent}`, { color: '#7a3020', onClick: () => game.payDebt('rent') });
    by += 48;
  }
  if (s.phoneCut && s.cash >= s.unpaidPhone) {
    button(ctx, 360, by, 250, 40, `Pay Phone Bill $${s.unpaidPhone}`, { color: '#7a3020', onClick: () => game.payDebt('phone') });
  }

  if (game.restDay) {
    panel(ctx, 200, 430, 400, 70);
    drawText(ctx, "You're too run down to work today. Rest up.", 400, 460, { size: 17, weight: 'bold', color: '#ff6b5e', align: 'center' });
    drawText(ctx, '+20 balance from a day in bed', 400, 482, { size: 13, color: '#c9a876', align: 'center' });
    button(ctx, 295, 526, 210, 52, 'Sleep', { color: '#2c6e49', onClick: () => { game.goEvening(); } });
  } else if (game.morningReady) {
    const noListings = s.phoneCut || s.listingsLockedToday;
    button(ctx, 60, 526, 210, 52, 'Check Listings', {
      color: noListings ? '#3a3128' : '#2c6e49',
      disabled: noListings,
      onClick: () => game.goBrowse(),
      onDisabled: () => {
        playError();
        game.message = s.phoneCut ? `Phone's cut off — pay the $${s.unpaidPhone} bill to see listings.` : 'Your phone is dead. No listings today.';
      },
    });
    button(ctx, 295, 526, 210, 52, game.shopOpen ? 'Close Shop' : 'Shop', { color: '#2c3e50', onClick: () => { game.shopOpen = !game.shopOpen; } });
    button(ctx, 530, 526, 210, 52, 'Sleep In (skip day)', { color: '#5d4023', onClick: () => game.goEvening() });
  }

  if (game.shopOpen) shopOverlay(ctx, game);

  // morning flavor ticker (fade in → hold → fade out per line)
  if (game.ticker.idx < game.ticker.lines.length) {
    const t = game.ticker.t;
    const alpha = t < 0.5 ? t / 0.5 : t > 2.5 ? Math.max(0, (3 - t) / 0.5) : 1;
    ctx.globalAlpha = alpha;
    drawText(ctx, game.ticker.lines[game.ticker.idx], 400, 108, { size: 15, color: '#aaaaaa', align: 'center', shadow: false, maxWidth: 680 });
    ctx.globalAlpha = 1;
    drawText(ctx, 'tap to skip', 400, 500, { size: 11, color: '#6a5a43', align: 'center', shadow: false });
  } else if (game.activeEvent) {
    eventModal(ctx, game);
  }
}

// Daily event modal. Every event now waits for a tap (QA #24); the backdrop absorbs stray taps.
function eventModal(ctx, game) {
  const e = game.activeEvent;
  const s = game.state;
  const fade = Math.min(1, (game.eventT || 0) / 0.25);
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(8, 6, 4, 0.82)';
  ctx.fillRect(0, 56, 800, 544);
  UI.absorb();

  const accents = { 1: '#8a99a8', 2: '#f1c40f', 3: '#e74c3c' };
  const labels = { 1: 'MORNING NOTE', 2: 'SOMETHING CAME UP', 3: 'CRISIS' };
  const accent = accents[e.tier] || '#8a99a8';
  const h = e.choices ? 140 + e.choices.length * 58 : 200;
  const y = Math.max(80, 300 - h / 2);

  ctx.save();
  modalScale(ctx, game.eventT || 0, 400, y + h / 2);
  panel(ctx, 160, y, 480, h, { alpha: 0.97 });
  ctx.fillStyle = accent;
  ctx.fillRect(162, y + 2, 476, 4);
  drawText(ctx, labels[e.tier] || '', 400, y + 32, { size: 13, weight: 'bold', color: accent, align: 'center' });
  const ty = drawWrapped(ctx, e.text, 195, y + 62, 410, 21, { size: 15, color: '#e0e0e0', shadow: false });
  ctx.restore();

  if (e.choices) {
    e.choices.forEach((opt, i) => {
      const oy = y + h - 24 - (e.choices.length - i) * 58;
      button(ctx, 210, oy, 380, 48, opt.text, {
        color: '#3d4d5c',
        fontSize: 15,
        disabled: opt.disabled ? opt.disabled(s) : false,
        onClick: () => game.chooseEventOption(opt),
        onDisabled: () => { playError(); game.message = "You can't afford that option."; },
      });
    });
  } else {
    if (game.eventOutcome) {
      drawText(ctx, game.eventOutcome, 400, ty + 10, { size: 15, weight: 'bold', color: accent, align: 'center' });
    }
    button(ctx, 300, y + h - 62, 200, 44, 'Continue', { color: '#2c6e49', fontSize: 15, onClick: () => game.startNextEvent() });
  }
  ctx.globalAlpha = 1;
}

// ---------- TRAVEL ----------
export function travelScreen(ctx, game) {
  const s = game.state;
  const gig = game.currentGig;
  drawBackground(ctx, workBackgroundKey(gig), 0.5);
  drawWeatherOverlay(ctx, s.weather);

  panel(ctx, 150, 180, 500, 240);
  drawText(ctx, `Traveling to: ${gig.title}`, 400, 218, { size: 20, weight: 'bold', color: '#ffffff', align: 'center', maxWidth: 470 });
  drawText(ctx, gig.description, 400, 246, { size: 14, color: '#c9a876', align: 'center', maxWidth: 470 });
  drawText(ctx, `Travel cost: ${travelCost(gig, s)} energy`, 400, 270, { size: 14, color: '#c9a876', align: 'center' });

  const t = game.travelT / 2;
  const cx = 200 + t * 360;
  const bob = Math.sin(game.travelT * 12) * 3;
  drawCharacter(ctx, cx, 300 + bob, 40, 80, s.character);

  ctx.fillStyle = '#161018';
  roundRectPath(ctx, 200, 396, 400, 16, 8); ctx.fill();
  const grad = ctx.createLinearGradient(200, 0, 600, 0);
  grad.addColorStop(0, '#e07030'); grad.addColorStop(1, '#f1c40f');
  ctx.fillStyle = grad;
  roundRectPath(ctx, 200, 396, Math.max(4, 400 * t), 16, 8); ctx.fill();

  if (game.travelT >= 2) {
    button(ctx, 300, 470, 200, 52, 'Start Gig', { color: '#2c6e49', onClick: () => game.startGig() });
  }
}

// ---------- GIG (choice tree, EI game, or QTE) ----------
export function gigScreen(ctx, game) {
  const gig = game.currentGig;
  drawBackground(ctx, workBackgroundKey(gig), 0.55);
  drawWeatherOverlay(ctx, game.state.weather);

  ctx.fillStyle = TYPE_COLORS[gig.type] || '#8b4513';
  ctx.fillRect(0, 60, 800, 36);
  drawText(ctx, `${gig.title}  •  $${gig.payout}  •  ${gig.hours}h`, 400, 78, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', outline: true, maxWidth: 760 });

  if (game.qte) {
    minigamePanel(ctx, game);
    return;
  }

  const node = game.node;
  if (!node) return;

  panel(ctx, 80, 120, 640, 140);
  drawWrapped(ctx, node.text, 105, 158, 590, 26, { size: 17, color: '#f0f0f0' });

  const s = game.state;
  node.choices.forEach((choice, i) => {
    const y = 290 + i * 64;
    const needsItem = choice.result?.requireItem || choice.requireItem;
    const missing = needsItem && !s.inventory.includes(needsItem);
    button(ctx, 120, y, 560, 52, missing ? `${choice.text} (needs ${needsItem})` : choice.text, {
      color: '#3d4d5c',
      disabled: missing,
      fontSize: 15,
      onClick: () => game.choose(choice),
      onDisabled: () => { playError(); game.message = `You need a ${needsItem} for that.`; },
    });
  });
}

/** Shared frame for every minigame (skill QTE, EI game, evening game). */
function minigamePanel(ctx, game) {
  panel(ctx, 90, 100, 620, 430, { alpha: 0.82 });
  drawText(ctx, game.qte.name, 400, 130, { size: 22, weight: 'bold', color: '#f1c40f', align: 'center' });
  drawText(ctx, game.qte.hint, 400, 154, { size: 14, color: '#e0e0e0', align: 'center', maxWidth: 580 });
  game.qte.render(ctx);
  if (game.qteKind === 'skill' && game.qteReadyT < QTE_READY_DURATION) {
    const pulse = 1 + 0.08 * Math.sin(game.qteReadyT * 14);
    ctx.save();
    ctx.translate(400, 316);
    ctx.scale(pulse, pulse);
    drawText(ctx, 'GET READY', 0, 0, { size: 30, weight: 'bold', color: '#ffffff', align: 'center', outline: true });
    ctx.restore();
  }
  if (game.qte.done && game.qte.result && game.qteKind === 'skill') {
    drawText(ctx, game.qte.result.success ? 'NICE!' : 'FUMBLED...', 400, 320, {
      size: 34, weight: 'bold', color: game.qte.result.success ? '#2ecc71' : '#e74c3c', align: 'center', outline: true,
    });
  }
}

// ---------- RESULTS ----------
export function resultsScreen(ctx, game) {
  const r = game.results;
  if (!r) return;
  drawBackground(ctx, workBackgroundKey(game.currentGig), 0.62);

  panel(ctx, 140, 80, 520, 450);
  drawText(ctx, 'GIG COMPLETE', 400, 114, { size: 22, weight: 'bold', color: '#ffffff', align: 'center' });

  // animated headline = the ledger total, always
  const shown = Math.round(Math.min(1, game.resultsT / 1.2) * r.total);
  drawText(ctx, `${r.total >= 0 ? '+' : '-'}$${Math.abs(shown)}`, 400, 164, { size: 40, weight: 'bold', color: r.total >= 0 ? '#2ecc71' : '#e74c3c', align: 'center', outline: true });

  // itemized ledger
  let y = 192;
  for (const item of r.items) {
    drawText(ctx, item.label, 180, y, { size: 13, color: '#c9a876', maxWidth: 330 });
    drawText(ctx, `${item.amount >= 0 ? '+' : '-'}$${Math.abs(item.amount)}`, 620, y, { size: 13, weight: 'bold', color: item.amount >= 0 ? '#2ecc71' : '#e74c3c', align: 'right', font: 'monospace' });
    y += 18;
  }
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(180, y - 8); ctx.lineTo(620, y - 8); ctx.stroke();
  y += 4;
  if (r.qteResult) {
    drawText(ctx, `Challenge ${r.qteResult.success ? 'cleared' : 'fumbled'} — score ${r.qteResult.score}`, 400, y, {
      size: 13, color: r.qteResult.success ? '#2ecc71' : '#e74c3c', align: 'center',
    });
    y += 18;
  }
  for (const t of r.outcomeTexts.slice(0, 3)) {
    y = drawWrapped(ctx, t, 400, y, 460, 17, { size: 12, color: '#c9a876', align: 'center' }) + 1;
  }

  // stat deltas
  y = Math.max(y + 10, 400);
  const deltas = [
    ['Cash', r.deltas.cash, '$', '#2ecc71', '#e74c3c'],
    ['Stress', r.deltas.stress, '', '#e74c3c', '#2ecc71'],
    ['Rep', r.deltas.rep, '', '#2ecc71', '#e74c3c'],
    ['Energy', r.deltas.energy, '', '#2ecc71', '#e74c3c'],
  ];
  deltas.forEach(([label, val, prefix, posColor, negColor], i) => {
    const dx = 220 + i * 120;
    const v = label === 'Rep' ? Math.abs(val).toFixed(1) : Math.abs(Math.round(val));
    drawText(ctx, `${val >= 0 ? '+' : '-'}${prefix}${v}`, dx, y, { size: 16, weight: 'bold', color: val >= 0 ? posColor : negColor, align: 'center' });
    drawText(ctx, label, dx, y + 18, { size: 12, color: '#c9a876', align: 'center' });
  });

  button(ctx, 300, 458, 200, 52, 'Continue', { color: '#2c6e49', onClick: () => game.continueFromResults() });
}

// ---------- EVENING ----------
export function eveningScreen(ctx, game) {
  const s = game.state;
  drawBackground(ctx, 'apartment', 0.62);
  // lamp-light: the evening apartment is the morning one with the warmth turned down and a lit corner
  const g = ctx.createRadialGradient(150, 200, 20, 150, 200, 420);
  g.addColorStop(0, 'rgba(255,190,90,0.22)'); g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 56, 800, 544);
  messageBar(ctx, game);

  panel(ctx, 50, 100, 340, 300);
  drawText(ctx, `Evening — Day ${s.day}`, 70, 132, { size: 20, weight: 'bold', color: '#ffffff' });
  const todays = s.gigHistory.filter((g2) => g2.day === s.day);
  const earned = todays.reduce((a, g2) => a + g2.payout, 0);
  let y = 160;
  drawText(ctx, `Gigs done today: ${todays.length}`, 70, y, { size: 14, color: '#e0e0e0' }); y += 22;
  drawText(ctx, `Earned today: $${earned}`, 70, y, { size: 15, weight: 'bold', color: '#2ecc71' }); y += 26;
  for (const g2 of todays.slice(-4)) {
    y = drawWrapped(ctx, `• ${g2.title} (+$${g2.payout})`, 70, y, 300, 18, { size: 13, color: '#c9a876' }) + 1;
  }
  if (s.unpaidRent > 0) {
    drawWrapped(ctx, `⚠ Overdue rent $${s.unpaidRent} — eviction in ${14 - s.rentOverdueDays} days`, 70, Math.max(y, 340), 300, 18, { size: 13, color: '#ff6b5e' });
  }

  // evening choice panel (right)
  eveningChoicePanel(ctx, game, 410, 100, 340, 400);

  const canBack = !game.billsOpen && !game.wrapUpOpen && !game.restDay;
  button(ctx, 60, 526, 200, 52, 'Sleep', { color: '#2c6e49', disabled: game.billsOpen || game.wrapUpOpen, onClick: () => game.sleep() });
  if (canBack) button(ctx, 270, 526, 110, 52, '← Back', { color: '#5d4023', onClick: () => game.backFromEvening() });
  if (s.unpaidRent > 0 && s.cash >= s.unpaidRent) {
    button(ctx, 390, 526, 240, 52, `Pay Rent Debt $${s.unpaidRent}`, { color: '#7a3020', onClick: () => game.payDebt('rent') });
  }

  if (game.shopOpen) shopOverlay(ctx, game);
  if (game.billsOpen) billsModal(ctx, game);
  else if (game.wrapUpOpen) wrapUpModal(ctx, game);
  else if (game.ping && !game.ping.resolved) pingModal(ctx, game);
}

function eveningChoicePanel(ctx, game, x, y, w, h) {
  const s = game.state;
  panel(ctx, x, y, w, h);
  drawText(ctx, 'TONIGHT', x + 18, y + 30, { size: 16, weight: 'bold', color: '#ffd700' });
  const done = s.eveningDoneDay === s.day;
  if (done) {
    drawWrapped(ctx, game.eveningOutcome || 'Evening spent. Time for bed.', x + 18, y + 62, w - 36, 20, { size: 14, color: '#e0e0e0' });
    drawText(ctx, `Support ${Math.round(s.support)}  ·  Balance ${Math.round(s.health)}`, x + 18, y + 176, { size: 12, color: '#c9a876', font: 'monospace' });
  } else {
    drawText(ctx, 'One thing before bed:', x + 18, y + 54, { size: 13, color: '#c9a876' });
    EVENING_OPTIONS.forEach((opt, i) => {
      const oy = y + 66 + i * 88;
      button(ctx, x + 18, oy, w - 36, 40, opt.label, { color: opt.id === 'hustle' ? '#5d4023' : '#2c5a6e', fontSize: 15, onClick: () => game.eveningChoice(opt.id) });
      drawWrapped(ctx, opt.desc, x + 18, oy + 56, w - 36, 15, { size: 11, color: '#a89878', shadow: false });
    });
  }
  button(ctx, x + 18, y + h - 58, w - 36, 40, game.shopOpen ? 'Close Shop' : 'Open Shop', { color: '#2c3e50', fontSize: 14, onClick: () => { game.shopOpen = !game.shopOpen; } });
}

export function eveningGameScreen(ctx, game) {
  drawBackground(ctx, 'apartment', 0.7);
  ctx.fillStyle = '#2c5a6e';
  ctx.fillRect(0, 60, 800, 36);
  drawText(ctx, `Evening — Day ${game.state.day}`, 400, 78, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', outline: true });
  if (game.qte) minigamePanel(ctx, game);
}

// Late-night ping: the boundary decision, with tomorrow's energy shown for each option.
function pingModal(ctx, game) {
  const s = game.state;
  const p = game.ping;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.82)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 150, 110, 500, 380, { alpha: 0.98 });
  ctx.fillStyle = '#5dade2'; ctx.fillRect(152, 112, 496, 4);
  drawText(ctx, 'LATE PING · 11:40 PM', 400, 146, { size: 13, weight: 'bold', color: '#5dade2', align: 'center' });
  drawWrapped(ctx, `"${p.gig.title.replace('Early call: ', '')} tomorrow, 6 a.m. sharp. $${p.gig.payout}. You in?"`, 185, 178, 430, 21, { size: 15, color: '#e0e0e0', shadow: false });
  const wake = Math.min(100, s.energy + 45 * (s.health >= 70 ? 1.2 : s.health < 40 ? 0.7 : 1));
  drawText(ctx, `Tomorrow's energy if you accept: ~${Math.round(Math.max(10, wake - 15))}   ·   if you decline: ~${Math.round(Math.min(100, wake + 5))}`, 400, 246, { size: 12, color: '#c9a876', align: 'center', font: 'monospace', maxWidth: 460 });
  const opts = [
    ['Take it (6 a.m., wake up tired)', 'accept', '#2c6e49'],
    ['Counter: 9 a.m. at +20%', 'counter', '#2c5a6e'],
    ['Decline. Tonight is yours.', 'decline', '#5d4023'],
  ];
  opts.forEach(([label, id, color], i) => {
    button(ctx, 200, 272 + i * 58, 400, 48, label, { color, fontSize: 15, onClick: () => game.resolvePing(id) });
  });
  drawText(ctx, 'Saying no costs nothing here. Saying yes costs tomorrow.', 400, 462, { size: 12, color: '#8a7a63', align: 'center', shadow: false });
}

// Weekly wrap-up — shows after bills every 7 days.
function wrapUpModal(ctx, game) {
  const s = game.state;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.82)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 170, 80, 460, 440, { alpha: 0.98 });

  drawText(ctx, `Week ${s.weekNumber} Wrap-Up`, 400, 128, { size: 28, weight: 'bold', color: '#ffd700', align: 'center' });
  const earned = Math.round(s.cash - s.weekStats.startingCash);
  drawWrapped(ctx, wrapUpHeadline(earned), 400, 166, 390, 22, { size: 17, color: '#e0e0e0', align: 'center' });

  const rows = [
    ['Gigs Completed', `${s.weekStats.gigsDone}`],
    ['Total Earned', `$${Math.round(s.weekStats.totalEarned)}`],
    ['Reputation', `${s.reputation.toFixed(1)} ★`],
    ['Evenings you rested', `${s.weekStats.eveningsRested || 0} / 7`],
    ['Balance', balanceVerdict(s.health)],
    ['Days Survived', `${s.day}`],
  ];
  const gy = 246;
  panel(ctx, 210, gy - 28, 380, rows.length * 30 + 16, { alpha: 0.6 });
  rows.forEach(([k, v], i) => {
    drawText(ctx, k, 232, gy + i * 30, { size: 15, color: '#c9a876' });
    drawText(ctx, v, 568, gy + i * 30, { size: 15, weight: 'bold', color: '#f0f0f0', align: 'right', font: 'monospace' });
  });

  button(ctx, 300, 452, 200, 48, 'Continue', { color: '#2c6e49', onClick: () => game.finishWrapUp() });
}

function balanceVerdict(h) {
  if (h >= 80) return 'Steady';
  if (h >= 55) return 'Holding up';
  if (h >= 30) return 'Fraying';
  return 'Running on empty';
}

function wrapUpHeadline(earned) {
  if (earned > 300) return `A great week. You earned $${earned} after expenses.`;
  if (earned > 0) return `A solid week. You earned $${earned} after expenses.`;
  if (earned > -100) return `A tight week. You're down $${Math.abs(earned)}.`;
  return `A rough week. You're down $${Math.abs(earned)}. Keep pushing.`;
}

function shopPanel(ctx, game, x, y, w, h) {
  const s = game.state;
  panel(ctx, x, y, w, h);
  drawSprite(ctx, 'items', x + w - 46, y + 8, 36, 36);
  drawText(ctx, 'SHOP', x + 18, y + 30, { size: 16, weight: 'bold', color: '#ffd700' });
  const rows = [
    ...CONSUMABLES.map((c) => ({ ...c, kind: 'food', canBuyNow: c.canBuy(s) })),
    ...UPGRADES.filter((u) => !s.upgradesOwned.includes(u.name)).map((u) => ({ ...u, kind: 'upgrade', canBuyNow: true })),
  ];
  if (rows.length === 0) {
    drawText(ctx, 'Nothing left to buy!', x + 18, y + 62, { size: 14, color: '#e0e0e0' });
    return;
  }
  const perPage = Math.floor((h - 60) / 62);
  rows.slice(0, perPage).forEach((up, i) => {
    const uy = y + 44 + i * 62;
    drawText(ctx, `${up.kind === 'food' ? '🍞 ' : ''}${up.name} — $${up.cost}`, x + 18, uy + 15, { size: 14, weight: 'bold', color: '#f0f0f0', maxWidth: w - 110 });
    drawText(ctx, up.canBuyNow ? up.effect : 'Already ate today', x + 18, uy + 32, { size: 11, color: '#a89878', maxWidth: w - 110 });
    button(ctx, x + w - 78, uy + 2, 64, 40, 'Buy', {
      color: '#2c6e49',
      disabled: s.cash < up.cost || !up.canBuyNow,
      fontSize: 13,
      onClick: () => game.buyUpgrade(up),
      onDisabled: () => { playError(); game.message = s.cash < up.cost ? `You need $${up.cost} for that.` : 'You already ate today.'; },
    });
  });
}

function shopOverlay(ctx, game) {
  ctx.fillStyle = 'rgba(8, 6, 4, 0.7)';
  ctx.fillRect(0, 56, 800, 460);
  UI.absorb();
  shopPanel(ctx, game, 200, 90, 400, 424);
  // keep the toggle reachable above the absorbing backdrop
  const onMorning = game.phase === 'MORNING';
  button(ctx, onMorning ? 295 : 428, onMorning ? 526 : 442, onMorning ? 210 : 304, onMorning ? 52 : 40, 'Close Shop', { color: '#2c3e50', fontSize: 14, onClick: () => { game.shopOpen = false; } });
}

function billsModal(ctx, game) {
  const s = game.state;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.82)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 180, 120, 440, 360, { alpha: 0.98 });
  drawText(ctx, 'BILLS DUE', 400, 158, { size: 22, weight: 'bold', color: '#f1c40f', align: 'center' });
  drawText(ctx, `Cash on hand: $${Math.round(s.cash)}`, 400, 182, { size: 14, color: '#e0e0e0', align: 'center' });

  const bills = [
    { kind: 'rent', label: 'Rent', warn: 'Miss it: eviction clock starts' },
    { kind: 'phone', label: 'Phone', warn: 'Miss it: no listings' },
    { kind: 'food', label: 'Food', warn: 'Miss it: energy costs double until you buy groceries' },
  ];
  bills.forEach((b, i) => {
    const by = 210 + i * 66;
    const amt = game.billAmount(b.kind);
    const paid = game.billsPaid[b.kind];
    drawText(ctx, `${b.label}: $${amt}${paid ? '  ✓ PAID' : ''}`, 210, by + 16, { size: 15, weight: 'bold', color: paid ? '#2ecc71' : '#f0f0f0' });
    drawText(ctx, b.warn, 210, by + 34, { size: 11, color: '#a89878', maxWidth: 280 });
    if (!paid) {
      button(ctx, 500, by, 96, 40, 'Pay', {
        color: '#2c6e49',
        disabled: s.cash < amt,
        fontSize: 14,
        onClick: () => game.payBill(b.kind),
        onDisabled: () => playError(),
      });
    }
  });

  const allPaid = game.billsPaid.rent && game.billsPaid.phone && game.billsPaid.food;
  button(ctx, 280, 416, 240, 46, allPaid ? 'Done' : 'Skip Unpaid Bills', {
    color: allPaid ? '#2c6e49' : '#7a3020',
    onClick: () => game.closeBills(),
  });
}

// ---------- SETTINGS (global overlay — opened from the HUD gear icon, any phase) ----------
function volumeRow(ctx, game, x, y, label, key) {
  const s = game.state.settings;
  drawText(ctx, `${label} — ${Math.round(s[key] * 100)}%`, x, y, { size: 14, color: '#c9a876' });
  const barX = x, barY = y + 14, barW = 220;
  // The bar itself is draggable / tappable (QA #25); the +/- buttons stay for precision.
  if (InputManager.isPressedIn(barX - 8, barY - 12, barW + 16, 36)) {
    const v = Math.max(0, Math.min(1, (InputManager.pointer.x - barX) / barW));
    s[key] = Math.round(v * 20) / 20;
    applyAudioSettings();
    game.state.save();
  }
  ctx.fillStyle = '#3a2d1f';
  roundRectPath(ctx, barX, barY, barW, 12, 6); ctx.fill();
  ctx.fillStyle = '#e07030';
  roundRectPath(ctx, barX, barY, Math.max(6, barW * s[key]), 12, 6); ctx.fill();
  ctx.fillStyle = '#f5deb3';
  ctx.beginPath(); ctx.arc(barX + barW * s[key], barY + 6, 9, 0, Math.PI * 2); ctx.fill();
  const step = (delta) => {
    s[key] = Math.max(0, Math.min(1, Math.round((s[key] + delta) * 10) / 10));
    applyAudioSettings();
    game.state.save();
  };
  button(ctx, barX + barW + 24, barY - 14, 40, 40, '-', { fontSize: 16, onClick: () => step(-0.1) });
  button(ctx, barX + barW + 68, barY - 14, 40, 40, '+', { fontSize: 16, onClick: () => step(0.1) });
}

function toggleRow(ctx, x, y, label, get, set) {
  drawText(ctx, label, x, y + 24, { size: 15, color: '#f0f0f0' });
  button(ctx, x + 250, y, 90, 40, get() ? 'ON' : 'OFF', {
    color: get() ? '#2c6e49' : '#3a3128',
    fontSize: 14,
    onClick: () => set(!get()),
  });
}

export function settingsModal(ctx, game) {
  const s = game.state.settings;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.85)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 170, 40, 460, 530, { alpha: 0.98 });
  drawText(ctx, 'SETTINGS', 400, 76, { size: 24, weight: 'bold', color: '#ffd700', align: 'center' });

  let y = 110;
  volumeRow(ctx, game, 204, y, 'Master Volume', 'masterVolume'); y += 52;
  volumeRow(ctx, game, 204, y, 'Music Volume', 'musicVolume'); y += 52;
  volumeRow(ctx, game, 204, y, 'SFX Volume', 'sfxVolume'); y += 60;

  toggleRow(ctx, 204, y, 'Mute All', () => s.muted, (v) => { s.muted = v; applyAudioSettings(); game.state.save(); }); y += 48;
  toggleRow(ctx, 204, y, 'Reduce Timing Pressure', () => s.reduceTimingPressure, (v) => { s.reduceTimingPressure = v; game.state.save(); }); y += 44;
  drawWrapped(ctx, 'Widens timed-challenge windows and slows their timers.', 204, y, 380, 15, { size: 11, color: '#8a7a63' }); y += 22;
  toggleRow(ctx, 204, y, 'Reduce Motion', () => s.reduceMotion, (v) => { s.reduceMotion = v; game.state.save(); }); y += 44;
  drawWrapped(ctx, 'Replaces screen transitions with a quick fade.', 204, y, 380, 15, { size: 11, color: '#8a7a63' }); y += 30;

  button(ctx, 204, y, 180, 40, 'Replay tutorial', { color: '#2c5a6e', fontSize: 13, onClick: () => game.replayTutorial() });
  if (game.confirmReset) {
    button(ctx, 400, y, 190, 40, 'Really reset? YES', { color: '#7a3020', fontSize: 13, onClick: () => { game.newGame(); game.settingsOpen = false; game.confirmReset = false; } });
  } else {
    button(ctx, 400, y, 190, 40, 'Reset progress', { color: '#5d4023', fontSize: 13, onClick: () => { game.confirmReset = true; } });
  }
  y += 48;
  if (game.confirmReset) drawText(ctx, 'This deletes the current run. Settings are kept.', 400, y, { size: 11, color: '#ff6b5e', align: 'center' });

  button(ctx, 300, 512, 200, 44, 'Close', { color: '#2c6e49', onClick: () => { game.settingsOpen = false; game.confirmReset = false; } });
}

// ---------- SUMMARY (day 30) ----------
function runVerdict(s) {
  if (s.cash >= 1500 && s.health >= 60) return 'You made it — and you made it with something left in the tank.';
  if (s.cash >= 1500) return 'You made rent with room to spare. You also ran yourself into the ground doing it.';
  if (s.health >= 60) return 'Money stayed tight, but you took care of yourself. That is not nothing.';
  if (s.unpaidRent > 0) return 'Still standing, still behind on rent. The month ended before the math did.';
  return 'Thirty days. Every bill paid, barely, and nothing left over. Sound familiar?';
}

export function summaryScreen(ctx, game) {
  const s = game.state;
  ctx.fillStyle = '#0d0906';
  ctx.fillRect(0, 0, 800, 600);
  drawBackground(ctx, 'apartment', 0.78);
  panel(ctx, 110, 50, 580, 500, { alpha: 0.96 });
  drawText(ctx, '30 DAYS DONE', 400, 96, { size: 34, weight: 'bold', color: '#ffd700', align: 'center', outline: true });
  drawWrapped(ctx, runVerdict(s), 400, 134, 500, 22, { size: 16, color: '#e0e0e0', align: 'center' });

  const rows = [
    ['Cash on hand', `$${Math.round(s.cash)}`],
    ['Total earned', `$${Math.round(s.totalEarned)}`],
    ['Gigs completed', `${s.gigsCompleted}`],
    ['Reputation', `${s.reputation.toFixed(1)} ★`],
    ['Balance', `${Math.round(s.health)} — ${balanceVerdict(s.health)}`],
    ['Evenings rested', `${s.eveningsRested}`],
    ['Clients read well', `${s.eiWins}`],
  ];
  const gy = 224;
  panel(ctx, 190, gy - 26, 420, rows.length * 28 + 14, { alpha: 0.6 });
  rows.forEach(([k, v], i) => {
    drawText(ctx, k, 214, gy + i * 28, { size: 15, color: '#c9a876' });
    drawText(ctx, v, 586, gy + i * 28, { size: 15, weight: 'bold', color: '#f0f0f0', align: 'right', font: 'monospace' });
  });
  drawStars(ctx, 366, 452, s.reputation, 20);

  button(ctx, 160, 480, 220, 50, 'Free play (keep going)', { color: '#2c5a6e', fontSize: 14, onClick: () => game.startFreePlay() });
  button(ctx, 420, 480, 220, 50, 'New run', { color: '#2c6e49', fontSize: 14, onClick: () => game.newGame() });
}

// ---------- GAME OVER ----------
export function gameOverScreen(ctx, game) {
  const s = game.state;
  ctx.fillStyle = '#0d0906';
  ctx.fillRect(0, 0, 800, 600);
  drawText(ctx, 'EVICTED', 400, 180, { size: 38, weight: 'bold', color: '#e74c3c', align: 'center', outline: true });
  drawText(ctx, 'Rent went unpaid for two weeks. The landlord changed the locks.', 400, 232, { size: 15, color: '#e0e0e0', align: 'center' });
  drawText(ctx, `Days survived: ${s.day}`, 400, 300, { size: 17, weight: 'bold', color: '#f0f0f0', align: 'center' });
  drawText(ctx, `Gigs completed: ${s.gigsCompleted}`, 400, 330, { size: 17, weight: 'bold', color: '#f0f0f0', align: 'center' });
  drawText(ctx, `Total earned: $${Math.round(s.totalEarned)}`, 400, 360, { size: 17, weight: 'bold', color: '#f0f0f0', align: 'center' });
  button(ctx, 300, 430, 200, 56, 'New Game', { color: '#2c6e49', onClick: () => game.newGame() });
}

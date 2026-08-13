// Screen renderers + immediate-mode UI helpers.
import { drawSprite } from '../main.js';
import { InputManager } from '../engine/input.js';
import { drawCharacter, renderCustomizer } from './character.js';
import { travelCost } from '../game/gigs.js';
import { UPGRADES } from '../game/loop.js';
import { drawText, drawWrapped, roundRectPath } from './text.js';
import { playError, applyAudioSettings } from '../engine/audio.js';
import { QTE_READY_DURATION } from '../game/qte.js';

// ---------- immediate-mode UI ----------
export const UI = {
  hotspots: [],
  begin() { this.hotspots.length = 0; }, // reuse the array instead of allocating a new one every frame
  register(x, y, w, h, onClick) { this.hotspots.push({ x, y, w, h, onClick }); },
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

// Rounded, styled button. Signature preserved so existing call sites work.
export function button(ctx, x, y, w, h, label, { color = '#5d4023', textColor = '#ffffff', disabled = false, onClick = null, onDisabled = null, fontSize = 16, border = '#c9a876' } = {}) {
  const hov = !disabled && isHovered(x, y, w, h);
  // subtle vertical gradient for depth
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
  });

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

// All 12 GIG_TEMPLATES used to render against one generic work-location.png regardless of
// type — a water-slide-testing gig and an IKEA-assembly gig looked identical. Swap in a
// per-category background instead.
const WORK_BG_BY_TYPE = { physical: 'workPhysical', service: 'workService', creative: 'workCreative', weird: 'workWeird' };
export function workBackgroundKey(gig) {
  return (gig && WORK_BG_BY_TYPE[gig.type]) || 'workLocation';
}

const WEATHER_OVERLAY_BY_ID = { rainy: 'weatherRainy', hot: 'weatherHot', cold: 'weatherCold', sunny: 'weatherSunny', perfect: 'weatherPerfect' };
// Drawn at reduced alpha over whatever's already on screen — not an opaque background swap.
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
  drawText(ctx, game.message, 400, 83, { size: 15, color: '#f1c40f', align: 'center', baseline: 'middle' });
}

// ---------- APARTMENT (morning) ----------
export function apartmentScreen(ctx, game) {
  const s = game.state;
  drawBackground(ctx, 'apartment', 0.45);
  messageBar(ctx, game);

  // character + customizer panel
  panel(ctx, 30, 120, 300, 360);
  drawText(ctx, 'YOU', 180, 146, { size: 18, weight: 'bold', color: '#ffffff', align: 'center' });
  drawCharacter(ctx, 130, 160, 100, 200, s.character);
  renderCustomizer(ctx, 55, 378, s, (x, y, w, h, cb) => UI.register(x, y, w, h, cb));

  // stats summary panel
  panel(ctx, 360, 120, 410, 220);
  drawText(ctx, `Morning — Day ${s.day}`, 380, 152, { size: 22, weight: 'bold', color: '#ffffff' });
  const lines = [
    `Hours available today: ${s.hoursLeft}`,
    `Gigs on the board: ${s.todayGigs.length}`,
    `Gigs completed so far: ${s.gigsCompleted}`,
    `Lifetime earnings: $${Math.round(s.totalEarned)}`,
  ];
  if (s.unpaidRent > 0) lines.push(`OVERDUE RENT: $${s.unpaidRent} (${14 - s.rentOverdueDays} days to eviction!)`);
  if (s.phoneCut) lines.push(`Phone cut — pay $${s.unpaidPhone} to restore listings`);
  if (s.hungry) lines.push('Hungry — energy drains twice as fast');
  let ly = 180;
  for (const line of lines) {
    const warn = /OVERDUE|Phone cut|Hungry/.test(line);
    ly = drawWrapped(ctx, warn ? '⚠ ' + line : line, 380, ly, 370, 22, { size: 15, color: warn ? '#ff6b5e' : '#e0e0e0' });
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

  // actions — sick days lock everything but sleep; otherwise wait for the
  // morning ticker + events to finish before the day's buttons appear
  if (game.restDay) {
    panel(ctx, 200, 430, 400, 70);
    drawText(ctx, "You're too sick to work today. Rest up.", 400, 460, { size: 17, weight: 'bold', color: '#ff6b5e', align: 'center' });
    drawText(ctx, '+20 health from a day in bed', 400, 482, { size: 13, color: '#c9a876', align: 'center' });
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
    drawText(ctx, game.ticker.lines[game.ticker.idx], 400, 108, { size: 15, color: '#aaaaaa', align: 'center', shadow: false });
    ctx.globalAlpha = 1;
  } else if (game.activeEvent) {
    eventModal(ctx, game);
  }
}

// Daily event modal (Step 1). Flavor auto-dismisses; choices wait for a click.
function eventModal(ctx, game) {
  const e = game.activeEvent;
  const s = game.state;
  ctx.globalAlpha = Math.min(1, (game.eventT || 0) / 0.25);   // quick fade-in, no pop
  ctx.fillStyle = 'rgba(8, 6, 4, 0.55)';
  ctx.fillRect(0, 56, 800, 544);

  const accents = { 1: '#8a99a8', 2: '#f1c40f', 3: '#e74c3c' };
  const labels = { 1: 'MORNING NOTE', 2: 'SOMETHING CAME UP', 3: 'CRISIS' };
  const accent = accents[e.tier] || '#8a99a8';
  const h = e.choices ? 130 + e.choices.length * 58 : 190;
  const y = Math.max(80, 300 - h / 2);

  panel(ctx, 160, y, 480, h, { alpha: 0.97 });
  ctx.fillStyle = accent;
  ctx.fillRect(162, y + 2, 476, 4);
  drawText(ctx, labels[e.tier] || '', 400, y + 32, { size: 13, weight: 'bold', color: accent, align: 'center' });
  const ty = drawWrapped(ctx, e.text, 195, y + 62, 410, 21, { size: 15, color: '#aaaaaa', shadow: false });

  if (e.choices) {
    e.choices.forEach((opt, i) => {
      const oy = y + h - 24 - (e.choices.length - i) * 58;
      button(ctx, 210, oy, 380, 48, opt.text, {
        color: '#3d4d5c',
        fontSize: 15,
        disabled: opt.disabled ? opt.disabled(s) : false,
        onClick: () => game.chooseEventOption(opt),
        onDisabled: () => playError(),
      });
    });
  } else {
    if (game.eventOutcome) {
      drawText(ctx, game.eventOutcome, 400, ty + 10, { size: 15, weight: 'bold', color: accent, align: 'center' });
    }
    drawText(ctx, '(tap to continue)', 400, y + h - 18, { size: 12, color: '#8a7a63', align: 'center', shadow: false });
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
  drawText(ctx, `Traveling to: ${gig.title}`, 400, 218, { size: 20, weight: 'bold', color: '#ffffff', align: 'center' });
  drawText(ctx, gig.description, 400, 246, { size: 14, color: '#c9a876', align: 'center' });
  drawText(ctx, `Travel cost: ${travelCost(gig, s)} energy`, 400, 270, { size: 14, color: '#c9a876', align: 'center' });

  // walking character with a little bob
  const t = game.travelT / 2;
  const cx = 200 + t * 360;
  const bob = Math.sin(game.travelT * 12) * 3;
  drawCharacter(ctx, cx, 300 + bob, 40, 80, s.character);

  // progress bar
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

// ---------- GIG (choice tree or QTE) ----------
export function gigScreen(ctx, game) {
  const gig = game.currentGig;
  drawBackground(ctx, workBackgroundKey(gig), 0.55);
  drawWeatherOverlay(ctx, game.state.weather);

  // gig title ribbon
  ctx.fillStyle = TYPE_COLORS[gig.type] || '#8b4513';
  ctx.fillRect(0, 60, 800, 36);
  drawText(ctx, `${gig.title}  •  $${gig.payout}  •  ${gig.hours}h`, 400, 78, { size: 16, weight: 'bold', color: '#ffffff', align: 'center', outline: true });

  if (game.qte) {
    panel(ctx, 90, 100, 620, 430, { alpha: 0.82 });
    drawText(ctx, game.qte.name, 400, 130, { size: 22, weight: 'bold', color: '#f1c40f', align: 'center' });
    drawText(ctx, game.qte.hint, 400, 154, { size: 15, color: '#e0e0e0', align: 'center' });
    game.qte.render(ctx);
    if (game.qteReadyT < QTE_READY_DURATION) {
      // Telegraph: the mechanic doesn't spring on the player the instant this modal opens —
      // input is gated (see Game.update()/processInput()) until this beat finishes.
      const pulse = 1 + 0.08 * Math.sin(game.qteReadyT * 14);
      ctx.save();
      ctx.translate(400, 316);
      ctx.scale(pulse, pulse);
      drawText(ctx, 'GET READY', 0, 0, { size: 30, weight: 'bold', color: '#ffffff', align: 'center', outline: true });
      ctx.restore();
    }
    if (game.qte.done && game.qte.result) {
      drawText(ctx, game.qte.result.success ? 'NICE!' : 'FUMBLED...', 400, 320, {
        size: 34, weight: 'bold', color: game.qte.result.success ? '#2ecc71' : '#e74c3c', align: 'center', outline: true,
      });
    }
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
    });
  });
}

// ---------- RESULTS ----------
export function resultsScreen(ctx, game) {
  const r = game.results;
  if (!r) return;
  drawBackground(ctx, 'workLocation', 0.62);

  panel(ctx, 140, 90, 520, 430);
  drawText(ctx, 'GIG COMPLETE', 400, 126, { size: 22, weight: 'bold', color: '#ffffff', align: 'center' });

  // animated payout counter
  const shown = Math.round(Math.min(1, game.resultsT / 1.2) * r.payout);
  drawText(ctx, `+$${shown}`, 400, 182, { size: 42, weight: 'bold', color: '#2ecc71', align: 'center', outline: true });

  let y = 216;
  if (r.scamText) {
    y = drawWrapped(ctx, r.scamText, 400, y, 460, 19, { size: 14, color: '#ff6b5e', align: 'center' }) + 4;
  }
  if (r.qteResult) {
    drawText(ctx, `QTE ${r.qteResult.success ? 'success' : 'failed'} — score ${r.qteResult.score}`, 400, y, {
      size: 14, color: r.qteResult.success ? '#2ecc71' : '#e74c3c', align: 'center',
    });
    y += 22;
  }
  for (const t of r.outcomeTexts.slice(0, 3)) {
    y = drawWrapped(ctx, t, 400, y, 460, 19, { size: 13, color: '#c9a876', align: 'center' }) + 2;
  }

  // stat deltas
  y = Math.max(y + 10, 360);
  const deltas = [
    ['Cash', r.deltas.cash, '$', '#2ecc71', '#e74c3c'],
    ['Stress', r.deltas.stress, '', '#e74c3c', '#2ecc71'],
    ['Rep', r.deltas.rep, '', '#2ecc71', '#e74c3c'],
    ['Energy', r.deltas.energy, '', '#2ecc71', '#e74c3c'],
  ];
  deltas.forEach(([label, val, prefix, posColor, negColor], i) => {
    const dx = 220 + i * 120;
    const v = label === 'Rep' ? val.toFixed(1) : Math.round(val);
    drawText(ctx, `${val >= 0 ? '+' : ''}${prefix}${v}`, dx, y, { size: 16, weight: 'bold', color: val >= 0 ? posColor : negColor, align: 'center' });
    drawText(ctx, label, dx, y + 18, { size: 12, color: '#c9a876', align: 'center' });
  });

  button(ctx, 300, 450, 200, 52, 'Continue', { color: '#2c6e49', onClick: () => game.continueFromResults() });
}

// ---------- EVENING ----------
export function eveningScreen(ctx, game) {
  const s = game.state;
  drawBackground(ctx, 'apartment', 0.55);
  messageBar(ctx, game);

  panel(ctx, 50, 100, 340, 300);
  drawText(ctx, `Evening — Day ${s.day}`, 70, 132, { size: 20, weight: 'bold', color: '#ffffff' });
  const todays = s.gigHistory.filter((g) => g.day === s.day);
  const earned = todays.reduce((a, g) => a + g.payout, 0);
  let y = 160;
  drawText(ctx, `Gigs done today: ${todays.length}`, 70, y, { size: 14, color: '#e0e0e0' }); y += 22;
  drawText(ctx, `Earned today: $${earned}`, 70, y, { size: 15, weight: 'bold', color: '#2ecc71' }); y += 26;
  for (const g of todays.slice(-5)) {
    y = drawWrapped(ctx, `• ${g.title} (+$${g.payout})`, 70, y, 300, 18, { size: 13, color: '#c9a876' }) + 1;
  }
  if (s.unpaidRent > 0) {
    drawWrapped(ctx, `⚠ Overdue rent $${s.unpaidRent} — eviction in ${14 - s.rentOverdueDays} days`, 70, Math.max(y, 330), 300, 18, { size: 13, color: '#ff6b5e' });
  }

  // shop
  shopPanel(ctx, game, 410, 100, 340, 400);

  button(ctx, 60, 526, 200, 52, 'Sleep', { color: '#2c6e49', disabled: game.billsOpen || game.wrapUpOpen, onClick: () => game.sleep() });
  if (s.unpaidRent > 0 && s.cash >= s.unpaidRent) {
    button(ctx, 280, 526, 240, 52, `Pay Rent Debt $${s.unpaidRent}`, { color: '#7a3020', onClick: () => game.payDebt('rent') });
  }

  if (game.billsOpen) billsModal(ctx, game);
  else if (game.wrapUpOpen) wrapUpModal(ctx, game);
}

// Weekly wrap-up (Step 6) — shows after bills every 7 days.
function wrapUpModal(ctx, game) {
  const s = game.state;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.82)';
  ctx.fillRect(0, 0, 800, 600);
  panel(ctx, 170, 96, 460, 410, { alpha: 0.98 });

  drawText(ctx, `Week ${s.weekNumber} Wrap-Up`, 400, 148, { size: 28, weight: 'bold', color: '#ffd700', align: 'center' });
  const earned = Math.round(s.cash - s.weekStats.startingCash);
  drawWrapped(ctx, wrapUpHeadline(earned), 400, 188, 390, 24, { size: 18, color: '#e0e0e0', align: 'center' });

  const rows = [
    ['Gigs Completed', `${s.weekStats.gigsDone}`],
    ['Total Earned', `$${Math.round(s.weekStats.totalEarned)}`],
    ['Reputation', `${s.reputation.toFixed(1)} ★`],
    ['Days Survived', `${s.day}`],
  ];
  const gy = 268;
  panel(ctx, 230, gy - 30, 340, rows.length * 34 + 20, { alpha: 0.6 });
  rows.forEach(([k, v], i) => {
    drawText(ctx, k, 258, gy + i * 34, { size: 16, color: '#c9a876' });
    drawText(ctx, v, 542, gy + i * 34, { size: 16, weight: 'bold', color: '#f0f0f0', align: 'right', font: 'monospace' });
  });

  button(ctx, 300, 434, 200, 48, 'Continue', { color: '#2c6e49', onClick: () => game.finishWrapUp() });
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
  drawText(ctx, 'UPGRADE SHOP', x + 18, y + 30, { size: 16, weight: 'bold', color: '#ffd700' });
  const available = UPGRADES.filter((u) => !s.upgradesOwned.includes(u.name));
  if (available.length === 0) {
    drawText(ctx, 'All upgrades owned!', x + 18, y + 62, { size: 14, color: '#e0e0e0' });
    return;
  }
  available.slice(0, 5).forEach((up, i) => {
    const uy = y + 44 + i * 68;
    drawText(ctx, `${up.name} — $${up.cost}`, x + 18, uy + 15, { size: 14, weight: 'bold', color: '#f0f0f0' });
    drawText(ctx, up.effect, x + 18, uy + 32, { size: 11, color: '#a89878' });
    button(ctx, x + w - 78, uy + 2, 64, 40, 'Buy', {
      color: '#2c6e49',
      disabled: s.cash < up.cost,
      fontSize: 13,
      onClick: () => game.buyUpgrade(up),
      onDisabled: () => playError(),
    });
  });
}

function shopOverlay(ctx, game) {
  ctx.fillStyle = 'rgba(8, 6, 4, 0.7)';
  ctx.fillRect(0, 56, 800, 460);
  shopPanel(ctx, game, 230, 90, 340, 410);
}

function billsModal(ctx, game) {
  const s = game.state;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.82)';
  ctx.fillRect(0, 0, 800, 600);
  panel(ctx, 180, 120, 440, 360, { alpha: 0.98 });
  drawText(ctx, 'BILLS DUE', 400, 158, { size: 22, weight: 'bold', color: '#f1c40f', align: 'center' });
  drawText(ctx, `Cash on hand: $${Math.round(s.cash)}`, 400, 182, { size: 14, color: '#e0e0e0', align: 'center' });

  const bills = [
    { kind: 'rent', label: 'Rent', warn: 'Miss it: eviction clock starts' },
    { kind: 'phone', label: 'Phone', warn: 'Miss it: no listings' },
    { kind: 'food', label: 'Food', warn: 'Miss it: energy drains 2x' },
  ];
  bills.forEach((b, i) => {
    const by = 210 + i * 66;
    const amt = game.billAmount(b.kind);
    const paid = game.billsPaid[b.kind];
    drawText(ctx, `${b.label}: $${amt}${paid ? '  ✓ PAID' : ''}`, 210, by + 16, { size: 15, weight: 'bold', color: paid ? '#2ecc71' : '#f0f0f0' });
    drawText(ctx, b.warn, 210, by + 34, { size: 11, color: '#a89878' });
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
  ctx.fillStyle = '#3a2d1f';
  ctx.fillRect(barX, barY, barW, 12);
  ctx.fillStyle = '#e07030';
  ctx.fillRect(barX, barY, barW * s[key], 12);
  const step = (delta) => {
    s[key] = Math.max(0, Math.min(1, Math.round((s[key] + delta) * 10) / 10));
    applyAudioSettings();
    game.state.save();
  };
  button(ctx, barX + barW + 14, barY - 14, 40, 40, '-', { fontSize: 16, onClick: () => step(-0.1) });
  button(ctx, barX + barW + 58, barY - 14, 40, 40, '+', { fontSize: 16, onClick: () => step(0.1) });
}

function toggleRow(ctx, x, y, label, get, set) {
  drawText(ctx, label, x, y + 20, { size: 15, color: '#f0f0f0' });
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
  panel(ctx, 190, 90, 420, 420, { alpha: 0.98 });
  drawText(ctx, 'SETTINGS', 400, 128, { size: 24, weight: 'bold', color: '#ffd700', align: 'center' });

  let y = 168;
  volumeRow(ctx, game, 224, y, 'Master Volume', 'masterVolume'); y += 56;
  volumeRow(ctx, game, 224, y, 'Music Volume', 'musicVolume'); y += 56;
  volumeRow(ctx, game, 224, y, 'SFX Volume', 'sfxVolume'); y += 68;

  toggleRow(ctx, 224, y, 'Mute All', () => s.muted, (v) => { s.muted = v; applyAudioSettings(); game.state.save(); }); y += 46;
  toggleRow(ctx, 224, y, 'Reduce Timing Pressure', () => s.reduceTimingPressure, (v) => { s.reduceTimingPressure = v; game.state.save(); }); y += 34;
  drawWrapped(ctx, 'Widens quick-time-event windows and slows their timers. Off by default.', 224, y, 340, 16, {
    size: 11, color: '#8a7a63',
  });

  button(ctx, 300, 460, 200, 46, 'Close', { color: '#2c6e49', onClick: () => { game.settingsOpen = false; } });
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

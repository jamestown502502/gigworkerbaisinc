// Screen renderers + immediate-mode UI helpers.
import { drawSprite, drawFullscreen } from '../engine/sprites.js';
import { InputManager } from '../engine/input.js';
import { drawCharacter, optionRow, pronounsFor, pronounPreview, randomLook, BUILDS, FACIAL_HAIR, HAIR_COLORS, HAIR_STYLES, PRONOUNS, SHIRT_COLORS, SKIN_TONES } from './character.js';
import { travelCost } from '../game/gigs.js';
import { UPGRADES, CONSUMABLES, EVENING_OPTIONS } from '../game/loop.js';
import { drawText, drawWrapped, roundRectPath, wrapLines } from './text.js';
import { twistOf, goalOf, windDownMultiplier } from '../game/twists.js';
import { playError, applyAudioSettings } from '../engine/audio.js';
import { QTE_READY_DURATION } from '../game/qte.js';
import { easeOutBack, receiptState, heartbeat } from './juice.js';
import { RUN_LENGTH_DAYS } from '../engine/state.js';

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
  /** The last real button hit, for the release flash every button draws (QA round 2 #25). */
  lastHit: null,
  /** Set by loop.js: sound + haptic on every real button press, in one place. */
  onPress: null,
  /** The topmost hotspot under a point when it is a real button (not a modal backdrop), else null. */
  buttonAt(pt) {
    for (let i = this.hotspots.length - 1; i >= 0; i--) {
      const b = this.hotspots[i];
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return b.onClick ? b : null;
    }
    return null;
  },
  handleClick(pt) {
    for (let i = this.hotspots.length - 1; i >= 0; i--) {
      const b = this.hotspots[i];
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        if (b.onClick) {
          this.lastHit = { x: b.x, y: b.y, w: b.w, h: b.h, at: performance.now() };
          this.onPress?.();
        }
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
export function button(ctx, x, y, w, h, label, { color = '#5d4023', textColor = '#ffffff', disabled = false, onClick = null, onDisabled = null, fontSize = 16, border = '#c9a876', ghost = false } = {}) {
  const hov = !disabled && isHovered(x, y, w, h);
  const pressed = !disabled && InputManager.isPressedIn(x, y, w, h);
  // A tap on a phone is down and up within one or two frames, so the held squash alone was
  // invisible there (QA round 2 #25). Every button also flashes and springs back for 180 ms
  // after the press lands, whatever the input device.
  const hit = UI.lastHit;
  const since = hit && hit.x === x && hit.y === y && hit.w === w && hit.h === h ? performance.now() - hit.at : Infinity;
  const flash = since < 180 ? 1 - since / 180 : 0;
  ctx.save();
  const sq = pressed ? 0.96 : flash > 0 ? 1 - 0.05 * Math.sin(Math.PI * (1 - flash)) : 1;
  if (sq !== 1) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(sq, sq); ctx.translate(-(x + w / 2), -(y + h / 2)); }
  if (ghost) {
    // Secondary action: outline only, so the primary button next to it clearly leads.
    ctx.fillStyle = hov ? 'rgba(255,255,255,0.12)' : 'rgba(20,14,8,0.72)';
    roundRectPath(ctx, x, y, w, h, 9); ctx.fill();
    ctx.strokeStyle = hov ? '#f1c40f' : '#a08560'; ctx.lineWidth = 1.5;
    roundRectPath(ctx, x, y, w, h, 9); ctx.stroke();
    drawText(ctx, label, x + w / 2, y + h / 2, { size: fontSize, weight: 'bold', color: '#e8d9b8', align: 'center', baseline: 'middle', maxWidth: w - 12, shadow: false });
    if (flash > 0) { ctx.fillStyle = `rgba(255,236,170,${0.35 * flash})`; roundRectPath(ctx, x, y, w, h, 9); ctx.fill(); }
    ctx.restore();
    if (onClick) UI.register(x, y, w, h, onClick);
    return;
  }
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
    color: disabled ? '#b5a488' : textColor,
    align: 'center',
    baseline: 'middle',
    outline: !disabled,
    maxWidth: w - 12,
  });
  if (flash > 0) { ctx.fillStyle = `rgba(255,236,170,${0.35 * flash})`; roundRectPath(ctx, x, y, w, h, 9); ctx.fill(); }
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
  drawFullscreen(ctx, key);
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
  drawFullscreen(ctx, key);
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

// ---------- CHARACTER CREATOR ----------
// Opens every new run, and from the apartment's "Edit look". Every option is independent and
// open to every build; see src/ui/character.js for the practice this follows.
export function creatorScreen(ctx, game) {
  const s = game.state;
  const c = s.character;
  const set = (patch) => { s.character = { ...s.character, ...patch }; s.save(); };
  drawBackground(ctx, 'apartment', 0.62);
  drawText(ctx, game.creatorEditing ? 'CHANGE YOUR LOOK' : 'WHO IS HUSTLING?', 400, 40, { size: 24, weight: 'bold', color: '#ffffff', align: 'center', outline: true });
  drawText(ctx, 'Every option is open to everyone. Change any of it later from your apartment.', 400, 64, { size: 13, color: '#c9a876', align: 'center' });

  panel(ctx, 30, 80, 270, 400);
  drawCharacter(ctx, 105, 100, 120, 240, c);
  drawWrapped(ctx, pronounPreview(c), 165, 380, 240, 18, { size: 13, color: '#f0e0b0', align: 'center' });

  panel(ctx, 320, 80, 450, 400);
  const reg = (x, y, w, h, cb) => UI.register(x, y, w, h, cb);
  const keys = Object.keys(PRONOUNS);
  let y = 94;
  y = optionRow(ctx, 340, y, 'Pronouns', keys.map((k) => PRONOUNS[k]), keys.indexOf(c.pronouns), (i) => set({ pronouns: keys[i] }), reg);
  y = optionRow(ctx, 340, y, 'Body', BUILDS, c.body, (i) => set({ body: i }), reg);
  y = optionRow(ctx, 340, y, 'Hair', HAIR_STYLES, c.hairStyle, (i) => set({ hairStyle: i }), reg);
  y = optionRow(ctx, 340, y, 'Facial hair', FACIAL_HAIR, c.facialHair, (i) => set({ facialHair: i }), reg, { chipW: 72, perRow: 4 });
  y = optionRow(ctx, 340, y, 'Skin', SKIN_TONES, c.skin, (col) => set({ skin: col }), reg, { swatch: true });
  y = optionRow(ctx, 340, y, 'Hair color', HAIR_COLORS, c.hair, (col) => set({ hair: col }), reg, { swatch: true });
  optionRow(ctx, 340, y, 'Shirt', SHIRT_COLORS, c.shirt, (col) => set({ shirt: col }), reg, { swatch: true });

  // Randomize is the secondary action, styled as an outline so "Start Day 1" clearly leads (QA round
  // 2 #17). It respects the pronouns picked above (QA round 2 #7); every option stays open by hand.
  button(ctx, 330, 504, 170, 42, 'Randomize', { ghost: true, fontSize: 14, onClick: () => set(randomLook(s.character)) });
  if (game.creatorEditing) {
    // Editing an existing look: Save stays disabled until something changes (QA round 2 #13), and
    // Back leaves without changing anything, so there is always a way out.
    const changed = JSON.stringify(s.character) !== game.creatorOriginal;
    button(ctx, 40, 500, 150, 50, '< Back', { color: '#5d4023', fontSize: 15, onClick: () => game.cancelCreator() });
    button(ctx, 560, 500, 210, 50, 'Save look', {
      color: '#2c6e49', fontSize: 16, disabled: !changed, onClick: () => game.finishCreator(),
      onDisabled: () => { playError(); game.creatorHint = 'Change something first, or tap Back.'; game.creatorHintAt = performance.now(); },
    });
    if (game.creatorHint && performance.now() - game.creatorHintAt < 2200) {
      drawText(ctx, game.creatorHint, 665, 572, { size: 13, color: '#f1c40f', align: 'center' });
    }
  } else {
    button(ctx, 560, 500, 210, 50, 'Start Day 1  >', { color: '#2c6e49', fontSize: 17, onClick: () => game.finishCreator() });
  }
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
  drawText(ctx, `${pronounsFor(s.character).label} · ${BUILDS[s.character.body] ?? BUILDS[0]}`, 180, 392, { size: 13, color: '#c9a876', align: 'center' });
  button(ctx, 80, 410, 200, 44, 'Edit look', { fontSize: 14, onClick: () => { if (!game.activeEvent) game.openCreator(); } });

  // stats summary panel
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
  const twist = twistOf(s), goal = goalOf(s);
  if (twist) lines.push(`This month: ${twist.name}`);
  if (goal) lines.push(s.sideGoalDone ? `Side goal done: ${goal.text}` : `Side goal: ${goal.text} (${goal.progress(s)})`);
  // The panel grows to fit its lines (a hungry, phone-cut, overdue morning has nine of them).
  let need = 0;
  for (const line of lines) {
    const small = line.startsWith('This month') || line.startsWith('Side goal');
    const shown = /OVERDUE|Phone cut|Hungry/.test(line) ? '⚠ ' + line : line;
    need += wrapLines(ctx, shown, 370, { size: small ? 13 : 14 }).length * (small ? 18 : 20);
  }
  const panelH = Math.max(220, 76 + need);
  panel(ctx, 360, 120, 410, panelH);
  drawText(ctx, `Morning — Day ${s.day}${s.freePlay && s.day > RUN_LENGTH_DAYS ? ' (free play)' : ''}`, 380, 152, { size: 22, weight: 'bold', color: '#ffffff' });
  let ly = 180;
  for (const line of lines) {
    const warn = /OVERDUE|Phone cut|Hungry/.test(line);
    const monthLine = line.startsWith('This month') || line.startsWith('Side goal');
    ly = drawWrapped(ctx, warn ? '⚠ ' + line : line, 380, ly, 370, monthLine ? 18 : 20, { size: monthLine ? 13 : 14, color: warn ? '#ff6b5e' : line.startsWith('Rested') || line.startsWith('Side goal done') ? '#2ecc71' : monthLine ? '#f5deb3' : '#e0e0e0' });
  }

  // debt quick-pay, right under the panel
  let by = 130 + panelH;
  if (s.unpaidRent > 0 && s.cash >= s.unpaidRent) {
    button(ctx, 360, by, 250, 40, `Pay Overdue Rent $${s.unpaidRent}`, { color: '#7a3020', onClick: () => game.payDebt('rent') });
    by += 48;
  }
  if (s.phoneCut && s.cash >= s.unpaidPhone) {
    button(ctx, 360, by, 250, 40, `Pay Phone Bill $${s.unpaidPhone}`, { color: '#7a3020', onClick: () => game.payDebt('phone') });
    by += 48;
  }
  // Rent can be paid ahead of the bills screen whenever the cash is there (QA round 3 #8).
  if (game.morningReady && !game.shopOpen && !game.restDay && by + 40 <= 516) {
    if (game.canPayRentEarly()) button(ctx, 360, by, 250, 40, `Pay rent early $${game.rentEarlyAmount()}`, { color: '#2c5a6e', fontSize: 15, onClick: () => game.payRentEarly() });
    else if (s.rentPrepaid) drawText(ctx, "✓ This week's rent is paid", 485, by + 20, { size: 14, weight: 'bold', color: '#2ecc71', align: 'center', baseline: 'middle' });
  }

  if (game.restDay) {
    panel(ctx, 200, 430, 400, 70);
    drawText(ctx, "You're too run down to work today. Rest up.", 400, 460, { size: 17, weight: 'bold', color: '#ff6b5e', align: 'center' });
    drawText(ctx, '+20 balance from a day in bed', 400, 482, { size: 13, color: '#c9a876', align: 'center' });
    button(ctx, 295, 526, 210, 52, 'Sleep', { color: '#2c6e49', onClick: () => { game.goEvening(); } });
  } else if (game.morningReady && !game.shopOpen) {
    // While the shop is open the day's actions are not drawn at all (QA round 2 #26): they used to
    // show at full brightness below the shop's dimmer, looking tappable when they were not.
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
    button(ctx, 295, 526, 210, 52, 'Shop', { color: '#2c3e50', onClick: () => { game.shopOpen = true; } });
    button(ctx, 530, 526, 210, 52, 'Sleep In (skip day)', { color: '#5d4023', onClick: () => { game.skippedDay = true; game.goEvening(); } });
  }

  if (game.shopOpen) shopOverlay(ctx, game);

  // morning flavor ticker (fade in → hold → fade out per line)
  if (game.ticker.idx < game.ticker.lines.length) {
    const t = game.ticker.t;
    const alpha = t < 0.5 ? t / 0.5 : t > 2.5 ? Math.max(0, (3 - t) / 0.5) : 1;
    ctx.globalAlpha = alpha;
    drawText(ctx, game.ticker.lines[game.ticker.idx], 400, 108, { size: 15, color: '#aaaaaa', align: 'center', shadow: false, maxWidth: 680 });
    ctx.globalAlpha = 1;
    // A real pill, not faint 12 px text on the painting (QA round 2 #21).
    ctx.fillStyle = 'rgba(20, 14, 8, 0.88)';
    roundRectPath(ctx, 330, 482, 140, 30, 15); ctx.fill();
    ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 1.5;
    roundRectPath(ctx, 330, 482, 140, 30, 15); ctx.stroke();
    drawText(ctx, 'Tap to skip  >>', 400, 497, { size: 14, weight: 'bold', color: '#f5deb3', align: 'center', baseline: 'middle', shadow: false });
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
  const accent = e.label ? '#f1c40f' : accents[e.tier] || '#8a99a8';
  const textLines = wrapLines(ctx, e.text, 410, { size: 15 }).length + (e.subtext ? wrapLines(ctx, e.subtext, 410, { size: 15 }).length + 0.6 : 0);
  const h = e.choices ? 140 + e.choices.length * 58 : Math.max(200, 150 + Math.ceil(textLines * 21));
  const y = Math.max(80, 300 - h / 2);

  ctx.save();
  modalScale(ctx, game.eventT || 0, 400, y + h / 2);
  panel(ctx, 160, y, 480, h, { alpha: 0.97 });
  ctx.fillStyle = accent;
  ctx.fillRect(162, y + 2, 476, 4);
  drawText(ctx, e.label || labels[e.tier] || '', 400, y + 32, { size: 13, weight: 'bold', color: accent, align: 'center' });
  let ty = drawWrapped(ctx, e.text, 195, y + 62, 410, 21, { size: 15, color: '#e0e0e0', shadow: false });
  if (e.subtext) ty = drawWrapped(ctx, e.subtext, 195, ty + 12, 410, 21, { size: 15, color: '#f5deb3', shadow: false });
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
    if (e.resolved && e.label === 'REMEMBER THIS?' && /^Right/.test(game.eventOutcome || '')) goldSticker(ctx, 612, y + 30, game.eventT || 0, game.state.settings.reduceMotion);
    button(ctx, 300, y + h - 62, 200, 44, 'Continue', { color: '#2c6e49', fontSize: 15, onClick: () => game.startNextEvent() });
  }
  ctx.globalAlpha = 1;
}

/** A gold-star sticker that slaps onto the corner of a card. */
function goldSticker(ctx, x, y, t, calm) {
  const k = calm ? 1 : easeOutBack(Math.min(1, t / 0.25));
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.25); ctx.scale(0.3 + 0.7 * k, 0.3 + 0.7 * k);
  ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#8a6d0b'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 20, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
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

  if (game.pendingOutcome) { outcomeCard(ctx, game); return; }

  const node = game.node;
  if (!node) return;

  // The client at the door (a first meeting, or how last time went), then the situation.
  panel(ctx, 80, 108, 640, 164);
  let ty = 146;
  if (game.clientGreeting) {
    ty = drawWrapped(ctx, game.clientGreeting, 105, 136, 590, 20, { size: 15, color: '#e8c98a' }) + 10;
  }
  drawWrapped(ctx, node.text, 105, ty, 590, 25, { size: 17, color: '#f0f0f0' });

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

/** "+$20  ·  -15 energy  ·  +10 stress", from a choice's effects. */
export function effectLine(fx = {}) {
  const parts = [];
  if (fx.cash) parts.push(`${fx.cash > 0 ? '+' : '-'}$${Math.abs(Math.round(fx.cash))}`);
  if (fx.energy) parts.push(`${signed(fx.energy)} energy`);
  if (fx.stress) parts.push(`${signed(fx.stress)} stress`);
  if (fx.rep) parts.push(`${signed(fx.rep)} reputation`);
  return parts.join('  ·  ');
}

/** After a choice: what the client did about it, what it cost or earned, and the takeaway. */
function outcomeCard(ctx, game) {
  const o = game.pendingOutcome;
  panel(ctx, 80, 108, 640, 176);
  drawText(ctx, `You: ${o.choice}`, 105, 136, { size: 14, color: '#c9a876', maxWidth: 590 });
  const ey = drawWrapped(ctx, o.text, 105, 168, 590, 24, { size: 17, color: '#f0f0f0' });
  const fx = effectLine(o.effects);
  drawText(ctx, fx || 'No change', 105, Math.min(ey + 8, 270), { size: 15, weight: 'bold', color: '#f5deb3' });  // neutral: a cost is not shown as a win
  if (o.lesson) {
    panel(ctx, 80, 300, 640, 128);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(82, 302, 636, 4);
    drawText(ctx, 'TAKEAWAY', 105, 332, { size: 13, weight: 'bold', color: '#f1c40f' });
    drawWrapped(ctx, o.lesson, 105, 362, 590, 24, { size: 17, color: '#ffffff' });
  }
  button(ctx, 300, 448, 200, 52, 'Continue', { color: '#2c6e49', onClick: () => game.continueOutcome() });
}

/** Shared frame for every minigame (skill QTE, EI game, evening game). */
function minigamePanel(ctx, game) {
  if (game.qteKind === 'skill' && game.qte && !game.qte.done && game.state.stress > 70) {
    const a = game.state.settings.reduceMotion ? 0.12 : 0.1 + 0.3 * heartbeat(performance.now() / 1000);
    ctx.fillStyle = `rgba(200, 30, 30, ${a.toFixed(3)})`;
    ctx.fillRect(0, 60, 86, 540); ctx.fillRect(714, 60, 86, 540); ctx.fillRect(86, 534, 628, 66);
  }
  panel(ctx, 90, 100, 620, 430, { alpha: 0.82 });
  drawText(ctx, game.qte.name, 400, 130, { size: 22, weight: 'bold', color: '#f1c40f', align: 'center' });
  drawText(ctx, game.qte.hint, 400, 154, { size: 14, color: '#e0e0e0', align: 'center', maxWidth: 580 });
  game.qte.render(ctx);
  if (game.qteKind === 'skill' && game.qteIntroHold) {
    howToCard(ctx, game);
  } else if (game.qteKind === 'skill' && game.qteReadyT < QTE_READY_DURATION) {
    getReady(ctx, game);
  }
  if (game.qte.done && game.qte.result) resultCard(ctx, game);
}

/** First meeting with a microgame: what it is, what to do, how long you have. Waits for a tap. */
function howToCard(ctx, game) {
  const q = game.qte;
  if (globalThis.__textProbe) globalThis.__textProbe.push({ layer: true });
  ctx.fillStyle = 'rgba(8, 6, 4, 0.86)';
  roundRectPath(ctx, 92, 102, 616, 426, 12); ctx.fill();
  const x = 160, y = 150, w = 480, h = 320;
  panel(ctx, x, y, w, h, { alpha: 0.98 });
  ctx.fillStyle = '#f1c40f'; ctx.fillRect(x + 2, y + 2, w - 4, 4);
  drawText(ctx, 'NEW JOB SKILL', 400, y + 36, { size: 13, weight: 'bold', color: '#c9a876', align: 'center' });
  drawText(ctx, q.name, 400, y + 80, { size: 34, weight: 'bold', color: '#ffd700', align: 'center', outline: true });
  const ny = drawWrapped(ctx, q.hint, 400, y + 124, w - 70, 24, { size: 18, color: '#ffffff', align: 'center' });
  const secs = q.timeMax ? Math.max(1, Math.round(q.timeMax)) : null;
  drawText(ctx, secs ? `You'll have about ${secs} seconds. Do it well for a pay bonus.` : 'Do it well for a pay bonus. Fumble it and the client pays less.', 400, Math.min(ny + 6, y + h - 74), { size: 13, color: '#c9a876', align: 'center', maxWidth: w - 40 });
  const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 260);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#2c6e49';
  roundRectPath(ctx, 300, y + h - 60, 200, 42, 21); ctx.fill();
  ctx.globalAlpha = 1;
  drawText(ctx, 'Tap to start', 400, y + h - 39, { size: 17, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', outline: true });
}

/** The count-in: GET READY plus the one-line goal, big, so a repeat play still says what to do. */
function getReady(ctx, game) {
  if (globalThis.__textProbe) globalThis.__textProbe.push({ layer: true });
  ctx.fillStyle = 'rgba(8, 6, 4, 0.72)';
  roundRectPath(ctx, 92, 162, 616, 364, 12); ctx.fill();
  const left = Math.max(0, QTE_READY_DURATION - game.qteReadyT);
  // the job's one word punches in first, WarioWare-style (2026-10-04)
  const calm = game.state.settings.reduceMotion;
  const k = calm ? 1 : easeOutBack(Math.min(1, game.qteReadyT / 0.25));
  ctx.save();
  ctx.translate(400, 214); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k); ctx.translate(-400, -214);
  drawText(ctx, game.qte.name, 400, 214, { size: 50, weight: 'bold', color: '#ffd700', align: 'center', baseline: 'middle', outline: true });
  ctx.restore();
  const pulse = 1 + 0.08 * Math.sin(game.qteReadyT * 14);
  ctx.save();
  // scaled about its own centre, drawn at its real position (so the text probe measures where it is)
  ctx.translate(400, 270);
  ctx.scale(pulse, pulse);
  ctx.translate(-400, -270);
  drawText(ctx, left > 0.6 ? 'GET READY' : 'GO!', 400, 270, { size: 34, weight: 'bold', color: left > 0.6 ? '#ffffff' : '#2ecc71', align: 'center', outline: true });
  ctx.restore();
  drawWrapped(ctx, game.qte.hint, 400, 330, 520, 24, { size: 18, color: '#f5deb3', align: 'center' });
}

function starRow(ctx, cx, y, n, k) {
  // Stars pop in one after another as the card opens.
  for (let i = 0; i < 3; i++) {
    const appear = Math.max(0, Math.min(1, (k - 0.25 - i * 0.15) / 0.18));
    const on = i < n;
    const scale = on ? 0.6 + 0.4 * appear + (appear > 0 && appear < 1 ? 0.25 * Math.sin(Math.PI * appear) : 0) : 1;
    // scaled about its own centre, drawn at its real position (so the text probe measures where it is);
    // unlit stars are #7d6b4f, 3.7:1 on the card (was #4a3d2a at 1.79:1, under the 3:1 graphics floor)
    const sx = cx + (i - 1) * 46;
    ctx.save();
    ctx.translate(sx, y);
    ctx.scale(scale, scale);
    ctx.translate(-sx, -y);
    drawText(ctx, '★', sx, y, { size: 38, color: on && appear > 0 ? '#f1c40f' : '#7d6b4f', align: 'center', baseline: 'middle', shadow: false });
    ctx.restore();
  }
}

/** Five stars that pop in one after another, for a near-perfect challenge. */
function fiveStarRow(ctx, cx, y, t, calm) {
  for (let i = 0; i < 5; i++) {
    const appear = calm ? 1 : Math.max(0, Math.min(1, (t - 0.2 - i * 0.12) / 0.18));
    const sc = calm ? 1 : 0.4 + 0.6 * easeOutBack(appear);
    const sx = cx + (i - 2) * 44;
    ctx.save(); ctx.translate(sx, y); ctx.scale(sc, sc); ctx.translate(-sx, -y);
    drawText(ctx, '★', sx, y, { size: 36, color: appear > 0 ? '#f1c40f' : '#7d6b4f', align: 'center', baseline: 'middle', shadow: false });
    ctx.restore();
  }
}

function signed(v, unit = '') {
  const n = Math.round(v * 10) / 10;
  return `${n >= 0 ? '+' : ''}${n}${unit}`;
}

/** After every minigame: how it went against the goal, as stars, a score bar, and what it earned
 *  or cost. It replaces a 0.8 s "NICE!" that said nothing about the score or the consequence. */
function resultCard(ctx, game) {
  const q = game.qte, r = q.result, t = game.qteEndTimer || 0;
  const k = Math.min(1, t / 0.9);
  const score = Math.max(0, Math.min(100, Math.round(r.score ?? (r.success ? 70 : 20))));
  const stars = !r.success ? 0 : score >= 85 ? 3 : score >= 60 ? 2 : 1;
  let title, lines = [];
  if (game.qteKind === 'skill') {
    title = !r.success ? 'FUMBLED' : score >= 85 ? 'GREAT WORK!' : score >= 60 ? 'GOOD JOB' : 'GOT IT DONE';
    const base = game.currentGig ? game.currentGig.payout : 0;
    if (r.items) lines.push(r.items.map((it) => `${it.label.replace(/ \(.*\)$/, '')} ${it.amount >= 0 ? '+' : '-'}$${Math.abs(it.amount)}`).join('  ·  ') + (r.hourly !== undefined ? `  ·  $${r.hourly.toFixed(2)}/hr` : ''));
    else lines.push(r.success ? `Pay bonus +$${Math.round(base * (score / 500))}  ·  Reputation +0.1` : `Pay cut -$${Math.round(base * 0.3)}  ·  Reputation -0.2  ·  Stress +3`);
  } else if (game.qteKind === 'ei') {
    title = r.success ? 'YOU READ THE ROOM' : 'MISREAD';
    const fx = r.effects || {};
    const parts = [];
    if (fx.rep) parts.push(`Reputation ${signed(fx.rep)}`);
    if (fx.stress) parts.push(`Stress ${signed(fx.stress)}`);
    if (fx.cash) parts.push(`Cash ${fx.cash >= 0 ? '+' : '-'}$${Math.abs(Math.round(fx.cash))}`);
    if (parts.length) lines.push(parts.join('  ·  '));
  } else {
    const isBreath = q.name === 'WIND DOWN';
    title = isBreath ? (score >= 85 ? 'DEEPLY CALM' : score >= 60 ? 'SETTLED' : 'A LITTLE CALMER') : (r.success ? 'GOOD TALK' : 'IT WAS SOMETHING');
    if (isBreath) lines.push(`Stress -${Math.round((8 + Math.round((score / 100) * 12)) * windDownMultiplier(game.state.twist))}  ·  Balance +3  ·  Easier timing tomorrow`);
    else lines.push(`Support +${(r.effects && r.effects.support) || 0}  ·  Balance +2`);
  }
  if (globalThis.__textProbe) globalThis.__textProbe.push({ layer: true });
  ctx.fillStyle = `rgba(8, 6, 4, ${0.88 * k})`;
  roundRectPath(ctx, 92, 102, 616, 426, 12); ctx.fill();
  const x = 190, y = r.lesson ? 146 : 160, w = 420, h = r.lesson ? 330 : 290;
  ctx.save();
  modalScale(ctx, t, 400, y + h / 2);
  panel(ctx, x, y, w, h, { alpha: 0.98 });
  const accent = r.success ? '#2ecc71' : '#e74c3c';
  ctx.fillStyle = accent; ctx.fillRect(x + 2, y + 2, w - 4, 4);
  drawText(ctx, title, 400, y + 46, { size: 28, weight: 'bold', color: r.success ? '#2ecc71' : '#ff6b5e', align: 'center', outline: true });
  if (game.fiveStarsT !== null && game.fiveStarsT !== undefined) fiveStarRow(ctx, 400, y + 96, game.fiveStarsT, game.state.settings.reduceMotion);
  else starRow(ctx, 400, y + 96, stars, k);
  // score bar fills to the score; the notch marks the "good job" line
  const bx = x + 50, bw = w - 100, by = y + 136;
  ctx.fillStyle = '#3a2d1f'; roundRectPath(ctx, bx, by, bw, 14, 7); ctx.fill();
  ctx.fillStyle = accent; roundRectPath(ctx, bx, by, Math.max(8, bw * (score / 100) * k), 14, 7); ctx.fill();
  ctx.fillStyle = '#f5deb3'; ctx.fillRect(bx + bw * 0.6 - 1, by - 3, 2, 20);
  drawText(ctx, `Score ${Math.round(score * k)} / 100`, 400, by + 36, { size: 15, weight: 'bold', color: '#ffffff', align: 'center' });
  lines.forEach((l, i) => drawText(ctx, l, 400, by + 62 + i * 20, { size: 14, color: '#f5deb3', align: 'center', maxWidth: w - 30 }));
  // The why: one real-world takeaway, so the score comes with a reason (2026-10-02).
  if (r.lesson) drawWrapped(ctx, r.lesson, 400, by + 70 + lines.length * 20, w - 44, 18, { size: 14, color: '#e8c98a', align: 'center' });
  if (t > 0.4) drawText(ctx, 'Tap to continue', 400, y + h - 16, { size: 13, color: '#e8d9b8', align: 'center' });
  ctx.restore();
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

  // itemized ledger, printed one line at a time (2026-10-04)
  const rs = receiptState(game.resultsT || 0, r.items.length);
  let y = 192;
  for (const item of r.items.slice(0, rs.shown)) {
    drawText(ctx, item.label, 180, y, { size: 13, color: '#c9a876', maxWidth: 330 });
    drawText(ctx, `${item.amount >= 0 ? '+' : '-'}$${Math.abs(item.amount)}`, 620, y, { size: 13, weight: 'bold', color: item.amount >= 0 ? '#2ecc71' : '#ff6b5e', align: 'right', font: 'monospace' });
    y += 18;
  }
  y = 192 + r.items.length * 18;
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(180, y - 8); ctx.lineTo(620, y - 8); ctx.stroke();
  y += 4;
  // PAID (or SHORT) stamps on once the total lands
  if (rs.stamp) {
    const k = game.state.settings.reduceMotion ? 1 : easeOutBack(Math.min(1, rs.stampT / 0.22));
    const sc = 1.8 - 0.8 * k, word = r.total > 0 ? 'PAID' : 'SHORT', col = r.total > 0 ? '#2ecc71' : '#ff6b5e';
    ctx.save();
    ctx.translate(590, 158); ctx.rotate(-0.16); ctx.scale(sc, sc); ctx.translate(-590, -158);
    ctx.globalAlpha = Math.min(1, k * 1.4);
    ctx.strokeStyle = col; ctx.lineWidth = 3; roundRectPath(ctx, 548, 140, 84, 36, 6); ctx.stroke();
    drawText(ctx, word, 590, 158, { size: 20, weight: 'bold', color: col, align: 'center', baseline: 'middle', shadow: false });
    ctx.restore();
  }
  if (r.qteResult) {
    drawText(ctx, `Challenge ${r.qteResult.success ? 'cleared' : 'fumbled'} — score ${r.qteResult.score}`, 400, y, {
      size: 13, color: r.qteResult.success ? '#2ecc71' : '#ff6b5e', align: 'center',
    });
    y += 18;
  }
  for (const t of r.outcomeTexts.slice(0, 3)) {
    y = drawWrapped(ctx, t, 400, y, 460, 17, { size: 12, color: '#c9a876', align: 'center' }) + 1;
  }
  // the client's review, only when it fits above the stat row (never pushes it into the button)
  if (r.review && y + 17 <= 392) {
    drawText(ctx, r.review, 400, y + 4, { size: 12, color: '#f0e0b0', align: 'center', maxWidth: 460 });
    y += 20;
  }

  // stat deltas
  y = Math.max(y + 10, 400);
  // Losses use #ff6b5e: #e74c3c measured 4.49:1 on this panel in CI, just under the 4.5:1 standard.
  const deltas = [
    ['Cash', r.deltas.cash, '$', '#2ecc71', '#ff6b5e'],
    ['Stress', r.deltas.stress, '', '#ff6b5e', '#2ecc71'],
    ['Rep', r.deltas.rep, '', '#2ecc71', '#ff6b5e'],
    ['Energy', r.deltas.energy, '', '#2ecc71', '#ff6b5e'],
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

  // After "Sleep In (skip day)" the day is over: no Back to the morning (QA round 2 #18).
  const canBack = !game.billsOpen && !game.wrapUpOpen && !game.restDay && !game.skippedDay;
  if (!game.shopOpen) button(ctx, 60, 526, 200, 52, 'Sleep', { color: '#2c6e49', disabled: game.billsOpen || game.wrapUpOpen, onClick: () => game.sleep() });
  if (canBack && !game.shopOpen) button(ctx, 270, 526, 110, 52, '← Back', { color: '#5d4023', onClick: () => game.backFromEvening() });
  if (!game.shopOpen && s.unpaidRent > 0 && s.cash >= s.unpaidRent) {
    button(ctx, 390, 526, 240, 52, `Pay Rent Debt $${s.unpaidRent}`, { color: '#7a3020', onClick: () => game.payDebt('rent') });
  } else if (!game.shopOpen && !game.billsOpen && !game.wrapUpOpen && game.canPayRentEarly()) {
    button(ctx, 390, 526, 240, 52, `Pay rent early $${game.rentEarlyAmount()}`, { color: '#2c5a6e', fontSize: 15, onClick: () => game.payRentEarly() });
  }
  // A late ping put off with "Decide later" waits here as a message to open again.
  if (!game.shopOpen && game.ping && !game.ping.resolved && game.ping.snoozed) {
    button(ctx, 50, 412, 340, 40, '📱 Late ping waiting: reply', { color: '#2c5a6e', fontSize: 14, onClick: () => { game.ping.snoozed = false; } });
  }

  if (game.shopOpen) shopOverlay(ctx, game);
  if (game.billsOpen) billsModal(ctx, game);
  else if (game.wrapUpOpen) wrapUpModal(ctx, game);
  else if (game.ping && !game.ping.resolved && !game.ping.snoozed) pingModal(ctx, game);
}

function eveningChoicePanel(ctx, game, x, y, w, h) {
  const s = game.state;
  panel(ctx, x, y, w, h);
  drawText(ctx, 'TONIGHT', x + 18, y + 30, { size: 16, weight: 'bold', color: '#ffd700' });
  const done = s.eveningDoneDay === s.day;
  if (done) {
    const ty = drawWrapped(ctx, game.eveningOutcome || 'Evening spent. Time for bed.', x + 18, y + 62, w - 36, 20, { size: 14, color: '#e0e0e0' });
    // Where tonight left you, directly under what happened (QA round 3 #9: the two numbers used to
    // float on their own halfway down the panel).
    const sy = ty + 10;
    ctx.strokeStyle = 'rgba(139,90,43,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 18, sy); ctx.lineTo(x + w - 18, sy); ctx.stroke();
    drawText(ctx, 'WHERE YOU STAND', x + 18, sy + 18, { size: 11, weight: 'bold', color: '#c9a876' });
    [['Support', s.support, '#5dade2'], ['Balance', s.health, '#2ecc71']].forEach(([label, v, col], i) => {
      const ry = sy + 40 + i * 26;
      drawText(ctx, label, x + 18, ry, { size: 13, color: '#e0e0e0', baseline: 'middle' });
      const bx = x + 96, bw = w - 170;
      ctx.fillStyle = '#3a2d1f'; roundRectPath(ctx, bx, ry - 5, bw, 10, 5); ctx.fill();
      ctx.fillStyle = col; roundRectPath(ctx, bx, ry - 5, Math.max(6, bw * Math.max(0, Math.min(100, v)) / 100), 10, 5); ctx.fill();
      drawText(ctx, `${Math.round(v)}`, x + w - 18, ry, { size: 13, weight: 'bold', color: '#f0f0f0', align: 'right', baseline: 'middle', font: 'monospace' });
    });
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
  panel(ctx, 150, 110, 500, 404, { alpha: 0.98 });
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
  drawText(ctx, 'Saying no costs nothing here. Saying yes costs tomorrow.', 400, 452, { size: 12, color: '#b5a488', align: 'center', shadow: false });
  // A way out without answering (QA round 3 #6): the ping waits on the evening screen.
  button(ctx, 300, 464, 200, 40, 'Decide later', { ghost: true, fontSize: 14, onClick: () => game.resolvePing('later') });
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
  panel(ctx, x, y, w, h, { alpha: 0.98 });
  // Icon beside the title, clear of every Buy button (QA round 2 #8: it sat on top of the first one).
  drawSprite(ctx, 'items', x + 16, y + 10, 30, 30);
  drawText(ctx, 'SHOP', x + 54, y + 31, { size: 18, weight: 'bold', color: '#ffd700' });
  drawText(ctx, `Cash $${Math.round(s.cash)}`, x + w - 18, y + 31, { size: 14, weight: 'bold', color: '#2ecc71', align: 'right', font: 'monospace' });
  const rows = [
    ...CONSUMABLES.map((c) => ({ ...c, kind: 'food', canBuyNow: c.canBuy(s) })),
    ...UPGRADES.filter((u) => !s.upgradesOwned.includes(u.name)).map((u) => ({ ...u, kind: 'upgrade', canBuyNow: true })),
  ];
  if (rows.length === 0) {
    drawText(ctx, 'Nothing left to buy!', x + 18, y + 72, { size: 14, color: '#e0e0e0' });
    return;
  }
  const PITCH = 50; // all eight items fit; the eighth (Sturdy Leash) used to be cut off
  const perPage = Math.floor((h - 52 - 64) / PITCH);
  rows.slice(0, perPage).forEach((up, i) => {
    const uy = y + 50 + i * PITCH;
    if (i > 0) { ctx.strokeStyle = 'rgba(139,90,43,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 16, uy - 4); ctx.lineTo(x + w - 16, uy - 4); ctx.stroke(); }
    drawText(ctx, `${up.kind === 'food' ? '🍞 ' : ''}${up.name} — $${up.cost}`, x + 18, uy + 17, { size: 14, weight: 'bold', color: '#f0f0f0', maxWidth: w - 120 });
    drawText(ctx, up.canBuyNow ? up.effect : 'Already ate today', x + 18, uy + 35, { size: 12, color: '#b5a488', maxWidth: w - 120 });
    button(ctx, x + w - 86, uy + 4, 68, 40, 'Buy', {
      color: '#2c6e49',
      disabled: s.cash < up.cost || !up.canBuyNow,
      fontSize: 13,
      onClick: () => game.buyUpgrade(up),
      onDisabled: () => { playError(); game.message = s.cash < up.cost ? `You need $${up.cost} for that.` : 'You already ate today.'; },
    });
  });
}

function shopOverlay(ctx, game) {
  // The whole screen dims (it stopped at y=516 and left the day's buttons lit), and the shop's own
  // Close sits inside the panel, centred under its rows (QA round 2 #22, #26).
  ctx.fillStyle = 'rgba(8, 6, 4, 0.78)';
  ctx.fillRect(0, 56, 800, 544);
  UI.absorb();
  UI.register(0, 56, 800, 544, () => { game.shopOpen = false; }); // tap outside the panel closes it
  const x = 170, y = 66, w = 460, h = 524;
  UI.register(x, y, w, h, null);
  shopPanel(ctx, game, x, y, w, h);
  button(ctx, x + w / 2 - 100, y + h - 56, 200, 44, 'Close Shop', { color: '#2c3e50', fontSize: 15, onClick: () => { game.shopOpen = false; } });
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
    drawText(ctx, `${b.label}: $${amt}${paid ? (b.kind === 'rent' && game.billsPaidEarly ? '  ✓ PAID EARLY' : '  ✓ PAID') : ''}`, 210, by + 16, { size: 15, weight: 'bold', color: paid ? '#2ecc71' : '#f0f0f0' });
    const hint = game.billsHint && game.billsHint.kind === b.kind && performance.now() - game.billsHint.at < 4500 ? game.billsHint.text : null;
    if (hint) drawWrapped(ctx, hint, 210, by + 33, 280, 13, { size: 11, weight: 'bold', color: '#ff8a7e', shadow: false });
    else drawText(ctx, b.warn, 210, by + 34, { size: 11, color: '#a89878', maxWidth: 280 });
    if (!paid) {
      button(ctx, 500, by, 96, 40, 'Pay', {
        color: '#2c6e49',
        disabled: s.cash < amt,
        fontSize: 14,
        onClick: () => game.payBill(b.kind),
        onDisabled: () => game.payBill(b.kind),   // says how much is missing (QA round 3 #2)
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
  button(ctx, x + 280, y, 90, 40, get() ? 'ON' : 'OFF', {
    color: get() ? '#2c6e49' : '#3a3128',
    fontSize: 14,
    onClick: () => set(!get()),
  });
}

export function settingsModal(ctx, game) {
  const s = game.state.settings;
  const close = () => { game.settingsOpen = false; game.confirmReset = false; };
  ctx.fillStyle = 'rgba(6, 4, 2, 0.85)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  // Tap outside the panel to close (QA round 2 #10); taps on the panel itself are absorbed.
  UI.register(0, 0, 800, 600, close);
  const PX = 160, PY = 16, PW = 480, PH = 572;
  UI.register(PX, PY, PW, PH, null);
  panel(ctx, PX, PY, PW, PH, { alpha: 0.98 });
  drawText(ctx, 'SETTINGS', 400, 50, { size: 24, weight: 'bold', color: '#ffd700', align: 'center' });

  // A flow layout: each row starts below whatever the row above actually used, including a
  // description that wraps to two lines on a narrower font. Fixed y offsets let a wrapped line
  // run into the next button on iPhone (QA round 2 #24).
  let y = 82;
  volumeRow(ctx, game, 196, y, 'Master Volume', 'masterVolume'); y += 52;
  volumeRow(ctx, game, 196, y, 'Music Volume', 'musicVolume'); y += 52;
  volumeRow(ctx, game, 196, y, 'SFX Volume', 'sfxVolume'); y += 58;

  toggleRow(ctx, 196, y, 'Mute All', () => s.muted, (v) => { s.muted = v; applyAudioSettings(); game.state.save(); }); y += 50;
  toggleRow(ctx, 196, y, 'Reduce Timing Pressure', () => s.reduceTimingPressure, (v) => { s.reduceTimingPressure = v; game.state.save(); }); y += 54;
  y = drawWrapped(ctx, 'Wider timing windows and slower timers.', 196, y, 400, 16, { size: 12, color: '#b5a488' }) + 8;
  toggleRow(ctx, 196, y, 'Reduce Motion', () => s.reduceMotion, (v) => { s.reduceMotion = v; game.state.save(); }); y += 54;
  y = drawWrapped(ctx, 'Quick fades instead of screen transitions.', 196, y, 400, 16, { size: 12, color: '#b5a488' }) + 10;

  button(ctx, 196, y, 190, 40, 'Replay tutorial', { color: '#2c5a6e', fontSize: 13, onClick: () => game.replayTutorial() });
  if (game.confirmReset) {
    button(ctx, 414, y, 190, 40, 'Start over? YES', { color: '#7a3020', fontSize: 13, onClick: () => { game.newGame(); game.settingsOpen = false; game.confirmReset = false; } });
  } else {
    button(ctx, 414, y, 190, 40, 'Start new game', { color: '#5d4023', fontSize: 13, onClick: () => { game.confirmReset = true; } });
  }
  y += 58;
  if (game.confirmReset) drawText(ctx, 'This deletes the current run. Settings are kept.', 400, y, { size: 12, color: '#ff8a7e', align: 'center' });

  button(ctx, 300, PY + PH - 50, 200, 40, 'Close', { color: '#2c6e49', onClick: close });
}

// ---------- WELCOME BACK (reopening a run in progress) ----------
/** One line for what rent needs next, with the amount (QA round 3 #10). */
export function rentStatusLine(game) {
  const s = game.state;
  if (s.unpaidRent > 0) return { text: `Overdue rent $${s.unpaidRent}  ·  eviction in ${Math.max(0, 14 - s.rentOverdueDays)} days`, warn: true };
  if (s.rentPrepaid) return { text: `This week's rent is paid  ·  next due in ${Math.max(0, s.daysUntilBills)} days`, warn: false };
  const amt = game.rentEarlyAmount();
  const d = s.daysUntilBills;
  return { text: d <= 0 ? `Rent $${amt} due today` : d === 1 ? `Rent $${amt} due tomorrow` : `Rent $${amt} due in ${d} days`, warn: d <= 2 };
}

/** "Oct 6, 2:13 PM" in the player's own locale, or '' for a save from before it was recorded. */
function playedAt(ms) {
  if (!ms) return '';
  try { return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

export function resumeModal(ctx, game) {
  const s = game.state;
  ctx.fillStyle = 'rgba(6, 4, 2, 0.82)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 190, 112, 420, 372, { alpha: 0.98 });
  drawText(ctx, 'WELCOME BACK', 400, 150, { size: 24, weight: 'bold', color: '#ffd700', align: 'center' });
  // Which run, which day of how many: a fresh run after a finished month must never read as
  // progress lost (QA round 3 #11: a tester saw "Day 6" and took it for their 30-day run).
  const dayText = s.freePlay && s.day > RUN_LENGTH_DAYS ? `Day ${s.day} (free play)` : `Day ${s.day} of ${RUN_LENGTH_DAYS}`;
  drawText(ctx, `Run ${s.runNumber || 1}  ·  ${dayText}`, 400, 182, { size: 16, weight: 'bold', color: '#f0f0f0', align: 'center' });
  drawText(ctx, `$${Math.round(s.cash)}  ·  ${s.gigsCompleted} gigs done  ·  ${(Math.round(s.reputation * 2) / 2).toFixed(1)} ★`, 400, 206, { size: 14, color: '#e0e0e0', align: 'center' });
  const rent = rentStatusLine(game);
  drawText(ctx, rent.text, 400, 232, { size: 14, weight: 'bold', color: rent.warn ? '#ff8a7e' : '#c9a876', align: 'center', maxWidth: 390 });
  const twist = twistOf(s);
  const when = playedAt(s.savedAt);
  const meta = [twist && twist.name, when && `Last played ${when}`].filter(Boolean).join('  ·  ');
  if (meta) drawText(ctx, meta, 400, 254, { size: 12, color: '#b5a488', align: 'center', maxWidth: 390 });
  const lr = s.lastRun;
  if (lr) {
    const how = lr.evicted ? `evicted on day ${lr.day}` : lr.complete ? `finished all ${RUN_LENGTH_DAYS} days with $${lr.cash}` : `stopped on day ${lr.day} with $${lr.cash}`;
    drawText(ctx, `Your last run: ${how}`, 400, 274, { size: 12, color: '#b5a488', align: 'center', maxWidth: 390 });
  }
  if (!game.confirmNewGame) {
    button(ctx, 250, 300, 300, 56, 'Continue', { color: '#2c6e49', onClick: () => { game.resumePrompt = false; } });
    button(ctx, 250, 372, 300, 56, 'New game', { color: '#5d4023', onClick: () => { game.confirmNewGame = true; } });
  } else {
    drawWrapped(ctx, 'Start over from Day 1? This run will be deleted. Your settings are kept.', 400, 312, 300, 20, { size: 15, color: '#ffb3a8', align: 'center' });
    button(ctx, 250, 372, 145, 56, 'Keep playing', { color: '#2c6e49', fontSize: 14, onClick: () => { game.confirmNewGame = false; game.resumePrompt = false; } });
    button(ctx, 405, 372, 145, 56, 'Start over', { color: '#7a3020', fontSize: 14, onClick: () => game.newGame() });
  }
}

// ---------- OPEN IN ANOTHER TAB ----------
/** Another tab or window of the game saved: this one is out of date. It stops saving (saveLock)
 *  and offers to pick up the newer save, so two copies can never overwrite each other's progress
 *  (QA round 3 #3, #11). */
export function staleTabModal(ctx) {
  ctx.fillStyle = 'rgba(6, 4, 2, 0.9)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 190, 170, 420, 250, { alpha: 0.98 });
  drawText(ctx, 'OPEN IN ANOTHER TAB', 400, 210, { size: 22, weight: 'bold', color: '#ffd700', align: 'center' });
  drawWrapped(ctx, 'This game is running in another tab or window, and that copy has newer progress. This tab is paused so it cannot save over it.', 400, 244, 360, 20, { size: 14, color: '#e0e0e0', align: 'center' });
  button(ctx, 250, 340, 300, 56, 'Play here instead', { color: '#2c6e49', onClick: () => { try { location.reload(); } catch { /* test runner */ } } });
}

// ---------- THE MATH OF THE MONTH ----------
// Research on the poverty simulator Spent found that making the choices can leave players believing
// hardship is a personal failing, while empathy grows from seeing the structural causes. So the end
// of a run shows the job's own numbers, from this run, next to the verdict on the player's choices.
export function monthMath(s) {
  const m = s.monthMath || {};
  const hours = m.paidHours || 0;
  const rate = hours > 0 ? s.totalEarned / hours : 0;
  return {
    hours, rate,
    earned: Math.round(s.totalEarned),
    lost: Math.round(m.lostToNonPayment || 0),
    rent: Math.round(m.rentPaid || 0),
    rentShare: s.totalEarned > 0 ? Math.round(((m.rentPaid || 0) / s.totalEarned) * 100) : 0,
    travelEnergy: Math.round(m.travelEnergy || 0),
    sickDays: m.sickDays || 0,
    hoursForRent: rate > 0 ? Math.ceil(600 / rate) : null,
  };
}

export function monthMathModal(ctx, game) {
  const k = monthMath(game.state);
  ctx.fillStyle = 'rgba(6, 4, 2, 0.88)';
  ctx.fillRect(0, 0, 800, 600);
  UI.absorb();
  panel(ctx, 110, 40, 580, 520, { alpha: 0.98 });
  drawText(ctx, 'THE MATH OF THE MONTH', 400, 80, { size: 24, weight: 'bold', color: '#ffd700', align: 'center' });
  const rows = [
    ['Paid hours worked', `${k.hours} h`],
    ['Earned, per paid hour', k.hours > 0 ? `$${k.rate.toFixed(2)}` : 'no paid work yet'],
    ["Lost to clients who didn't pay", `$${k.lost}`],
    ['Rent paid', k.earned > 0 ? `$${k.rent} (${k.rentShare}% of earnings)` : `$${k.rent}`],
    ['Energy spent getting to gigs, unpaid', `${k.travelEnergy}`],
    ['Days too sick to work', `${k.sickDays}`],
  ];
  rows.forEach(([label, v], i) => {
    const y = 124 + i * 32;
    drawText(ctx, label, 140, y, { size: 15, color: '#e8dcc4' });
    drawText(ctx, v, 660, y, { size: 15, weight: 'bold', color: '#ffffff', align: 'right', font: 'monospace' });
  });
  const line = k.hoursForRent
    ? `At $${k.rate.toFixed(2)} an hour, one week's rent took ${k.hoursForRent} hours of paid work, before food, the phone, or a single day off.`
    : "With no paid hours, a week's rent was out of reach from the start.";
  let y = drawWrapped(ctx, line, 400, 330, 520, 22, { size: 16, color: '#ffffff', align: 'center' }) + 8;
  drawWrapped(ctx, "The pay per gig, the rent, and the chance a client doesn't pay were set by the job, not by you. Your choices moved these numbers a little. They didn't set them.", 400, y, 520, 21, { size: 15, color: '#c9e4d3', align: 'center' });
  button(ctx, 300, 490, 200, 48, 'Close', { color: '#2c6e49', onClick: () => { game.mathOpen = false; } });
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
  const vy = drawWrapped(ctx, runVerdict(s), 400, 134, 500, 22, { size: 16, color: '#e0e0e0', align: 'center' });
  const twist = twistOf(s), goal = goalOf(s);
  if (twist) drawText(ctx, `This month: ${twist.name}`, 400, Math.min(vy + 2, 190), { size: 13, color: '#c9a876', align: 'center' });

  const rows = [
    ['Cash on hand', `$${Math.round(s.cash)}`],
    ['Total earned', `$${Math.round(s.totalEarned)}`],
    ['Gigs completed', `${s.gigsCompleted}`],
    ['Reputation', `${s.reputation.toFixed(1)} ★`],
    ['Balance', `${Math.round(s.health)} — ${balanceVerdict(s.health)}`],
    ['Evenings rested', `${s.eveningsRested}`],
    ['Clients read well', `${s.eiWins}`],
    ['Lessons learned on the job', `${(s.lessonsSeen || []).length}`],
  ];
  if (goal) rows.push(['Side goal', (s.sideGoalDone || goal.check(s)) ? 'Done ✓' : 'Missed']);
  const gy = 224;
  panel(ctx, 190, gy - 26, 420, rows.length * 28 + 14, { alpha: 0.6 });
  rows.forEach(([k, v], i) => {
    drawText(ctx, k, 214, gy + i * 28, { size: 15, color: '#c9a876' });
    drawText(ctx, v, 586, gy + i * 28, { size: 15, weight: 'bold', color: '#f0f0f0', align: 'right', font: 'monospace' });
  });

  // Three equal buttons, evenly spaced INSIDE the panel (QA round 2 #27: the outer two hung past
  // the panel's edges).
  const BW = 172, GAP = 14, BX = 400 - (BW * 3 + GAP * 2) / 2;
  button(ctx, BX, 484, BW, 50, 'Free play (keep going)', { color: '#2c5a6e', fontSize: 13, onClick: () => game.startFreePlay() });
  button(ctx, BX + BW + GAP, 484, BW, 50, 'The math of the month', { color: '#6b4a2e', fontSize: 13, onClick: () => { game.mathOpen = true; } });
  button(ctx, BX + (BW + GAP) * 2, 484, BW, 50, 'New run', { color: '#2c6e49', fontSize: 14, onClick: () => game.newGame() });
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
  button(ctx, 180, 430, 210, 56, 'The math of the month', { color: '#6b4a2e', fontSize: 14, onClick: () => { game.mathOpen = true; } });
  button(ctx, 410, 430, 210, 56, 'New Game', { color: '#2c6e49', onClick: () => game.newGame() });
}

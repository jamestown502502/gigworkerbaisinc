// Pixel character renderer + the look/identity options the creator offers.
//
// Follows current character-creator practice (Baldur's Gate 3, The Sims 4, Animal Crossing:
// New Horizons): body shape, pronouns, hairstyle and facial hair are separate, independent
// choices, and nothing is locked to anything else. Builds are numbered, not labelled male or
// female; every hairstyle and every facial-hair option is open to every build; pronouns are
// picked on their own and are the only thing the game's text reads.
import { drawText } from './text.js';

/** The Monk Skin Tone Scale (Google / Dr. Ellis Monk, 2022): ten tones spanning the full range of
 *  human skin, designed so no group is represented by a single swatch. Lightest to deepest. */
export const SKIN_TONES = ['#f6ede4', '#f3e7db', '#f7ead0', '#eadaba', '#d7bd96', '#a07e56', '#825c43', '#604134', '#3a312a', '#292420'];
export const HAIR_COLORS = ['#1a1a1a', '#4a3728', '#7a5230', '#a83c28', '#d9b45b', '#9a9a9a', '#e8e4dc', '#3f6fd1', '#d45a9a'];
export const SHIRT_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#95a5a6'];
export const BUILDS = ['Build 1', 'Build 2', 'Build 3'];
export const HAIR_STYLES = ['Short', 'Buzz', 'Long', 'Bun', 'Curls', 'Bald'];
export const FACIAL_HAIR = ['None', 'Stubble', 'Mustache', 'Beard'];
export const PRONOUNS = {
  she: { label: 'she/her', Subj: 'She', subj: 'she', obj: 'her', poss: 'her', was: 'was', is: 'is' },
  he: { label: 'he/him', Subj: 'He', subj: 'he', obj: 'him', poss: 'his', was: 'was', is: 'is' },
  they: { label: 'they/them', Subj: 'They', subj: 'they', obj: 'them', poss: 'their', was: 'were', is: 'are' },
};

export const DEFAULT_CHARACTER = { body: 0, pronouns: 'they', hairStyle: 0, facialHair: 0, skin: '#a07e56', hair: '#4a3728', shirt: '#3498db' };

/** The player's pronoun set, falling back to they/them for anything unrecognised. */
export function pronounsFor(character) {
  return PRONOUNS[character?.pronouns] ?? PRONOUNS.they;
}

/** Fill {Subj} {subj} {obj} {poss} {was} {is} in a line of text. */
export function withPronouns(template, character) {
  const p = pronounsFor(character);
  return template.replace(/\{(Subj|subj|obj|poss|was|is)\}/g, (_, k) => p[k]);
}

// What Randomize leans toward for each pronoun set (QA round 2 #7: with she/her picked, Randomize
// kept producing beards, which read as the button ignoring the choice). Weights only: every option
// stays reachable by hand, and they/them stays fully open. Index order follows HAIR_STYLES
// (Short, Buzz, Long, Bun, Curls, Bald), FACIAL_HAIR (None, Stubble, Mustache, Beard), BUILDS.
const RANDOM_WEIGHTS = {
  she: { hairStyle: [2, 1, 5, 4, 4, 0.5], facialHair: [1, 0, 0, 0], body: [3, 1, 3] },
  he: { hairStyle: [5, 4, 1, 1, 3, 2], facialHair: [3, 3, 2, 3], body: [2, 3, 2] },
  they: { hairStyle: [1, 1, 1, 1, 1, 1], facialHair: [3, 1, 1, 1], body: [1, 1, 1] },
};

function weightedIndex(weights, rand) {
  const total = weights.reduce((a, w) => a + w, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}

/** A random look, for the creator's Randomize button. Pronouns are never randomized: they are
 *  the player's to state, not a roll of the dice; the look leans toward what those pronouns
 *  usually go with (see RANDOM_WEIGHTS). */
export function randomLook(character, rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const w = RANDOM_WEIGHTS[character?.pronouns] ?? RANDOM_WEIGHTS.they;
  return {
    ...character,
    body: weightedIndex(w.body, rand),
    hairStyle: weightedIndex(w.hairStyle, rand),
    facialHair: weightedIndex(w.facialHair, rand),
    skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS), shirt: pick(SHIRT_COLORS),
  };
}

// A pixel person on an 8x16 unit grid scaled to w x h. Redrawn 2026-11-10 with a face (eyes that
// blink, a mouth that follows the mood), shading on hair, shirt and trousers, a collar, a belt and
// a shadow on the floor, so the character reads as someone rather than a stack of blocks.
// `opts.t` (seconds) drives the blink; `opts.walk` (seconds) swings the legs and arms;
// `opts.mood` is 'ok', 'tired' or 'stressed'.
export function drawCharacter(ctx, x, y, w, h, character = DEFAULT_CHARACTER, opts = {}) {
  const { t = 0, walk = null, mood = 'ok' } = opts;
  const step = walk === null ? 0 : Math.sin(walk * 10);   // -1..1, one stride every 0.6 s
  const c = { ...DEFAULT_CHARACTER, ...character };
  const u = w / 8, v = h / 16;
  const px = (gx, gy, gw, gh, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + gx * u), Math.round(y + gy * v), Math.ceil(gw * u), Math.ceil(gh * v));
  };
  // Build 1: narrow frame. Build 2: broad shoulders. Build 3: fuller frame, wider through the hips.
  const shoulder = [0, 0.5, 0.2][c.body] ?? 0;
  const hip = [0, 0.15, 0.45][c.body] ?? 0;

  // hair behind the face
  switch (c.hairStyle) {
    case 0: px(1.5, 0, 5, 2, c.hair); px(1, 1, 6, 1.5, c.hair); break;                                   // short
    case 1: px(2, 1.2, 4, 1, c.hair); break;                                                              // buzz
    case 2: px(1.5, 0, 5, 2, c.hair); px(1, 1, 6, 1.5, c.hair); px(1, 2, 1, 5, c.hair); px(6, 2, 1, 5, c.hair); break; // long
    case 3: px(3, 0, 2, 1.1, c.hair); px(1.8, 0.9, 4.4, 1.6, c.hair); break;                             // bun
    case 4: px(1, 0.2, 6, 2.3, c.hair); px(0.6, 1, 0.8, 2.6, c.hair); px(6.6, 1, 0.8, 2.6, c.hair); break; // curls
    default: break;                                                                                        // bald
  }
  // floor shadow first, so the feet stand on it
  px(1.2, 15.5, 5.6, 0.5, 'rgba(0,0,0,0.28)');
  // face: cheeks in shade, eyes with whites (closed for a blink), and a mouth for the mood
  px(2, 2, 4, 3, c.skin);
  px(5.4, 2, 0.6, 3, SHADE);
  const blink = t % 4 > 3.86;
  if (blink || mood === 'tired') {
    px(2.6, 3.3, 1, 0.3, '#1a1a1a');
    px(4.4, 3.3, 1, 0.3, '#1a1a1a');
  } else {
    px(2.6, 2.9, 1, 0.9, '#fdfdfd');
    px(4.4, 2.9, 1, 0.9, '#fdfdfd');
    px(3, 3.1, 0.6, 0.7, '#1a1a1a');
    px(4.8, 3.1, 0.6, 0.7, '#1a1a1a');
  }
  if (mood === 'stressed') {
    px(2.5, 2.5, 1.2, 0.25, '#1a1a1a');          // brows drawn down
    px(4.3, 2.5, 1.2, 0.25, '#1a1a1a');
    px(3.3, 4.35, 1.4, 0.3, MOUTH);
    px(3.1, 4.55, 0.3, 0.25, MOUTH); px(4.6, 4.55, 0.3, 0.25, MOUTH);
  } else if (mood === 'tired') {
    px(3.4, 4.35, 1.2, 0.3, MOUTH);
  } else {
    px(3.3, 4.4, 1.4, 0.3, MOUTH);                 // a small smile
    px(3.1, 4.2, 0.3, 0.25, MOUTH); px(4.6, 4.2, 0.3, 0.25, MOUTH);
  }
  // a highlight on the hair, where there is hair
  if (c.hairStyle !== 5 && c.hairStyle !== 1) px(2.4, 0.5, 1.6, 0.4, 'rgba(255,255,255,0.22)');
  // facial hair, in the hair color
  if (c.facialHair === 1) { ctx.save(); ctx.globalAlpha *= 0.45; px(2.2, 4.1, 3.6, 0.9, c.hair); ctx.restore(); }
  if (c.facialHair === 2) px(3, 3.95, 2, 0.45, c.hair);
  if (c.facialHair === 3) { px(2, 3.9, 4, 1.1, c.hair); px(2.5, 5, 3, 0.5, c.hair); }
  // neck
  px(3.5, 5, 1, 0.6, c.skin);
  // torso: shoulders at the top, hips at the bottom
  px(2 - shoulder, 5.6, 4 + shoulder * 2, 2.4, c.shirt);
  px(2 - hip, 8, 4 + hip * 2, 2, c.shirt);
  px(5 + shoulder * 0.5, 5.6, 1 + shoulder * 0.5, 4.4, SHADE);   // the side away from the light
  px(3.4, 5.6, 1.2, 0.5, c.skin);                                 // open collar
  // arms (sleeves + hands) sit outside the shoulders, and swing on a walk
  const swing = step * 0.5;
  px(1 - shoulder, 5.8 + swing, 1, 2.5, c.shirt);
  px(6 + shoulder, 5.8 - swing, 1, 2.5, c.shirt);
  px(6 + shoulder, 5.8 - swing, 1, 2.5, SHADE);
  px(1 - shoulder, 8.3 + swing, 1, 1.5, c.skin);
  px(6 + shoulder, 8.3 - swing, 1, 1.5, c.skin);
  // trousers with a belt, legs that take turns on a walk, and shoes
  const liftL = Math.max(0, step) * 0.7, liftR = Math.max(0, -step) * 0.7;
  px(2 - hip, 10, 4 + hip * 2, 1, PANTS);
  px(2 - hip, 10, 4 + hip * 2, 0.35, '#22303f');
  px(3.7, 10, 0.6, 0.35, '#d9b45b');                              // buckle
  px(2 - hip, 11, 1.6 + hip, 3.5 - liftL, PANTS);
  px(4.4, 11, 1.6 + hip, 3.5 - liftR, PANTS);
  px(5.2 + hip * 0.5, 11, 0.8 + hip * 0.5, 3.5 - liftR, SHADE);
  px(1.8 - hip, 14.5 - liftL, 2, 1.2, SHOES);
  px(4.2 + hip, 14.5 - liftR, 2, 1.2, SHOES);
  px(1.8 - hip, 15.4 - liftL, 2, 0.3, '#3d2514');
  px(4.2 + hip, 15.4 - liftR, 2, 0.3, '#3d2514');
}

const SHADE = 'rgba(0,0,0,0.16)', MOUTH = '#7a3b2e', PANTS = '#34495e', SHOES = '#6b4226';

/** The face the character wears for how the day is going (apartment and travel screens). */
export function moodFor(state) {
  if ((state?.stress || 0) >= 70) return 'stressed';
  if ((state?.energy ?? 100) < 25) return 'tired';
  return 'ok';
}

/** A short line under the preview showing what the pronoun choice changes in the game's text. */
export function pronounPreview(character) {
  return withPronouns('Client review: "{Subj} {was} on time. Would hire {obj} again."', character);
}

/** One row of the creator: a label and a strip of options (text chips or colour swatches).
 *  Selection is shown by shape as well as colour (filled chip / thick ring), never colour alone. */
export function optionRow(ctx, x, y, label, options, selected, onPick, register, { swatch = false, chipW = 96, perRow = 3 } = {}) {
  drawText(ctx, label, x, y + 20, { size: 14, weight: 'bold', color: '#c9a876' });
  const ox = x + 100;
  if (swatch) {
    const size = 28, gap = 4;
    options.forEach((color, i) => {
      const sx = ox + i * (size + gap);
      const on = color === selected;
      ctx.fillStyle = color;
      ctx.fillRect(sx, y + 2, size, size);
      ctx.lineWidth = on ? 4 : 1;
      ctx.strokeStyle = on ? '#f1c40f' : '#8b5a2b'; // a visible edge even on the darkest swatches
      ctx.strokeRect(sx, y + 2, size, size);
      if (on) {
        // The same check mark the text chips use, so selection reads the same everywhere (QA round
        // 2 #15). A dark disc behind it keeps it visible on the lightest and darkest swatches alike.
        ctx.fillStyle = 'rgba(20,14,8,0.82)';
        ctx.beginPath(); ctx.arc(sx + size / 2, y + 2 + size / 2, 13, 0, Math.PI * 2); ctx.fill();
        drawText(ctx, '✓', sx + size / 2, y + 3 + size / 2, { size: 14, weight: 'bold', color: '#f1c40f', align: 'center', baseline: 'middle', shadow: false });
      }
      register(sx - 2, y, size + 4, size + 4, () => onPick(color));
    });
    return y + 40;
  }
  const h = 32, gap = 8;
  options.forEach((opt, i) => {
    const col = i % perRow, row = Math.floor(i / perRow);
    const cx = ox + col * (chipW + gap), cy = y + row * (h + 6);
    const on = i === selected || opt === selected;
    ctx.fillStyle = on ? '#f1c40f' : 'rgba(20, 14, 8, 0.85)';
    ctx.fillRect(cx, cy, chipW, h);
    ctx.lineWidth = on ? 3 : 1;
    ctx.strokeStyle = on ? '#ffffff' : '#8b5a2b';
    ctx.strokeRect(cx, cy, chipW, h);
    drawText(ctx, (on ? '✓ ' : '') + (typeof opt === 'string' ? opt : opt.label), cx + chipW / 2, cy + h / 2, {
      size: 13, weight: 'bold', color: on ? '#1d150d' : '#f0f0f0', align: 'center', baseline: 'middle', maxWidth: chipW - 8,
    });
    register(cx, cy, chipW, h, () => onPick(i, opt));
  });
  const rows = Math.ceil(options.length / perRow);
  return y + rows * (h + 6) + 6;
}

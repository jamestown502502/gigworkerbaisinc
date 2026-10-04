// The Hustle polish kit (2026-10-04): easing, the receipt printer's timing, the Five Stars rule,
// the haptic vocabulary and where each HUD meter sits. Pure, so tests can check it; fx.js and the
// screens draw it. Every effect has a calm fallback under Settings > Reduce Motion.

export const easeOutCubic = (t) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1, x = Math.max(0, Math.min(1, t)) - 1;
  return 1 + c3 * x ** 3 + c1 * x ** 2;
}
export function easeOutBounce(t) {
  let x = Math.max(0, Math.min(1, t));
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** Where each HUD meter's number sits, so a token can fly to it. */
export const METER_POS = { cash: { x: 70, y: 28 }, stress: { x: 182, y: 28 }, rep: { x: 322, y: 28 }, energy: { x: 430, y: 28 }, balance: { x: 550, y: 28 } };

/** The receipt prints one line per LINE_SECS, then the total, then the stamp. */
export const RECEIPT_LINE_SECS = 0.14;
export function receiptState(t, lines) {
  const shown = Math.max(0, Math.min(lines, Math.floor(t / RECEIPT_LINE_SECS) + 1));
  const totalAt = lines * RECEIPT_LINE_SECS + 0.1;
  return { shown, total: t >= totalAt, stamp: t >= totalAt + 0.35, stampT: Math.max(0, t - totalAt - 0.35) };
}

/** Five Stars: a skill challenge cleared near-perfectly. Rare on purpose. */
export const FIVE_STAR_SCORE = 95;
export function isFiveStars(kind, result) {
  return kind === 'skill' && !!result && result.success && (result.score ?? 0) >= FIVE_STAR_SCORE;
}

/** Short and clear, never buzzy (Android haptics principles). */
export const HAPTIC = { tick: 8, thud: 18, double: [12, 40, 12], soft: [30] };

/** Heartbeat timing: two thumps every 0.9 s; returns 0..1 glow strength at time t. */
export function heartbeat(t) {
  const p = t % 0.9;
  const thump = (c) => Math.max(0, 1 - Math.abs(p - c) / 0.07);
  return Math.max(thump(0.08), thump(0.28) * 0.7);
}

/** Which way a choice's effects fly: one token per non-zero stat, labelled. */
export function effectTokens(fx = {}) {
  const out = [];
  if (fx.cash) out.push({ key: 'cash', text: `${fx.cash > 0 ? '+' : '-'}$${Math.abs(Math.round(fx.cash))}`, color: fx.cash > 0 ? '#2ecc71' : '#ff6b5e' });
  if (fx.stress) out.push({ key: 'stress', text: `${fx.stress > 0 ? '+' : ''}${Math.round(fx.stress)}`, color: fx.stress > 0 ? '#ff6b5e' : '#2ecc71' });
  if (fx.rep) out.push({ key: 'rep', text: `${fx.rep > 0 ? '+' : ''}${Math.round(fx.rep * 10) / 10}★`, color: fx.rep > 0 ? '#f1c40f' : '#ff6b5e' });
  if (fx.energy) out.push({ key: 'energy', text: `${fx.energy > 0 ? '+' : ''}${Math.round(fx.energy)}`, color: fx.energy > 0 ? '#2ecc71' : '#ff6b5e' });
  return out;
}

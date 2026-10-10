// Long-form job games (2026-10-03). The six job microgames are a few seconds each; these two are a
// whole shift (about a minute), harder, and built around a real-money skill. Both keep the skill
// QTE contract loop.js relies on (update, render, handleTap, done, result { success, score }) and
// add `result.items`: real money lines for the gig's receipt, because in these jobs what you earn
// IS the score. loop.finishGig puts them on the ledger instead of the usual bonus or pay cut.
//
//   Delivery Driver -> RUSH!    orders ping in; the app shows pay per order, the game shows what
//                               you really make per hour after gas and wear
//   Flea Market     -> MARKET!  buy thrift stock on a budget, then haggle with buyers you must read
import { difficultyFactor, AREA, drawFace } from './qte.js';
import { drawText, drawWrapped, roundRectPath } from '../ui/text.js';
import { playTick, playSuccess, playFail, playError, playGood, playBuzz, playCashIn, haptic } from '../engine/audio.js';
import { easeOutBack, easeOutCubic } from '../ui/juice.js';

function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function inRect(pt, r) { return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h; }
function btn(ctx, b, fill, label, size = 17) {
  ctx.fillStyle = fill; roundRectPath(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
  ctx.strokeStyle = '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
  drawText(ctx, label, b.x + b.w / 2, b.y + b.h / 2, { size, weight: 'bold', color: '#ffffff', align: 'center', baseline: 'middle', maxWidth: b.w - 16 });
}
const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2).replace(/\.00$/, '')}`;

export const LONGFORM_LESSONS = {
  rush: 'Judge an order by pay per mile and per hour, not the headline. Many drivers want about $1 a mile or more.',
  market: 'Buy what has margin, and read the buyer: an eager one pays list, a bargain hunter meets halfway.',
};

// =============================================================================== RUSH! (Delivery)
export const GAS_PER_MILE = 0.35;   // gas and wear, simplified (the IRS rate, which adds depreciation, was 70 cents in 2025)
export const SHIFT_MIN = 180;       // a three-hour shift, compressed
const IDLE_MIN_PER_SEC = 4;         // waiting for a ping still costs shift time
const DRIVE_SECS = 1.3;             // an accepted order plays out in this many real seconds
export const LOW_PRIORITY_AT = 0.6; // acceptance under this: the app sends worse orders
export const RUSH_TARGET = 13;       // real dollars an hour after gas: the shift's goal, shown live (QA round 4 #3)

/** One order. About half are good (pay well per mile); the rest look fine and are not. */
export function makeOrder(rand = Math.random, lowPriority = false) {
  const miles = Math.round((1.5 + rand() * 7.5) * 10) / 10;
  const good = rand() < 0.55;
  let pay = good ? miles * (1.25 + rand() * 0.75) + 1.5 : miles * (0.3 + rand() * 0.3) + 2;
  if (lowPriority) pay *= 0.85;
  pay = Math.round(pay * 4) / 4;
  return { pay, miles, minutes: Math.round(miles * 2.6 + 6) };
}
export function perMile(o) { return o.pay / o.miles; }
/** What an order really adds after gas, per hour of the time it takes. */
export function orderHourly(o) { return ((o.pay - o.miles * GAS_PER_MILE) / o.minutes) * 60; }

export class RushShift {
  constructor(state, rand = Math.random) {
    this.name = 'RUSH!';
    this.hint = 'Orders ping in. Accept or decline. Your real pay is after gas, per hour.';
    this.rand = rand;
    this.d = difficultyFactor(state);
    this.decideMax = 7 / this.d;
    this.clock = 0; this.t = 0;
    this.order = null; this.decideLeft = 0;
    this.nextPing = 0.8; this.driving = null;
    this.pay = 0; this.miles = 0; this.accepted = 0; this.declined = 0;
    this.badTaken = 0;   // accepted orders under $1 a mile: the reason a busy shift can still lose
    this.verdict = null; this.buttons = [];
    this.timeMax = Math.round(SHIFT_MIN / IDLE_MIN_PER_SEC);
    this.done = false; this.result = null;
  }
  acceptance() { const n = this.accepted + this.declined; return n === 0 ? 1 : this.accepted / n; }
  lowPriority() { return this.accepted + this.declined >= 4 && this.acceptance() < LOW_PRIORITY_AT; }
  gas() { return this.miles * GAS_PER_MILE; }
  realHourly() { const hrs = Math.max(this.clock, 1) / 60; return (this.pay - this.gas()) / hrs; }
  accept() {
    if (!this.order || this.driving || this.done) return;
    const o = this.order; this.order = null;
    this.accepted += 1; this.pay += o.pay; this.miles += o.miles;
    this.driving = { left: DRIVE_SECS, minutes: o.minutes };
    const pm = perMile(o);
    if (pm < 1) this.badTaken += 1;
    this.verdict = { good: pm >= 1, text: pm >= 1 ? `${money(pm)} a mile: worth the drive.` : `${money(pm)} a mile. After gas, ${money(o.pay - o.miles * GAS_PER_MILE)} for ${o.minutes} min.`, t: 2.2 };
    pm >= 1 ? playGood() : playError();
  }
  decline(expired = false) {
    if (!this.order || this.done) return;
    const o = this.order; this.order = null;
    this.declined += 1;
    const pm = perMile(o);
    this.verdict = { good: pm < 1, text: expired ? 'Missed it. That counts as a decline.' : pm < 1 ? `Skipped ${money(pm)} a mile. Good call.` : `That was ${money(pm)} a mile. A good one got away.`, t: 2.2 };
    playTick();
    this.nextPing = 0.6 + this.rand() * 1.2;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.verdict) { this.verdict.t -= dt; if (this.verdict.t <= 0) this.verdict = null; }
    if (this.driving) {
      const step = Math.min(dt, this.driving.left);
      this.clock += (this.driving.minutes / DRIVE_SECS) * step;
      this.driving.left -= dt;
      if (this.driving.left <= 0) { this.driving = null; this.nextPing = 0.6 + this.rand() * 1.2; }
    } else if (this.order) {
      this.clock += IDLE_MIN_PER_SEC * dt * 0.5;   // deciding takes a little time too
      this.decideLeft -= dt;
      if (this.decideLeft <= 0) this.decline(true);
    } else {
      this.clock += IDLE_MIN_PER_SEC * dt;
      this.nextPing -= dt;
      if (this.nextPing <= 0 && this.clock < SHIFT_MIN) { this.order = makeOrder(this.rand, this.lowPriority()); this.orderAt = this.t; this.decideLeft = this.decideMax; playBuzz(); haptic([12, 40, 12]); }
    }
    if (this.clock >= SHIFT_MIN && !this.driving) this.finish();
  }
  handleTap(pt) {
    if (this.done) return;
    const b = this.buttons.find((x) => inRect(pt, x));
    if (b) b.onTap();
  }
  finish() {
    this.order = null;
    const rate = this.realHourly();
    const score = Math.max(0, Math.min(100, Math.round(((rate - 6) / 16) * 100)));
    // Taking most orders and still missing the target is the lesson, so the card says why
    // (QA round 4 #3: "accepted most of the deliveries but the result shows fumbled").
    const why = rate >= RUSH_TARGET
      ? `Real pay $${rate.toFixed(2)}/hr beat the $${RUSH_TARGET}/hr target.`
      : this.badTaken > 0
        ? `Real pay $${rate.toFixed(2)}/hr, under the $${RUSH_TARGET}/hr target: ${this.badTaken} of your ${this.accepted} orders paid under $1 a mile, and gas ate them.`
        : `Real pay $${rate.toFixed(2)}/hr, under the $${RUSH_TARGET}/hr target: too much of the shift went to waiting.`;
    this.result = {
      success: rate >= RUSH_TARGET, score, lesson: LONGFORM_LESSONS.rush, hourly: Math.round(rate * 100) / 100,
      target: RUSH_TARGET, why, accepted: this.accepted, badTaken: this.badTaken,
      items: [
        { label: `Order pay (${this.accepted} orders)`, amount: Math.round(this.pay) },
        { label: `Gas and wear (${Math.round(this.miles)} mi)`, amount: -Math.round(this.gas()) },
      ],
    };
    this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    this.buttons = [];
    const cx = AREA.x + AREA.w / 2;
    const left = Math.max(0, SHIFT_MIN - this.clock);
    const low = this.lowPriority();
    drawText(ctx, `Shift: ${Math.floor(left / 60)}h ${String(Math.floor(left % 60)).padStart(2, '0')}m left   ·   Acceptance ${Math.round(this.acceptance() * 100)}%`, cx, AREA.y + 72, { size: 15, weight: 'bold', color: low ? '#ff8a7e' : '#f5deb3', align: 'center' });
    // the phone
    // a new order drops in from the top like a phone notification (2026-10-04)
    const drop = this.order ? easeOutBack(Math.min(1, (this.t - (this.orderAt ?? -1)) / 0.3)) : 1;
    const card = { x: AREA.x + 150, y: AREA.y + 86 - (1 - drop) * 50, w: 300, h: 142 };
    ctx.fillStyle = 'rgba(15, 20, 28, 0.94)'; roundRectPath(ctx, card.x, card.y, card.w, card.h, 14); ctx.fill();
    ctx.strokeStyle = '#5dade2'; ctx.lineWidth = 2; roundRectPath(ctx, card.x, card.y, card.w, card.h, 14); ctx.stroke();
    if (this.order) {
      const o = this.order;
      drawText(ctx, 'NEW ORDER', cx, card.y + 26, { size: 13, weight: 'bold', color: '#5dade2', align: 'center' });
      drawText(ctx, money(o.pay), cx, card.y + 66, { size: 34, weight: 'bold', color: '#ffffff', align: 'center' });
      drawText(ctx, `${o.miles} mi  ·  about ${o.minutes} min`, cx, card.y + 96, { size: 16, color: '#e0e0e0', align: 'center' });
      ctx.fillStyle = '#3a2d1f'; ctx.fillRect(card.x + 20, card.y + 118, card.w - 40, 8);
      ctx.fillStyle = '#5dade2'; ctx.fillRect(card.x + 20, card.y + 118, (card.w - 40) * Math.max(0, this.decideLeft / this.decideMax), 8);
      const dec = { x: AREA.x + 150, y: AREA.y + 262, w: 140, h: 52, onTap: () => this.decline() };
      const acc = { x: AREA.x + 310, y: AREA.y + 262, w: 140, h: 52, onTap: () => this.accept() };
      this.buttons.push(dec, acc);
      btn(ctx, dec, '#6b3a2e', 'Decline'); btn(ctx, acc, '#2c6e49', 'Accept');
    } else if (this.driving) {
      drawText(ctx, 'On a delivery', cx, card.y + 52, { size: 20, weight: 'bold', color: '#ffffff', align: 'center' });
      drawText(ctx, `${this.driving.minutes} minutes on the road`, cx, card.y + 86, { size: 15, color: '#e0e0e0', align: 'center' });
      // the car, driving its route across the card
      const prog = 1 - Math.max(0, this.driving.left) / DRIVE_SECS;
      ctx.strokeStyle = 'rgba(93, 173, 226, 0.5)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(card.x + 30, card.y + 116); ctx.lineTo(card.x + card.w - 30, card.y + 116); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#5dade2'; roundRectPath(ctx, card.x + 22 + (card.w - 60) * easeOutCubic(prog), card.y + 108, 16, 16, 4); ctx.fill();
    } else {
      drawText(ctx, 'Waiting for orders...', cx, card.y + 66, { size: 18, color: '#c9a876', align: 'center' });
      drawText(ctx, 'Waiting is unpaid shift time', cx, card.y + 96, { size: 14, color: '#b5a488', align: 'center' });
    }
    if (this.verdict) drawText(ctx, this.verdict.text, cx, AREA.y + 246, { size: 15, weight: 'bold', color: this.verdict.good ? '#9fe0b5' : '#ffb3a8', align: 'center', maxWidth: AREA.w - 40 });
    if (low) drawText(ctx, 'Acceptance under 60%: the app is sending you lower-paying orders.', cx, AREA.y + 334, { size: 14, weight: 'bold', color: '#ff8a7e', align: 'center', maxWidth: AREA.w - 40 });
    const onTarget = this.clock < 1 || this.realHourly() >= RUSH_TARGET;
    drawText(ctx, `Pay ${money(Math.round(this.pay))}   ·   Gas -${money(Math.round(this.gas()))}   ·   Real ${money(Math.round(this.realHourly()))}/hr (target $${RUSH_TARGET})`, cx, AREA.y + AREA.h - 22, { size: 16, weight: 'bold', color: onTarget ? '#9fe0b5' : '#ffb3a8', align: 'center', maxWidth: AREA.w - 20 });
  }
}

// =============================================================================== MARKET! (Flea Market)
export const MARKET_BUDGET = 30;
export const THRIFT_ITEMS = [
  { name: 'Denim jacket', cost: 8, lo: 25, hi: 40 },
  { name: 'Box of records', cost: 12, lo: 30, hi: 48 },
  { name: 'Desk lamp', cost: 5, lo: 12, hi: 20 },
  { name: 'Board game', cost: 4, lo: 8, hi: 14 },
  { name: 'Leather boots', cost: 15, lo: 28, hi: 42 },
  { name: 'Picture frames', cost: 6, lo: 6, hi: 10 },
];
/** How each kind of buyer opens, and what they will accept. Readable from the face and the cue. */
export const BUYERS = {
  eager: { feeling: 'grateful', offer: 0.7, accepts: ['take', 'half', 'hold'], cue: 'Already holding it up to the light.' },
  bargain: { feeling: 'suspicious', offer: 0.55, accepts: ['take', 'half'], cue: 'Counting coins, one eyebrow raised.' },
  browser: { feeling: 'neutral', offer: 0.45, accepts: ['take'], cue: 'Wandering past, phone in hand.' },
};
export function marketPrices(item, kind) {
  const list = item.hi;
  const offer = Math.round(list * BUYERS[kind].offer);
  return { take: offer, half: Math.round((offer + list) / 2), hold: list };
}
/** The best a perfect read of these buyers could make. */
export function bestSale(item, kind) {
  const p = marketPrices(item, kind);
  return Math.max(...BUYERS[kind].accepts.map((k) => p[k]));
}
/** Best expected margin any set of thrift picks can buy within the budget (at mid resale). */
export function bestBuyMargin(items = THRIFT_ITEMS, budget = MARKET_BUDGET) {
  let best = 0;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let cost = 0, margin = 0;
    items.forEach((it, i) => { if (mask & (1 << i)) { cost += it.cost; margin += (it.lo + it.hi) / 2 - it.cost; } });
    if (cost <= budget) best = Math.max(best, margin);
  }
  return best;
}

export class MarketDay {
  constructor(state, rand = Math.random) {
    this.name = 'MARKET!';
    this.hint = 'Buy cheap stock with margin. Then read each buyer before you name your price.';
    this.rand = rand;
    this.d = difficultyFactor(state);
    this.stage = 'buy';
    this.picked = new Set();
    this.buyLeft = 24 / this.d; this.buyMax = this.buyLeft;
    this.customers = []; this.idx = 0; this.feedback = null;
    this.perCustomer = 9 / this.d; this.custLeft = this.perCustomer;
    this.sales = 0; this.flash = 0;
    this.buttons = [];
    this.done = false; this.result = null;
  }
  spent() { return [...this.picked].reduce((a, i) => a + THRIFT_ITEMS[i].cost, 0); }
  toggle(i) {
    if (this.stage !== 'buy') return;
    if (this.picked.has(i)) { this.picked.delete(i); playTick(); return; }
    if (this.spent() + THRIFT_ITEMS[i].cost > MARKET_BUDGET) { this.flash = 1.2; playError(); return; }
    this.picked.add(i); playTick();
  }
  openStall() {
    if (this.stage !== 'buy') return;
    const items = [...this.picked].map((i) => THRIFT_ITEMS[i]);
    if (!items.length) return this.finish();
    const kinds = shuffle(['eager', 'bargain', 'browser', 'bargain', 'eager', 'browser'], this.rand);
    this.customers = items.map((item, k) => ({ item, kind: kinds[k % kinds.length], seed: 3 + k * 7 }));
    this.stage = 'sell'; this.custLeft = this.perCustomer; this.custAt = 0; this.sellT = 0;
    playGood();
  }
  respond(choice) {
    if (this.stage !== 'sell' || this.feedback) return;
    const c = this.customers[this.idx];
    const p = marketPrices(c.item, c.kind);
    const sold = choice !== 'none' && BUYERS[c.kind].accepts.includes(choice);
    const price = sold ? p[choice] : 0;
    c.sold = price; this.sales += price;
    const why = { eager: 'Eager buyers pay list.', bargain: 'Bargain hunters meet halfway, never list.', browser: 'Browsers only buy at their own price.' }[c.kind];
    const text = sold ? `Sold for $${price} (you paid $${c.item.cost}). ${price === bestSale(c.item, c.kind) ? 'Best you could get.' : why}` : choice === 'none' ? `They wander off. ${why}` : `They put it down and walk. ${why}`;
    this.feedback = { sold, text, t: 2.4, price };
    if (sold) { playCashIn(); haptic(18); } else { playError(); haptic(30); }
  }
  update(dt) {
    if (this.done) return;
    this.flash = Math.max(0, this.flash - dt);
    this.sellT = (this.sellT || 0) + dt;
    if (this.stage === 'buy') {
      this.buyLeft -= dt;
      if (this.buyLeft <= 0) this.openStall();
      return;
    }
    if (this.feedback) {
      this.feedback.t -= dt;
      if (this.feedback.t <= 0) {
        this.feedback = null; this.idx += 1; this.custLeft = this.perCustomer; this.custAt = this.sellT;
        if (this.idx >= this.customers.length) this.finish();
      }
      return;
    }
    this.custLeft -= dt;
    if (this.custLeft <= 0) this.respond('none');
  }
  handleTap(pt) {
    if (this.done) return;
    const b = this.buttons.find((x) => inRect(pt, x));
    if (b) b.onTap();
  }
  finish() {
    const spent = this.spent();
    const profit = this.sales - spent;
    const bestSell = this.customers.reduce((a, c) => a + bestSale(c.item, c.kind), 0);
    const sellSkill = bestSell > 0 ? Math.max(0, this.sales) / bestSell : 0;
    const buyMargin = this.customers.reduce((a, c) => a + (c.item.lo + c.item.hi) / 2 - c.item.cost, 0);
    const buySkill = Math.max(0, buyMargin) / bestBuyMargin();
    const score = Math.round(Math.min(1, sellSkill) * 70 + Math.min(1, buySkill) * 30);
    this.result = {
      success: score >= 60 && profit > 0, score, lesson: LONGFORM_LESSONS.market, profit,
      items: [{ label: `Sales (${this.customers.filter((c) => c.sold).length} items)`, amount: this.sales }, { label: 'Thrift stock', amount: -spent }],
    };
    this.stage = 'done'; this.done = true;
    this.result.success ? playSuccess() : playFail();
  }
  render(ctx) {
    this.buttons = [];
    const cx = AREA.x + AREA.w / 2;
    if (this.stage === 'buy') {
      ctx.fillStyle = '#3a2d1f'; ctx.fillRect(AREA.x + 20, AREA.y + 52, AREA.w - 40, 6);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(AREA.x + 20, AREA.y + 52, (AREA.w - 40) * Math.max(0, this.buyLeft / this.buyMax), 6);
      drawText(ctx, 'The thrift store, 8 a.m.: pick your stock', cx, AREA.y + 80, { size: 16, weight: 'bold', color: '#c9a876', align: 'center' });
      THRIFT_ITEMS.forEach((it, i) => {
        const b = { x: AREA.x + 22 + (i % 3) * 190, y: AREA.y + 94 + Math.floor(i / 3) * 100, w: 176, h: 88, onTap: () => this.toggle(i) };
        this.buttons.push(b);
        const on = this.picked.has(i);
        ctx.fillStyle = on ? '#1e4d33' : '#2b3d4f'; roundRectPath(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();   // selected green dark enough for gold text (AA)
        ctx.strokeStyle = on ? '#9fe0b5' : '#c9a876'; ctx.lineWidth = 2; roundRectPath(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
        drawText(ctx, `${on ? '✓ ' : ''}${it.name}`, b.x + b.w / 2, b.y + 26, { size: 15, weight: 'bold', color: '#ffffff', align: 'center', maxWidth: b.w - 12 });
        drawText(ctx, `Costs $${it.cost}`, b.x + b.w / 2, b.y + 50, { size: 14, color: '#ffd27a', align: 'center' });
        drawText(ctx, `Sells $${it.lo}-${it.hi}`, b.x + b.w / 2, b.y + 72, { size: 14, color: '#e0e0e0', align: 'center' });
      });
      const left = MARKET_BUDGET - this.spent();
      drawText(ctx, this.flash > 0 ? 'Over budget. Put something back first.' : `Budget $${MARKET_BUDGET}   ·   Spent $${this.spent()}   ·   Left $${left}`, cx, AREA.y + 314, { size: 15, weight: 'bold', color: this.flash > 0 ? '#ff8a7e' : '#f5deb3', align: 'center' });
      const open = { x: cx - 110, y: AREA.y + 330, w: 220, h: 48, onTap: () => this.openStall() };
      this.buttons.push(open);
      btn(ctx, open, this.picked.size ? '#2c6e49' : '#4a4a4a', 'Open the stall');
      return;
    }
    if (this.stage !== 'sell') return;
    const c = this.customers[Math.min(this.idx, this.customers.length - 1)];
    const p = marketPrices(c.item, c.kind);
    ctx.fillStyle = '#3a2d1f'; ctx.fillRect(AREA.x + 20, AREA.y + 52, AREA.w - 40, 6);
    ctx.fillStyle = '#5dade2'; ctx.fillRect(AREA.x + 20, AREA.y + 52, (AREA.w - 40) * Math.max(0, this.feedback ? 0 : this.custLeft / this.perCustomer), 6);
    // each buyer walks in from the left
    const walk = easeOutCubic(Math.min(1, ((this.sellT || 0) - (this.custAt || 0)) / 0.35));
    drawFace(ctx, AREA.x + 30 - (1 - walk) * 120, AREA.y + 70, 96, c.seed, BUYERS[c.kind].feeling);
    drawWrapped(ctx, `"Would you take $${p.take} for the ${c.item.name.toLowerCase()}?"`, AREA.x + 150, AREA.y + 92, AREA.w - 180, 21, { size: 17, color: '#ffffff', shadow: false });
    drawText(ctx, BUYERS[c.kind].cue, AREA.x + 150, AREA.y + 142, { size: 14, color: '#e8c98a', shadow: false, maxWidth: AREA.w - 180 });
    drawText(ctx, `Listed at $${p.hold}   ·   You paid $${c.item.cost}`, AREA.x + 150, AREA.y + 166, { size: 14, color: '#c9a876', shadow: false });
    if (this.feedback) {
      drawWrapped(ctx, this.feedback.text, cx, AREA.y + 232, AREA.w - 60, 22, { size: 16, weight: 'bold', color: this.feedback.sold ? '#9fe0b5' : '#ffb3a8', align: 'center' });
      if (this.feedback.sold) {
        // SOLD stamps on below the line
        const k = easeOutBack(Math.min(1, (2.4 - this.feedback.t) / 0.22)), sc = 1.8 - 0.8 * k, sy = AREA.y + 316;
        ctx.save(); ctx.translate(cx, sy); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.translate(-cx, -sy);
        ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3; roundRectPath(ctx, cx - 70, sy - 20, 140, 40, 6); ctx.stroke();
        drawText(ctx, `SOLD $${this.feedback.price}`, cx, sy, { size: 20, weight: 'bold', color: '#2ecc71', align: 'center', baseline: 'middle', shadow: false });
        ctx.restore();
      }
    } else {
      [['take', `Take $${p.take}`], ['half', `Meet halfway: $${p.half}`], ['hold', `Hold at $${p.hold}`]].forEach(([k, label], i) => {
        const b = { x: AREA.x + 40, y: AREA.y + 190 + i * 56, w: AREA.w - 80, h: 48, onTap: () => this.respond(k) };
        this.buttons.push(b);
        btn(ctx, b, ['#2b3d4f', '#3d4d5c', '#5d4023'][i], label, 16);
      });
    }
    drawText(ctx, `Buyer ${Math.min(this.idx + 1, this.customers.length)} of ${this.customers.length}   ·   Sold $${this.sales}   ·   Profit ${this.sales - this.spent() < 0 ? '-' : ''}$${Math.abs(this.sales - this.spent())}`, cx, AREA.y + AREA.h - 18, { size: 15, color: '#f0f0f0', align: 'center' });
  }
}

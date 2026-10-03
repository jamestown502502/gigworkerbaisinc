// Long-form job games (2026-10-03): RUSH! and MARKET! can be won by playing the real skill well,
// lose by doing nothing, teach what they score, and put their money on the receipt line by line.
import { describe, expect, it } from 'vitest';
import { RushShift, MarketDay, makeOrder, perMile, orderHourly, GAS_PER_MILE, THRIFT_ITEMS, MARKET_BUDGET, BUYERS, marketPrices, bestSale, bestBuyMargin } from '../../src/game/longform.js';
import { makeGame, seededRandom } from './helpers.js';

const CALM = { stress: 0, energy: 100, health: 100, settings: {} };
const DT = 1 / 60;

function shift(strategy, seed) {
  const g = new RushShift(CALM, seededRandom(seed));
  for (let i = 0; i < 20000 && !g.done; i++) {
    if (g.order && g.decideLeft < g.decideMax - 0.5) {
      if (strategy === 'all') g.accept();
      else if (strategy === 'none') g.decline();
      else if (strategy === 'rule') (perMile(g.order) >= 1 ? g.accept() : g.decline());
    }
    g.update(DT);
  }
  return g;
}
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('RUSH!: real pay is after gas, per hour', () => {
  it('the $1-a-mile rule beats taking everything, which beats taking nothing (200 shifts each)', () => {
    const rate = (s) => avg(Array.from({ length: 200 }, (_, i) => shift(s, 100 + i).result.hourly));
    const rule = rate('rule'), all = rate('all'), none = rate('none');
    expect(rule).toBeGreaterThan(all);
    expect(all).toBeGreaterThan(none);
    expect(none).toBe(0);
  });
  it('a picky shift usually succeeds; ignoring every ping fails and earns nothing', () => {
    const wins = Array.from({ length: 100 }, (_, i) => shift('rule', 500 + i).result.success).filter(Boolean).length;
    expect(wins).toBeGreaterThanOrEqual(60);
    const idle = new RushShift(CALM, seededRandom(7));
    for (let t = 0; t < 200 && !idle.done; t += DT) idle.update(DT);
    expect(idle.done).toBe(true);
    expect(idle.result.success).toBe(false);
    expect(idle.declined).toBeGreaterThan(0);   // missed pings count as declines
  });
  it('declining too much lowers your priority: the app sends lower-paying orders', () => {
    const g = new RushShift(CALM, seededRandom(3));
    g.declined = 4; g.accepted = 1;
    expect(g.lowPriority()).toBe(true);
    const r1 = seededRandom(9), r2 = seededRandom(9);
    expect(makeOrder(r1, true).pay).toBeLessThan(makeOrder(r2, false).pay + 0.001);
  });
  it('the receipt lines are the shift: order pay minus gas and wear', () => {
    const g = shift('all', 42);
    const [pay, gas] = g.result.items;
    expect(pay.amount).toBe(Math.round(g.pay));
    expect(gas.amount).toBe(-Math.round(g.miles * GAS_PER_MILE));
    const o = { pay: 10, miles: 5, minutes: 20 };
    expect(perMile(o)).toBe(2);
    expect(orderHourly(o)).toBeCloseTo(((10 - 5 * GAS_PER_MILE) / 20) * 60);
  });
  it('stress shortens the time to decide', () => {
    expect(new RushShift({ stress: 95, energy: 10, health: 40, settings: {} }).decideMax).toBeLessThan(new RushShift(CALM).decideMax);
  });
});

function market(read, picks, seed = 1) {
  const g = new MarketDay(CALM, seededRandom(seed));
  for (const i of picks) g.toggle(i);
  g.openStall();
  for (let k = 0; k < 2000 && !g.done; k++) {
    if (g.stage === 'sell' && !g.feedback) {
      const c = g.customers[g.idx];
      g.respond(read === 'perfect' ? BUYERS[c.kind].accepts[BUYERS[c.kind].accepts.length - 1] : read);
    }
    g.update(DT);
  }
  return g;
}

describe('MARKET!: buy margin, read the buyer', () => {
  it('the budget is enforced', () => {
    const g = new MarketDay(CALM);
    THRIFT_ITEMS.forEach((_, i) => g.toggle(i));
    expect(g.spent()).toBeLessThanOrEqual(MARKET_BUDGET);
    expect(g.flash).toBeGreaterThan(0);
  });
  it('each buyer has a readable rule: eager pays list, bargain meets halfway, browser only takes their offer', () => {
    const item = THRIFT_ITEMS[0];
    expect(bestSale(item, 'eager')).toBe(marketPrices(item, 'eager').hold);
    expect(bestSale(item, 'bargain')).toBe(marketPrices(item, 'bargain').half);
    expect(bestSale(item, 'browser')).toBe(marketPrices(item, 'browser').take);
    for (const k of Object.keys(BUYERS)) expect(BUYERS[k].cue.length).toBeLessThanOrEqual(48);
  });
  it('good stock and a perfect read wins; holding firm with everyone loses sales', () => {
    const best = market('perfect', [0, 1, 2, 3]);          // 29 dollars of good-margin stock
    expect(best.result.success).toBe(true);
    expect(best.result.profit).toBeGreaterThan(0);
    const stubborn = market('hold', [0, 1, 2, 3]);
    expect(stubborn.result.score).toBeLessThan(best.result.score);
  });
  it('buying low-margin stock costs score even with a perfect read', () => {
    expect(market('perfect', [5, 3]).result.score).toBeLessThan(market('perfect', [0, 1, 2, 3]).result.score);
    expect(bestBuyMargin()).toBeGreaterThan(0);
  });
  it('buying nothing, or doing nothing, ends the day without crashing', () => {
    const none = new MarketDay(CALM); none.openStall();
    expect(none.done).toBe(true); expect(none.result.success).toBe(false);
    const idle = new MarketDay(CALM);
    for (let t = 0; t < 200 && !idle.done; t += DT) idle.update(DT);
    expect(idle.done).toBe(true);
  });
});

describe('the receipt uses the shift itself', () => {
  it('RUSH! lines replace the bonus or pay cut, and the ledger still balances', () => {
    const { game, state } = makeGame();
    const gig = { title: 'Delivery Driver — Rush Shift', type: 'service', payout: 25, hours: 3, risk: 0, location: 'safe', hasQTE: true, choiceTree: 'rushShift', client: 'Dev', clientReliability: 5, isRepeat: false, remote: true };
    state.todayGigs = [gig];
    game.acceptGig(gig);
    game.choose(game.node.choices[1]); game.continueOutcome();
    expect(game.qte.name).toBe('RUSH!');
    const before = state.cash;
    game.finishGig({ success: true, score: 70, items: [{ label: 'Order pay (5 orders)', amount: 48 }, { label: 'Gas and wear (30 mi)', amount: -11 }] });
    const r = game.results;
    expect(r.items.map((i) => i.label)).toEqual(['Delivery Driver — Rush Shift', 'Order pay (5 orders)', 'Gas and wear (30 mi)']);
    expect(r.total).toBe(r.items.reduce((a, i) => a + i.amount, 0));
    expect(state.cash - before).toBe(r.total);
  });
});

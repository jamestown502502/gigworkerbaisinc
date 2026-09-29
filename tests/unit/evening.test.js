import { describe, it, expect } from 'vitest';
import { makeGame, withRandom } from './helpers.js';
import { Breathe, BREATH_PATTERNS, BREATH_CHOOSE_SECS, ReadClient, ThreadGame, READ_CLIENT_SCENARIOS, TEXT_BACK_THREADS, CHECK_IN_THREADS, difficultyFactor } from '../../src/game/qte.js';
import { sleepRecovery, applyHealthDecay } from '../../src/game/loop.js';

describe('evening loop', () => {
  it('wind down lowers stress, sets calm for tomorrow, and calm eases QTE difficulty', () => {
    const { game, state } = makeGame({ stress: 60, day: 5 });
    game.phase = 'EVENING';
    game.eveningChoice('winddown');
    expect(game.phase).toBe('EVENING_GAME');
    expect(game.qte).toBeInstanceOf(Breathe);
    game.finishEveningGame({ success: true, score: 100 });
    expect(state.stress).toBe(40);
    expect(state.calmTonight).toBe(true);
    expect(state.eveningDoneDay).toBe(5);
    const hard = difficultyFactor({ stress: 90, energy: 20, health: 100, calm: false, settings: {} });
    const eased = difficultyFactor({ stress: 90, energy: 20, health: 100, calm: true, settings: {} });
    expect(eased).toBeLessThan(hard);
    game.sleep();
    expect(state.calm).toBe(true);
    expect(state.calmTonight).toBe(false);
  });
  it('one evening choice per evening', () => {
    const { game, state } = makeGame({ day: 4, cash: 100 });
    game.phase = 'EVENING';
    game.eveningChoice('hustle');
    const cash = state.cash;
    expect(cash).toBeGreaterThanOrEqual(120);
    expect(state.tiredTomorrow).toBe(true);
    game.eveningChoice('hustle');
    expect(state.cash).toBe(cash);
    game.eveningChoice('winddown');
    expect(game.phase).toBe('EVENING');
  });
  it('a late hustle costs 15 energy at wake; declining a ping refunds a little', () => {
    const { game, state } = makeGame({ day: 4, energy: 40, health: 100 });
    game.phase = 'EVENING';
    state.tiredTomorrow = true;
    game.sleep();
    expect(state.energy).toBe(Math.min(100, 40 + sleepRecovery({ hungry: false, health: 100 })) - 15);
    game.ping = { gig: { payout: 100, title: 'x' }, resolved: false, text: '' };
    const e = state.energy;
    game.resolvePing('decline');
    expect(state.energy).toBe(Math.min(100, e + 5));
    expect(game.ping.resolved).toBe(true);
  });
  it('accepting a ping puts the gig on tomorrow\'s board', () => {
    const { game, state } = makeGame({ day: 4 });
    game.phase = 'EVENING';
    game.ping = { gig: { payout: 100, title: 'Early call: Test', hours: 2 }, resolved: false, text: '' };
    game.resolvePing('accept');
    game.sleep();
    expect(state.todayGigs[0].title).toBe('Early call: Test');
  });
  it('support softens the stress→balance slope; balance bands scale recovery', () => {
    const a = { ateYesterday: true, stress: 80, coldDays: 0, energy: 50, health: 60, support: 10 };
    const b = { ...a, support: 60 };
    applyHealthDecay(a); applyHealthDecay(b);
    expect(a.health).toBe(57);
    expect(b.health).toBe(59);
    expect(sleepRecovery({ hungry: false, health: 90 })).toBe(54);
    expect(sleepRecovery({ hungry: false, health: 50 })).toBe(45);
    expect(sleepRecovery({ hungry: false, health: 20 })).toBe(32);
    expect(sleepRecovery({ hungry: true, health: 50 })).toBe(25);
  });
});

describe('minigames', () => {
  // Breathing: hold through the in-breath (and a hold), let go through the out-breath (and a rest).
  const runBreathe = (key, pressFor) => {
    const b = new Breathe();
    b.start(key);
    while (!b.done) b.update(1 / 60, pressFor(b.side()));
    return b;
  };
  for (const key of ['calm', 'focus']) {
    it(`Breathe (${key}): matching the breath scores 100, the reverse scores 0`, () => {
      expect(runBreathe(key, (side) => side.press).result.score).toBe(100);
      expect(runBreathe(key, (side) => !side.press).result.score).toBe(0);
    });
    it(`Breathe (${key}) never fails: never touching it succeeds, matching the let-go half`, () => {
      const b = runBreathe(key, () => false);
      expect(b.result.success).toBe(true);
      expect(b.result.score).toBe(50);
    });
  }
  it('Calm is resonance breathing: 5 in, 5 out, six breaths a minute; Focus is a 4-count box', () => {
    const cycle = BREATH_PATTERNS.calm.sides.reduce((a, x) => a + x.secs, 0);
    expect(cycle).toBe(10);
    expect(60 / cycle).toBe(6);
    expect(BREATH_PATTERNS.focus.sides.map((x) => x.secs)).toEqual([4, 4, 4, 4]);
  });
  it('Breathe waits for a choice, then starts Calm on its own', () => {
    const b = new Breathe();
    expect(b.stage).toBe('choose');
    for (let t = 0; t < BREATH_CHOOSE_SECS + 0.1; t += 1 / 60) b.update(1 / 60, false);
    expect(b.stage).toBe('breathe');
    expect(b.patternKey).toBe('calm');
  });
  it('Breathe does not score reaction time at each turn', () => {
    const b = new Breathe();
    b.start('focus');
    let t = 0;
    while (!b.done) {
      const late = (Math.max(0, Math.min(t, b.exercise - 1e-6) - 0.4)) % b.cycleLen;
      b.update(1 / 60, t >= 0.4 && late < 8);   // in-breath and hold, pressed 0.4 s late each time
      t += 1 / 60;
    }
    expect(b.result.score).toBeGreaterThanOrEqual(98);
  });
  it('the lungs fill on the in-breath, stay full on hold, empty on the out-breath', () => {
    const b = new Breathe();
    b.start('focus');
    b.update(2, true); expect(b.sideIndex()).toBe(0); expect(b.lungs()).toBeCloseTo(0.5, 1);
    b.update(4, true); expect(b.sideIndex()).toBe(1); expect(b.lungs()).toBe(1);
    b.update(4, false); expect(b.sideIndex()).toBe(2); expect(b.lungs()).toBeCloseTo(0.5, 1);
    b.update(4, false); expect(b.sideIndex()).toBe(3); expect(b.lungs()).toBe(0);
  });
  it('Read the Client: right feeling + good response = 100, wrong feeling costs reputation', () => {
    for (const sc of READ_CLIENT_SCENARIOS) {
      expect(sc.options).toContain(sc.feeling);
      expect(sc.responses.filter((r) => r.good).length).toBe(1);
      const g = new ReadClient({}, sc);
      g.picked = sc.feeling; g.response = sc.responses.find((r) => r.good); g.step = 2;
      g.update(2);
      expect(g.result.score).toBe(100);
      const g2 = new ReadClient({}, sc);
      g2.picked = sc.options.find((o) => o !== sc.feeling); g2.response = sc.responses.find((r) => !r.good); g2.step = 2;
      g2.update(2);
      expect(g2.result.score).toBe(0);
      expect(g2.result.effects.rep).toBeLessThan(0);
    }
  });
  // Let a thread play out in real time (messages now arrive after a "typing..." beat).
  const settle = (g) => { for (let i = 0; i < 60 * 60 && !g.done; i++) g.update(1 / 60); return g; };
  it('Text Back: acknowledging replies cool the client; silence counts against you', () => {
    for (const th of TEXT_BACK_THREADS) {
      const g = new ThreadGame('client', th);
      for (const m of th.msgs) g.reply(m.replies.find((r) => r.tag === 'ack'));
      settle(g);
      expect(g.result.success).toBe(true);
      const g2 = new ThreadGame('client', th);
      settle(g2); // never replies: each message waits out its timer after it lands
      expect(g2.tags).toEqual(['dis', 'dis', 'dis']);
      expect(g2.result.success).toBe(false);
    }
  });
  it('Check In: empathetic replies build support, and it cannot be failed', () => {
    for (const th of CHECK_IN_THREADS) {
      const g = new ThreadGame('friend', th);
      for (const m of th.msgs) g.reply(m.replies.find((r) => r.tag === 'emp'));
      settle(g);
      expect(g.result.success).toBe(true);
      expect(g.result.effects.support).toBe(16);
      const g2 = new ThreadGame('friend', th);
      for (const m of th.msgs) g2.reply(m.replies.find((r) => r.tag === 'self'));
      settle(g2);
      expect(g2.result.success).toBe(true);
      expect(g2.result.effects.support).toBe(4);
    }
  });
  it('in-gig EI success makes a regular half the time and continues the tree', () => {
    const { game, state } = makeGame({ energy: 100, cash: 100 });
    const gig = { title: 'Tutoring — High School Math', type: 'service', payout: 50, hours: 1, risk: 0, location: 'safe', hasQTE: false, choiceTree: 'tutoring', client: 'Priya', clientReliability: 5, isRepeat: false, remote: true };
    state.todayGigs = [gig];
    game.acceptGig(gig);
    expect(game.qteKind).toBe('ei');
    withRandom([0.1], () => game.finishEIGame({ success: true, score: 100, effects: { rep: 0.3 }, summary: 'ok' }));
    expect(state.repeatClients).toContain('Priya');
    expect(game.node).toBeTruthy();
    expect(game.node.id).toBe('work');
  });
});

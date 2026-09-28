// Depth of the emotional-intelligence games: enough scenarios, no repeats until the pool is used
// up, and no fixed position for the best answer.
import { describe, expect, it } from 'vitest';
import { CHECK_IN_THREADS, READ_CLIENT_SCENARIOS, ReadClient, TEXT_BACK_THREADS, ThreadGame, drawFromDeck } from '../../src/game/qte.js';
import { withRandom, seededRandom } from './helpers.js';

describe('scenario pools', () => {
  it('twelve client reads, five client texts, five check-in calls', () => {
    expect(READ_CLIENT_SCENARIOS).toHaveLength(12);
    expect(TEXT_BACK_THREADS).toHaveLength(5);
    expect(CHECK_IN_THREADS).toHaveLength(5);
  });

  it('every feeling is the answer at least twice, so no feeling is a giveaway', () => {
    const counts = {};
    for (const s of READ_CLIENT_SCENARIOS) counts[s.feeling] = (counts[s.feeling] ?? 0) + 1;
    for (const n of Object.values(counts)) expect(n).toBeGreaterThanOrEqual(2);
  });

  it('every message offers exactly one best reply', () => {
    for (const t of TEXT_BACK_THREADS) for (const m of t.msgs) expect(m.replies.filter((r) => r.tag === 'ack')).toHaveLength(1);
    for (const t of CHECK_IN_THREADS) for (const m of t.msgs) expect(m.replies.filter((r) => r.tag === 'emp')).toHaveLength(1);
  });

  it('check-in friends have distinct names', () => {
    const names = CHECK_IN_THREADS.map((t) => t.title);
    expect(new Set(names).size).toBe(names.length);
  });

  // Limits = the longest strings that shipped and passed the on-screen text-overlap sweep.
  it('no line is longer than the longest one proven to fit its box', () => {
    for (const s of READ_CLIENT_SCENARIOS) {
      expect(s.line.length, s.line).toBeLessThanOrEqual(113);
      for (const r of s.responses) expect(r.text.length, r.text).toBeLessThanOrEqual(85);
    }
    for (const t of [...TEXT_BACK_THREADS, ...CHECK_IN_THREADS]) {
      for (const m of t.msgs) {
        expect(m.text.length, m.text).toBeLessThanOrEqual(90);
        for (const r of m.replies) expect(r.text.length, r.text).toBeLessThanOrEqual(94);
      }
    }
  });
});

describe('no-repeat decks', () => {
  it('every scenario plays once before any repeats', () => {
    const state = {};
    withRandom([0.1, 0.7, 0.3, 0.9, 0.5], () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        const seen = new Set();
        for (let i = 0; i < 12; i++) seen.add(drawFromDeck(state, 'readClient', 12));
        expect(seen.size).toBe(12);
      }
    });
  });

  it('never plays the same scenario twice in a row, even across a reshuffle', () => {
    const rand = seededRandom(11);
    const orig = Math.random; Math.random = rand;
    try {
      const state = {};
      let prev = -1;
      for (let i = 0; i < 500; i++) {
        const pick = drawFromDeck(state, 'textBack', 5);
        expect(pick).not.toBe(prev);
        prev = pick;
      }
    } finally { Math.random = orig; }
  });

  it('the deck lives on the save, so a reload continues it', () => {
    const state = {};
    drawFromDeck(state, 'checkIn', 5);
    const copy = JSON.parse(JSON.stringify(state));
    expect(copy.eiDecks.checkIn).toHaveLength(4);
  });
});

describe('answer order', () => {
  it('the best Read the Client response is not always in the same position', () => {
    const rand = seededRandom(3);
    const orig = Math.random; Math.random = rand;
    try {
      const positions = new Set();
      for (let i = 0; i < 60; i++) positions.add(new ReadClient({}, READ_CLIENT_SCENARIOS[0]).s.responses.findIndex((r) => r.good));
      expect(positions.size).toBe(3);
    } finally { Math.random = orig; }
  });

  it('the best reply in a thread is not always the top button', () => {
    const rand = seededRandom(5);
    const orig = Math.random; Math.random = rand;
    try {
      const positions = new Set();
      for (let i = 0; i < 60; i++) positions.add(new ThreadGame('friend', CHECK_IN_THREADS[0]).thread.msgs[0].replies.findIndex((r) => r.tag === 'emp'));
      expect(positions.size).toBe(3);
    } finally { Math.random = orig; }
  });

  it('shuffling never mutates the shared content', () => {
    const before = JSON.stringify(TEXT_BACK_THREADS);
    for (let i = 0; i < 20; i++) new ThreadGame('client', TEXT_BACK_THREADS[1]);
    expect(JSON.stringify(TEXT_BACK_THREADS)).toBe(before);
  });
});

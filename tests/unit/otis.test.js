// game/otis.js (publisher polish 2026-10-12): Otis's three beats, each branch, once each.
import { describe, it, expect } from 'vitest';
import { GameState } from '../../src/engine/state.js';
import { ensureOtisListing, noteOtisGig, otisStudioGig, noteOtisChoice, otisMorningCard, OTIS_CHOICE, OTIS } from '../../src/game/otis.js';
import { CHOICE_TREES } from '../../src/game/choices.js';
import { GIG_TEMPLATES } from '../../src/game/gigs.js';

const fresh = (day = 2) => { const s = new GameState(); s.day = day; s.contracts = []; s.todayGigs = []; return s; };
const gig = (over = {}) => ({ title: 'Clean Out Garage', type: 'physical', client: 'Marge', payout: 70, hours: 3, ...over });

function toBeat3(choice) {
  const s = fresh(3);
  noteOtisGig(s, gig({ client: OTIS }));
  s.day = 5;
  noteOtisChoice(s, OTIS_CHOICE[choice]);
  s.day = 7;
  return { s, card: otisMorningCard(s) };
}

describe('Otis', () => {
  it('one listing becomes his from day 2 until the arc starts', () => {
    const s = fresh(1); const gigs = [gig(), gig({ type: 'service' })];
    ensureOtisListing(s, gigs); expect(gigs.some((g) => g.client === OTIS)).toBe(false);
    s.day = 2; ensureOtisListing(s, gigs); expect(gigs.filter((g) => g.client === OTIS)).toHaveLength(1);
    noteOtisGig(s, gigs.find((g) => g.client === OTIS));
    const later = [gig()]; ensureOtisListing(s, later); expect(later[0].client).toBe('Marge');
  });
  it('beat 1 only from a job for Otis, once', () => {
    const s = fresh(4);
    expect(noteOtisGig(s, gig())).toBeNull();
    expect(noteOtisGig(s, gig({ client: OTIS }))).toMatch(/practice room/);
    expect(noteOtisGig(s, gig({ client: OTIS }))).toBeNull();
  });
  it('beat 2: his studio listing from two days later, priced inside the garage range', () => {
    const s = fresh(4); noteOtisGig(s, gig({ client: OTIS }));
    s.day = 5; expect(otisStudioGig(s)).toBeNull();
    s.day = 6; const g = otisStudioGig(s);
    expect(g).toMatchObject({ client: OTIS, otisStudio: true, choiceTree: 'otisStudio', risk: 0 });
    const [lo, hi] = GIG_TEMPLATES.find((t) => t.title === 'Clean Out Garage').payout;
    expect(g.payout).toBeGreaterThanOrEqual(lo); expect(g.payout).toBeLessThanOrEqual(hi);
  });
  it('the mid-job choice texts are exactly the ones the arc listens for', () => {
    const texts = CHOICE_TREES.otisStudio[0].choices.map((c) => c.text);
    expect(texts.sort()).toEqual(Object.values(OTIS_CHOICE).sort());
    for (const c of CHOICE_TREES.otisStudio[0].choices) expect(c.lesson.split(' ').length).toBeGreaterThanOrEqual(8);
  });
  it('quoted a price: a fair standing booking is offered', () => {
    const { s, card } = toBeat3('quote');
    expect(card.label).toBe('OTIS CALLS');
    card.choices[0].apply(s);
    expect(s.contracts).toHaveLength(1);
    expect(s.contracts[0]).toMatchObject({ client: OTIS, every: 5 });
  });
  it('did the favor: a referral arrives, and so does the expectation', () => {
    const { s, card } = toBeat3('favor');
    expect(card.effect(s)).toMatch(/referral/);
    expect(s.todayGigs[0].description).toMatch(/extras for free/);
  });
  it('kept to the agreement: a warm thank-you', () => {
    const { s, card } = toBeat3('agreed');
    const before = s.stress;
    card.effect(s);
    expect(s.stress).toBe(before - 3);
  });
  it('beat 3 comes once', () => {
    const { s } = toBeat3('agreed');
    expect(otisMorningCard(s)).toBeNull();
  });
});

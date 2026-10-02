// Character creator: identity options are independent, pronouns reach the game's text, and old
// saves are never interrupted by the new creator screen.
import { describe, expect, it } from 'vitest';
import { GameState, SAVE_VERSION } from '../../src/engine/state.js';
import { Game } from '../../src/game/loop.js';
import { generateMorningFlavor } from '../../src/game/events.js';
import { BUILDS, DEFAULT_CHARACTER, FACIAL_HAIR, HAIR_STYLES, PRONOUNS, SKIN_TONES, drawCharacter, randomLook, withPronouns } from '../../src/ui/character.js';
import { fakeCtx } from './setup.js';
import { makeGame, seededRandom } from './helpers.js';

describe('character options', () => {
  it('offers three builds, six hairstyles, four facial-hair options, three pronoun sets, ten skin tones', () => {
    expect(BUILDS).toHaveLength(3);
    expect(HAIR_STYLES).toHaveLength(6);
    expect(FACIAL_HAIR).toHaveLength(4);
    expect(Object.keys(PRONOUNS)).toEqual(['she', 'he', 'they']);
    expect(SKIN_TONES).toHaveLength(10);
  });

  it('builds are never labelled by gender', () => {
    for (const b of BUILDS) expect(b).not.toMatch(/male|female|man|woman|masc|fem|boy|girl/i);
  });

  it('every combination of build, hairstyle and facial hair renders without throwing', () => {
    const ctx = fakeCtx();
    for (let body = 0; body < BUILDS.length; body++)
      for (let hairStyle = 0; hairStyle < HAIR_STYLES.length; hairStyle++)
        for (let facialHair = 0; facialHair < FACIAL_HAIR.length; facialHair++)
          expect(() => drawCharacter(ctx, 0, 0, 100, 200, { ...DEFAULT_CHARACTER, body, hairStyle, facialHair })).not.toThrow();
  });

  it('an old three-colour character still renders (missing fields fall back to defaults)', () => {
    expect(() => drawCharacter(fakeCtx(), 0, 0, 40, 80, { skin: '#d4a574', hair: '#4a3728', shirt: '#3498db' })).not.toThrow();
  });

  it('randomize changes the look but never the pronouns', () => {
    const rand = seededRandom(7);
    for (const p of Object.keys(PRONOUNS)) {
      for (let i = 0; i < 20; i++) expect(randomLook({ ...DEFAULT_CHARACTER, pronouns: p }, rand).pronouns).toBe(p);
    }
  });

  it('randomize leans toward the chosen pronouns: she/her never rolls facial hair (QA round 2 #7)', () => {
    const rand = seededRandom(11);
    const she = Array.from({ length: 200 }, () => randomLook({ ...DEFAULT_CHARACTER, pronouns: 'she' }, rand));
    expect(she.every((c) => c.facialHair === 0)).toBe(true);
    expect(she.some((c) => c.hairStyle === 2 || c.hairStyle === 3)).toBe(true); // long / bun appear
    const he = Array.from({ length: 200 }, () => randomLook({ ...DEFAULT_CHARACTER, pronouns: 'he' }, rand));
    expect(he.some((c) => c.facialHair > 0)).toBe(true);
    const they = Array.from({ length: 400 }, () => randomLook({ ...DEFAULT_CHARACTER, pronouns: 'they' }, rand));
    expect(new Set(they.map((c) => c.hairStyle)).size).toBe(HAIR_STYLES.length); // fully open
  });
});

describe('pronouns reach the text', () => {
  it('fills every token with matching verb agreement', () => {
    const line = '{Subj} {was} here; I paid {obj}; {poss} bike; {subj} {is} back.';
    expect(withPronouns(line, { pronouns: 'she' })).toBe('She was here; I paid her; her bike; she is back.');
    expect(withPronouns(line, { pronouns: 'he' })).toBe('He was here; I paid him; his bike; he is back.');
    expect(withPronouns(line, { pronouns: 'they' })).toBe('They were here; I paid them; their bike; they are back.');
  });

  it('an unknown pronoun value falls back to they/them rather than printing a token', () => {
    expect(withPronouns('{Subj} {was}', { pronouns: 'xyz' })).toBe('They were');
  });

  it('the morning five-star review uses the chosen pronouns', () => {
    const state = new GameState();
    state.reputation = 4;
    state.character = { ...state.character, pronouns: 'he' };
    expect(generateMorningFlavor(state, null).join(' ')).toContain('Would hire him again');
  });
});

describe('creator flow', () => {
  it('a brand-new player starts on the creator, then Day 1', () => {
    localStorage.clear();
    const state = new GameState();
    state.tutorialSeen = true;
    const game = new Game(state);
    game.ctx = fakeCtx();
    expect(game.phase).toBe('CREATE');
    game.setPhase = function (next) { this.phase = next; };
    game.finishCreator();
    expect(game.phase).toBe('MORNING');
    expect(state.characterCreated).toBe(true);
  });

  it('a pre-creator save is NOT sent to the creator mid-run, and keeps its colours', () => {
    localStorage.clear();
    localStorage.setItem('gigWorkerState', JSON.stringify({ day: 9, cash: 310, tutorialSeen: true, character: { skin: '#8d5a3a', hair: '#1a1a1a', shirt: '#e74c3c' } }));
    const state = new GameState();
    const game = new Game(state);
    expect(game.phase).toBe('MORNING');
    expect(state.character.skin).toBe('#8d5a3a');
    expect(state.character.pronouns).toBe('they');
    expect(state.version).toBe(SAVE_VERSION);
  });

  it('a new run reopens the creator with the previous look already filled in', () => {
    const { game, state } = makeGame();
    state.character = { ...state.character, pronouns: 'she', hairStyle: 4, body: 2 };
    game.newGame();
    expect(game.phase).toBe('CREATE');
    expect(state.character.pronouns).toBe('she');
    expect(state.character.hairStyle).toBe(4);
    expect(state.characterCreated).toBe(false);
  });

  it('editing from the apartment returns to the apartment, not to Day 1', () => {
    const { game, state } = makeGame();
    const day = state.day;
    game.openCreator();
    expect(game.phase).toBe('CREATE');
    game.finishCreator();
    expect(game.phase).toBe('MORNING');
    expect(state.day).toBe(day);
  });

  it('tapping chips on the creator changes the character', () => {
    localStorage.clear();
    const state = new GameState();
    state.tutorialSeen = true;
    const game = new Game(state);
    game.ctx = fakeCtx();
    game.step(2 / 60);
    // Pronouns row: first chip at x 440..536, y 94..126; the second is "he/him" at 544..640.
    game.tap(590, 110);
    expect(state.character.pronouns).toBe('he');
    // Body row starts at y 132: third chip "Build 3" at x 648..744.
    game.tap(700, 148);
    expect(state.character.body).toBe(2);
  });

  it('results carry a client review in the chosen pronouns', () => {
    const { game, state } = makeGame({ cash: 500, energy: 100, hoursLeft: 12 });
    state.character = { ...state.character, pronouns: 'she' };
    const gig = state.todayGigs.find((g) => game.canAffordGig(g)) ?? state.todayGigs[0];
    expect(game.acceptGig(gig)).toBe(true);
    if (!gig.remote) game.startGig();
    let guard = 0;
    while (game.phase === 'GIG' && guard++ < 10) {
      if (game.qteKind === 'ei') { game.finishEIGame({ success: true, score: 100, effects: { rep: 0.3, stress: -3 }, summary: 'ok' }); continue; }
      if (game.qteKind === 'skill') { game.finishGig({ success: true, score: 80 }); break; }
      if (game.node) { game.choose(game.node.choices[0]); continue; }
      break;
    }
    expect(game.results?.review).toMatch(/\b(She|she|her)\b/);
    expect(game.results.review).not.toMatch(/\{\w+\}/);
  });
});

// Publisher polish (2026-10-12): every challenge meets the same three-part learning rubric.
//  1. a named real-world skill (skills.js SKILLS), said before it starts and on the result card;
//  2. a lesson that is a usable rule, not praise (LESSONS, LONGFORM_LESSONS, the EI lessons);
//  3. a transfer line: where that rule works off the job (skills.js TRANSFER).
import { describe, it, expect } from 'vitest';
import { SKILLS, TRANSFER, transferFor } from '../../src/game/skills.js';
import { LESSONS } from '../../src/game/microgames.js';
import { LONGFORM_LESSONS } from '../../src/game/longform.js';
import { BREATH_LESSON } from '../../src/game/qte.js';

const words = (s) => s.trim().split(/\s+/).length;
const PRAISE_ONLY = /^(great|nice|well done|good job|awesome|perfect|you did it)\b/i;

describe('learning rubric', () => {
  it('every named skill has a transfer line, and only those', () => {
    const skills = new Set([...Object.values(SKILLS), 'Listening to a friend']);
    expect(Object.keys(TRANSFER).sort()).toEqual([...skills].sort());
  });

  for (const [skill, line] of Object.entries(TRANSFER)) {
    it(`${skill}: transfer says where, then how`, () => {
      expect(line).toMatch(/^[^:]+: /);
      expect(words(line)).toBeGreaterThanOrEqual(10);
      expect(line.length).toBeLessThanOrEqual(110);   // two lines at most on the result card
    });
  }

  it('every lesson is a rule of at least eight words, not praise', () => {
    for (const l of [...Object.values(LESSONS), ...Object.values(LONGFORM_LESSONS), BREATH_LESSON]) {
      expect(words(l), l).toBeGreaterThanOrEqual(8);
      expect(l).not.toMatch(PRAISE_ONLY);
    }
  });

  it('a challenge resolves its transfer line by on-screen name', () => {
    expect(transferFor('PACK!')).toMatch(/^Packing a car/);
    expect(transferFor('CALL MOM')).toMatch(/^Any hard conversation/);
    expect(transferFor('NOT A GAME')).toBe('');
  });
});

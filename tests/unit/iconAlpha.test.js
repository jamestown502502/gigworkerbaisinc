// The HUD and shop icons shipped as RGB images with a gray checkerboard baked in where the
// transparency should have been (found 2026-11-10; visible on every screen). Icons drawn over
// the game must carry a real alpha channel.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ICONS = ['public/media/ui-icons.png', 'public/media/items.png'];

describe('icon sheets are transparent', () => {
  for (const path of ICONS) {
    it(`${path} is an RGBA PNG`, () => {
      const png = readFileSync(path);
      expect(png.toString('latin1', 12, 16)).toBe('IHDR');
      expect(png[25]).toBe(6);   // PNG color type 6 = truecolor with alpha
    });
  }
});

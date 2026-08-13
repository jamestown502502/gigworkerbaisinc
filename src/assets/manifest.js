// === ASSET MANIFEST — Gig Worker Simulator ===
// Tier: intermediate (FLUX-generated sprites)
// Toggle to 'basic' to use procedural fallbacks

import { drawCharacter } from '../ui/character.js';

const ASSET_MANIFEST = {
  tier: 'intermediate',

  // === BACKGROUNDS ===
  // Paths are relative to Vite's publicDir (public/), not the src/assets/ folder — files in
  // publicDir are copied verbatim into dist/ on build and served at the same root-relative
  // path in both dev and prod. A src/-relative string path (the old value here) only ever
  // resolved in `npm run dev`, where Vite happens to serve the whole project root; `vite build`
  // never bundled it, so every one of these 404'd in production. See git history / HANDOFF.md.
  apartment: {
    file: 'media/apartment.png',
    procedural: null,
    size: { w: 800, h: 600 }
  },
  listingsBoard: {
    file: 'media/listings-board.png',
    procedural: null,
    size: { w: 800, h: 600 }
  },
  workLocation: {
    file: 'media/work-location.png',
    procedural: null,
    size: { w: 800, h: 600 }
  },

  // === CHARACTER ===
  character: {
    file: 'media/character.png',
    procedural: drawCharacter,
    size: { w: 32, h: 64 }
  },

  // === UI ICONS ===
  uiIcons: {
    file: 'media/ui-icons.png',
    procedural: null,
    size: { w: 128, h: 32 },  // 4 icons × 32px
    frames: 4,
    frameWidth: 32
  },
  items: {
    file: 'media/items.png',
    procedural: null,
    size: { w: 128, h: 32 },  // 4 icons × 32px
    frames: 4,
    frameWidth: 32
  },

  // === AUDIO (procedural) ===
  audio: {
    bgm:      { type: 'procedural', func: 'playLofiBGM' },
    click:    { type: 'procedural', func: 'playClick' },
    cashIn:   { type: 'procedural', func: 'playCashIn' },
    cashOut:  { type: 'procedural', func: 'playCashOut' },
    stressUp: { type: 'procedural', func: 'playStress' },
    success:  { type: 'procedural', func: 'playSuccess' },
    fail:     { type: 'procedural', func: 'playFail' }
  },

  // === FILE REFERENCES ===
  files: {
    apartment: 'media/apartment.png',
    listingsBoard: 'media/listings-board.png',
    workLocation: 'media/work-location.png',
    character: 'media/character.png',
    uiIcons: 'media/ui-icons.png',
    items: 'media/items.png'
  }
};

export { ASSET_MANIFEST };
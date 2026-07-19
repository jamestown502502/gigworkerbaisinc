// === ASSET MANIFEST — Gig Worker Simulator ===
// Tier: intermediate (FLUX-generated sprites)
// Toggle to 'basic' to use procedural fallbacks

import { drawCharacter } from '../ui/character.js';

const ASSET_MANIFEST = {
  tier: 'intermediate',

  // === BACKGROUNDS ===
  apartment: {
    file: 'src/assets/media/apartment.png',
    procedural: null,
    size: { w: 800, h: 600 }
  },
  listingsBoard: {
    file: 'src/assets/media/listings-board.png',
    procedural: null,
    size: { w: 800, h: 600 }
  },
  workLocation: {
    file: 'src/assets/media/work-location.png',
    procedural: null,
    size: { w: 800, h: 600 }
  },

  // === CHARACTER ===
  character: {
    file: 'src/assets/media/character.png',
    procedural: drawCharacter,
    size: { w: 32, h: 64 }
  },

  // === UI ICONS ===
  uiIcons: {
    file: 'src/assets/media/ui-icons.png',
    procedural: null,
    size: { w: 128, h: 32 },  // 4 icons × 32px
    frames: 4,
    frameWidth: 32
  },
  items: {
    file: 'src/assets/media/items.png',
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
    apartment: 'src/assets/media/apartment.png',
    listingsBoard: 'src/assets/media/listings-board.png',
    workLocation: 'src/assets/media/work-location.png',
    character: 'src/assets/media/character.png',
    uiIcons: 'src/assets/media/ui-icons.png',
    items: 'src/assets/media/items.png'
  }
};

export { ASSET_MANIFEST };
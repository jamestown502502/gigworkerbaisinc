// Pixel character renderer with color customization.
import { drawText } from './text.js';

export const SKIN_TONES = ['#d4a574', '#f2d6bd', '#8d5a3a', '#c9b380'];   // tan, pale, dark, olive
export const HAIR_COLORS = ['#4a3728', '#d9b45b', '#1a1a1a', '#a83c28']; // brown, blonde, black, red
export const SHIRT_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#95a5a6'];

const DEFAULT_COLORS = { skin: '#d4a574', hair: '#4a3728', shirt: '#3498db' };

// Simple geometric pixel rep on an 8x16 unit grid scaled to w x h.
export function drawCharacter(ctx, x, y, w, h, colors = DEFAULT_COLORS) {
  const u = w / 8, v = h / 16;
  const px = (gx, gy, gw, gh, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + gx * u), Math.round(y + gy * v), Math.ceil(gw * u), Math.ceil(gh * v));
  };
  // hair
  px(1.5, 0, 5, 2, colors.hair);
  px(1, 1, 6, 1.5, colors.hair);
  // face
  px(2, 2, 4, 3, colors.skin);
  // eyes
  px(2.8, 3, 0.7, 0.7, '#1a1a1a');
  px(4.5, 3, 0.7, 0.7, '#1a1a1a');
  // neck
  px(3.5, 5, 1, 0.6, colors.skin);
  // shirt torso
  px(2, 5.6, 4, 4.4, colors.shirt);
  // arms (shirt sleeves + skin hands)
  px(1, 5.8, 1, 2.5, colors.shirt);
  px(6, 5.8, 1, 2.5, colors.shirt);
  px(1, 8.3, 1, 1.5, colors.skin);
  px(6, 8.3, 1, 1.5, colors.skin);
  // pants
  px(2, 10, 4, 1, '#34495e');
  px(2, 11, 1.6, 3.5, '#34495e');
  px(4.4, 11, 1.6, 3.5, '#34495e');
  // shoes
  px(1.8, 14.5, 2, 1.2, '#6b4226');
  px(4.2, 14.5, 2, 1.2, '#6b4226');
}

// Swatch rows for the apartment screen. registerHit(x,y,w,h,onClick) comes
// from the UI helper so this module stays render-only.
export function renderCustomizer(ctx, x, y, state, registerHit) {
  const rows = [
    { label: 'Skin', options: SKIN_TONES, key: 'skin' },
    { label: 'Hair', options: HAIR_COLORS, key: 'hair' },
    { label: 'Shirt', options: SHIRT_COLORS, key: 'shirt' },
  ];
  const size = 22, gap = 6;
  rows.forEach((row, ri) => {
    const ry = y + ri * (size + 12);
    drawText(ctx, row.label, x, ry + size - 6, { size: 13, color: '#f0f0f0', font: 'monospace' });
    row.options.forEach((color, ci) => {
      const sx = x + 48 + ci * (size + gap);
      ctx.fillStyle = color;
      ctx.fillRect(sx, ry, size, size);
      ctx.lineWidth = state.character[row.key] === color ? 3 : 1;
      ctx.strokeStyle = state.character[row.key] === color ? '#f1c40f' : '#1d150d';
      ctx.strokeRect(sx, ry, size, size);
      registerHit(sx - 2, ry - 2, size + 4, size + 4, () => {
        state.character[row.key] = color;
        state.save();
      });
    });
  });
}

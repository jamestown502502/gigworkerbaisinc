// Accessibility layer for the canvas (2026-10-07). The game draws everything on one <canvas>, which
// a screen reader sees as a single blank image and a keyboard cannot step through. Following the
// approach PixiJS uses for its own accessibility, every labelled hotspot the immediate-mode UI
// registers this frame is mirrored as a real, invisible <button> placed exactly over the drawn one:
//
//  - TalkBack / VoiceOver explore-by-touch lands on it and reads its label; a double-tap presses it.
//  - Tab / Shift+Tab move between buttons with a visible focus ring; Enter or Space presses.
//  - Switch Access scans them like any native button.
//
// The overlay never takes a finger or mouse press (pointer-events: none), so play is unchanged for
// everyone else. Challenge answer buttons (PERCENT!, READ THE CLIENT…) are mirrored too; timing and
// drag challenges stay canvas-only, softened by Reduce Timing Pressure.

let root = null;
let live = null;
const pool = new Map();   // key -> <button>
let lastSignature = '';
// The mirrored button that has focus, in logical units. The game draws its own ring there on the
// canvas (QA round 4 #14: TalkBack read the labels but showed no focus box): a screen reader's
// focus on a sized, positioned button also moves DOM focus in Chrome, and the canvas ring is
// visible whatever the browser draws for the outline.
let focused = null;
/** The focused mirrored button { x, y, w, h, label } in 800x600 units, or null. */
export function focusedTarget() { return focused; }

function ensureRoot() {
  if (root || typeof document === 'undefined') return root;
  root = document.createElement('div');
  root.id = 'a11y-layer';
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: '5', pointerEvents: 'none' });
  const style = document.createElement('style');
  style.textContent = `#a11y-layer button{position:fixed;margin:0;padding:0;border:0;background:transparent;color:transparent;font-size:1px;pointer-events:none;opacity:1;outline:none}
#a11y-layer button:focus,#a11y-layer button:focus-visible{outline:3px solid #f1c40f;outline-offset:2px;border-radius:8px}
#a11y-live{position:fixed;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}`;
  document.head.appendChild(style);
  live = document.createElement('div');
  live.id = 'a11y-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  document.body.appendChild(root);
  document.body.appendChild(live);
  return root;
}

/** Say something to a screen reader (a phase change, a message), without showing it. */
let lastSaid = '';
export function announce(text) {
  if (!text || text === lastSaid || !ensureRoot()) return;
  lastSaid = text;
  live.textContent = text;
}

/** Mirror this frame's labelled hotspots. `targets`: [{ key, label, x, y, w, h, press }] in the
 *  800x600 logical space. Cheap when nothing changed: only the signature is compared. */
export function syncA11y(canvas, targets) {
  if (!canvas || !ensureRoot()) return;
  const r = canvas.getBoundingClientRect();
  const sx = r.width / 800, sy = r.height / 600;
  const sig = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}|` + targets.map((t) => `${t.key}@${t.x},${t.y},${t.w},${t.h}`).join(';');
  // presses always call the CURRENT frame's handler, even when the layout is unchanged
  for (const t of targets) { const b = pool.get(t.key); if (b) b._press = t.press; }
  if (sig === lastSignature) return;
  lastSignature = sig;
  const keep = new Set();
  targets.forEach((t, i) => {
    keep.add(t.key);
    let b = pool.get(t.key);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', () => b._press?.());
      b.addEventListener('focus', () => { focused = b._rect; });
      b.addEventListener('blur', () => { if (focused === b._rect) focused = null; });
      pool.set(t.key, b);
    }
    b._press = t.press;
    const wasFocused = focused && focused === b._rect;
    b._rect = { x: t.x, y: t.y, w: t.w, h: t.h, label: t.label };
    if (wasFocused) focused = b._rect;
    b.setAttribute('aria-label', t.label);
    b.textContent = t.label;
    Object.assign(b.style, { left: `${r.left + t.x * sx}px`, top: `${r.top + t.y * sy}px`, width: `${Math.max(1, t.w * sx)}px`, height: `${Math.max(1, t.h * sy)}px` });
    // DOM order = focus order = draw order
    if (root.children[i] !== b) root.insertBefore(b, root.children[i] || null);
  });
  for (const [key, b] of pool) {
    if (keep.has(key)) continue;
    if (focused === b._rect) focused = null;
    b.remove(); pool.delete(key);
  }
}

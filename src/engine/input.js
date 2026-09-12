// Pointer input in 800x600 logical space. One code path for mouse and touch (Pointer Events),
// with a tap-vs-drag threshold so the listing board can scroll by finger and the volume bar can
// be dragged, while every existing button keeps working on a plain tap.
//
// Audio unlocking deliberately does NOT happen here on pointerdown/touchstart: `touchstart` is not
// a user-activation event, so an AudioContext.resume() or <audio>.play() called from it is
// blocked on Android Chrome. main.js listens for pointerup/touchend/keydown instead.
const DRAG_THRESHOLD = 8; // logical px before a press becomes a drag instead of a tap

export const InputManager = {
  isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent),
  clicks: [],          // { x, y, type: 'click'|'touch' }
  hover: null,         // { x, y } logical, desktop only
  pointer: { x: 0, y: 0, down: false, dragging: false },
  dragDelta: { x: 0, y: 0 },   // accumulated since last consumeDrag()
  wheelDelta: 0,               // accumulated since last consumeWheel()
  _press: null,
  onActivate: null,   // set by main.js: audio unlock on a real activation event (pointerup)

  init(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.isPrimary === false) return;
      const pt = this.toLogical(e.clientX, e.clientY);
      this._press = { x: pt.x, y: pt.y, type: e.pointerType === 'mouse' ? 'click' : 'touch' };
      this.pointer = { x: pt.x, y: pt.y, down: true, dragging: false };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.isPrimary === false) return;
      const pt = this.toLogical(e.clientX, e.clientY);
      if (!this.isMobile) this.hover = pt;
      if (this._press) {
        const dx = pt.x - this.pointer.x, dy = pt.y - this.pointer.y;
        const fromStart = Math.hypot(pt.x - this._press.x, pt.y - this._press.y);
        if (!this.pointer.dragging && fromStart > DRAG_THRESHOLD) this.pointer.dragging = true;
        if (this.pointer.dragging) { this.dragDelta.x += dx; this.dragDelta.y += dy; }
        this.pointer.x = pt.x; this.pointer.y = pt.y;
      }
    });
    const release = (e) => {
      if (e && e.isPrimary === false) return;
      if (e && e.type === 'pointerup' && this.onActivate) this.onActivate();
      if (this._press && !this.pointer.dragging) {
        this.clicks.push({ x: this._press.x, y: this._press.y, type: this._press.type });
      }
      this._press = null;
      this.pointer = { ...this.pointer, down: false, dragging: false };
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('mouseleave', () => { this.hover = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheelDelta += e.deltaY; }, { passive: false });
    // Belt-and-suspenders on top of touch-action:none — never let a drag scroll the page.
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  },

  // Map client coords to 800x600 logical space regardless of how the canvas is scaled on screen.
  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  },
  consumeClick() { return this.clicks.shift() || null; },
  clearClicks() { this.clicks = []; },
  /** Drag movement since the last call, in logical px. */
  consumeDrag() { const d = this.dragDelta; this.dragDelta = { x: 0, y: 0 }; return d; },
  consumeWheel() { const w = this.wheelDelta; this.wheelDelta = 0; return w; },
  /** True while the pointer is held inside the rect (tap or drag) — for sliders. */
  isPressedIn(x, y, w, h) {
    const p = this.pointer;
    return p.down && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  },
};

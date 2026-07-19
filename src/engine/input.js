export const InputManager = {
  isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent),
  clicks: [],  // { x, y, type: 'click'|'touch' }
  hover: null, // { x, y } in logical space, desktop only
  init(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('click', (e) => {
      const pt = this.toLogical(e.clientX, e.clientY);
      this.clicks.push({ ...pt, type: 'click' });
    });
    if (!this.isMobile) {
      canvas.addEventListener('mousemove', (e) => {
        this.hover = this.toLogical(e.clientX, e.clientY);
      });
      canvas.addEventListener('mouseleave', () => { this.hover = null; });
    }
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const pt = this.toLogical(touch.clientX, touch.clientY);
      this.clicks.push({ ...pt, type: 'touch' });
    }, { passive: false });
  },
  // Map client coords to 800x600 logical space even when CSS scales the canvas
  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  },
  consumeClick() { return this.clicks.shift() || null; },
  clearClicks() { this.clicks = []; }
};

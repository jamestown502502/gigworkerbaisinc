// Minimal browser surface so the game modules load under Node. No canvas library: the fake
// 2D context records nothing and the tests assert on state, not pixels.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' };
globalThis.window = globalThis.window || globalThis;
globalThis.Audio = class { constructor() { this.volume = 1; } play() { return Promise.resolve(); } pause() {} };
globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.document = globalThis.document || { hidden: false, addEventListener() {}, getElementById() { return null; } };
globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
globalThis.window.devicePixelRatio = 1;
globalThis.window.innerWidth = 800;
globalThis.window.innerHeight = 600;

export function fakeCtx() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return new Proxy({
    measureText: (t) => ({ width: String(t).length * 7 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
  }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
}

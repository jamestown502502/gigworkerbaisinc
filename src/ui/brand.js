// Brand colours, sampled from the Side Hustle City key art and wordmark (publisher polish
// 2026-10-12). Used as accents and edges; text on them must still pass the readability audit
// (tests/e2e/readability.spec.js), so gold is a fill behind dark text only and cyan an accent.
export const BRAND = {
  gold: '#FDB80B',
  cyan: '#0FD1F6',
  navy: '#0E3261',
  cream: '#FEEF95',
  ink: '#0b1530',
};

/** The tint the bands around the game take in each phase (index.html #ambient-tint). */
export const PHASE_MOOD = {
  CREATE: BRAND.navy,
  MORNING: BRAND.gold,
  BROWSE: BRAND.cyan,
  TRAVEL: BRAND.cyan,
  GIG: BRAND.gold,
  RESULTS: BRAND.gold,
  EVENING: BRAND.navy,
  EVENING_GAME: BRAND.navy,
  SUMMARY: BRAND.navy,
  GAMEOVER: BRAND.navy,
};

// The opening splash (index.html #splash): the key-art banner, painted before any script runs. It
// stays at least SPLASH_MIN_MS from page start so a warm-cache load does not flash it for a few
// frames (which reads as a glitch), then fades. It never takes input. Under automation
// (navigator.webdriver) it goes at once: the tests drive and measure the canvas from the start.
const SPLASH_MIN_MS = 1200;
export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  if (navigator.webdriver) { el.remove(); return; }
  setTimeout(() => {
    el.classList.add('gone');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => el.remove(), reduced ? 0 : 450);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}

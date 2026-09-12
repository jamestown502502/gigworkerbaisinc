// SFX are procedural Web Audio; BGM is a real generated track (see public/audio/).
let audioCtx = null;
let bgmAudio = null;
let unlocked = false;

// Set once from main.js on boot (initAudio(state.settings)) and again whenever Settings
// changes — a plain mutable reference, not a copy, so mutations to state.settings are seen
// immediately without every playX() call needing to pass settings through explicitly.
let settings = { masterVolume: 1, musicVolume: 0.35, sfxVolume: 1, muted: false };

export function initAudio(liveSettings) {
  settings = liveSettings;
}

function sfxVolume() {
  return settings.muted ? 0 : settings.masterVolume * settings.sfxVolume;
}

function musicVolume() {
  return settings.muted ? 0 : settings.masterVolume * settings.musicVolume;
}

function ac() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;                       // no Web Audio (old browser, test runner): silent
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Must be called from a real user-activation event (pointerup / touchend / keydown / click).
 *  Resumes the context and starts the BGM loop. Safe to call repeatedly. */
export function unlock() {
  try {
    const ctx = ac();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    startBGM();
    unlocked = (ctx && ctx.state === 'running') || unlocked;
  } catch { /* no Web Audio — the game is silent but playable */ }
  return unlocked;
}

export function isUnlocked() { return unlocked; }
export function contextState() { return audioCtx ? audioCtx.state : 'none'; }

function tone(freq, dur, { type = 'square', vol = 0.06, when = 0, slide = 0 } = {}) {
  const v = vol * sfxVolume();
  if (v <= 0) return;
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  gain.gain.setValueAtTime(v, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playClick()   { tone(660, 0.05, { type: 'square', vol: 0.04 }); }
export function playCashIn()  { tone(523, 0.09); tone(659, 0.09, { when: 0.09 }); tone(784, 0.14, { when: 0.18 }); }
export function playCashOut() { tone(392, 0.12); tone(311, 0.18, { when: 0.12 }); }
export function playStress()  { tone(180, 0.25, { type: 'sawtooth', vol: 0.05, slide: -60 }); }
export function playSuccess() { tone(523, 0.08); tone(659, 0.08, { when: 0.08 }); tone(784, 0.08, { when: 0.16 }); tone(1047, 0.2, { when: 0.24 }); }
export function playFail()    { tone(330, 0.15, { type: 'sawtooth', vol: 0.05 }); tone(233, 0.3, { type: 'sawtooth', vol: 0.05, when: 0.15 }); }
export function playTick()    { tone(880, 0.03, { type: 'sine', vol: 0.03 }); }
export function playError()   { tone(160, 0.09, { type: 'sawtooth', vol: 0.06 }); tone(120, 0.12, { type: 'sawtooth', vol: 0.05, when: 0.07 }); }
export function playAccept()  { tone(523, 0.07, { type: 'triangle', vol: 0.06 }); tone(659, 0.07, { type: 'triangle', vol: 0.06, when: 0.07 }); tone(784, 0.12, { type: 'triangle', vol: 0.06, when: 0.14 }); }
export function playGood()    { tone(784, 0.07, { type: 'sine', vol: 0.05 }); tone(1047, 0.16, { type: 'sine', vol: 0.05, when: 0.07 }); }
export function playSting()   { tone(140, 0.4, { type: 'sawtooth', vol: 0.05, slide: -30 }); tone(147, 0.4, { type: 'sawtooth', vol: 0.04 }); }
// Evening / wellbeing cues
export function playBreathIn()  { tone(330, 0.5, { type: 'sine', vol: 0.035, slide: 60 }); }
export function playBreathOut() { tone(392, 0.6, { type: 'sine', vol: 0.035, slide: -70 }); }
export function playBuzz()      { tone(120, 0.08, { type: 'square', vol: 0.04 }); tone(120, 0.08, { type: 'square', vol: 0.04, when: 0.12 }); }
export function playWarm()      { tone(392, 0.12, { type: 'triangle', vol: 0.05 }); tone(494, 0.12, { type: 'triangle', vol: 0.05, when: 0.1 }); tone(587, 0.25, { type: 'triangle', vol: 0.05, when: 0.2 }); }

export function startBGM() {
  if (bgmAudio) return;
  bgmAudio = new Audio('/audio/apartment-bgm.mp3');
  bgmAudio.loop = true;
  bgmAudio.volume = musicVolume();
  bgmAudio.play().catch(() => { bgmAudio = null; }); // retried on the next activation event
}

export function stopBGM() {
  bgmAudio?.pause();
  bgmAudio = null;
}

/** Re-applies current master/music/mute settings to whatever's already playing. Call after Settings changes. */
export function applyAudioSettings() {
  if (bgmAudio) bgmAudio.volume = musicVolume();
}

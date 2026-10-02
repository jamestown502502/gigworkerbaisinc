// SFX are procedural Web Audio; BGM is a real generated track (see public/audio/).
//
// Everything is routed through one Web Audio graph: SFX -> sfxGain -> master, and the BGM
// <audio> element -> MediaElementSource -> musicGain -> master. iOS Safari ignores
// HTMLMediaElement.volume (it is read-only there and always reads 1), so the old "set the
// element's volume to 0" mute did nothing on an iPhone: QA round 2 #2, music kept playing while
// muted. A GainNode IS honoured on iOS. Muting also pauses the element outright, and unmuting
// starts it again from whatever state it is in (QA round 2 #5: on Android a muted-then-unmuted
// track could stay silent because nothing ever restarted it).
let audioCtx = null;
let bgmAudio = null;
let bgmNode = null;
let master = null, sfxBus = null, musicBus = null;
let unlocked = false;
let backgrounded = false;

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
  if (!audioCtx) {
    audioCtx = new Ctor();
    master = audioCtx.createGain();
    master.connect(audioCtx.destination);
    sfxBus = audioCtx.createGain();
    sfxBus.connect(master);
    musicBus = audioCtx.createGain();
    musicBus.connect(master);
    applyGains();
  }
  if (audioCtx.state === 'suspended' && !backgrounded) audioCtx.resume();
  return audioCtx;
}

function applyGains() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.02);
  musicBus.gain.setTargetAtTime(settings.masterVolume * settings.musicVolume, t, 0.05);
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
  osc.connect(gain).connect(sfxBus || ctx.destination);
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
/** A soft tone that glides for the whole length of one breath: up on the inhale, down on the exhale.
 *  Sustained (not a blip), so the out-breath can be paced by ear with the eyes closed. */
export function playBreathGlide(rising, seconds) {
  const v = 0.03 * sfxVolume();
  if (v <= 0) return;
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rising ? 247 : 370, t0);
  osc.frequency.linearRampToValueAtTime(rising ? 370 : 247, t0 + seconds);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(v, t0 + Math.min(0.4, seconds / 3));
  gain.gain.setValueAtTime(v, t0 + Math.max(0.5, seconds - 0.5));
  gain.gain.linearRampToValueAtTime(0.0001, t0 + seconds);
  osc.connect(gain).connect(sfxBus || ctx.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.05);
}
/** True when sound effects will actually be heard (not muted, volume above zero). */
export function soundIsOn() { return sfxVolume() > 0; }
export function playBuzz()      { tone(120, 0.08, { type: 'square', vol: 0.04 }); tone(120, 0.08, { type: 'square', vol: 0.04, when: 0.12 }); }
export function playWarm()      { tone(392, 0.12, { type: 'triangle', vol: 0.05 }); tone(494, 0.12, { type: 'triangle', vol: 0.05, when: 0.1 }); tone(587, 0.25, { type: 'triangle', vol: 0.05, when: 0.2 }); }

export function startBGM() {
  if (settings.muted || musicVolume() <= 0 || backgrounded) return; // nothing to hear: don't spend battery on it
  if (!bgmAudio) {
    bgmAudio = new Audio('/audio/apartment-bgm.mp3');
    bgmAudio.loop = true;
    const ctx = ac();
    if (ctx && ctx.createMediaElementSource) {
      try { bgmNode = ctx.createMediaElementSource(bgmAudio); bgmNode.connect(musicBus); } catch { bgmNode = null; }
    }
    if (!bgmNode) bgmAudio.volume = musicVolume(); // no Web Audio: the element's own volume is all there is
  }
  if (bgmAudio.paused) bgmAudio.play().catch(() => { /* retried on the next activation event */ });
}

export function stopBGM() {
  bgmAudio?.pause();
}

/** Re-applies current master/music/mute settings to whatever's already playing. Call after Settings changes. */
export function applyAudioSettings() {
  applyGains();
  if (bgmAudio) {
    bgmAudio.muted = !!settings.muted;               // honoured on iOS, unlike .volume
    if (!bgmNode) bgmAudio.volume = musicVolume();
  }
  if (settings.muted || musicVolume() <= 0) stopBGM();
  else if (unlocked || bgmAudio) startBGM();
}

/** The app went to the background (or came back). Android and iOS both keep a web page's audio
 *  running behind other apps unless the page stops it; a game should fall silent the moment it
 *  is not on screen and pick up again when it is (Play's guidance for games, and what a native
 *  app does on onPause/onResume). */
export function setBackgrounded(hidden) {
  backgrounded = hidden;
  if (hidden) {
    bgmAudio?.pause();
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
  } else {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    if (bgmAudio && !settings.muted && musicVolume() > 0) bgmAudio.play().catch(() => {});
  }
}

/** Light haptic tick on button presses where the platform supports it (Android). */
export function haptic(ms = 8) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ }
}

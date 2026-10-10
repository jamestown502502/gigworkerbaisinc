// QA round 2 #2 (iPhone: muted game still plays music) and #5 (Android: unmute leaves it silent).
// iOS ignores HTMLMediaElement.volume, so mute must work through the Web Audio graph and by pausing
// the element; unmute must start the element again. Real output can't be heard under Node, so this
// checks the graph and the element with a stub AudioContext.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeParam { constructor(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeNode { connect(n) { return n; } }
class FakeGain extends FakeNode { constructor() { super(); this.gain = new FakeParam(1); } }
class FakeCtx {
  constructor() {
    this.state = FakeCtx.startState; this.currentTime = 0; this.sampleRate = 48000; this.destination = new FakeNode(); this.primed = 0;
    this.sessionAtCreate = globalThis.navigator?.audioSession?.type;
  }
  createGain() { return new FakeGain(); }
  createBuffer() { return {}; }
  createBufferSource() { const ctx = this; return Object.assign(new FakeNode(), { buffer: null, start() { ctx.primed++; } }); }
  createOscillator() { return Object.assign(new FakeNode(), { frequency: new FakeParam(0), start() {}, stop() {}, type: '' }); }
  createMediaElementSource(el) { this.source = el; (this.sources ||= []).push(el); return new FakeNode(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
class FakeAudio {
  constructor(src) { this.src = src; this.paused = true; this.volume = 1; this.muted = false; FakeAudio.last = this; FakeAudio.all.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(type, fn) { ((this.listeners ||= {})[type] ||= []).push(fn); }
}


/** The <audio> element for one track. Since QA round 4 #1 every player exists after the first tap,
 *  so the most recently created element is no longer the one playing. */
const track = (re) => FakeAudio.all.find((a) => re.test(a.src));
const morningEl = () => track(/apartment-bgm/);

let audio, settings, ctxs;
beforeEach(async () => {
  vi.resetModules();
  ctxs = [];
  FakeCtx.startState = 'running';
  FakeAudio.last = undefined;
  FakeAudio.all = [];
  globalThis.window.AudioContext = class extends FakeCtx { constructor() { super(); ctxs.push(this); } };
  globalThis.Audio = FakeAudio;
  audio = await import('../../src/engine/audio.js');
  settings = { masterVolume: 1, musicVolume: 0.35, sfxVolume: 1, muted: false };
  audio.initAudio(settings);
});

describe('mute that works on iPhone and Android', () => {
  it('music runs through the Web Audio graph, not the element volume iOS ignores', () => {
    audio.unlock();
    expect(ctxs[0].sources).toContain(morningEl());
    expect(morningEl().paused).toBe(false);
  });

  it('mute pauses the music and mutes the element; unmute starts it again', () => {
    audio.unlock();
    const el = morningEl();
    settings.muted = true; audio.applyAudioSettings();
    expect(el.paused).toBe(true);
    expect(el.muted).toBe(true);
    settings.muted = false; audio.applyAudioSettings();
    expect(el.paused).toBe(false);
    expect(el.muted).toBe(false);
  });

  it('a game muted before the first tap starts its music on unmute', () => {
    settings.muted = true;
    audio.unlock();
    expect(FakeAudio.last).toBeUndefined();
    settings.muted = false; audio.applyAudioSettings();
    expect(morningEl().paused).toBe(false);
  });

  it('going to the background silences everything; coming back restores it', () => {
    audio.unlock();
    const el = morningEl();
    audio.setBackgrounded(true);
    expect(el.paused).toBe(true);
    expect(ctxs[0].state).toBe('suspended');
    audio.setBackgrounded(false);
    expect(el.paused).toBe(false);
    expect(ctxs[0].state).toBe('running');
  });

  it('coming back to a muted game stays silent', () => {
    audio.unlock();
    settings.muted = true; audio.applyAudioSettings();
    audio.setBackgrounded(true);
    audio.setBackgrounded(false);
    expect(morningEl().paused).toBe(true);
  });
});

describe('QA round 3 #7: sound comes back after the app was backgrounded', () => {
  it('an iOS "interrupted" context is resumed on return, and the next tap restarts the music', () => {
    audio.unlock();
    const el = morningEl();
    audio.setBackgrounded(true);
    ctxs[0].state = 'interrupted';   // what Safari reports after a call or app switch
    el.play = () => Promise.reject(new Error('NotAllowedError')); // no gesture: the browser refuses
    audio.setBackgrounded(false);
    expect(ctxs[0].state).toBe('running');
    el.play = FakeAudio.prototype.play;
    audio.unlock();                  // the next tap
    expect(el.paused).toBe(false);
  });
});

describe('music states (2026-10-07)', () => {
  it('a new part of the day starts its own track and fades the old one out', () => {
    vi.useFakeTimers();
    try {
      audio.unlock();
      const morning = morningEl();
      expect(morning.paused).toBe(false);
      audio.setMusicState('evening');
      const evening = track(/evening-bgm/);
      expect(evening.src).toMatch(/evening-bgm/);
      expect(evening.paused).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(morning.paused).toBe(true);
      expect(audio.currentMusicState()).toBe('evening');
      const made = FakeAudio.all.length;
      audio.setMusicState('evening');            // no-op
      expect(FakeAudio.all.length).toBe(made);
      expect(evening.paused).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('muted: the state changes but nothing plays; unmuting plays the new state', () => {
    audio.unlock();
    settings.muted = true; audio.applyAudioSettings();
    audio.setMusicState('summary');
    settings.muted = false; audio.applyAudioSettings();
    expect(track(/summary-bgm/).paused).toBe(false);
    expect(morningEl().paused).toBe(true);
  });
});

// iPhone audio (2026-10-08), the same defect Tour Life had. Two WebKit rules no Chromium test sees:
//   1. iOS gives web audio an 'ambient' session, which the Ring/Silent switch mutes outright, unless
//      the page asks for 'playback' before it makes its AudioContext.
//   2. A context made or resumed outside a touchend/click/keydown stays silent; inside one, WebKit
//      opens the output once a source starts, so unlock() also starts a one-sample silent buffer.
describe('iPhone audio (2026-10-08)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks iOS for a 'playback' session before the context exists, so the Silent switch does not mute the game", () => {
    vi.stubGlobal('navigator', { audioSession: { type: 'auto' } });
    audio.unlock();
    expect(ctxs[0].sessionAtCreate).toBe('playback');
  });

  it('still unlocks where there is no audioSession API (Android Chrome, desktop)', () => {
    vi.stubGlobal('navigator', {});
    expect(() => audio.unlock()).not.toThrow();
    expect(ctxs).toHaveLength(1);
  });

  it('the first tap resumes the context and starts a silent buffer inside the gesture', () => {
    FakeCtx.startState = 'suspended';
    audio.unlock();
    expect(ctxs[0].state).toBe('running');
    expect(ctxs[0].primed).toBe(1);
  });

  it('a context a sound made outside a gesture is resumed and primed by the next tap', () => {
    FakeCtx.startState = 'suspended';
    const resume = FakeCtx.prototype.resume;
    FakeCtx.prototype.resume = () => Promise.reject(new Error('NotAllowedError'));   // outside a gesture: refused
    audio.playClick();               // the game loop plays a sound before any tap
    FakeCtx.prototype.resume = resume;
    expect(ctxs[0].state).toBe('suspended');
    expect(ctxs[0].primed).toBe(0);
    audio.unlock();                  // the touchend that follows
    expect(ctxs[0].state).toBe('running');
    expect(ctxs[0].primed).toBe(1);
    expect(ctxs).toHaveLength(1);
  });

  it('primes once for a new context, not on every tap once it is running', () => {
    audio.unlock();
    audio.unlock();
    audio.unlock();
    expect(ctxs[0].primed).toBe(1);
  });
});

// QA round 4 #1 (Android: no music during gigs) and #7 (sounds while the page is not in front).
describe('QA round 4: every track playable, nothing queued while away', () => {
  it('the first tap primes every music track inside the gesture, then pauses the ones not playing', async () => {
    audio.unlock();
    expect(FakeAudio.all.map((a) => a.src.split('/').pop()).sort()).toEqual(['apartment-bgm.mp3', 'evening-bgm.mp3', 'summary-bgm.mp3', 'work-bgm.mp3']);
    expect(track(/work-bgm/).paused).toBe(true);        // primed and paused at once: nothing loads
    expect(track(/work-bgm/).preload).toBe('none');
    expect(morningEl().paused).toBe(false);
  });
  it('a muted game primes nothing', () => {
    settings.muted = true;
    audio.unlock();
    expect(FakeAudio.all.length).toBe(0);
  });
  it('the watchdog restarts music that should be playing but stopped', async () => {
    audio.unlock();
    await Promise.resolve(); await Promise.resolve();
    morningEl().paused = true;              // a refused play() or a stalled stream
    audio.ensureMusic();
    expect(morningEl().paused).toBe(false);
  });
  it('the watchdog leaves a backgrounded or muted game alone', async () => {
    audio.unlock();
    audio.setBackgrounded(true);
    audio.ensureMusic();
    expect(morningEl().paused).toBe(true);
    audio.setBackgrounded(false);
    settings.muted = true; audio.applyAudioSettings();
    audio.ensureMusic();
    expect(morningEl().paused).toBe(true);
  });
  it('no sound effect is scheduled while backgrounded (they would all burst out on return)', () => {
    audio.unlock();
    let made = 0;
    const orig = ctxs[0].createOscillator.bind(ctxs[0]);
    ctxs[0].createOscillator = () => { made++; return orig(); };
    audio.setBackgrounded(true);
    audio.playClick(); audio.playSuccess(); audio.playTick();
    expect(made).toBe(0);
    audio.setBackgrounded(false);
    audio.playClick();
    expect(made).toBe(1);
  });
  it('a track that fails to load is built again the next time it is wanted', () => {
    audio.unlock();
    const first = morningEl();
    const handlers = first.listeners?.error || [];
    for (const h of handlers) h();
    audio.setMusicState('work'); audio.setMusicState('morning');
    expect(FakeAudio.all.filter((a) => /apartment-bgm/.test(a.src)).length).toBe(handlers.length ? 2 : 1);
  });
});

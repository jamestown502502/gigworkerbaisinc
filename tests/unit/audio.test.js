// QA round 2 #2 (iPhone: muted game still plays music) and #5 (Android: unmute leaves it silent).
// iOS ignores HTMLMediaElement.volume, so mute must work through the Web Audio graph and by pausing
// the element; unmute must start the element again. Real output can't be heard under Node, so this
// checks the graph and the element with a stub AudioContext.
import { describe, it, expect, beforeEach, vi } from 'vitest';

class FakeParam { constructor(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeNode { connect(n) { return n; } }
class FakeGain extends FakeNode { constructor() { super(); this.gain = new FakeParam(1); } }
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = new FakeNode(); }
  createGain() { return new FakeGain(); }
  createOscillator() { return Object.assign(new FakeNode(), { frequency: new FakeParam(0), start() {}, stop() {}, type: '' }); }
  createMediaElementSource(el) { this.source = el; return new FakeNode(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
class FakeAudio {
  constructor(src) { this.src = src; this.paused = true; this.volume = 1; this.muted = false; FakeAudio.last = this; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

let audio, settings, ctxs;
beforeEach(async () => {
  vi.resetModules();
  ctxs = [];
  FakeAudio.last = undefined;
  globalThis.window.AudioContext = class extends FakeCtx { constructor() { super(); ctxs.push(this); } };
  globalThis.Audio = FakeAudio;
  audio = await import('../../src/engine/audio.js');
  settings = { masterVolume: 1, musicVolume: 0.35, sfxVolume: 1, muted: false };
  audio.initAudio(settings);
});

describe('mute that works on iPhone and Android', () => {
  it('music runs through the Web Audio graph, not the element volume iOS ignores', () => {
    audio.unlock();
    expect(ctxs[0].source).toBe(FakeAudio.last);
    expect(FakeAudio.last.paused).toBe(false);
  });

  it('mute pauses the music and mutes the element; unmute starts it again', () => {
    audio.unlock();
    const el = FakeAudio.last;
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
    expect(FakeAudio.last.paused).toBe(false);
  });

  it('going to the background silences everything; coming back restores it', () => {
    audio.unlock();
    const el = FakeAudio.last;
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
    expect(FakeAudio.last.paused).toBe(true);
  });
});

describe('QA round 3 #7: sound comes back after the app was backgrounded', () => {
  it('an iOS "interrupted" context is resumed on return, and the next tap restarts the music', () => {
    audio.unlock();
    const el = FakeAudio.last;
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

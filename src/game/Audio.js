// ---------------------------------------------------------------------------
// All sound is synthesized in WebAudio at runtime. No audio files means nothing
// to download, no load screen, and no licensing questions - the whole game is
// still just JS. The context is created lazily on the first user gesture
// because browsers block autoplay before one.
// ---------------------------------------------------------------------------

const PENTATONIC = [0, 3, 5, 7, 10];          // minor pentatonic offsets
const PROGRESSION = [45, 41, 48, 43];          // A2, F2, C3, G2 - one per bar
const STEPS_PER_BAR = 16;
const BPM = 128;

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuffer = null;

    this.muted = false;
    this.musicEnabled = true;
    this.musicRunning = false;

    this.step = 0;
    this.nextNoteTime = 0;
    this.timerId = null;
    this.intensity = 0;      // 0..1, rises with game speed to thicken the mix
  }

  /** Safe to call repeatedly; only the first call does anything. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);

    // One second of white noise, reused by every percussive/whoosh sound.
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.02);
    }
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = enabled;
    if (!this.ctx) return;
    if (enabled && this.musicRunning) this._fadeMusic(0.34);
    else this._fadeMusic(0);
  }

  _fadeMusic(value, time = 0.4) {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(value, this.ctx.currentTime, time / 3);
  }

  // --- one-shot voices ------------------------------------------------------

  _now() { return this.ctx.currentTime; }

  _env(node, time, attack, decay, peak = 1) {
    node.gain.cancelScheduledValues(time);
    node.gain.setValueAtTime(0.0001, time);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  }

  _tone({ freq, type = 'sine', attack = 0.005, decay = 0.2, gain = 0.3, glide = 0, when = 0, dest = null }) {
    if (!this.ready) return;
    const t = this._now() + when;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(freq * glide, 20), t + attack + decay);
    this._env(amp, t, attack, decay, gain);
    osc.connect(amp).connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  _noise({ duration = 0.2, gain = 0.3, filter = 'bandpass', from = 800, to = 200, q = 1, when = 0 }) {
    if (!this.ready) return;
    const t = this._now() + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, t);
    biquad.frequency.exponentialRampToValueAtTime(Math.max(to, 30), t + duration);
    const amp = this.ctx.createGain();
    this._env(amp, t, 0.008, duration, gain);
    src.connect(biquad).connect(amp).connect(this.sfxGain);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  // --- game sounds ----------------------------------------------------------

  /** Pitch climbs with the combo so a coin run sounds like a rising phrase. */
  coin(combo = 0) {
    const step = Math.min(combo, 11);
    const base = midiToFreq(76 + PENTATONIC[step % 5] + Math.floor(step / 5) * 12);
    this._tone({ freq: base, type: 'triangle', attack: 0.004, decay: 0.1, gain: 0.22 });
    this._tone({ freq: base * 2, type: 'sine', attack: 0.003, decay: 0.07, gain: 0.1, when: 0.012 });
  }

  jump() {
    this._noise({ duration: 0.22, gain: 0.12, filter: 'bandpass', from: 500, to: 1900, q: 1.2 });
    this._tone({ freq: 220, type: 'sine', attack: 0.006, decay: 0.16, gain: 0.16, glide: 1.7 });
  }

  land() {
    this._tone({ freq: 130, type: 'sine', attack: 0.004, decay: 0.11, gain: 0.2, glide: 0.6 });
    this._noise({ duration: 0.09, gain: 0.08, filter: 'lowpass', from: 900, to: 200 });
  }

  roll() {
    this._noise({ duration: 0.3, gain: 0.11, filter: 'lowpass', from: 1400, to: 260, q: 0.7 });
  }

  crash() {
    this._noise({ duration: 0.55, gain: 0.4, filter: 'lowpass', from: 2600, to: 90, q: 0.9 });
    this._tone({ freq: 90, type: 'sawtooth', attack: 0.005, decay: 0.5, gain: 0.28, glide: 0.35 });
    this._tone({ freq: 61, type: 'sine', attack: 0.01, decay: 0.7, gain: 0.3, glide: 0.5 });
  }

  powerup() {
    [0, 4, 7, 12].forEach((semi, i) => {
      this._tone({
        freq: midiToFreq(69 + semi), type: 'square',
        attack: 0.004, decay: 0.16, gain: 0.13, when: i * 0.055,
      });
    });
  }

  hoverboard() {
    this._tone({ freq: 180, type: 'sawtooth', attack: 0.02, decay: 0.5, gain: 0.16, glide: 3.0 });
    this._noise({ duration: 0.5, gain: 0.09, filter: 'bandpass', from: 300, to: 2400, q: 3 });
  }

  boardBreak() {
    this._noise({ duration: 0.35, gain: 0.26, filter: 'highpass', from: 400, to: 2600, q: 1 });
    this._tone({ freq: 300, type: 'square', attack: 0.004, decay: 0.3, gain: 0.14, glide: 0.3 });
  }

  jetpack() {
    this._noise({ duration: 1.4, gain: 0.13, filter: 'lowpass', from: 1800, to: 700, q: 0.6 });
  }

  click() {
    this._tone({ freq: 520, type: 'square', attack: 0.002, decay: 0.05, gain: 0.1 });
  }

  countdown(final = false) {
    this._tone({
      freq: final ? 880 : 587, type: 'triangle',
      attack: 0.004, decay: final ? 0.4 : 0.16, gain: 0.2,
    });
  }

  newBest() {
    [0, 4, 7, 12, 16, 19].forEach((semi, i) => {
      this._tone({
        freq: midiToFreq(65 + semi), type: 'triangle',
        attack: 0.005, decay: 0.32, gain: 0.13, when: i * 0.09,
      });
    });
  }

  // --- music bed ------------------------------------------------------------
  // A small lookahead sequencer: a JS timer wakes up often and schedules notes
  // slightly into the future, so timing comes from the audio clock (rock solid)
  // rather than from setInterval (jittery).

  startMusic() {
    if (!this.ready || this.musicRunning) return;
    this.musicRunning = true;
    this.step = 0;
    this.nextNoteTime = this._now() + 0.08;
    if (this.musicEnabled) this._fadeMusic(0.34);
    this.timerId = setInterval(() => this._scheduler(), 25);
  }

  stopMusic() {
    this.musicRunning = false;
    this._fadeMusic(0);
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  duckMusic(ducked) {
    if (!this.musicRunning) return;
    this._fadeMusic(this.musicEnabled ? (ducked ? 0.08 : 0.34) : 0, 0.3);
  }

  /** 0..1 - drives extra percussion/arps as the run gets faster. */
  setIntensity(value) {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  _scheduler() {
    if (!this.ready || !this.musicRunning) return;
    const stepDur = 60 / BPM / 4;
    while (this.nextNoteTime < this._now() + 0.12) {
      this._playStep(this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % (STEPS_PER_BAR * PROGRESSION.length);
    }
  }

  _playStep(step, time, stepDur) {
    if (!this.musicEnabled) return;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const root = PROGRESSION[bar];

    // Bass on every 8th note.
    if (inBar % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420 + this.intensity * 420;
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(inBar === 8 ? root + 7 : root);
      this._env(amp, time, 0.01, stepDur * 3.2, 0.3);
      osc.connect(lp).connect(amp).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + stepDur * 4);
    }

    // Arp - denser as the run speeds up.
    const arpGate = inBar % 2 === 0 || this.intensity > 0.5;
    if (arpGate) {
      const idx = (inBar * 3) % PENTATONIC.length;
      const octave = inBar % 8 < 4 ? 24 : 36;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = midiToFreq(root + PENTATONIC[idx] + octave);
      this._env(amp, time, 0.005, stepDur * 1.4, 0.055 + this.intensity * 0.035);
      osc.connect(amp).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + stepDur * 2);
    }

    // Hats on offbeats, kick on the downbeats.
    if (inBar % 4 === 2) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const amp = this.ctx.createGain();
      this._env(amp, time, 0.002, 0.045, 0.06 + this.intensity * 0.05);
      src.connect(hp).connect(amp).connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.1);
    }
    if (inBar % 8 === 0) {
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.11);
      this._env(amp, time, 0.004, 0.16, 0.34);
      osc.connect(amp).connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.25);
    }
  }
}

export const audio = new AudioEngine();

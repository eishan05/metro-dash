// Persistent state: high score, lifetime coins, settings. localStorage only -
// nothing leaves the browser, so the game needs no account and no server.

const KEY = 'metro-dash:v1';

const DEFAULTS = {
  best: 0,
  coins: 0,
  runs: 0,
  bestDistance: 0,
  settings: {
    muted: false,
    music: true,
    quality: 'auto',
    shadows: true,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class Storage {
  constructor() {
    this.data = clone(DEFAULTS);
    this.available = true;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          ...clone(DEFAULTS),
          ...parsed,
          settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      // Private browsing or a corrupt entry: fall back to in-memory defaults
      // so the game still runs, it just won't remember anything.
      this.available = false;
      this.data = clone(DEFAULTS);
    }
  }

  save() {
    if (!this.available) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      this.available = false;
    }
  }

  get best() { return this.data.best; }
  get coins() { return this.data.coins; }
  get settings() { return this.data.settings; }

  /** Records a finished run. Returns true when it beat the stored best. */
  recordRun(score, coins, distance) {
    const isBest = score > this.data.best;
    if (isBest) this.data.best = score;
    if (distance > this.data.bestDistance) this.data.bestDistance = Math.floor(distance);
    this.data.coins += coins;
    this.data.runs += 1;
    this.save();
    return isBest;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  reset() {
    this.data = clone(DEFAULTS);
    this.save();
  }
}

export const storage = new Storage();

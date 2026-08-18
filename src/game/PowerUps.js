import { POWERUPS } from '../config.js';

/**
 * Independent countdown timers, one per power-up. Picking up a power-up that's
 * already running refreshes it rather than stacking, which keeps the HUD honest
 * and stops a lucky pickup chain from running away with the game.
 */
export class PowerUps {
  constructor() {
    this.timers = new Map();
    this.onExpire = null;
    this.onActivate = null;
  }

  activate(type, duration = POWERUPS[type].duration) {
    const refreshed = this.timers.has(type);
    this.timers.set(type, duration);
    if (this.onActivate) this.onActivate(type, refreshed);
    return refreshed;
  }

  isActive(type) {
    return this.timers.has(type);
  }

  remaining(type) {
    return this.timers.get(type) || 0;
  }

  fraction(type) {
    if (!this.timers.has(type)) return 0;
    return this.timers.get(type) / POWERUPS[type].duration;
  }

  get multiplier() {
    return this.isActive('double') ? 2 : 1;
  }

  update(dt) {
    if (this.timers.size === 0) return;
    for (const [type, remaining] of this.timers) {
      const next = remaining - dt;
      if (next <= 0) {
        this.timers.delete(type);
        if (this.onExpire) this.onExpire(type);
      } else {
        this.timers.set(type, next);
      }
    }
  }

  /** Snapshot for the HUD, longest-remaining first. */
  list() {
    const out = [];
    for (const [type, remaining] of this.timers) {
      out.push({ type, remaining, fraction: this.fraction(type), config: POWERUPS[type] });
    }
    out.sort((a, b) => b.remaining - a.remaining);
    return out;
  }

  clear() {
    this.timers.clear();
  }
}

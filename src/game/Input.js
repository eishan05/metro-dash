import { INPUT } from '../config.js';

export const Action = {
  LEFT: 'left',
  RIGHT: 'right',
  JUMP: 'jump',
  ROLL: 'roll',
  HOVERBOARD: 'hoverboard',
  PAUSE: 'pause',
};

const KEY_MAP = {
  ArrowLeft: Action.LEFT,  KeyA: Action.LEFT,
  ArrowRight: Action.RIGHT, KeyD: Action.RIGHT,
  ArrowUp: Action.JUMP,    KeyW: Action.JUMP, Space: Action.JUMP,
  ArrowDown: Action.ROLL,  KeyS: Action.ROLL,
  Escape: Action.PAUSE,    KeyP: Action.PAUSE,
};

/**
 * Collects keyboard and touch input into a short-lived action queue.
 *
 * Actions are queued rather than applied instantly so an input that lands a few
 * frames early - mid lane-switch, or just before touching down from a jump -
 * still fires instead of being silently dropped. Entries older than
 * INPUT.bufferTime are discarded.
 */
export class Input {
  constructor(target = window) {
    this.target = target;
    this.queue = [];
    this.time = 0;
    this.enabled = true;
    this.lastJumpTap = -Infinity;
    this.lastTouchTap = -Infinity;

    this.pointerActive = false;
    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;
    this.swipeHandled = false;

    this.onFirstGesture = null;   // used to unlock WebAudio
    this._gestureSeen = false;

    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      // Space/arrows scroll the page by default - never wanted here.
      e.preventDefault();
      if (e.repeat) return;
      this._gesture();
      if (!this.enabled) return;

      if (action === Action.JUMP) {
        if (this.time - this.lastJumpTap < INPUT.doubleTapTime) {
          this.push(Action.HOVERBOARD);
          this.lastJumpTap = -Infinity;
        } else {
          this.lastJumpTap = this.time;
        }
      }
      this.push(action);
    };

    this._onPointerDown = (e) => {
      if (e.pointerType === 'mouse') return;   // mouse uses the keyboard path
      this._gesture();
      if (!this.enabled) return;
      this.pointerActive = true;
      this.swipeHandled = false;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startTime = this.time;
    };

    this._onPointerMove = (e) => {
      if (!this.pointerActive || this.swipeHandled) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < INPUT.swipeThreshold) return;

      // Dominant axis wins, so a sloppy diagonal still reads as one intent.
      this.swipeHandled = true;
      if (absX > absY) {
        this.push(dx > 0 ? Action.RIGHT : Action.LEFT);
      } else if (dy < 0) {
        this.push(Action.JUMP);
      } else {
        this.push(Action.ROLL);
      }
    };

    this._onPointerUp = () => {
      if (!this.pointerActive) return;
      this.pointerActive = false;
      if (this.swipeHandled) return;

      // A short stationary press is a tap: jump, or hoverboard on double-tap.
      if (this.time - this.startTime < 0.35) {
        if (this.time - this.lastTouchTap < INPUT.doubleTapTime) {
          this.push(Action.HOVERBOARD);
          this.lastTouchTap = -Infinity;
        } else {
          this.lastTouchTap = this.time;
          this.push(Action.JUMP);
        }
      }
    };

    this._onTouchMove = (e) => { if (e.cancelable) e.preventDefault(); };
    this._onContextMenu = (e) => e.preventDefault();

    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    this.target.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this.target.addEventListener('pointerup', this._onPointerUp, { passive: true });
    this.target.addEventListener('pointercancel', this._onPointerUp, { passive: true });
    this.target.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.target.addEventListener('contextmenu', this._onContextMenu);
  }

  _gesture() {
    if (this._gestureSeen) return;
    this._gestureSeen = true;
    if (this.onFirstGesture) this.onFirstGesture();
  }

  push(action) {
    if (!this.enabled) return;
    if (this.queue.length > 3) this.queue.shift();
    this.queue.push({ action, t: this.time });
  }

  update(dt) {
    this.time += dt;
    const cutoff = this.time - INPUT.bufferTime;
    while (this.queue.length && this.queue[0].t < cutoff) this.queue.shift();
  }

  /** Removes and returns the oldest matching action, or null. */
  consume(...actions) {
    for (let i = 0; i < this.queue.length; i++) {
      if (actions.includes(this.queue[i].action)) {
        return this.queue.splice(i, 1)[0].action;
      }
    }
    return null;
  }

  /** True if the action is queued; leaves the queue untouched. */
  has(action) {
    return this.queue.some((entry) => entry.action === action);
  }

  clear() {
    this.queue.length = 0;
    this.pointerActive = false;
    this.swipeHandled = false;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('pointerdown', this._onPointerDown);
    this.target.removeEventListener('pointermove', this._onPointerMove);
    this.target.removeEventListener('pointerup', this._onPointerUp);
    this.target.removeEventListener('pointercancel', this._onPointerUp);
    this.target.removeEventListener('touchmove', this._onTouchMove);
    this.target.removeEventListener('contextmenu', this._onContextMenu);
  }
}

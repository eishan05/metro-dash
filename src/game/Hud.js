import { storage } from './Storage.js';

const $ = (id) => document.getElementById(id);

function formatScore(n) {
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * Everything on the DOM overlay. Kept deliberately separate from the WebGL
 * side: text stays crisp at any pixel ratio, and layout is just CSS.
 */
export class Hud {
  constructor() {
    this.el = {
      ui: $('ui'),
      hud: $('hud'),
      score: $('hud-score'),
      coins: $('hud-coins'),
      board: $('hud-board'),
      boardCount: $('hud-board-count'),
      multiplier: $('hud-multiplier'),
      pills: $('powerup-pills'),
      toast: $('toast'),
      countdown: $('countdown'),

      title: $('screen-title'),
      pause: $('screen-pause'),
      gameover: $('screen-gameover'),
      settings: $('screen-settings'),

      titleBest: $('title-best'),
      titleCoins: $('title-coins'),
      gameoverTitle: $('gameover-title'),
      finalScore: $('final-score'),
      finalBest: $('final-best'),
      finalCoins: $('final-coins'),
      finalDistance: $('final-distance'),

      btnMute: $('btn-mute'),
      btnMusic: $('btn-music'),
      btnShadows: $('btn-shadows'),
      selQuality: $('sel-quality'),
    };

    this.handlers = {};
    this.pillNodes = new Map();
    this._lastScore = -1;
    this._lastCoins = -1;
    this._lastMultiplier = -1;
    this._lastBoards = -1;
    this._toastTimer = null;

    this._wireButtons();
    this._syncSettingsUI();
    this.refreshTitle();

    if (window.matchMedia('(hover: none)').matches) {
      document.body.classList.add('is-touch');
    }
  }

  on(event, fn) {
    this.handlers[event] = fn;
  }

  _emit(event, ...args) {
    const fn = this.handlers[event];
    if (fn) fn(...args);
  }

  _wireButtons() {
    const bind = (id, event) => {
      const node = $(id);
      if (node) node.addEventListener('click', () => this._emit(event));
    };

    bind('btn-play', 'play');
    bind('btn-pause', 'pause');
    bind('btn-resume', 'resume');
    bind('btn-restart-pause', 'restart');
    bind('btn-quit', 'quit');
    bind('btn-retry', 'restart');
    bind('btn-menu', 'quit');
    bind('btn-settings', 'openSettings');
    bind('btn-settings-back', 'closeSettings');

    this.el.btnMute.addEventListener('click', () => {
      const next = this.el.btnMute.dataset.on !== 'true';
      this._setToggle(this.el.btnMute, next);
      this._emit('setMuted', !next);
    });

    this.el.btnMusic.addEventListener('click', () => {
      const next = this.el.btnMusic.dataset.on !== 'true';
      this._setToggle(this.el.btnMusic, next);
      this._emit('setMusic', next);
    });

    this.el.btnShadows.addEventListener('click', () => {
      const next = this.el.btnShadows.dataset.on !== 'true';
      this._setToggle(this.el.btnShadows, next);
      this._emit('setShadows', next);
    });

    this.el.selQuality.addEventListener('change', () => {
      this._emit('setQuality', this.el.selQuality.value);
    });

    $('btn-reset-progress').addEventListener('click', () => {
      // Destructive and one tap away, so make it deliberate.
      if (window.confirm('Erase your best score and all collected coins?')) {
        storage.reset();
        this.refreshTitle();
        this._syncSettingsUI();
        this._emit('progressReset');
      }
    });
  }

  _setToggle(node, on) {
    node.dataset.on = on ? 'true' : 'false';
    node.textContent = on ? 'On' : 'Off';
  }

  _syncSettingsUI() {
    const s = storage.settings;
    this._setToggle(this.el.btnMute, !s.muted);
    this._setToggle(this.el.btnMusic, s.music);
    this._setToggle(this.el.btnShadows, s.shadows);
    this.el.selQuality.value = s.quality;
  }

  refreshTitle() {
    this.el.titleBest.textContent = formatScore(storage.best);
    this.el.titleCoins.textContent = formatScore(storage.coins);
  }

  // --- screens --------------------------------------------------------------

  showScreen(name) {
    for (const key of ['title', 'pause', 'gameover', 'settings']) {
      this.el[key].classList.toggle('hidden', key !== name);
    }
    this.el.hud.classList.toggle('hidden', name !== null && name !== undefined);
  }

  showGameOver({ score, coins, distance, isBest }) {
    this.el.finalScore.textContent = formatScore(score);
    this.el.finalBest.textContent = formatScore(storage.best);
    this.el.finalCoins.textContent = formatScore(coins);
    this.el.finalDistance.textContent = `${Math.floor(distance)} m`;
    this.el.gameoverTitle.textContent = isBest ? 'New Best!' : 'Wiped Out';
    this.el.gameoverTitle.classList.toggle('new-best', isBest);
    this.showScreen('gameover');
    this.refreshTitle();
  }

  // --- live HUD -------------------------------------------------------------

  setScore(score) {
    const value = Math.floor(score);
    if (value === this._lastScore) return;
    this._lastScore = value;
    this.el.score.textContent = formatScore(value);
  }

  setCoins(coins) {
    if (coins === this._lastCoins) return;
    this._lastCoins = coins;
    this.el.coins.textContent = formatScore(coins);
  }

  setBoards(count) {
    if (count === this._lastBoards) return;
    this._lastBoards = count;
    this.el.boardCount.textContent = String(count);
    this.el.board.classList.toggle('empty', count <= 0);
  }

  setMultiplier(multiplier) {
    if (multiplier === this._lastMultiplier) return;
    this._lastMultiplier = multiplier;
    const show = multiplier > 1;
    this.el.multiplier.classList.toggle('hidden', !show);
    if (show) this.el.multiplier.textContent = `${multiplier}x`;
  }

  /** Reconciles the pill row against the active power-up list. */
  updatePills(list) {
    const seen = new Set();

    for (const item of list) {
      seen.add(item.type);
      let node = this.pillNodes.get(item.type);
      if (!node) {
        node = document.createElement('div');
        node.className = 'pill';
        node.innerHTML =
          `<span class="pill-icon"></span><span class="pill-label"></span>` +
          `<span class="pill-bar"><span></span></span>`;
        node.querySelector('.pill-icon').style.background =
          `#${item.config.color.toString(16).padStart(6, '0')}`;
        node.querySelector('.pill-label').textContent = item.config.label;
        this.el.pills.appendChild(node);
        this.pillNodes.set(item.type, node);
      }
      node.querySelector('.pill-bar span').style.width = `${Math.round(item.fraction * 100)}%`;
      node.classList.toggle('expiring', item.remaining < 2.5);
    }

    for (const [type, node] of this.pillNodes) {
      if (!seen.has(type)) {
        node.remove();
        this.pillNodes.delete(type);
      }
    }
  }

  clearPills() {
    for (const [, node] of this.pillNodes) node.remove();
    this.pillNodes.clear();
  }

  toast(text) {
    const el = this.el.toast;
    el.textContent = text;
    el.classList.remove('show');
    // Reflow so the animation restarts even for back-to-back toasts.
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 1200);
  }

  flash() {
    this.el.ui.classList.remove('flash');
    void this.el.ui.offsetWidth;
    this.el.ui.classList.add('flash');
    setTimeout(() => this.el.ui.classList.remove('flash'), 420);
  }

  showCountdown(text) {
    this.el.countdown.classList.remove('hidden');
    this.el.countdown.innerHTML = `<span>${text}</span>`;
  }

  hideCountdown() {
    this.el.countdown.classList.add('hidden');
    this.el.countdown.innerHTML = '';
  }

  resetRunState() {
    this._lastScore = -1;
    this._lastCoins = -1;
    this._lastMultiplier = -1;
    this._lastBoards = -1;
    this.setScore(0);
    this.setCoins(0);
    this.setMultiplier(1);
    this.clearPills();
  }
}

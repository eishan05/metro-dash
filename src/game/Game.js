import * as THREE from 'three';
import {
  SPEED, SCORE, COINS, POWERUPS, PHYSICS_STEP, MAX_FRAME_DT, PLAYER,
} from '../config.js';
import { World } from './World.js';
import { Track } from './Track.js';
import { Player } from './Player.js';
import { Spawner } from './Spawner.js';
import { CollisionWorld } from './Collision.js';
import { PowerUps } from './PowerUps.js';
import { Effects } from './Effects.js';
import { Input, Action } from './Input.js';
import { Hud } from './Hud.js';
import { audio } from './Audio.js';
import { storage } from './Storage.js';

const State = {
  MENU: 'menu',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  GAMEOVER: 'gameover',
};

const BOARD_SCORE_INTERVAL = 1000;   // one extra hoverboard charge per 1000 points

/**
 * Top-level state machine and the fixed-timestep loop.
 *
 * Physics runs at a fixed 60 Hz regardless of display refresh: at top speed the
 * world moves 0.6 units per step, comfortably less than the thinnest obstacle,
 * so nothing can tunnel through a barrier on a slow frame.
 */
export class Game {
  constructor(canvas) {
    this.world = new World(canvas);
    this.collision = new CollisionWorld();
    this.player = new Player(this.collision);
    this.world.scene.add(this.player.group);

    this.track = new Track(this.world.scene);
    this.spawner = new Spawner(this.world.scene, this.collision);
    this.effects = new Effects(this.world.scene);
    this.powerups = new PowerUps();
    this.input = new Input(window);
    this.hud = new Hud();

    this.state = State.MENU;
    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.speed = SPEED.min;
    this.boards = 1;
    this.nextBoardScore = BOARD_SCORE_INTERVAL;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.deathTimer = 0;
    this.countdownTimer = 0;
    this.lastCountdownShown = -1;

    this.accumulator = 0;
    this.lastFrame = 0;
    this.running = false;

    this._wire();
    this._applyStoredSettings();
    this.hud.showScreen('title');
  }

  // --- wiring ---------------------------------------------------------------

  _wire() {
    this.input.onFirstGesture = () => {
      audio.unlock();
      audio.setMuted(storage.settings.muted);
      audio.setMusicEnabled(storage.settings.music);
    };

    this.spawner.onCoin = () => this._collectCoin();
    this.spawner.onPickup = (type) => this._collectPickup(type);

    this.powerups.onExpire = (type) => {
      if (type === 'jetpack') {
        // Hand control back to gravity rather than dropping like a stone.
        this.player.jetpackTime = 0;
      }
    };

    this.hud.on('play', () => this.startRun());
    this.hud.on('restart', () => this.startRun());
    this.hud.on('pause', () => this.pause());
    this.hud.on('resume', () => this.resume());
    this.hud.on('quit', () => this.toMenu());
    this.hud.on('openSettings', () => {
      this._settingsReturn = this.state === State.PAUSED ? 'pause' : 'title';
      this.hud.showScreen('settings');
    });
    this.hud.on('closeSettings', () => {
      this.hud.showScreen(this._settingsReturn || 'title');
    });
    this.hud.on('setMuted', (muted) => {
      storage.setSetting('muted', muted);
      audio.unlock();
      audio.setMuted(muted);
    });
    this.hud.on('setMusic', (enabled) => {
      storage.setSetting('music', enabled);
      audio.setMusicEnabled(enabled);
    });
    this.hud.on('setShadows', (enabled) => {
      storage.setSetting('shadows', enabled);
      this.world.setShadowsAllowed(enabled);
    });
    this.hud.on('setQuality', (mode) => {
      storage.setSetting('quality', mode);
      this.world.setQualityMode(mode);
    });
    this.hud.on('progressReset', () => {
      this._applyStoredSettings();
    });

    // Losing focus mid-run should never cost the player a life.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === State.PLAYING) this.pause();
    });
    window.addEventListener('blur', () => {
      if (this.state === State.PLAYING) this.pause();
    });
  }

  _applyStoredSettings() {
    const s = storage.settings;
    this.world.setShadowsAllowed(s.shadows);
    this.world.setQualityMode(s.quality);
    audio.setMuted(s.muted);
    audio.setMusicEnabled(s.music);
    this.world.onQualityChange = (level) => this.track.setSceneryDensity(level.scenery);
    this.track.setSceneryDensity(this.world.level.scenery);
  }

  // --- run lifecycle --------------------------------------------------------

  startRun() {
    audio.unlock();
    audio.click();

    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.speed = SPEED.min;
    this.boards = 1;
    this.nextBoardScore = BOARD_SCORE_INTERVAL;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.deathTimer = 0;

    this.player.reset();
    this.powerups.clear();
    this.spawner.reset();
    this.track.reset();
    this.effects.reset();
    this.input.clear();
    this.input.enabled = true;

    this.hud.resetRunState();
    this.hud.setBoards(this.boards);
    this.hud.showScreen(null);

    this.state = State.COUNTDOWN;
    this.countdownTimer = 3;
    this.lastCountdownShown = -1;

    audio.startMusic();
    audio.duckMusic(false);
  }

  pause() {
    if (this.state !== State.PLAYING && this.state !== State.COUNTDOWN) return;
    this._resumeTo = this.state;
    this.state = State.PAUSED;
    this.input.enabled = false;
    this.hud.hideCountdown();
    this.hud.showScreen('pause');
    audio.duckMusic(true);
  }

  resume() {
    if (this.state !== State.PAUSED) return;
    audio.click();
    this.hud.showScreen(null);
    this.input.clear();
    this.input.enabled = true;
    audio.duckMusic(false);

    // Always give a beat to re-orient rather than dropping straight back in.
    this.state = State.COUNTDOWN;
    this.countdownTimer = 2;
    this.lastCountdownShown = -1;
  }

  toMenu() {
    audio.click();
    this.state = State.MENU;
    this.input.enabled = false;
    this.hud.hideCountdown();
    this.hud.clearPills();
    this.hud.showScreen('title');
    this.hud.refreshTitle();
    audio.stopMusic();
    this.player.reset();
    this.spawner.reset();
    this.track.reset();
    this.effects.reset();
    this.powerups.clear();
  }

  _die() {
    this.state = State.DYING;
    this.deathTimer = 1.15;
    this.input.enabled = false;
    audio.crash();
    audio.duckMusic(true);
    this.effects.crash(this.player.x, this.player.y + 0.8, PLAYER.z);
    this.hud.flash();
    this.hud.clearPills();
    this.powerups.clear();
  }

  _finishDeath() {
    this.state = State.GAMEOVER;
    audio.stopMusic();
    const isBest = storage.recordRun(Math.floor(this.score), this.coins, this.distance);
    if (isBest) audio.newBest();
    this.hud.showGameOver({
      score: this.score,
      coins: this.coins,
      distance: this.distance,
      isBest,
    });
  }

  // --- rewards --------------------------------------------------------------

  _collectCoin() {
    this.coins += COINS.value;
    this.score += COINS.score * this.powerups.multiplier;

    this.comboTimer = SCORE.comboWindow;
    this.comboCount += 1;
    audio.coin(this.comboCount);
    this.effects.coinSparkle(this.player.x, this.player.y + 1.0, PLAYER.z);
  }

  _collectPickup(type) {
    const config = POWERUPS[type];
    this.powerups.activate(type, config.duration);
    audio.powerup();
    this.effects.powerup(this.player.x, this.player.y + 1.0, PLAYER.z, config.color);
    this.hud.toast(config.label.toUpperCase());

    if (type === 'jetpack') {
      this.player.startJetpack(config.duration);
      this.spawner.spawnJetpackTrail(this.player.lane, config.duration, this.speed);
      audio.jetpack();
    }
  }

  _useHoverboard() {
    if (this.player.hasHoverboard) return;
    if (this.boards <= 0) {
      this.hud.toast('NO BOARDS');
      return;
    }
    this.boards -= 1;
    this.hud.setBoards(this.boards);
    this.player.giveHoverboard();
    audio.hoverboard();
    this.effects.powerup(this.player.x, this.player.y + 0.4, PLAYER.z, 0xff8c42);
    this.hud.toast('HOVERBOARD');
  }

  // --- simulation -----------------------------------------------------------

  _handleInput() {
    let action;
    // Pause is checked outside the action queue so it works in any state.
    while ((action = this.input.consume(
      Action.LEFT, Action.RIGHT, Action.JUMP, Action.ROLL, Action.HOVERBOARD, Action.PAUSE
    ))) {
      switch (action) {
        case Action.PAUSE:
          this.pause();
          return;
        case Action.LEFT:
          this.player.moveLane(-1);
          break;
        case Action.RIGHT:
          this.player.moveLane(1);
          break;
        case Action.JUMP:
          if (this.player.jump(this.speed)) audio.jump();
          break;
        case Action.ROLL: {
          const result = this.player.roll(this.speed);
          if (result === true) audio.roll();
          break;
        }
        case Action.HOVERBOARD:
          this._useHoverboard();
          break;
      }
    }
  }

  step(dt) {
    this.input.update(dt);

    if (this.state === State.COUNTDOWN) {
      this.countdownTimer -= dt;
      const shown = Math.ceil(this.countdownTimer);
      if (shown !== this.lastCountdownShown && shown > 0) {
        this.lastCountdownShown = shown;
        this.hud.showCountdown(String(shown));
        audio.countdown(false);
      }
      if (this.countdownTimer <= 0) {
        this.hud.showCountdown('GO!');
        audio.countdown(true);
        setTimeout(() => this.hud.hideCountdown(), 520);
        this.state = State.PLAYING;
      }
      // The world holds still during the countdown, but keep the run cycle
      // playing so the character doesn't freeze mid-stride.
      this.player.update(dt, this.speed, this.powerups);
      this.effects.update(dt, 0);
      return;
    }

    if (this.state === State.DYING) {
      this.deathTimer -= dt;
      // Tumble.
      this.player.group.rotation.x -= dt * 6;
      this.player.group.position.y = Math.max(0.2, this.player.group.position.y - dt * 2);
      this.effects.update(dt, 0);
      if (this.deathTimer <= 0) this._finishDeath();
      return;
    }

    if (this.state !== State.PLAYING) {
      this.effects.update(dt, 0);
      return;
    }

    this._handleInput();
    if (this.state !== State.PLAYING) return;   // input may have paused us

    // Speed and distance -----------------------------------------------------
    this.speed = SPEED.max - (SPEED.max - SPEED.min) * Math.exp(-this.distance / SPEED.rampDistance);
    const dz = this.speed * dt;
    this.distance += dz;

    // Score ------------------------------------------------------------------
    const multiplier = this.powerups.multiplier;
    this.score += dz * SCORE.perUnit * multiplier;

    if (this.score >= this.nextBoardScore) {
      this.nextBoardScore += BOARD_SCORE_INTERVAL;
      this.boards += 1;
      this.hud.setBoards(this.boards);
      this.hud.toast('+1 BOARD');
      audio.powerup();
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    // Systems ----------------------------------------------------------------
    this.powerups.update(dt);
    this.player.update(dt, this.speed, this.powerups);
    this.track.update(dz);
    this.spawner.update(dz, this.player, this.powerups, dt);
    this.effects.update(dt, dz);

    // Collision --------------------------------------------------------------
    const hit = this.player.checkCollision();
    if (hit) this._resolveHit(hit);

    // HUD --------------------------------------------------------------------
    this.hud.setScore(this.score);
    this.hud.setCoins(this.coins);
    this.hud.setMultiplier(multiplier);
    this.hud.updatePills(this.powerups.list());

    audio.setIntensity((this.speed - SPEED.min) / (SPEED.max - SPEED.min));
  }

  _resolveHit({ entry, kind }) {
    if (kind === 'graze') {
      // Caught the lip of a train roof on the way up. Boosting onto the roof
      // is far better than punishing a jump that was basically right.
      this.player.y = entry.spec.h;
      this.player.vy = 0;
      this.player.airborne = false;
      this.player.registerCrash();
      this.effects.burst(this.player.x, entry.spec.h, PLAYER.z,
        { count: 5, color: 0xffffff, speed: 3, life: 0.3, size: 0.6 });
      return;
    }

    if (this.player.hasHoverboard) {
      this.player.breakHoverboard();
      this.player.registerCrash();
      this.player.recoverFrom(entry);
      this.effects.boardBreak(this.player.x, this.player.y + 0.4, PLAYER.z);
      audio.boardBreak();
      this.hud.toast('BOARD BROKE');
      return;
    }

    this._die();
  }

  // --- frame loop -----------------------------------------------------------

  start() {
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      requestAnimationFrame(loop);

      const frameMs = now - this.lastFrame;
      this.lastFrame = now;
      const dt = Math.min(frameMs / 1000, MAX_FRAME_DT);

      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= PHYSICS_STEP && steps < 8) {
        this.step(PHYSICS_STEP);
        this.accumulator -= PHYSICS_STEP;
        steps++;
      }
      if (steps === 8) this.accumulator = 0;   // give up on a huge backlog

      this.world.updateCamera(this.player, this.speed, this.effects.shakeOffset, dt);
      this.world.render();
      this.world.sampleFrame(frameMs);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }
}

export { State };

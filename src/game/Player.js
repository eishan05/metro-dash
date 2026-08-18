import * as THREE from 'three';
import { LANES, LANE_COUNT, PLAYER, JETPACK, HOVERBOARD } from '../config.js';
import { createCharacter, animateCharacter } from './models/character.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Steepest surface the player can run up without jumping (units/sec of rise). */
const MAX_RISE_RATE = 26;

function createHoverboard() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.09, 1.5),
    new THREE.MeshLambertMaterial({ color: 0xff8c42, emissive: 0x3a1c05 })
  );
  deck.castShadow = true;
  g.add(deck);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.04, 1.56),
    new THREE.MeshLambertMaterial({ color: 0x2f3640 })
  );
  trim.position.y = -0.06;
  g.add(trim);
  for (const z of [-0.45, 0.45]) {
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x63e2ff })
    );
    glow.position.set(0, -0.1, z);
    g.add(glow);
  }
  return g;
}

export class Player {
  constructor(collision) {
    this.collision = collision;

    this.rig = createCharacter();
    this.group = new THREE.Group();
    this.group.add(this.rig.group);

    this.board = createHoverboard();
    this.board.visible = false;
    this.group.add(this.board);

    this.reset();
  }

  reset() {
    this.lane = PLAYER.startLane;
    this.x = LANES[this.lane];
    this.y = 0;
    // Constant, but exposed as a field so the player is a complete position
    // triple for anything doing distance maths against it (coins, pickups).
    this.z = PLAYER.z;
    this.vy = 0;
    this.airborne = false;
    this.rolling = false;
    this.rollRemaining = 0;
    this.runPhase = 0;
    this.lean = 0;

    this.hoverboardTime = 0;
    this.jetpackTime = 0;
    this.sneakers = false;

    this.alive = true;
    this.crashGrace = 0;

    this.group.position.set(this.x, 0, PLAYER.z);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
    this.group.visible = true;
    this.board.visible = false;

    // Reset the limb pose so a new run doesn't start mid-roll.
    const { torso, head, armL, armR, legL, legR } = this.rig.parts;
    for (const part of [torso, head, armL, armR, legL, legR]) part.rotation.set(0, 0, 0);
    torso.position.y = 0.95;
  }

  get height() {
    return this.rolling ? PLAYER.rollHeight : PLAYER.height;
  }

  get hasHoverboard() {
    return this.hoverboardTime > 0;
  }

  get isFlying() {
    return this.jetpackTime > 0;
  }

  // --- speed-scaled physics -------------------------------------------------
  // Scaling velocity by s and gravity by s^2 keeps the apex and the ground
  // distance of a jump identical at every speed - see config.js PLAYER.

  _scale(speed) {
    return clamp(speed / PLAYER.jumpRefSpeed, PLAYER.jumpScaleMin, PLAYER.jumpScaleMax);
  }

  gravityAt(speed) {
    const s = this._scale(speed);
    return PLAYER.gravity * s * s;
  }

  jumpVelocityAt(speed) {
    const s = this._scale(speed);
    return PLAYER.jumpVelocity * s * (this.sneakers ? 1.35 : 1);
  }

  rollDurationAt(speed) {
    return clamp(PLAYER.rollDistance / Math.max(speed, 1), PLAYER.rollTimeMin, PLAYER.rollTimeMax);
  }

  // --- actions --------------------------------------------------------------

  moveLane(dir) {
    const next = clamp(this.lane + dir, 0, LANE_COUNT - 1);
    if (next === this.lane) return false;
    this.lane = next;
    return true;
  }

  jump(speed) {
    if (this.isFlying) return false;
    if (this.airborne) return false;
    this.vy = this.jumpVelocityAt(speed);
    this.airborne = true;
    this.rolling = false;
    this.rollRemaining = 0;
    return true;
  }

  roll(speed) {
    if (this.isFlying) return false;
    if (this.airborne) {
      // Rolling in mid-air slams you back down - the standard way to cut a
      // jump short when you've mistimed it.
      this.vy = PLAYER.fastFallVelocity * this._scale(speed);
      return 'fastfall';
    }
    if (this.rolling) return false;
    this.rolling = true;
    this.rollRemaining = this.rollDurationAt(speed);
    return true;
  }

  giveHoverboard() {
    this.hoverboardTime = HOVERBOARD.duration;
    this.board.visible = true;
  }

  breakHoverboard() {
    this.hoverboardTime = 0;
    this.board.visible = false;
  }

  startJetpack(duration) {
    this.jetpackTime = duration;
    this.rolling = false;
    this.rollRemaining = 0;
  }

  // --- per-step update ------------------------------------------------------

  update(dt, speed, powerups) {
    this.sneakers = powerups.isActive('sneakers');

    if (this.crashGrace > 0) this.crashGrace -= dt;
    if (this.hoverboardTime > 0) {
      this.hoverboardTime -= dt;
      if (this.hoverboardTime <= 0) this.breakHoverboard();
    }

    // Lane tween -------------------------------------------------------------
    const targetX = LANES[this.lane];
    const laneSpeed = Math.abs(LANES[1] - LANES[0]) / PLAYER.laneSwitchTime;
    const dx = targetX - this.x;
    const stepX = laneSpeed * dt;
    this.x = Math.abs(dx) <= stepX ? targetX : this.x + Math.sign(dx) * stepX;

    // Roll timer -------------------------------------------------------------
    if (this.rolling) {
      this.rollRemaining -= dt;
      if (this.rollRemaining <= 0) {
        // Don't stand back up inside a low beam - stay tucked until clear.
        const standing = this.collision.hitTest(this.x, this.y, PLAYER.z, PLAYER.height);
        if (!standing) {
          this.rolling = false;
        } else {
          this.rollRemaining = 0.08;
        }
      }
    }

    // Vertical ---------------------------------------------------------------
    const ground = this.collision.groundHeight(this.x, PLAYER.z);

    if (this.jetpackTime > 0) {
      this.jetpackTime -= dt;
      this.airborne = true;
      this.vy = 0;
      const target = JETPACK.flyHeight;
      this.y += clamp(target - this.y, -JETPACK.fallSpeed * dt, JETPACK.riseSpeed * dt);
      if (this.jetpackTime <= 0) this.vy = 0;   // hand back to gravity
    } else if (this.airborne) {
      this.vy -= this.gravityAt(speed) * dt;
      this.y += this.vy * dt;
      if (this.vy <= 0 && this.y <= ground) {
        this.y = ground;
        this.vy = 0;
        this.airborne = false;
        this.justLanded = true;
      }
    } else if (ground > this.y) {
      // Rising ground: walk up a ramp, but never levitate up a train's flank.
      // Anything steeper than a ramp stays un-climbed so it registers as the
      // crash it is on the collision pass below.
      this.y = Math.min(ground, this.y + MAX_RISE_RATE * dt);
    } else if (ground < this.y - 1e-4) {
      // Ran off the end of a roof.
      this.airborne = true;
      this.vy = 0;
    }

    // Animation --------------------------------------------------------------
    this.runPhase += dt * (5 + speed * 0.62);
    animateCharacter(this.rig, {
      phase: this.runPhase,
      airborne: this.airborne,
      rolling: this.rolling,
      speedRatio: clamp(speed / 36, 0, 1),
      dt,
    });

    const targetLean = clamp(dx * 0.16, -0.28, 0.28);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 12);

    this.group.position.set(this.x, this.y, PLAYER.z);
    this.group.rotation.z = -this.lean;

    // Board sits under the feet and banks with the lean.
    this.board.position.set(0, -0.02, 0);
    this.board.rotation.z = -this.lean * 1.6;
    if (this.hasHoverboard) {
      this.rig.group.position.y = HOVERBOARD.height;
      this.board.visible = true;
    } else {
      this.rig.group.position.y = 0;
      this.board.visible = false;
    }
  }

  /**
   * Collision pass. Returns null, or {entry, kind} describing what was hit.
   * Skipped while flying - the jetpack is above everything by design.
   */
  checkCollision() {
    if (this.isFlying) return null;
    if (this.crashGrace > 0) return null;
    const entry = this.collision.hitTest(this.x, this.y, PLAYER.z, this.height);
    if (!entry) return null;
    return { entry, kind: this.collision.classify(entry, this.x, this.y) };
  }

  /** Consumes the grace window so one impact can't fire twice. */
  registerCrash() {
    this.crashGrace = PLAYER.crashGrace;
  }

  /** Nudges the player clear of whatever they hit, so they don't re-collide. */
  recoverFrom(entry) {
    const spec = entry.spec;
    // Push out along whichever axis needs the least movement.
    const pushX = this.x < entry.x ? -1 : 1;
    this.x = entry.x + pushX * (spec.w / 2 + PLAYER.radius + 0.05);

    // Snap to the nearest lane so the player stays on the grid.
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < LANE_COUNT; i++) {
      const d = Math.abs(LANES[i] - this.x);
      if (d < bestDist) { bestDist = d; nearest = i; }
    }
    this.lane = nearest;
    this.x = LANES[nearest];
    this.rolling = false;
    this.rollRemaining = 0;
  }
}

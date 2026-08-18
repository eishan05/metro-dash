import * as THREE from 'three';
import {
  LANES, TRACK, COINS, POWERUPS, SPAWN, OBSTACLES, JETPACK,
} from '../config.js';
import { createObstacle } from './models/obstacles.js';
import { createCoinInstancedMesh, createPickup } from './models/coin.js';
import { pickPattern, JUMP_APEX, JUMP_SPAN } from './Patterns.js';

const COIN_CAPACITY = 240;
const PICKUP_TYPES = Object.keys(POWERUPS).filter((k) => POWERUPS[k].duration !== undefined);
const HIDDEN = new THREE.Vector3(0, -999, 0);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Places everything the player interacts with: obstacles, coins and pickups.
 *
 * All three are pooled. Obstacle meshes are reused per type, coins live in a
 * single InstancedMesh, and pickups round-robin through a small pool - so a
 * ten-minute run allocates no more than the first ten seconds did.
 */
export class Spawner {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;

    this.obstaclePool = new Map();
    this.activeObstacles = [];

    // Coins ------------------------------------------------------------------
    this.coinMesh = createCoinInstancedMesh(COIN_CAPACITY);
    scene.add(this.coinMesh);
    this.coins = [];
    for (let i = 0; i < COIN_CAPACITY; i++) {
      this.coins.push({ active: false, x: 0, y: 0, z: 0, spin: 0, scale: 1, taken: 0 });
    }

    this.pickupPool = new Map();
    this.activePickups = [];

    this.onCoin = null;
    this.onPickup = null;

    this._dummy = new THREE.Object3D();
    this._spawnCursor = TRACK.spawnZ;   // world z where the next pattern begins
    this.distance = 0;

    this.reset();
  }

  reset() {
    for (const entry of this.activeObstacles.slice()) this._releaseObstacle(entry);
    for (const p of this.activePickups.slice()) this._releasePickup(p);
    for (const c of this.coins) c.active = false;
    this.collision.clear();
    this.distance = 0;

    // Start the cursor just ahead of the player and fill the whole visible
    // track immediately. Starting it out at the far spawn plane instead meant
    // the first obstacle was placed 240 units away AND only after 60 units of
    // travel - about 18 seconds of empty track at the top of every run.
    this._spawnCursor = -SPAWN.safeStartDistance;
    this._fillAhead(0);
    this._syncCoins();
  }

  /**
   * Lays out patterns from the spawn cursor until the track is stocked out to
   * the spawn plane. Used both to prefill a new run and to top up during one.
   */
  _fillAhead(difficulty) {
    while (this._spawnCursor > TRACK.spawnZ) {
      const gap = SPAWN.maxGapUnits - (SPAWN.maxGapUnits - SPAWN.minGapUnits) * difficulty;
      const patternStart = this._spawnCursor;
      const length = this._spawnPattern(patternStart, difficulty);
      const nextStart = patternStart - length - gap;
      this._spawnFiller(patternStart - length - 2, nextStart + 2);
      this._spawnCursor = nextStart;
    }
  }

  // --- pooling --------------------------------------------------------------

  _takeObstacle(type) {
    let pool = this.obstaclePool.get(type);
    if (!pool) {
      pool = [];
      this.obstaclePool.set(type, pool);
    }
    let mesh = pool.pop();
    if (!mesh) {
      mesh = createObstacle(type);
      this.scene.add(mesh);
    }
    mesh.visible = true;
    return mesh;
  }

  _releaseObstacle(entry) {
    entry.mesh.visible = false;
    entry.mesh.position.copy(HIDDEN);
    this.obstaclePool.get(entry.type).push(entry.mesh);
    this.collision.remove(entry);
    const i = this.activeObstacles.indexOf(entry);
    if (i !== -1) this.activeObstacles.splice(i, 1);
  }

  _takePickup(type) {
    let pool = this.pickupPool.get(type);
    if (!pool) {
      pool = [];
      this.pickupPool.set(type, pool);
    }
    let mesh = pool.pop();
    if (!mesh) {
      mesh = createPickup(type);
      this.scene.add(mesh);
    }
    mesh.visible = true;
    return mesh;
  }

  _releasePickup(p) {
    p.mesh.visible = false;
    p.mesh.position.copy(HIDDEN);
    this.pickupPool.get(p.type).push(p.mesh);
    const i = this.activePickups.indexOf(p);
    if (i !== -1) this.activePickups.splice(i, 1);
  }

  _freeCoin() {
    for (let i = 0; i < this.coins.length; i++) {
      if (!this.coins[i].active) return this.coins[i];
    }
    return null;
  }

  // --- placement ------------------------------------------------------------

  _placeObstacle(type, lane, worldZ) {
    const spec = OBSTACLES[type];
    const mesh = this._takeObstacle(type);
    mesh.position.set(LANES[lane], 0, worldZ);

    const entry = { type, spec, mesh, lane, x: LANES[lane], z: worldZ };
    this.activeObstacles.push(entry);
    this.collision.add(entry);
    return entry;
  }

  _placeCoin(x, y, z) {
    const coin = this._freeCoin();
    if (!coin) return null;
    coin.active = true;
    coin.x = x;
    coin.y = y;
    coin.z = z;
    coin.spin = Math.random() * Math.PI * 2;
    coin.scale = 1;
    coin.taken = 0;
    return coin;
  }

  /** Straight run of coins down a lane. */
  _coinRun(lane, fromZ, toZ, height = COINS.hoverHeight) {
    const count = Math.floor(Math.abs(toZ - fromZ) / COINS.spacing);
    for (let i = 0; i <= count; i++) {
      this._placeCoin(LANES[lane], height, fromZ - i * COINS.spacing);
    }
  }

  /** Coins tracing the jump arc over an obstacle - a reward for jumping it. */
  _coinArc(lane, centerZ) {
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = COINS.hoverHeight * 0.4 + JUMP_APEX * 4 * t * (1 - t);
      const z = centerZ + JUMP_SPAN * 0.5 - t * JUMP_SPAN;
      this._placeCoin(LANES[lane], y, z);
    }
  }

  /** Fires when a jetpack activates: a trail to fly along. */
  spawnJetpackTrail(lane, duration, speed) {
    const length = Math.min(duration * speed, 180);
    const count = Math.floor(length / JETPACK.coinArcSpacing);
    for (let i = 2; i < count; i++) {
      const z = -i * JETPACK.coinArcSpacing;
      this._placeCoin(LANES[lane], JETPACK.flyHeight + 0.5, z);
    }
  }

  _placePickup(lane, worldZ, difficulty) {
    // Jetpacks and magnets stay rarer than the score/mobility pickups.
    const weights = { magnet: 3, double: 4, sneakers: 3, jetpack: difficulty > 0.25 ? 2 : 0 };
    let total = 0;
    for (const t of PICKUP_TYPES) total += weights[t] || 0;
    let roll = Math.random() * total;
    let type = PICKUP_TYPES[0];
    for (const t of PICKUP_TYPES) {
      roll -= weights[t] || 0;
      if (roll <= 0) { type = t; break; }
    }

    const mesh = this._takePickup(type);
    mesh.position.set(LANES[lane], 1.25, worldZ);
    const p = { type, mesh, x: LANES[lane], y: 1.25, z: worldZ, spin: 0 };
    this.activePickups.push(p);
    return p;
  }

  /** Lays out one pattern plus its coins, starting at world z `startZ`. */
  _spawnPattern(startZ, difficulty) {
    const pattern = pickPattern(difficulty);

    for (const item of pattern.items) {
      // Forward offset f runs in -Z, the direction of travel.
      this._placeObstacle(item.type, item.lane, startZ - item.f);
    }

    // Coins ------------------------------------------------------------------
    const free = pattern.free || [];
    for (const lane of free) {
      if (Math.random() < 0.62) {
        this._coinRun(lane, startZ - 1, startZ - pattern.length - 1);
      }
    }
    for (const item of pattern.items) {
      const spec = OBSTACLES[item.type];
      const z = startZ - item.f;
      if (item.type === 'barrierLow' && Math.random() < 0.5) {
        this._coinArc(item.lane, z);
      } else if (spec.roof && !spec.ramp && spec.h <= JUMP_APEX && Math.random() < 0.55) {
        // Coins along a train roof: pays out for taking the high route.
        this._coinRun(item.lane, z + spec.d / 2 - 1.5, z - spec.d / 2 + 1.5, spec.h + 0.9);
      }
    }

    // Pickup -----------------------------------------------------------------
    if (Math.random() < POWERUPS.spawnChance) {
      const lane = free.length
        ? free[(Math.random() * free.length) | 0]
        : (Math.random() * LANES.length) | 0;
      this._placePickup(lane, startZ - pattern.length - 4, difficulty);
    }

    return pattern.length;
  }

  /** Coins in the empty stretch between two patterns. */
  _spawnFiller(fromZ, toZ) {
    if (Math.abs(toZ - fromZ) < 8) return;
    const lane = (Math.random() * LANES.length) | 0;
    if (Math.random() < 0.75) {
      this._coinRun(lane, fromZ - 3, toZ + 3);
    }
  }

  // --- per-frame ------------------------------------------------------------

  update(dz, playerState, powerups, dt) {
    this.distance += dz;
    const difficulty = clamp(this.distance / SPAWN.difficultyDistance, 0, 1);

    // Advance and recycle obstacles.
    for (let i = this.activeObstacles.length - 1; i >= 0; i--) {
      const entry = this.activeObstacles[i];
      entry.z += dz;
      entry.mesh.position.z = entry.z;
      if (entry.z - entry.spec.d / 2 > TRACK.recycleZ) this._releaseObstacle(entry);
    }

    // Pickups.
    for (let i = this.activePickups.length - 1; i >= 0; i--) {
      const p = this.activePickups[i];
      p.z += dz;
      p.spin += dt * 2.2;
      p.mesh.position.z = p.z;
      p.mesh.position.y = p.y + Math.sin(p.spin * 1.6) * 0.14;
      p.mesh.rotation.y = p.spin;

      if (this._touching(p, playerState, 1.15)) {
        this._releasePickup(p);
        if (this.onPickup) this.onPickup(p.type);
        continue;
      }
      if (p.z > TRACK.recycleZ) this._releasePickup(p);
    }

    this._updateCoins(dz, playerState, powerups, dt);

    // Keep the world ahead of the player stocked.
    this._spawnCursor += dz;
    this._fillAhead(difficulty);
  }

  _touching(obj, player, radius) {
    const dx = obj.x - player.x;
    const dz = obj.z - player.z;
    const dy = obj.mesh ? obj.mesh.position.y - (player.y + 0.8) : obj.y - (player.y + 0.8);
    return dx * dx + dy * dy + dz * dz < radius * radius;
  }

  _updateCoins(dz, player, powerups, dt) {
    const magnet = powerups.isActive('magnet');
    const px = player.x;
    const py = player.y + 0.8;
    const pz = player.z;

    for (const c of this.coins) {
      if (!c.active) continue;
      c.z += dz;
      c.spin += dt * COINS.spinSpeed;

      if (c.taken > 0) {
        // Collection flourish: pop outward and fade before releasing the slot.
        c.taken -= dt;
        c.scale = Math.max(0, c.taken / 0.18);
        c.y += dt * 5;
        if (c.taken <= 0) c.active = false;
        continue;
      }

      if (magnet) {
        const dx = px - c.x;
        const dy = py - c.y;
        const dzz = pz - c.z;
        const distSq = dx * dx + dy * dy + dzz * dzz;
        if (distSq < COINS.magnetRadius * COINS.magnetRadius) {
          const dist = Math.sqrt(distSq) || 1;
          const step = Math.min(dist, COINS.magnetSpeed * dt);
          c.x += (dx / dist) * step;
          c.y += (dy / dist) * step;
          c.z += (dzz / dist) * step;
        }
      }

      const dx = c.x - px;
      const dy = c.y - py;
      const dzz = c.z - pz;
      if (dx * dx + dy * dy + dzz * dzz < 1.05) {
        c.taken = 0.18;
        if (this.onCoin) this.onCoin();
        continue;
      }

      if (c.z > TRACK.recycleZ) c.active = false;
    }

    this._syncCoins();
  }

  /** Writes coin state into the InstancedMesh matrices. */
  _syncCoins() {
    const d = this._dummy;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.active) {
        d.position.set(c.x, c.y, c.z);
        d.rotation.set(0, c.spin, 0);
        d.scale.setScalar(c.scale);
      } else {
        d.position.copy(HIDDEN);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0);
      }
      d.updateMatrix();
      this.coinMesh.setMatrixAt(i, d.matrix);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }
}

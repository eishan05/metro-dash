import * as THREE from 'three';
import { CAMERA } from '../config.js';

const PARTICLE_COUNT = 160;
const GRAVITY = 22;

/**
 * Pooled particle bursts and camera shake. One InstancedMesh covers every
 * effect in the game; particles that aren't alive are scaled to zero rather
 * than removed, so bursts cost no allocation.
 */
export class Effects {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, PARTICLE_COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        life: 0, maxLife: 1, x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0, size: 1, spin: 0, spinRate: 0,
      });
    }

    this.cursor = 0;
    this.shakeAmount = 0;
    this.shakeOffset = new THREE.Vector3();

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._hidden = new THREE.Vector3(0, -999, 0);
    this._sync();
  }

  _next() {
    // Round-robin: a new burst overwrites the oldest particles when saturated.
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % PARTICLE_COUNT;
    return index;
  }

  burst(x, y, z, { count = 10, color = 0xffffff, speed = 5, spread = 1, life = 0.6, size = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const index = this._next();
      const p = this.particles[index];
      p.life = life * (0.7 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.x = x + (Math.random() - 0.5) * 0.3;
      p.y = y + (Math.random() - 0.5) * 0.3;
      p.z = z + (Math.random() - 0.5) * 0.3;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const v = speed * (0.5 + Math.random() * 0.8);
      p.vx = Math.sin(phi) * Math.cos(theta) * v * spread;
      p.vy = Math.abs(Math.cos(phi)) * v + 2;
      p.vz = Math.sin(phi) * Math.sin(theta) * v * spread;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.spin = Math.random() * Math.PI;
      p.spinRate = (Math.random() - 0.5) * 12;

      this._color.set(color);
      this.mesh.setColorAt(index, this._color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  coinSparkle(x, y, z) {
    this.burst(x, y, z, { count: 4, color: 0xffe27a, speed: 3, life: 0.35, size: 0.55 });
  }

  crash(x, y, z) {
    this.burst(x, y, z, { count: 22, color: 0xf25f5c, speed: 8, life: 0.9, size: 1.3 });
    this.burst(x, y, z, { count: 10, color: 0xffffff, speed: 6, life: 0.7, size: 0.9 });
    this.shake(1.0);
  }

  powerup(x, y, z, color) {
    this.burst(x, y, z, { count: 16, color, speed: 6, life: 0.7, size: 1.1 });
  }

  boardBreak(x, y, z) {
    this.burst(x, y, z, { count: 18, color: 0xff8c42, speed: 7, life: 0.8, size: 1.1 });
    this.shake(0.55);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** @param dz world scroll this step, so particles drift with the track. */
  update(dt, dz) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt + dz;
      p.spin += p.spinRate * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.35;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
    }
    this._sync();

    if (this.shakeAmount > 0.001) {
      this.shakeAmount = Math.max(0, this.shakeAmount - CAMERA.shakeDecay * dt * this.shakeAmount);
      const a = this.shakeAmount * 0.32;
      this.shakeOffset.set(
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a * 0.5
      );
      if (this.shakeAmount < 0.01) {
        this.shakeAmount = 0;
        this.shakeOffset.set(0, 0, 0);
      }
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
  }

  _sync() {
    const d = this._dummy;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        const t = p.life / p.maxLife;
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(p.spin, p.spin * 0.7, 0);
        d.scale.setScalar(p.size * t);
      } else {
        d.position.copy(this._hidden);
        d.scale.setScalar(0);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const p of this.particles) p.life = 0;
    this.shakeAmount = 0;
    this.shakeOffset.set(0, 0, 0);
    this._sync();
  }
}

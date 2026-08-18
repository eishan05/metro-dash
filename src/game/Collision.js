import { PLAYER } from '../config.js';

// Runtime collision. Obstacles register here when they spawn and unregister
// when they recycle, so every query is a scan over the handful of things
// actually near the player rather than the whole world.

const EPS = 1e-3;

export class CollisionWorld {
  constructor() {
    this.entries = [];
  }

  add(entry) {
    this.entries.push(entry);
  }

  remove(entry) {
    const i = this.entries.indexOf(entry);
    if (i !== -1) this.entries.splice(i, 1);
  }

  clear() {
    this.entries.length = 0;
  }

  /** Solid y-span of an entry, or null when it isn't solid (ramps). */
  static solidSpan(spec) {
    if (spec.ramp) return null;
    if (spec.clearance !== undefined) {
      return [spec.clearance, spec.clearance + spec.h];
    }
    return [0, spec.h];
  }

  /**
   * Height of the highest landable surface under a player standing at (x, z).
   * Requires the player's centre to be over the obstacle, so you can't perch on
   * a roof you're only clipping the edge of.
   */
  groundHeight(x, z) {
    let best = 0;
    for (const e of this.entries) {
      const spec = e.spec;
      if (!spec.roof) continue;
      if (Math.abs(x - e.x) > spec.w / 2) continue;
      const z0 = e.z - spec.d / 2;
      const z1 = e.z + spec.d / 2;
      if (z < z0 || z > z1) continue;

      // Ramps climb in the direction of travel: the far (-Z) end is the top.
      const h = spec.ramp ? spec.h * ((z1 - z) / (z1 - z0)) : spec.h;
      if (h > best) best = h;
    }
    return best;
  }

  /**
   * Returns the entry the player box intersects, or null.
   * `y` is the player's feet; `height` shrinks while rolling.
   */
  hitTest(x, y, z, height) {
    const px0 = x - PLAYER.radius;
    const px1 = x + PLAYER.radius;
    const py0 = y;
    const py1 = y + height;
    const pz0 = z - PLAYER.depth / 2;
    const pz1 = z + PLAYER.depth / 2;

    for (const e of this.entries) {
      const spec = e.spec;
      const span = CollisionWorld.solidSpan(spec);
      if (!span) continue;

      const z0 = e.z - spec.d / 2;
      const z1 = e.z + spec.d / 2;
      if (pz1 <= z0 + EPS || pz0 >= z1 - EPS) continue;

      const x0 = e.x - spec.w / 2;
      const x1 = e.x + spec.w / 2;
      if (px1 <= x0 + EPS || px0 >= x1 - EPS) continue;

      if (py1 <= span[0] + EPS || py0 >= span[1] - EPS) continue;

      return e;
    }
    return null;
  }

  /**
   * Classifies a hit so the game can react in kind: clipping the side of a
   * train reads very differently from face-planting a wall, and landing on a
   * roof shouldn't register as either.
   */
  classify(entry, x, y) {
    const spec = entry.spec;
    if (spec.roof && y > spec.h - 0.45) return 'graze';   // scraped the roof lip
    if (Math.abs(x - entry.x) > spec.w * 0.34) return 'side';
    return 'head-on';
  }
}

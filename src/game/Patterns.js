import { OBSTACLES, PLAYER, LANE_COUNT } from '../config.js';

// ---------------------------------------------------------------------------
// Obstacle layouts, plus the validator that proves each one is survivable.
//
// A pattern is a list of items placed on a local "forward" axis `f`, where f=0
// is the edge the player reaches first and f grows in the direction of travel.
// `f` is the CENTRE of the item along that axis.
//
// Because jump height/span and roll distance are constant at every game speed
// (see the PLAYER block in config.js), a pattern that is clearable at 13 u/s is
// clearable at 36 u/s. That is what makes a single static validation pass valid
// for the whole run.
// ---------------------------------------------------------------------------

// --- derived player capabilities -------------------------------------------

export const JUMP_APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * PLAYER.gravity);
export const JUMP_AIRTIME_REF = (2 * PLAYER.jumpVelocity) / PLAYER.gravity;
/** Ground distance covered by one jump - identical at every speed. */
export const JUMP_SPAN = JUMP_AIRTIME_REF * PLAYER.jumpRefSpeed;
export const ROLL_SPAN = PLAYER.rollDistance;

const STEP = 0.5;                                   // validator resolution
const AIR_STEPS = Math.round(JUMP_SPAN / STEP);
const ROLL_STEPS = Math.round(ROLL_SPAN / STEP);
const LANE_COOLDOWN_STEPS = Math.round(4.8 / STEP); // worst-case lane change at top speed
const MAX_STEP_UP = 0.3;                            // steepest slope you can run up per step
const EPS = 1e-3;

// --- geometry helpers -------------------------------------------------------

/** Solid volumes an item occupies: {z0,z1,y0,y1}. Ramps are walkable, not solid. */
function solidsOf(item) {
  const spec = OBSTACLES[item.type];
  const z0 = item.f - spec.d / 2;
  const z1 = item.f + spec.d / 2;
  if (spec.ramp) return [];
  if (spec.clearance !== undefined) {
    return [{ z0, z1, y0: spec.clearance, y1: spec.clearance + spec.h }];
  }
  return [{ z0, z1, y0: 0, y1: spec.h }];
}

/** Height of the landable surface this item offers at forward position f. */
function supportOf(item, f) {
  const spec = OBSTACLES[item.type];
  if (!spec.roof) return 0;
  const z0 = item.f - spec.d / 2;
  const z1 = item.f + spec.d / 2;
  if (f < z0 || f > z1) return 0;
  if (spec.ramp) {
    // Wedge climbing in the direction of travel.
    return spec.h * ((f - z0) / (z1 - z0));
  }
  return spec.h;
}

function laneItems(pattern, lane) {
  return pattern.items.filter((it) => it.lane === lane);
}

/** Tallest surface the player can stand on in this lane at this position. */
export function supportHeight(items, f) {
  let h = 0;
  for (const item of items) h = Math.max(h, supportOf(item, f));
  return h;
}

/** True if a player box at [f±depth/2] x [y, y+height] hits anything. */
function collides(items, f, y, height) {
  const pz0 = f - PLAYER.depth / 2;
  const pz1 = f + PLAYER.depth / 2;
  const py0 = y;
  const py1 = y + height;
  for (const item of items) {
    for (const s of solidsOf(item)) {
      if (pz1 <= s.z0 + EPS || pz0 >= s.z1 - EPS) continue;
      if (py1 <= s.y0 + EPS || py0 >= s.y1 - EPS) continue;
      return true;
    }
  }
  return false;
}

/** Jump arc: constant apex, constant span, so progress alone gives the height. */
function arcHeight(elapsedSteps) {
  const t = elapsedSteps / AIR_STEPS;
  return JUMP_APEX * 4 * t * (1 - t);
}

// --- reachability search -----------------------------------------------------

/**
 * Breadth-first search over (position, lane, vertical state) proving at least
 * one route exists through the pattern. Catches the authoring mistake that
 * matters most: a layout with no survivable line at all.
 *
 * Conservative on purpose - it models a lane change as costing a cooldown and
 * never lets the player act mid-roll, so anything it approves is comfortably
 * clearable by a human with better timing than the search assumes.
 */
export function isSolvable(pattern) {
  const lanes = [];
  for (let l = 0; l < LANE_COUNT; l++) lanes.push(laneItems(pattern, l));

  const startF = -6;
  const endF = pattern.length + 6;
  const totalSteps = Math.round((endF - startF) / STEP);

  const key = (step, lane, air, roll, base, cd) =>
    `${step}|${lane}|${air}|${roll}|${Math.round(base * 20)}|${cd}`;

  const start = {
    step: 0, lane: 1, air: -1, airBase: 0, roll: 0, base: 0, cd: 0,
  };
  const queue = [start];
  const seen = new Set([key(0, 1, -1, 0, 0, 0)]);

  while (queue.length) {
    const st = queue.shift();
    if (st.step >= totalSteps) return true;

    const f = startF + st.step * STEP;
    const items = lanes[st.lane];

    // Where is the player vertically right now?
    const airborne = st.air >= 0;
    const y = airborne ? st.airBase + arcHeight(st.air) : st.base;
    const height = st.roll > 0 ? PLAYER.rollHeight : PLAYER.height;

    if (collides(items, f, y, height)) continue;

    const nextStep = st.step + 1;
    const nextF = f + STEP;
    const cd = Math.max(0, st.cd - 1);

    // Options available from this state.
    const moves = [];
    if (airborne) {
      moves.push({ kind: 'air' });
      moves.push({ kind: 'fastfall' });
    } else if (st.roll > 0) {
      moves.push({ kind: 'roll' });
    } else {
      moves.push({ kind: 'run' });
      moves.push({ kind: 'jump' });
      moves.push({ kind: 'startRoll' });
    }
    if (cd === 0) {
      if (st.lane > 0) moves.push({ kind: 'left' });
      if (st.lane < LANE_COUNT - 1) moves.push({ kind: 'right' });
    }

    for (const move of moves) {
      let lane = st.lane;
      let air = st.air;
      let airBase = st.airBase;
      let roll = st.roll;
      let base = st.base;
      let newCd = cd;

      switch (move.kind) {
        case 'run':
          break;
        case 'jump':
          air = 0;
          airBase = st.base;
          break;
        case 'startRoll':
          roll = ROLL_STEPS;
          break;
        case 'roll':
          roll = st.roll - 1;
          break;
        case 'air':
          air = st.air + 1;
          break;
        case 'fastfall':
          air = AIR_STEPS;   // cut the arc short
          break;
        case 'left':
          lane = st.lane - 1;
          newCd = LANE_COOLDOWN_STEPS;
          break;
        case 'right':
          lane = st.lane + 1;
          newCd = LANE_COOLDOWN_STEPS;
          break;
      }

      const nextItems = lanes[lane];
      const ground = supportHeight(nextItems, nextF);

      if (air >= 0) {
        const yNow = airBase + arcHeight(air);
        const descending = air > AIR_STEPS / 2;
        if (air >= AIR_STEPS || (descending && yNow <= ground + EPS)) {
          // Touch down - but only onto a surface the arc actually cleared. `y`
          // is the height before this step; without this guard a jump that
          // never rose above a train could still "land" on its roof.
          if (y < ground - EPS) continue;
          air = -1;
          base = ground;
        }
      } else if (ground < st.base) {
        // Walked off the edge of a roof: drop to the surface below. Falling is
        // never fatal in itself, so the search treats it as a free transition.
        base = ground;
      } else {
        // Rising while grounded is only possible up a walkable slope (a ramp).
        // Running into the flank of a train must NOT lift the player onto its
        // roof - it has to register as the crash it is.
        base = Math.min(ground, st.base + MAX_STEP_UP);
      }

      const k = key(nextStep, lane, air, roll, base, newCd);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ step: nextStep, lane, air, airBase, roll, base, cd: newCd });
    }
  }
  return false;
}

/** Lanes with no solid obstacle anywhere in the pattern - safe for coin runs. */
export function freeLanes(pattern) {
  const result = [];
  for (let l = 0; l < LANE_COUNT; l++) {
    const items = laneItems(pattern, l);
    if (items.every((it) => solidsOf(it).length === 0)) result.push(l);
  }
  return result;
}

// --- the pattern library -----------------------------------------------------
// `difficulty` is the point on the 0..1 ramp where the pattern starts showing
// up; `weight` is its relative frequency once unlocked.

const RAW_PATTERNS = [
  { id: 'lone-jump',    difficulty: 0,    weight: 3, length: 4,
    items: [{ lane: 1, type: 'barrierLow', f: 1 }] },

  { id: 'lone-roll',    difficulty: 0.04, weight: 3, length: 4,
    items: [{ lane: 1, type: 'barrierTop', f: 1 }] },

  { id: 'side-hurdles', difficulty: 0.06, weight: 3, length: 4,
    items: [{ lane: 0, type: 'barrierLow', f: 1 }, { lane: 2, type: 'barrierLow', f: 1 }] },

  { id: 'pair-left',    difficulty: 0.1,  weight: 3, length: 4,
    items: [{ lane: 0, type: 'barrierLow', f: 1 }, { lane: 1, type: 'barrierTop', f: 1 }] },

  { id: 'short-train',  difficulty: 0.12, weight: 3, length: 11,
    items: [{ lane: 0, type: 'trainShort', f: 5 }] },

  { id: 'wall-single',  difficulty: 0.15, weight: 2, length: 4,
    items: [{ lane: 2, type: 'barrierFull', f: 1 }] },

  { id: 'train-solo',   difficulty: 0.2,  weight: 3, length: 20,
    items: [{ lane: 1, type: 'trainLow', f: 10 }] },

  { id: 'roll-gate',    difficulty: 0.22, weight: 2, length: 4,
    items: [{ lane: 0, type: 'barrierTop', f: 1 }, { lane: 2, type: 'barrierTop', f: 1 }] },

  { id: 'train-pair',   difficulty: 0.28, weight: 3, length: 20,
    items: [{ lane: 0, type: 'trainLow', f: 10 }, { lane: 1, type: 'trainLow', f: 10 }] },

  { id: 'stagger',      difficulty: 0.3,  weight: 3, length: 36,
    items: [
      { lane: 0, type: 'barrierLow', f: 1 },
      { lane: 2, type: 'barrierTop', f: 17 },
      { lane: 1, type: 'barrierLow', f: 33 },
    ] },

  { id: 'ramp-onto',    difficulty: 0.34, weight: 3, length: 24,
    items: [
      { lane: 1, type: 'ramp', f: 2 },
      { lane: 1, type: 'trainLow', f: 13 },
    ] },

  { id: 'high-walls',   difficulty: 0.38, weight: 3, length: 28,
    items: [{ lane: 0, type: 'trainHigh', f: 13 }, { lane: 2, type: 'trainHigh', f: 13 }] },

  { id: 'weave',        difficulty: 0.42, weight: 3, length: 40,
    items: [
      { lane: 0, type: 'barrierFull', f: 1 },
      { lane: 1, type: 'barrierFull', f: 1 },
      { lane: 1, type: 'barrierFull', f: 21 },
      { lane: 2, type: 'barrierFull', f: 21 },
    ] },

  { id: 'roof-run',     difficulty: 0.46, weight: 3, length: 22,
    items: [
      { lane: 1, type: 'trainLow', f: 10 },
      { lane: 0, type: 'barrierLow', f: 3 },
      { lane: 2, type: 'barrierTop', f: 3 },
    ] },

  { id: 'train-maze',   difficulty: 0.5,  weight: 3, length: 30,
    items: [
      { lane: 0, type: 'trainLow', f: 10 },
      { lane: 1, type: 'trainHigh', f: 14 },
    ] },

  { id: 'roof-hop',     difficulty: 0.56, weight: 2, length: 44,
    items: [
      { lane: 1, type: 'ramp', f: 2 },
      { lane: 1, type: 'trainLow', f: 13 },
      { lane: 1, type: 'trainLow', f: 34 },
      { lane: 0, type: 'barrierFull', f: 24 },
    ] },

  { id: 'gauntlet',     difficulty: 0.62, weight: 3, length: 40,
    items: [
      { lane: 0, type: 'barrierLow', f: 1 },
      { lane: 1, type: 'barrierTop', f: 1 },
      { lane: 2, type: 'barrierFull', f: 1 },
      { lane: 0, type: 'barrierFull', f: 21 },
      { lane: 1, type: 'barrierLow', f: 21 },
      { lane: 2, type: 'barrierTop', f: 21 },
    ] },

  { id: 'twin-high',    difficulty: 0.66, weight: 3, length: 32,
    items: [
      { lane: 0, type: 'trainHigh', f: 14 },
      { lane: 1, type: 'trainLow', f: 10 },
    ] },

  { id: 'squeeze',      difficulty: 0.72, weight: 3, length: 46,
    items: [
      { lane: 1, type: 'trainHigh', f: 14 },
      { lane: 2, type: 'barrierLow', f: 3 },
      { lane: 0, type: 'barrierTop', f: 3 },
      { lane: 0, type: 'barrierLow', f: 24 },
      { lane: 2, type: 'trainShort', f: 30 },
    ] },

  { id: 'long-haul',    difficulty: 0.78, weight: 3, length: 48,
    items: [
      { lane: 0, type: 'trainHigh', f: 14 },
      { lane: 1, type: 'trainHigh', f: 14 },
      { lane: 2, type: 'barrierLow', f: 6 },
      { lane: 2, type: 'barrierTop', f: 24 },
      { lane: 1, type: 'barrierLow', f: 40 },
    ] },

  { id: 'final-run',    difficulty: 0.85, weight: 2, length: 52,
    items: [
      { lane: 0, type: 'barrierFull', f: 1 },
      { lane: 1, type: 'ramp', f: 3 },
      { lane: 1, type: 'trainLow', f: 14 },
      { lane: 2, type: 'trainHigh', f: 16 },
      { lane: 0, type: 'trainShort', f: 34 },
      { lane: 1, type: 'barrierTop', f: 40 },
    ] },
];

/** Mirrored copy (lane 0 <-> 2) - doubles the library for free. */
export function mirrorPattern(pattern) {
  return {
    ...pattern,
    id: `${pattern.id}-m`,
    items: pattern.items.map((it) => ({ ...it, lane: LANE_COUNT - 1 - it.lane })),
  };
}

// Validate at load. A pattern that fails is dropped rather than shipped, so a
// bad edit degrades variety instead of producing an unwinnable run.
export const PATTERNS = [];
const REJECTED = [];

for (const pattern of RAW_PATTERNS) {
  if (isSolvable(pattern)) {
    PATTERNS.push({ ...pattern, free: freeLanes(pattern) });
  } else {
    REJECTED.push(pattern.id);
  }
}

if (REJECTED.length && typeof console !== 'undefined') {
  console.warn('[Patterns] dropped unsolvable layouts:', REJECTED.join(', '));
}

/**
 * Weighted pick from the patterns unlocked at this difficulty, with a bias
 * toward the harder end of the unlocked set so the run keeps escalating.
 */
export function pickPattern(difficulty, random = Math.random) {
  const available = PATTERNS.filter((p) => p.difficulty <= difficulty + 0.001);
  const pool = available.length ? available : [PATTERNS[0]];

  let total = 0;
  const weights = pool.map((p) => {
    // Recently-unlocked patterns weigh more than ones long since mastered.
    const age = difficulty - p.difficulty;
    const recency = 1 / (1 + age * 1.6);
    const w = p.weight * (0.35 + recency);
    total += w;
    return w;
  });

  let roll = random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      const chosen = pool[i];
      return random() < 0.5 ? { ...mirrorPattern(chosen), free: freeLanes(mirrorPattern(chosen)) } : chosen;
    }
  }
  return pool[pool.length - 1];
}

// ---------------------------------------------------------------------------
// Every tunable in the game lives here. Tweak these to change how it feels.
// World axis convention: the track runs along Z. "Forward" (the direction the
// player faces) is -Z. Obstacles spawn far down -Z and travel toward +Z past
// the camera, which sits behind the player at +Z.
// ---------------------------------------------------------------------------

export const LANES = [-2.3, 0, 2.3];
export const LANE_COUNT = LANES.length;

export const TRACK = {
  segmentLength: 20,      // world units per recycled track segment
  segmentCount: 14,       // segments alive at once -> 280 units of visible track
  spawnZ: -240,           // where new content enters the world
  recycleZ: 24,           // past the camera; anything beyond gets pooled
  railGauge: 1.5,
  groundWidth: 15,        // trench floor - narrow, so the rails fill the frame
  streetLevel: 2.4,       // top of the trench wall; the city sits up here
};

export const SPEED = {
  min: 13,                // starting forward speed (units/sec)
  max: 36,                // asymptotic top speed
  rampDistance: 850,      // larger = slower difficulty ramp
  // speed(d) = max - (max - min) * exp(-d / rampDistance)
};

export const PLAYER = {
  z: 0,                   // player never moves along Z; the world moves instead
  radius: 0.34,
  depth: 0.7,             // hitbox length along Z
  height: 1.62,
  rollHeight: 0.78,
  laneSwitchTime: 0.13,

  // Jump physics are speed-scaled. With velocity scaled by `s` and gravity by
  // `s^2`, the apex stays fixed while airtime shrinks - so a jump always covers
  // the SAME ground distance and always clears the same height, at 13 u/s or at
  // 36 u/s. Without this, a top-speed jump would sail clean over an 18-unit
  // train instead of landing on its roof, and every pattern would need
  // re-tuning per speed band.
  gravity: 38,            // at the reference speed
  jumpVelocity: 13.6,     // -> apex 2.43u, airtime 0.72s at reference speed
  jumpRefSpeed: 18,       // speed at which the raw numbers above apply
  jumpScaleMin: 0.72,
  jumpScaleMax: 2.2,
  fastFallVelocity: -26,

  // Roll is likewise distance-based, not time-based.
  rollDistance: 9,        // world units covered by one roll
  rollTimeMin: 0.24,
  rollTimeMax: 0.8,
  // A crash inside this window after the previous one is ignored, so a single
  // impact can never burn a hoverboard AND end the run on consecutive frames.
  crashGrace: 0.6,
  startLane: 1,
};

export const INPUT = {
  bufferTime: 0.16,       // queued action stays live this long
  swipeThreshold: 28,     // px before a drag counts as a swipe
  doubleTapTime: 0.32,
};

// Obstacle archetypes. `roof` marks a surface the player can land on and run
// along; `clearance` marks a gap underneath that a roll fits through.
export const OBSTACLES = {
  trainLow:   { w: 2.05, h: 2.0,  d: 18, roof: true,  color: 0xe8514a, accent: 0xf7ede0 },
  trainHigh:  { w: 2.05, h: 3.05, d: 26, roof: true,  color: 0x4a90d9, accent: 0xdfe8f2 },
  trainShort: { w: 2.05, h: 2.0,  d: 9,  roof: true,  color: 0x54b06b, accent: 0xf2f2f2 },
  barrierLow: { w: 2.0,  h: 0.85, d: 0.6, roof: false, color: 0xf2a03d, accent: 0x2f3640 },
  barrierTop: { w: 2.0,  h: 1.1,  d: 0.6, roof: false, color: 0xf25f5c, accent: 0x2f3640,
                clearance: 1.15 },   // sits above the gap: roll under it
  barrierFull:{ w: 2.0,  h: 3.2,  d: 0.6, roof: false, color: 0x8e6ec8, accent: 0x2f3640 },
  ramp:       { w: 2.0,  h: 2.0,  d: 4.0, roof: true,  color: 0xf7d154, accent: 0x2f3640,
                ramp: true },
};

export const COINS = {
  radius: 0.34,
  thickness: 0.09,
  spacing: 2.0,           // gap between coins in a run of them
  hoverHeight: 1.0,
  spinSpeed: 2.4,
  magnetRadius: 7.5,
  magnetSpeed: 26,
  value: 1,
  score: 12,              // score points awarded per coin (before multiplier)
};

export const POWERUPS = {
  spawnChance: 0.16,      // chance a pattern slot hosts a pickup
  magnet:   { duration: 9,  color: 0xe4453f, label: 'Magnet' },
  double:   { duration: 12, color: 0xf7d154, label: '2x Score' },
  jetpack:  { duration: 6.5,color: 0x4ec5e0, label: 'Jetpack' },
  sneakers: { duration: 10, color: 0x6ecf68, label: 'Sneakers' },
};

export const JETPACK = {
  // Comfortably above the tallest train (3.05) but under the tunnel ribs
  // (6.47), so a jetpack run never clips the scenery.
  flyHeight: 4.6,
  riseSpeed: 9,
  fallSpeed: 12,
  coinArcSpacing: 2.4,
};

export const HOVERBOARD = {
  duration: 30,
  height: 0.22,           // board lifts the player slightly
  cooldownAfterBreak: 0,
};

export const SCORE = {
  perUnit: 1.0,           // score per world unit travelled
  comboWindow: 1.2,       // coins collected within this window keep the pitch rising
};

export const SPAWN = {
  minGapUnits: 15,        // gap between patterns at full difficulty
  maxGapUnits: 30,        // gap between patterns at the start of a run
  // Difficulty blends from easy patterns to hard ones over this distance.
  difficultyDistance: 1600,
  safeStartDistance: 60,  // no obstacles for the first stretch of a run
};

export const CAMERA = {
  fov: 58,
  fovSpeedKick: 10,       // extra FOV degrees at top speed
  offset: { x: 0, y: 4.0, z: 7.6 },
  lookAhead: -13,
  lateralLerp: 6.5,       // how fast the camera slides to the player's lane
  heightLerp: 4.0,
  shakeDecay: 4.5,
};

export const PALETTE = {
  sky: 0x8fd3f4,
  fog: 0x9fdcf7,
  ground: 0x7d8a9c,
  ballast: 0x4e5966,
  sleeper: 0x6d5844,
  rail: 0xb9c2cc,
  wallA: 0xc9d6e0,
  wallB: 0xa9bccd,
  buildings: [
    0xf2e4cc, 0xd8b79a, 0xa8c6b4, 0xe8b7a0, 0xb9c9e6,
    0xcbd6dd, 0xe0cbe4, 0xf0d9a8, 0x9fb8cc,
  ],
  player: { skin: 0xf2c49b, shirt: 0x2ec4b6, pants: 0x2f4858, shoes: 0xf25f5c, hair: 0x3a2a1f },
};

export const QUALITY = {
  targetFps: 55,
  sampleFrames: 90,       // frames averaged before considering a quality step
  levels: [
    { name: 'high',   pixelRatio: 2.0, shadows: true,  shadowMap: 2048, scenery: 1.0 },
    { name: 'medium', pixelRatio: 1.5, shadows: true,  shadowMap: 1024, scenery: 0.7 },
    { name: 'low',    pixelRatio: 1.0, shadows: false, shadowMap: 512,  scenery: 0.45 },
  ],
};

export const PHYSICS_STEP = 1 / 60;
export const MAX_FRAME_DT = 0.1;   // clamp so a backgrounded tab can't spiral

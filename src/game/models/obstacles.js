import * as THREE from 'three';
import { OBSTACLES } from '../../config.js';
import { mergeColored, boxPart } from './merge.js';

// Every obstacle is built once as a single merged, vertex-coloured mesh, then
// cloned for the pool. Clones share geometry and material, so twenty trains on
// screen cost twenty draw calls rather than ~280.

const GLASS = 0x2b3a4a;
const DARK = 0x2f3640;

/** Subway car. `d` is its length; the roof is a flat surface you can land on. */
function buildTrain(spec) {
  const parts = [];
  const { w, h, d, color, accent } = spec;

  boxPart(parts, w, h * 0.86, d, 0, h * 0.5, 0, color);
  boxPart(parts, w * 0.92, h * 0.16, d * 0.99, 0, h * 0.95, 0, accent);

  // Window band and livery stripe down both flanks.
  for (const side of [-1, 1]) {
    boxPart(parts, 0.07, h * 0.3, d * 0.78, side * (w / 2), h * 0.62, 0, GLASS);
    boxPart(parts, 0.06, h * 0.09, d * 0.95, side * (w / 2), h * 0.34, 0, accent);
  }

  // Front cap with windscreen and headlights - the face you meet head-on.
  boxPart(parts, w * 0.98, h * 0.84, 0.12, 0, h * 0.48, -d / 2, accent);
  boxPart(parts, w * 0.62, h * 0.26, 0.1, 0, h * 0.66, -d / 2 - 0.06, GLASS);
  for (const side of [-1, 1]) {
    boxPart(parts, 0.2, 0.14, 0.1, side * w * 0.28, h * 0.26, -d / 2 - 0.06, 0xfff3c4);
  }

  // Undercarriage skirt.
  boxPart(parts, w * 0.9, h * 0.14, d * 0.96, 0, h * 0.07, 0, DARK);

  // Roof vents give the landing surface texture to read speed against.
  const vents = Math.max(2, Math.round(d / 5));
  for (let i = 0; i < vents; i++) {
    const t = (i + 0.5) / vents - 0.5;
    boxPart(parts, w * 0.34, 0.08, 0.5, 0, h * 1.04, t * d * 0.85, 0x8d99a6);
  }
  return mergeColored(parts);
}

/** Low hurdle - jump it. Road-barrier styling reads as "go over". */
function buildBarrierLow(spec) {
  const parts = [];
  const { w, h, d, color, accent } = spec;

  boxPart(parts, w, h * 0.62, d, 0, h * 0.66, 0, color);
  for (const i of [-1, 0, 1]) {
    boxPart(parts, w * 0.19, h * 0.62, d + 0.05, i * w * 0.3, h * 0.66, 0, 0xf7f3ea);
  }
  boxPart(parts, w + 0.1, h * 0.16, d + 0.12, 0, h, 0, accent);
  for (const side of [-1, 1]) {
    boxPart(parts, 0.16, h * 0.42, 0.18, side * w * 0.36, h * 0.21, 0, accent);
  }
  boxPart(parts, w * 0.92, 0.1, 0.62, 0, 0.05, 0, accent);
  return mergeColored(parts);
}

/** Overhead beam - roll under it. Floats above a clearance gap. */
function buildBarrierTop(spec) {
  const parts = [];
  const { w, h, d, color, accent, clearance } = spec;

  boxPart(parts, w, h, d, 0, clearance + h / 2, 0, color);
  boxPart(parts, w, 0.12, d + 0.18, 0, clearance + 0.06, 0, accent);
  for (const side of [-1, 1]) {
    boxPart(parts, 0.12, clearance, 0.12, side * (w / 2 - 0.06), clearance / 2, 0, accent);
  }
  for (const i of [-1.6, -0.55, 0.55, 1.6]) {
    boxPart(parts, w * 0.16, h * 0.9, 0.06, i * w * 0.19, clearance + h / 2, -d / 2 - 0.03, 0xf7f3ea);
  }
  boxPart(parts, w * 0.94, 0.1, 0.1, 0, clearance + 0.13, -d / 2 - 0.06, 0xfff3c4);
  return mergeColored(parts);
}

/** Full-height wall - the lane is simply closed. */
function buildBarrierFull(spec) {
  const parts = [];
  const { w, h, d, color, accent } = spec;

  boxPart(parts, w, h, d, 0, h / 2, 0, color);
  for (const y of [h * 0.25, h * 0.55, h * 0.85]) {
    boxPart(parts, w + 0.08, 0.14, d + 0.08, 0, y, 0, accent);
  }
  boxPart(parts, w + 0.12, 0.18, d + 0.12, 0, h, 0, accent);
  // Hazard chevrons on the face so it's unmistakable at distance.
  for (const i of [-1, 1]) {
    boxPart(parts, w * 0.3, h * 0.16, 0.06, i * w * 0.24, h * 0.4, -d / 2 - 0.04, 0xf7f3ea);
  }
  return mergeColored(parts);
}

/** Wedge that launches the player up onto train roofs. */
function buildRamp(spec) {
  const { w, h, d, color, accent } = spec;

  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(d / 2, h);
  shape.lineTo(-d / 2, 0);
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  wedge.rotateY(Math.PI / 2);
  wedge.translate(w / 2, 0, 0);
  wedge.computeVertexNormals();

  const parts = [{ geo: wedge, color }];
  boxPart(parts, w + 0.06, 0.1, 0.4, 0, h, d / 2 - 0.2, accent);
  // Grip bars up the slope.
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    boxPart(parts, w * 0.9, 0.06, 0.22, 0, h * t + 0.04, -d / 2 + t * d, accent);
  }
  return mergeColored(parts);
}

const builders = {
  trainLow: buildTrain,
  trainHigh: buildTrain,
  trainShort: buildTrain,
  barrierLow: buildBarrierLow,
  barrierTop: buildBarrierTop,
  barrierFull: buildBarrierFull,
  ramp: buildRamp,
};

const prototypes = new Map();
let sharedMaterial = null;

/** Returns a fresh instance of the given obstacle type (a cheap clone). */
export function createObstacle(type) {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  if (!prototypes.has(type)) {
    const spec = OBSTACLES[type];
    if (!spec) throw new Error(`Unknown obstacle type: ${type}`);
    const mesh = new THREE.Mesh(builders[type](spec), sharedMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    prototypes.set(type, mesh);
  }
  const instance = prototypes.get(type).clone();
  instance.userData.type = type;
  return instance;
}

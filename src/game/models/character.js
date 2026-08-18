import * as THREE from 'three';
import { PALETTE, PLAYER } from '../../config.js';

// A blocky low-poly runner assembled from boxes, with pivot groups at the
// shoulders and hips so the run cycle can be driven procedurally. Nothing is
// loaded from disk - the whole character is ~20 primitives.

function box(w, h, d, color, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color, ...opts });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Builds the runner. The group's origin sits at the character's feet so the
 * caller can position it directly on whatever ground height it's standing on.
 */
export function createCharacter() {
  const group = new THREE.Group();
  const C = PALETTE.player;

  // Torso -------------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  group.add(torso);

  const chest = box(0.56, 0.6, 0.34, C.shirt);
  torso.add(chest);

  // A backpack reads instantly as "runner" from the chase camera.
  const pack = box(0.4, 0.42, 0.2, 0xf25f5c);
  pack.position.set(0, -0.02, 0.24);
  torso.add(pack);
  const packStrap = box(0.44, 0.08, 0.02, 0x2f4858);
  packStrap.position.set(0, 0.16, 0.35);
  torso.add(packStrap);

  const hips = box(0.5, 0.22, 0.32, C.pants);
  hips.position.y = -0.4;
  torso.add(hips);

  // Head --------------------------------------------------------------------
  const head = new THREE.Group();
  head.position.y = 0.52;
  torso.add(head);

  const skull = box(0.42, 0.4, 0.38, C.skin);
  head.add(skull);

  const hair = box(0.44, 0.14, 0.4, C.hair);
  hair.position.y = 0.2;
  head.add(hair);

  const capBrim = box(0.44, 0.05, 0.18, 0x2ec4b6);
  capBrim.position.set(0, 0.16, -0.26);
  head.add(capBrim);

  const eyeGeo = new THREE.BoxGeometry(0.07, 0.09, 0.03);
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222b36 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 0.02, -0.2);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  head.add(eyeL, eyeR);

  // Limbs -------------------------------------------------------------------
  // Each limb hangs off a pivot group positioned at the joint, so animating is
  // just a rotation.x on the pivot.
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 0.22, 0);
    const upper = box(0.16, 0.46, 0.16, C.shirt);
    upper.position.y = -0.23;
    const hand = box(0.17, 0.16, 0.17, C.skin);
    hand.position.y = -0.5;
    pivot.add(upper, hand);
    torso.add(pivot);
    return pivot;
  }

  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, -0.48, 0);
    const upper = box(0.2, 0.5, 0.2, C.pants);
    upper.position.y = -0.25;
    const shoe = box(0.22, 0.14, 0.32, C.shoes);
    shoe.position.set(0, -0.55, -0.05);
    pivot.add(upper, shoe);
    torso.add(pivot);
    return pivot;
  }

  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  group.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });

  return {
    group,
    parts: { torso, head, armL, armR, legL, legR, chest, pack },
    height: PLAYER.height,
  };
}

/**
 * Drives the run cycle. `phase` advances with distance travelled so the stride
 * naturally speeds up with the game, and `airborne`/`rolling` swap in poses.
 */
export function animateCharacter(rig, { phase, airborne, rolling, speedRatio, dt }) {
  const { torso, head, armL, armR, legL, legR } = rig.parts;
  const lerp = (a, b, t) => a + (b - a) * t;
  const k = Math.min(1, dt * 16);

  if (rolling) {
    // Tucked ball: limbs pulled in, torso curled forward.
    torso.rotation.x = lerp(torso.rotation.x, 1.15, k);
    torso.position.y = lerp(torso.position.y, 0.42, k);
    legL.rotation.x = lerp(legL.rotation.x, -1.5, k);
    legR.rotation.x = lerp(legR.rotation.x, -1.5, k);
    armL.rotation.x = lerp(armL.rotation.x, -2.4, k);
    armR.rotation.x = lerp(armR.rotation.x, -2.4, k);
    head.rotation.x = lerp(head.rotation.x, -0.5, k);
    return;
  }

  if (airborne) {
    torso.rotation.x = lerp(torso.rotation.x, 0.12, k);
    torso.position.y = lerp(torso.position.y, 0.95, k);
    legL.rotation.x = lerp(legL.rotation.x, -0.85, k);
    legR.rotation.x = lerp(legR.rotation.x, 0.45, k);
    armL.rotation.x = lerp(armL.rotation.x, -2.1, k);
    armR.rotation.x = lerp(armR.rotation.x, -1.7, k);
    head.rotation.x = lerp(head.rotation.x, 0, k);
    return;
  }

  // Grounded run cycle.
  const swing = Math.sin(phase);
  const swing2 = Math.cos(phase * 2);
  const amp = 0.65 + speedRatio * 0.35;

  legL.rotation.x = swing * amp;
  legR.rotation.x = -swing * amp;
  armL.rotation.x = -swing * amp * 0.9;
  armR.rotation.x = swing * amp * 0.9;

  torso.rotation.x = lerp(torso.rotation.x, 0.14 + speedRatio * 0.1, k);
  torso.position.y = 0.95 + swing2 * 0.035;
  head.rotation.x = lerp(head.rotation.x, -0.08, k);
}

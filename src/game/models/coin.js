import * as THREE from 'three';
import { COINS, POWERUPS } from '../../config.js';

// Coins are the highest-count object in the scene, so they render as a single
// InstancedMesh - one draw call regardless of how many are on screen.

export function createCoinInstancedMesh(capacity) {
  const geo = new THREE.CylinderGeometry(COINS.radius, COINS.radius, COINS.thickness, 14);
  // Stand the disc up so its face points down the track, then spinning the
  // instance around Y gives the classic flipping-coin read.
  geo.rotateX(Math.PI / 2);

  const mat = new THREE.MeshLambertMaterial({
    color: 0xf7d154,
    emissive: 0x6b5310,
  });

  const inst = new THREE.InstancedMesh(geo, mat, capacity);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.castShadow = false;      // hundreds of tiny shadows aren't worth the cost
  inst.receiveShadow = false;
  inst.frustumCulled = false;   // instances span the whole visible track
  inst.count = capacity;
  return inst;
}

function glowShell(color, radius) {
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 1),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.16, depthWrite: false,
    })
  );
  return shell;
}

/** Distinct silhouettes so a pickup is identifiable before you read its colour. */
function buildIcon(type, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.45) });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2f3640 });

  if (type === 'magnet') {
    const horseshoe = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.11, 8, 16, Math.PI), mat
    );
    horseshoe.rotation.z = Math.PI;
    g.add(horseshoe);
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 8), dark);
      tip.position.set(side * 0.3, 0.09, 0);
      g.add(tip);
    }
  } else if (type === 'double') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat);
    g.add(core);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 18), dark);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  } else if (type === 'jetpack') {
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), mat);
      tank.position.x = side * 0.15;
      g.add(tank);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 10), dark);
      nose.position.set(side * 0.15, 0.33, 0);
      g.add(nose);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      flame.position.set(side * 0.15, -0.35, 0);
      flame.rotation.x = Math.PI;
      g.add(flame);
    }
  } else { // sneakers
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.28), mat);
    g.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.32), dark);
    sole.position.y = -0.13;
    g.add(sole);
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    wing.rotation.z = Math.PI / 2;
    wing.position.set(-0.32, 0.06, 0);
    g.add(wing);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const pickupPrototypes = new Map();

/** Returns a pickup instance for one of the POWERUPS keys. */
export function createPickup(type) {
  if (!pickupPrototypes.has(type)) {
    const color = POWERUPS[type].color;
    const g = new THREE.Group();
    const icon = buildIcon(type, color);
    icon.scale.setScalar(1.45);      // readable from a lane away
    g.add(icon);
    g.add(glowShell(color, 0.95));
    pickupPrototypes.set(type, g);
  }
  const instance = pickupPrototypes.get(type).clone(true);
  instance.userData.powerup = type;
  return instance;
}

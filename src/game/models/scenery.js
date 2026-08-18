import * as THREE from 'three';
import { LANES, TRACK, PALETTE } from '../../config.js';
import { mergeColored, boxPart } from './merge.js';

// Static world dressing. Everything a track segment contains - ground, ballast,
// sleepers, rails, walls, lamp posts - is merged into a single vertex-coloured
// geometry, so a segment costs one draw call instead of ~60.

let segmentGeometry = null;
let segmentMaterial = null;

/**
 * One length of track, origin at its centre. Segments are identical by design -
 * repeating sleepers and rails are what real track looks like. Variety comes
 * from the building field and the obstacles on top.
 */
export function createTrackSegment(length = TRACK.segmentLength) {
  if (!segmentGeometry) {
    const parts = [];
    const halfW = TRACK.groundWidth / 2;

    // Base ground slab.
    boxPart(parts, TRACK.groundWidth, 0.4, length, 0, -0.2, 0, PALETTE.ground);

    for (const laneX of LANES) {
      // Ballast bed.
      boxPart(parts, 1.92, 0.14, length, laneX, -0.03, 0, PALETTE.ballast);

      // Sleepers.
      const spacing = 1.3;
      const count = Math.round(length / spacing);
      for (let i = 0; i < count; i++) {
        const z = -length / 2 + (i + 0.5) * (length / count);
        boxPart(parts, 1.78, 0.1, 0.32, laneX, 0.06, z, PALETTE.sleeper);
      }

      // Rails.
      for (const side of [-1, 1]) {
        boxPart(parts, 0.11, 0.14, length, laneX + side * (TRACK.railGauge / 2), 0.14, 0, PALETTE.rail);
      }
    }

    // The track sits in a trench: retaining walls rise to street level, and the
    // city runs along the top. Without the street deck the camera would see
    // straight over the walls into empty sky.
    const street = TRACK.streetLevel;
    for (const side of [-1, 1]) {
      boxPart(parts, 0.7, street, length, side * halfW, street / 2, 0, PALETTE.wallA);
      boxPart(parts, 0.95, 0.3, length, side * halfW, street + 0.15, 0, PALETTE.wallB);

      // Wall dressing: a colour band and regular pilasters stop the retaining
      // wall reading as one big flat grey plane as it rushes past.
      boxPart(parts, 0.78, 0.34, length, side * halfW, street * 0.62, 0, PALETTE.wallB);
      const pilasters = 4;
      for (let i = 0; i < pilasters; i++) {
        const z = -length / 2 + (i + 0.5) * (length / pilasters);
        boxPart(parts, 0.86, street * 0.96, 0.55, side * halfW, street * 0.48, z, 0xb6c2cd);
      }

      // Service walkway between the outer rail and the wall.
      boxPart(parts, 2.6, 0.16, length, side * (halfW - 1.5), 0.06, 0, 0x8b96a4);
      boxPart(parts, 0.14, 0.22, length, side * (halfW - 2.75), 0.11, 0, 0xa4aebb);

      // Street deck stretching away from the trench.
      boxPart(parts, 52, 0.4, length, side * (halfW + 26), street - 0.2, 0, 0x9aa6b2);
      // Kerb line for a bit of edge definition.
      boxPart(parts, 0.5, 0.16, length, side * (halfW + 1.1), street + 0.08, 0, 0xc3ccd6);

      // Lamp post on the street, one per segment.
      const lx = side * (halfW + 1.6);
      boxPart(parts, 0.18, 4.0, 0.18, lx, street + 2.0, -length / 2 + 3, 0x4a5765);
      boxPart(parts, 0.7, 0.2, 0.7, lx, street + 4.05, -length / 2 + 3, 0xfff3c4);

      // Railing posts along the trench edge.
      const posts = 5;
      for (let i = 0; i < posts; i++) {
        const z = -length / 2 + (i + 0.5) * (length / posts);
        boxPart(parts, 0.1, 0.9, 0.1, side * (halfW + 0.55), street + 0.6, z, 0x6e7a88);
      }
      boxPart(parts, 0.12, 0.1, length, side * (halfW + 0.55), street + 1.0, 0, 0x6e7a88);
    }

    segmentGeometry = mergeColored(parts);
    segmentMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  const mesh = new THREE.Mesh(segmentGeometry, segmentMaterial);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/**
 * Parallax city behind the walls. One InstancedMesh; each instance is a unit
 * box scaled and coloured per building, re-randomised whenever it recycles.
 */
export function createBuildingField(count) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);   // origin at the base so scaling grows upward
  const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  const palette = PALETTE.buildings;

  function randomize(index, z) {
    const side = index % 2 === 0 ? -1 : 1;
    const distance = 17 + Math.random() * 46;
    const width = 5 + Math.random() * 11;
    const depth = 5 + Math.random() * 13;
    const height = 5 + Math.random() * 26;

    // Buildings stand on the street deck, not on the trench floor.
    dummy.position.set(side * distance, TRACK.streetLevel - 0.2, z);
    dummy.scale.set(width, height, depth);
    dummy.rotation.y = (Math.random() - 0.5) * 0.35;
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);

    color.set(palette[(Math.random() * palette.length) | 0]);
    mesh.setColorAt(index, color);
  }

  return { mesh, randomize, dummy };
}

let tunnelPrototype = null;

/** Decorative arch the player runs through. Purely visual - never collides. */
export function createTunnel() {
  if (!tunnelPrototype) {
    const parts = [];
    const length = 26;
    const halfW = TRACK.groundWidth / 2 + 0.4;

    for (const side of [-1, 1]) {
      boxPart(parts, 1.2, 7, length, side * halfW, 3.5, 0, 0x8a97a6);
    }
    boxPart(parts, TRACK.groundWidth + 2.4, 1.2, length, 0, 7.2, 0, 0x76838f);

    // Ribs inside give a strobing sense of speed as you pass through.
    const ribCount = 7;
    for (let i = 0; i < ribCount; i++) {
      const z = -length / 2 + (i + 0.5) * (length / ribCount);
      boxPart(parts, TRACK.groundWidth + 1.6, 0.45, 0.5, 0, 6.7, z, 0x5d6975);
      for (const side of [-1, 1]) {
        boxPart(parts, 0.45, 6.6, 0.5, side * (halfW - 0.3), 3.4, z, 0x5d6975);
      }
    }
    // Warm strip lighting along the crown.
    for (let i = 0; i < ribCount; i++) {
      const z = -length / 2 + (i + 0.5) * (length / ribCount) + 1.4;
      boxPart(parts, 1.1, 0.14, 0.9, 0, 6.5, z, 0xfff0b8);
    }

    const geo = mergeColored(parts);
    tunnelPrototype = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    tunnelPrototype.receiveShadow = false;
    tunnelPrototype.castShadow = false;
    tunnelPrototype.userData.length = length;
  }
  return tunnelPrototype.clone();
}

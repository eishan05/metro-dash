import * as THREE from 'three';
import { TRACK, PALETTE } from '../config.js';
import { createTrackSegment, createBuildingField, createTunnel } from './models/scenery.js';

const BUILDING_COUNT = 64;
const BUILDING_SPAN = 320;      // z range the building field covers
const TUNNEL_MIN_GAP = 260;
const TUNNEL_MAX_GAP = 620;

/**
 * Streams the static world past the player. Nothing is created or destroyed
 * during a run: a fixed ring of segments, one instanced building field and two
 * tunnels are recycled forever, so the hot loop never allocates.
 */
export class Track {
  constructor(scene) {
    this.scene = scene;
    this.totalLength = TRACK.segmentCount * TRACK.segmentLength;

    // Track segments -------------------------------------------------------
    this.segments = [];
    for (let i = 0; i < TRACK.segmentCount; i++) {
      const seg = createTrackSegment();
      seg.position.z = TRACK.recycleZ - i * TRACK.segmentLength;
      scene.add(seg);
      this.segments.push(seg);
    }

    // Parallax city --------------------------------------------------------
    const field = createBuildingField(BUILDING_COUNT);
    this.buildings = field;
    this.buildingZ = new Float32Array(BUILDING_COUNT);
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const z = TRACK.recycleZ - (i / BUILDING_COUNT) * BUILDING_SPAN;
      this.buildingZ[i] = z;
      field.randomize(i, z);
    }
    field.mesh.instanceMatrix.needsUpdate = true;
    if (field.mesh.instanceColor) field.mesh.instanceColor.needsUpdate = true;
    scene.add(field.mesh);

    // Tunnels --------------------------------------------------------------
    this.tunnels = [];
    for (let i = 0; i < 2; i++) {
      const tunnel = createTunnel();
      tunnel.visible = false;
      tunnel.position.z = TRACK.spawnZ;
      scene.add(tunnel);
      this.tunnels.push({ mesh: tunnel, active: false });
    }
    this.nextTunnelIn = TUNNEL_MIN_GAP;

    // Reusable scratch so the update loop allocates nothing.
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._euler = new THREE.Euler();
  }

  reset() {
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].position.z = TRACK.recycleZ - i * TRACK.segmentLength;
    }
    for (const t of this.tunnels) {
      t.active = false;
      t.mesh.visible = false;
      t.mesh.position.z = TRACK.spawnZ;
    }
    this.nextTunnelIn = TUNNEL_MIN_GAP;
  }

  /** @param dz distance the world moved toward the camera this step. */
  update(dz) {
    // Segments -------------------------------------------------------------
    const half = TRACK.segmentLength / 2;
    for (const seg of this.segments) {
      seg.position.z += dz;
      if (seg.position.z - half > TRACK.recycleZ) {
        seg.position.z -= this.totalLength;
      }
    }

    // Buildings ------------------------------------------------------------
    const mesh = this.buildings.mesh;
    let dirty = false;
    for (let i = 0; i < BUILDING_COUNT; i++) {
      let z = this.buildingZ[i] + dz;
      if (z > TRACK.recycleZ + 40) {
        z -= BUILDING_SPAN;
        this.buildingZ[i] = z;
        this.buildings.randomize(i, z);
        dirty = true;
        continue;
      }
      this.buildingZ[i] = z;

      // Slide the existing instance without rebuilding its scale/rotation.
      mesh.getMatrixAt(i, this._m);
      this._m.decompose(this._pos, this._q, this._scale);
      this._pos.z = z;
      this._m.compose(this._pos, this._q, this._scale);
      mesh.setMatrixAt(i, this._m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Tunnels --------------------------------------------------------------
    this.nextTunnelIn -= dz;
    for (const t of this.tunnels) {
      if (!t.active) continue;
      t.mesh.position.z += dz;
      if (t.mesh.position.z > TRACK.recycleZ + 40) {
        t.active = false;
        t.mesh.visible = false;
      }
    }
    if (this.nextTunnelIn <= 0) {
      const free = this.tunnels.find((t) => !t.active);
      if (free) {
        free.active = true;
        free.mesh.visible = true;
        free.mesh.position.z = TRACK.spawnZ;
      }
      this.nextTunnelIn = TUNNEL_MIN_GAP + Math.random() * (TUNNEL_MAX_GAP - TUNNEL_MIN_GAP);
    }
  }

  setSceneryDensity(ratio) {
    const visible = Math.round(BUILDING_COUNT * ratio);
    this.buildings.mesh.count = Math.max(8, visible);
  }
}

import * as THREE from 'three';
import { CAMERA, PALETTE, QUALITY, SPEED, TRACK } from '../config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SKY_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  uniform vec3 top;
  uniform vec3 middle;
  uniform vec3 bottom;
  varying vec3 vWorld;
  void main() {
    float h = normalize(vWorld).y;
    vec3 col = h > 0.0
      ? mix(middle, top, pow(clamp(h, 0.0, 1.0), 0.65))
      : mix(middle, bottom, pow(clamp(-h, 0.0, 1.0), 0.5));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Owns the renderer, scene graph roots, camera rig and the quality ladder.
 * Everything visual that isn't a game entity lives here.
 */
export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    // Near plane far enough out that the playable track stays crisp; far plane
    // just inside the spawn line so obstacles fade in rather than popping.
    this.scene.fog = new THREE.Fog(PALETTE.fog, 105, Math.abs(TRACK.spawnZ) - 6);

    // Sky dome - a gradient reads far better than a flat clear colour, and the
    // fog colour is matched to the horizon band so the spawn line is invisible.
    const skyGeo = new THREE.SphereGeometry(600, 24, 16);
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f7fd4) },
        middle: { value: new THREE.Color(PALETTE.fog) },
        bottom: { value: new THREE.Color(0xf3d9b1) },
      },
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Camera ----------------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 900);
    this.camera.position.set(0, CAMERA.offset.y, CAMERA.offset.z);
    this.cameraX = 0;
    this.cameraY = CAMERA.offset.y;
    this._lookTarget = new THREE.Vector3();

    // Lights ----------------------------------------------------------------
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x6b6152, 1.05);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    this.sun.position.set(-16, 30, 12);
    this.sun.castShadow = true;
    // A tight ortho frustum around the player: shadows only need to be right
    // where the player is looking, and a small frustum keeps them crisp.
    const cam = this.sun.shadow.camera;
    cam.left = -16; cam.right = 16;
    cam.top = 18; cam.bottom = -14;
    cam.near = 1; cam.far = 90;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambient);

    // Quality ---------------------------------------------------------------
    this.qualityIndex = 0;
    this.qualityMode = 'auto';
    this.shadowsAllowed = true;
    this._frameSamples = [];
    this._sinceChange = 0;
    this.applyQuality(0);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.resize();
  }

  get level() {
    return QUALITY.levels[this.qualityIndex];
  }

  applyQuality(index) {
    this.qualityIndex = clamp(index, 0, QUALITY.levels.length - 1);
    const level = this.level;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.pixelRatio));
    const wantShadows = level.shadows && this.shadowsAllowed;
    this.renderer.shadowMap.enabled = wantShadows;
    this.sun.castShadow = wantShadows;

    if (this.sun.shadow.mapSize.width !== level.shadowMap) {
      this.sun.shadow.mapSize.set(level.shadowMap, level.shadowMap);
      // Force the shadow map to be rebuilt at the new resolution.
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
    this._sinceChange = 0;
    this._frameSamples.length = 0;

    if (this.onQualityChange) this.onQualityChange(level);
  }

  setQualityMode(mode) {
    this.qualityMode = mode;
    if (mode === 'auto') {
      this.applyQuality(this.qualityIndex);
    } else {
      const index = QUALITY.levels.findIndex((l) => l.name === mode);
      this.applyQuality(index === -1 ? 0 : index);
    }
  }

  setShadowsAllowed(allowed) {
    this.shadowsAllowed = allowed;
    this.applyQuality(this.qualityIndex);
  }

  /**
   * Watches frame times and steps the quality ladder down when the average
   * can't hold the target. Only ever steps down - hunting up and down mid-run
   * is more distracting than just running one notch lower.
   */
  sampleFrame(dtMs) {
    if (this.qualityMode !== 'auto') return;
    this._sinceChange += dtMs;
    if (this._sinceChange < 1500) return;      // ignore the warm-up after a change

    this._frameSamples.push(dtMs);
    if (this._frameSamples.length < QUALITY.sampleFrames) return;

    let total = 0;
    for (const s of this._frameSamples) total += s;
    const avgFps = 1000 / (total / this._frameSamples.length);
    this._frameSamples.length = 0;

    if (avgFps < QUALITY.targetFps && this.qualityIndex < QUALITY.levels.length - 1) {
      this.applyQuality(this.qualityIndex + 1);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Chase camera: trails the player's lane, kicks FOV with speed. */
  updateCamera(player, speed, shakeOffset, dt) {
    const speedRatio = clamp((speed - SPEED.min) / (SPEED.max - SPEED.min), 0, 1);

    const targetX = player.x * 0.72;
    const targetY = CAMERA.offset.y + player.y * 0.45;
    this.cameraX += (targetX - this.cameraX) * Math.min(1, dt * CAMERA.lateralLerp);
    this.cameraY += (targetY - this.cameraY) * Math.min(1, dt * CAMERA.heightLerp);

    this.camera.position.set(
      this.cameraX + shakeOffset.x,
      this.cameraY + shakeOffset.y,
      CAMERA.offset.z + shakeOffset.z
    );

    this._lookTarget.set(player.x * 0.5, player.y + 1.55, CAMERA.lookAhead);
    this.camera.lookAt(this._lookTarget);

    const targetFov = CAMERA.fov + speedRatio * CAMERA.fovSpeedKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2.5);
      this.camera.updateProjectionMatrix();
    }

    // Keep the shadow frustum centred on the action.
    this.sun.position.set(player.x - 16, 30, 14);
    this.sun.target.position.set(player.x, 0, -10);
    this.sun.target.updateMatrixWorld();

    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}

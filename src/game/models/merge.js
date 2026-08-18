import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared helpers for building one merged, vertex-coloured mesh out of many
// primitives. Used for track segments, tunnels and obstacles alike: a train
// made of 14 boxes becomes a single draw call instead of 14.

/** Bakes a flat colour into a geometry's vertex colour attribute. */
export function applyVertexColor(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Merges a list of {geo, color} into one geometry.
 * Everything is converted to non-indexed first, because mergeGeometries needs
 * all inputs to agree - and extruded shapes arrive non-indexed while boxes
 * arrive indexed.
 */
export function mergeColored(parts) {
  const prepared = parts.map(({ geo, color }) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    // Merging is only safe when every geometry carries the same attributes.
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') {
        flat.deleteAttribute(name);
      }
    }
    if (!flat.attributes.uv) {
      const count = flat.attributes.position.count;
      flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return applyVertexColor(flat, color);
  });

  const merged = mergeGeometries(prepared, false);
  merged.computeBoundingSphere();
  prepared.forEach((g) => g.dispose());
  return merged;
}

/** Convenience: an axis-aligned box already translated into place. */
export function boxPart(parts, w, h, d, x, y, z, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  parts.push({ geo, color });
}

import * as THREE from 'three';
import { readTextureToImageData } from './texture-preview.js';

// new Extrude() inside a node's code(), or use(Extrude) via useInstances.
// tick(src, { depth, resolution, threshold }) reads src's own alpha
// channel at a coarse `resolution`x`resolution` grid and builds a real 3D
// mesh out of it - one small box per alpha-covered cell, extruded along Z
// by `depth` and colored from that cell's own RGB. It's a "2D shape into
// voxel-relief 3D shape" builder, not a silhouette/contour extrusion -
// much cheaper to rebuild every tick (no contour tracing), and the blocky
// look fits a livecode-visuals context fine.
//
// Returns a THREE.Mesh owned by this instance (its geometry is rebuilt in
// place every tick, same mesh object each time) - add it to your own
// scene once, same one-time-add pattern as ModelSource:
//
//   const use = useInstances(state);
//   const extrude = use(Extrude);
//   const mesh = extrude.tick(inputs.src, { depth: 0.3 });
//   if (!state.added) { state.scene.add(mesh); state.added = true; }
//
// Cost: one CPU readback (readTextureToImageData) per tick at
// `resolution` squared pixels - the same order of cost as
// ThreeSource.toTexture()'s own readback. Keep `resolution` modest
// (24-48) for anything ticking every frame; higher looks smoother but
// costs more CPU per tick.
const VERTS_PER_CELL = 24;
const INDICES_PER_CELL = 36;

// Local-space corners of one box, one quad per face, matching the vertex
// order the index pattern below assumes (CCW looking from outside).
function writeBox(positions, normals, colors, index, vBase, iBase, x0, x1, y0, y1, z0, z1, r, g, b) {
  const faces = [
    // [normal, 4 corners]
    [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // +Z
    [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], // -Z
    [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], // +X
    [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // -X
    [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], // +Y
    [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // -Y
  ];

  for (let f = 0; f < 6; f++) {
    const [n, p0, p1, p2, p3] = faces[f];
    const vOff = (vBase + f * 4) * 3;
    const corners = [p0, p1, p2, p3];
    for (let c = 0; c < 4; c++) {
      const o = vOff + c * 3;
      positions[o] = corners[c][0];
      positions[o + 1] = corners[c][1];
      positions[o + 2] = corners[c][2];
      normals[o] = n[0];
      normals[o + 1] = n[1];
      normals[o + 2] = n[2];
      colors[o] = r;
      colors[o + 1] = g;
      colors[o + 2] = b;
    }
    const vi = vBase + f * 4;
    const iOff = iBase + f * 6;
    index[iOff] = vi;
    index[iOff + 1] = vi + 1;
    index[iOff + 2] = vi + 2;
    index[iOff + 3] = vi;
    index[iOff + 4] = vi + 2;
    index[iOff + 5] = vi + 3;
  }
}

export class Extrude {
  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this._resolution = 0;
  }

  _ensureBuffers(resolution) {
    if (this._resolution === resolution) return;
    this._resolution = resolution;
    const maxCells = resolution * resolution;
    this._positions = new Float32Array(maxCells * VERTS_PER_CELL * 3);
    this._normals = new Float32Array(maxCells * VERTS_PER_CELL * 3);
    this._colors = new Float32Array(maxCells * VERTS_PER_CELL * 3);
    this._index = new Uint32Array(maxCells * INDICES_PER_CELL);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this._normals, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(this._index, 1));
  }

  tick(src, { depth = 0.3, resolution = 32, threshold = 20 } = {}) {
    if (!src || !src.texture) return this.mesh;
    resolution = Math.max(2, Math.round(resolution));
    this._ensureBuffers(resolution);

    const img = readTextureToImageData(src.texture, resolution, resolution);
    const data = img.data;
    const cell = 1 / resolution; // unit square, -0.5..0.5, one grid cell wide
    const halfDepth = depth / 2;

    const { _positions: positions, _normals: normals, _colors: colors, _index: index } = this;
    let cellCount = 0;

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const p = (row * resolution + col) * 4;
        const a = data[p + 3];
        if (a <= threshold) continue;

        const r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255;
        const x0 = col * cell - 0.5, x1 = x0 + cell;
        const y0 = 0.5 - (row + 1) * cell, y1 = y0 + cell;

        writeBox(
          positions, normals, colors, index,
          cellCount * VERTS_PER_CELL, cellCount * INDICES_PER_CELL,
          x0, x1, y0, y1, -halfDepth, halfDepth, r, g, b
        );
        cellCount++;
      }
    }

    this.geometry.setDrawRange(0, cellCount * INDICES_PER_CELL);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.index.needsUpdate = true;
    if (cellCount > 0) this.geometry.computeBoundingSphere();

    return this.mesh;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

import * as THREE from 'three';
import { ThreeSource } from './three-source.js';
import { orbitCamera } from './three-camera.js';

// use(Scene3D, width, height) - replaces hand-building a THREE.Scene +
// THREE.PerspectiveCamera + light rig + ThreeSource in every node that
// wants real three.js content, which is what every three_* template used
// to do inside its own `if (!state.scene || newPatch)` guard. Scene3D
// does that setup once, in its own constructor, with the same default
// 2-light rig those templates all repeated by hand.
//
//   const three = use(Scene3D, width, height);
//   const box = use(Box);
//   box.tick({ color: 0x4488ff, rotation: { y: t } });
//   three.orbit({ azimuth: t * 0.3, elevation: 0.3, radius: 3 });
//   let out = three.tick([box]);
//
// See shape3d.js for use(Sphere)/use(Box)/etc - the "simple stateful
// object" shapes this is meant to composite - and csg3d.js for use(CSG).
export class Scene3D {
  constructor(width = 512, height = 512) {
    this.three = new ThreeSource(width, height);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    this._added = new Set(); // THREE.Object3Ds currently in the scene (not counting the fixed lights above)
  }

  // orbit(opts) - opts: { azimuth, elevation, radius, target } - see
  // lib/three-camera.js's orbitCamera, reused as-is here. Call this
  // yourself for a fixed camera (once, outside a per-tick azimuth), or
  // pass cameraOpts to tick() below to do it every frame in one call.
  orbit(opts) {
    orbitCamera(this.camera, opts);
    return this;
  }

  // toTexture(value, opts) - passthrough to the owned ThreeSource's own
  // toTexture() (see three-source.js) - projects any of this project's
  // OWN texture-bearing values onto a THREE.CanvasTexture, for use as a
  // shape's `map` option.
  toTexture(value, opts) {
    return this.three.toTexture(value, opts);
  }

  // tick(shapes, cameraOpts) - shapes: a plain array of this tick's live
  // shape wrappers (use(Sphere)/use(Box)/a use(CSG) result/...) or raw
  // THREE.Object3Ds. Diffs against what's currently added to the scene
  // and adds/removes only what changed - this is what replaces every old
  // template's own hand-rolled `state.added` flag (see e.g. the old
  // three_model template, which needed one specifically because its
  // model loads asynchronously and isn't there for the first several
  // ticks). cameraOpts, if given, is passed straight to orbit() above -
  // omit it (and call .orbit()/set .camera.position yourself) for a fixed
  // camera instead.
  tick(shapes = [], cameraOpts) {
    const wanted = new Set(shapes.filter(Boolean).map((s) => s.mesh || s));
    for (const obj of this._added) {
      if (!wanted.has(obj)) {
        this.scene.remove(obj);
        this._added.delete(obj);
      }
    }
    for (const obj of wanted) {
      if (!this._added.has(obj)) {
        this.scene.add(obj);
        this._added.add(obj);
      }
    }
    if (cameraOpts) this.orbit(cameraOpts);
    return this.three.tick(this.scene, this.camera);
  }

  dispose() {
    this.three.dispose();
  }
}

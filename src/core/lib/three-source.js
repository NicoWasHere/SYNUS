import * as THREE from 'three';
import { getGL } from './context.js';
import { createTexture } from '../../gl/gl-context.js';

// new ThreeSource(width, height) inside a node's code(), or
// use(ThreeSource, width, height) via useInstances. tick(scene, camera)
// renders a real three.js scene/camera (build them however you like with
// the `THREE` global - THREE.Scene, THREE.Mesh, lights, etc., same API
// as any other three.js project) and copies the result into this
// project's own texture pipeline.
//
// Three.js gets its OWN separate WebGL context on its own detached
// canvas (never added to the page), the same isolation HydraSource uses
// for hydra-synth - three.js's renderer keeps a lot of internal GL state
// assumptions (bound textures/framebuffers/programs) that would fight
// with this project's own raw WebGL2 calls if they shared a context, the
// same reason Hydra can't share one either. Its canvas is copied into
// our texture the same way Canvas2D/ImageSource/HydraSource all are:
// draw its canvas, upload.
//
// Unlike HydraSource, there's no global-namespace collision risk here -
// three.js doesn't put anything on `window`, so nothing needs restoring
// after construction the way HydraSource restores render().
export class ThreeSource {
  constructor(width = 512, height = 512) {
    this.gl = getGL();
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.texture = createTexture(this.gl, width, height);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setSize(width, height, false);
  }

  tick(scene, camera) {
    this.renderer.render(scene, camera);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    return this;
  }
}

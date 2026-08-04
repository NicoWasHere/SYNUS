import * as THREE from 'three';
import { getGL } from './context.js';
import { createTexture } from '../../gl/gl-context.js';
import { readTextureToImageData } from './texture-preview.js';

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

  // three.toTexture(value, { width, height, key }) - projects any of
  // THIS project's own texture-bearing values (a GLSL/Canvas2D result, a
  // media source, an effect chain's output, ...) onto a real
  // THREE.CanvasTexture, for use as a mesh's material.map - e.g. wrapping
  // a live effect chain around a THREE.SphereGeometry.
  //
  // Three.js's renderer runs in its OWN separate WebGL context (see the
  // class comment above), so a raw WebGLTexture from this project's
  // context can't just be handed to a three.js material directly - this
  // reads it back to a plain <canvas> (readTextureToImageData - the same
  // GPU->CPU bridge the preview cards use) and re-uploads THAT as a
  // CanvasTexture, which three.js's context can use like any other image.
  // That readback has a real per-tick cost (unlike everything else in
  // this pipeline, which stays GPU-resident) - fine for one or two
  // projected textures, but not something to do dozens of times a frame.
  //
  // `key` distinguishes more than one projected texture on the same
  // ThreeSource (e.g. one per mesh) - each gets its own cached canvas/
  // CanvasTexture, only recreated if the requested size actually changes.
  toTexture(value, { width, height, key = 'default' } = {}) {
    if (!value || !value.texture) return null;
    const w = width || value.width || (value.canvas && value.canvas.width) || 256;
    const h = height || value.height || (value.canvas && value.canvas.height) || 256;
    this._projected ??= new Map();
    let entry = this._projected.get(key);
    if (!entry || entry.canvas.width !== w || entry.canvas.height !== h) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const texture = new THREE.CanvasTexture(canvas);
      entry = { canvas, ctx: canvas.getContext('2d'), texture };
      this._projected.set(key, entry);
    }
    entry.ctx.putImageData(readTextureToImageData(value.texture, w, h), 0, 0);
    entry.texture.needsUpdate = true;
    return entry.texture;
  }

  // Each ThreeSource owns a WHOLE separate WebGL context (see the class
  // comment above) - browsers cap how many can exist at once (commonly
  // ~8-16), so leaving these to garbage collection alone is riskier than
  // the plain-texture classes elsewhere in this file: renderer.dispose()
  // frees three.js's own internal GL resources, but forceContextLoss()
  // is what actually releases the CONTEXT ITSELF back to the browser.
  dispose() {
    if (this._projected) for (const entry of this._projected.values()) entry.texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.gl.deleteTexture(this.texture);
  }
}

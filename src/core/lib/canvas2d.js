import { getGL, screenSize } from './context.js';
import { createTexture } from '../../gl/gl-context.js';

// new Canvas2D(width, height, filter) inside a node's code(). Draw with
// normal ctx.* calls, then call .upload() once you're done drawing for
// this tick. No GLSL involved - proves a video-type node doesn't need
// one. filter: 'linear' (default) or 'nearest' - see createTexture() in
// gl-context.js. width/height default to the current screenSize() (real
// output resolution), same reasoning as GLSL's own defaults.
export class Canvas2D {
  constructor(width = screenSize().width, height = screenSize().height, filter = 'linear') {
    this.gl = getGL();
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = createTexture(this.gl, width, height, { filter });
  }

  upload() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
  }

  // Frees the GL texture - see GLSL.dispose()'s comment for when/why this
  // gets called. this.canvas/this.ctx are plain DOM/2D objects, not GPU
  // resources - ordinary GC handles those fine on its own.
  dispose() {
    this.gl.deleteTexture(this.texture);
  }
}

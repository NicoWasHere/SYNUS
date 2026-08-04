import { getGL } from './context.js';
import { compileProgram, drawFullscreenQuad, createTexture, createFramebuffer } from '../../gl/gl-context.js';

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;

void main() {
  outColor = texture(uInput, vUv);
}`;

// new Delay(ticks, filter) inside a node's code(), or use(Delay, ticks,
// filter) via useInstances. tick(value) returns whatever `value` was
// exactly `ticks` ticks ago - a true sliding delay line, continuously
// shifting by one frame every tick. That's different from Lag, which
// steps: it holds a value for `every` ticks then jumps straight to a new
// one, rather than ever showing every intermediate frame in between.
//
// filter: 'linear' (default) or 'nearest' - see createTexture() in
// gl-context.js. Delay's own copy step samples 1:1 (no blur either way),
// but whatever reads ITS output through a resampling effect (Translate/
// Scale/Rotate) in a feedback loop inherits whichever filtering this
// texture uses - 'nearest' here is what stops that loop from getting
// blurrier every iteration, at the cost of visible pixel-stepping.
//
// Storing that costs what the constructor comment below explains -
// `ticks + 1` separate GPU textures in a ring buffer, not just one.
export class Delay {
  constructor(ticks = 1, filter = 'linear') {
    this.ticks = Math.max(1, Math.round(ticks));
    this.filter = filter;
    this.pool = null;
    this.writeIndex = 0;
    this.filled = 0;
    this._program = null;
    this._width = 0;
    this._height = 0;
  }

  // Ring buffer sized ticks+1, not ticks - one texture isn't enough:
  // the slot about to be returned as this tick's output can't also be
  // the one written into this same tick, or downstream would sample the
  // just-overwritten current frame instead of the actually-delayed one
  // (textures are live GPU resources - returning a reference to one
  // doesn't "consume" its old content the way reading a plain value
  // would, so writing over it before anything gets a chance to sample
  // it would silently replace it). The +1 spare slot is what keeps this
  // tick's read and this tick's write from ever landing on the same
  // texture.
  _ensurePool(width, height) {
    const gl = getGL();
    const size = this.ticks + 1;
    if (this.pool && this._width === width && this._height === height && this.pool.length === size) return;
    this.pool = Array.from({ length: size }, () => {
      const texture = createTexture(gl, width, height, { filter: this.filter });
      const fbo = createFramebuffer(gl, texture);
      return { texture, fbo };
    });
    this._width = width;
    this._height = height;
    this.writeIndex = 0;
    this.filled = 0;
    this._program ??= compileProgram(gl, PASSTHROUGH_FRAG);
  }

  tick(value, ticks = this.ticks) {
    const newTicks = Math.max(1, Math.round(ticks));
    if (newTicks !== this.ticks) {
      this.ticks = newTicks;
      this.pool = null; // size changed - rebuild, losing history (expected: you asked for a different delay length)
    }
    if (!value || !value.texture) return value;

    const gl = getGL();
    const width = value.width || gl.canvas.width;
    const height = value.height || gl.canvas.height;
    this._ensurePool(width, height);

    // The output for this tick is the slot `ticks` steps behind write -
    // untouched since it was written, so safe to read right now.
    const outIndex = (this.writeIndex + 1) % this.pool.length;
    const outSlot = this.pool[outIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pool[this.writeIndex].fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this._program);
    const loc = gl.getUniformLocation(this._program, 'uInput');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, value.texture);
    gl.uniform1i(loc, 0);
    drawFullscreenQuad(gl, this._program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.writeIndex = outIndex;
    this.filled++;

    // Not enough history yet - during the first `ticks` calls there's no
    // real delayed frame to show. Falls back to the live value so
    // there's something on screen right away instead of a hard blank/
    // transparent pop before the buffer fills up.
    if (this.filled <= this.ticks) return value;
    return { texture: outSlot.texture, width, height };
  }
  dispose() {
    const gl = getGL();
    if (this.pool) {
      for (const { texture, fbo } of this.pool) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(fbo);
      }
    }
    if (this._program) gl.deleteProgram(this._program);
  }
}

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

// new Lag(every, filter) inside a node's code(), or use(Lag, every,
// filter) via useInstances. Holds whatever value it's given and only
// refreshes that held value once every `every` calls to tick() - a
// simple frequency divider: a counter increments once per call, and the
// held value only updates when that counter reaches `every`, then resets
// to 0. Fires on the very first call too, so there's something to show
// immediately rather than a blank stretch until the first refresh.
//
// filter: 'linear' (default) or 'nearest' - see createTexture() in
// gl-context.js. Only matters for a texture-bearing value read back
// through a resampling effect afterward, same reasoning as Delay.
//
// A plain value (number, string, whatever) is just held by reference/
// copy, which is all that's needed since those are immutable. A
// texture-bearing value is NOT safe to hold that way: its texture is a
// live GL resource that the node which owns it keeps re-rendering into
// every single tick, on its own schedule, regardless of what Lag does
// with the reference - so "holding" the same JS object would still show
// whatever that upstream node is drawing *this* frame, not a frozen
// snapshot from `every` ticks ago. Lag needs its own texture to actually
// copy the source's current pixels into at the moment it fires.
export class Lag {
  constructor(every = 1, filter = 'linear') {
    this.every = every;
    this.filter = filter;
    this.counter = 0;
    this.value = undefined;
    this._texture = null;
    this._fbo = null;
    this._program = null;
    this._width = 0;
    this._height = 0;
  }

  _snapshot(value) {
    const gl = getGL();
    const width = value.width || gl.canvas.width;
    const height = value.height || gl.canvas.height;
    if (!this._texture || this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this._texture = createTexture(gl, width, height, { filter: this.filter });
      this._fbo = createFramebuffer(gl, this._texture);
      this._program ??= compileProgram(gl, PASSTHROUGH_FRAG);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this._program);
    const loc = gl.getUniformLocation(this._program, 'uInput');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, value.texture);
    gl.uniform1i(loc, 0);
    drawFullscreenQuad(gl, this._program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture: this._texture, width, height };
  }

  tick(value, every = this.every) {
    this.every = every;
    this.counter++;
    if (this.value === undefined || this.counter >= this.every) {
      this.counter = 0;
      this.value = value && value.texture ? this._snapshot(value) : value;
    }
    return this.value;
  }
  dispose() {
    const gl = getGL();
    if (this._texture) gl.deleteTexture(this._texture);
    if (this._fbo) gl.deleteFramebuffer(this._fbo);
    if (this._program) gl.deleteProgram(this._program);
  }
}

import { getGL } from './context.js';
import { compileProgram, drawFullscreenQuad } from '../../gl/gl-context.js';

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;

void main() {
  vec4 src = texture(uInput, vUv);
  // Always flatten onto an opaque black backdrop before this hits the
  // actual screen - same 'over' formula Composite's own 'over' mode uses
  // (mix(backdrop.rgb, src.rgb, src.a), backdrop here being solid black),
  // and forced fully opaque output. Without this, whatever alpha the
  // stack happens to still have when it reaches render() shows straight
  // through the canvas's own alpha channel to the PAGE behind it (the
  // canvas element itself defaults to alpha:true) - any leftover partial
  // transparency (an imperfectly-keyed edge, a stray un-composited layer)
  // reads as a visible fringe/outline instead of just quietly disappearing
  // the way "nothing there" should look.
  vec3 rgb = mix(vec3(0.0), src.rgb, src.a);
  outColor = vec4(rgb, 1.0);
}`;

// new ScreenOutput() inside a "render" node's code(). tick({ uInput })
// draws straight to the visible canvas - nothing downstream of this, so
// a render node's code() just returns {}.
export class ScreenOutput {
  constructor() {
    this.gl = getGL();
    this.program = compileProgram(this.gl, PASSTHROUGH_FRAG);
  }

  tick({ uInput } = {}) {
    if (!uInput || !uInput.texture) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(this.program);
    const loc = gl.getUniformLocation(this.program, 'uInput');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, uInput.texture);
    gl.uniform1i(loc, 0);
    drawFullscreenQuad(gl, this.program);
  }
  dispose() {
    this.gl.deleteProgram(this.program);
  }
}

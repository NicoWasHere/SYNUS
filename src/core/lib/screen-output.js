import { getGL } from './context.js';
import { compileProgram, drawFullscreenQuad } from '../../gl/gl-context.js';

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;

void main() {
  outColor = texture(uInput, vUv);
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

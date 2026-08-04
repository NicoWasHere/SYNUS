import { getGL, screenSize } from './context.js';
import {
  compileProgram,
  drawFullscreenQuad,
  createTexture,
  createFramebuffer,
} from '../../gl/gl-context.js';

// new GLSL() inside a node's code(). Anything with a .texture property
// (this class, Canvas2D, a bus value from a video-file node, etc.) can be
// passed straight in as a sampler2D uniform - no wrapping needed.
//
// IMPORTANT: pass the current fragment shader source into tick() every
// frame, not just at construction - _compile() only actually recompiles
// when the string changed, so this is cheap, and it's what makes editing
// the shader text in a node's code() actually take effect.
//
// filter: 'linear' (default) or 'nearest' - see createTexture() in
// gl-context.js. Matters for a node inside a feedback loop (something
// that samples its own recent history via Lag/Delay through Translate/
// Scale/Rotate) - LINEAR softens a little on every resample, which
// compounds into visible blur over many iterations; NEAREST doesn't.
export class GLSL {
  // width/height default to the CURRENT screenSize() (not a fixed
  // number) so every effect/composite/generator that doesn't pass its
  // own size renders at real output resolution instead of a small fixed
  // buffer that then gets stretched up on a bigger canvas (visibly
  // blocky on a large/high-res monitor - the same "use real resolution"
  // fix Pattern.plot()/preview cards already got).
  constructor({ width = screenSize().width, height = screenSize().height, filter = 'linear' } = {}) {
    this.gl = getGL();
    this.width = width;
    this.height = height;
    this.texture = createTexture(this.gl, width, height, { filter });
    this.fbo = createFramebuffer(this.gl, this.texture);
    this.program = null;
    this.lastSource = null;
    this.error = null;
  }

  _compile(src) {
    if (src === this.lastSource) return;
    try {
      const p = compileProgram(this.gl, src);
      if (this.program) this.gl.deleteProgram(this.program);
      this.program = p;
      this.lastSource = src;
      this.error = null;
    } catch (e) {
      this.error = e.message;
      // keep the previous program running
    }
  }

  // tick(fragSrc, uniforms) - source first, since it must be passed every
  // frame for edits to take effect. Uniform values can be:
  //   - anything with a .texture property -> bound as a sampler2D
  //   - a plain number                    -> uniform1f
  //   - a boolean                         -> uniform1f (0 or 1)
  //   - a JS array of length 2/3/4        -> uniform2fv/3fv/4fv
  tick(fragSrc, uniforms = {}) {
    this._compile(fragSrc);
    if (!this.program) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);

    let unit = 0;
    for (const [name, value] of Object.entries(uniforms)) {
      const loc = gl.getUniformLocation(this.program, name);
      if (loc === null) continue;
      if (value && value.texture) {
        // Reading a texture while it's bound as the render target you're
        // about to draw into is a hard WebGL rule violation ("feedback
        // loop between framebuffer and active texture") - the GPU driver
        // silently rejects the draw call (GL_INVALID_OPERATION, visible
        // only in the browser console, never as a JS exception), which
        // freezes this texture's content forever at whatever it last
        // rendered successfully. This happens whenever a node reads its
        // own previous output directly (a self-referencing feedback
        // loop through the bus) into the very same GLSL/Composite/etc.
        // instance that's producing it. The fix is never "read your own
        // output more carefully" - it's routing through something that
        // owns a genuinely separate texture, like Lag or Delay, so the
        // read and write never target the same GPU resource.
        if (value.texture === this.texture) {
          throw new Error(
            `GLSL: uniform "${name}" is this same instance's own output texture - reading a ` +
            `texture while it's the active render target isn't allowed by WebGL (this would ` +
            `otherwise silently freeze instead of erroring). Route feedback through a Lag or ` +
            `Delay node instead, which own their own separate texture.`
          );
        }
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value.texture);
        gl.uniform1i(loc, unit);
        unit++;
      } else if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2fv(loc, value);
        else if (value.length === 3) gl.uniform3fv(loc, value);
        else if (value.length === 4) gl.uniform4fv(loc, value);
      } else if (typeof value === 'boolean') {
        gl.uniform1f(loc, value ? 1 : 0);
      } else if (typeof value === 'number') {
        gl.uniform1f(loc, value);
      }
    }
    drawFullscreenQuad(gl, this.program);
  }
}

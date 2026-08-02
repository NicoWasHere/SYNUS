// Shared WebGL2 helpers. Every node in the graph draws through these same
// primitives - a "video" value flowing through the graph is always an
// object with a .texture property.

export function createGLContext(canvas) {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 not supported in this browser');
  // A 2D canvas's pixel data has row 0 at the top; GL texture V=0 is the
  // bottom. Without this, every texImage2D upload FROM a canvas (Canvas2D,
  // Html) comes in upside-down - invisible for symmetric content like a
  // centered square, but wrong for anything directional like text. This
  // only affects CPU->GPU uploads, not textures rendered into via a
  // fragment shader (GLSL's tick()), so it can't affect those.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  return gl;
}

// filter: 'linear' (default - smooth, the right choice almost always) or
// 'nearest' (blocky/no interpolation). Matters most for anything that
// gets sampled at fractional/scaled UV repeatedly in a feedback loop
// (Translate/Scale/Rotate reading Delay's or another effect's texture) -
// each LINEAR resample blends neighboring texels a little, and that blur
// compounds tick over tick; NEAREST never blends, so it can't accumulate
// blur, at the cost of visible pixel-stepping/aliasing instead.
export function createTexture(gl, width, height, { filter = 'linear' } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const mode = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createFramebuffer(gl, texture) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

// Every node shares this same vertex stage - a fullscreen triangle pair.
// Only fragment shaders are ever live-edited.
const QUAD_VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || 'shader compile failed');
  }
  return shader;
}

// vertSrc defaults to the shared fullscreen-quad vertex stage every effect
// uses - instance.js passes its own (a per-instance positioned/rotated/
// scaled quad instead of a fixed fullscreen one), which is the only reason
// this is a parameter instead of just inlining QUAD_VERT below.
export function compileProgram(gl, fragSrc, vertSrc = QUAD_VERT) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || 'program link failed');
  }
  return program;
}

let quadBuffer = null;
export function drawFullscreenQuad(gl, program) {
  if (!quadBuffer) {
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  const posLoc = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

import { getGL, screenSize } from './context.js';
import { nextCallKey } from './current-node.js';
import { compileProgram, createTexture, createFramebuffer } from '../../gl/gl-context.js';
import { sampleTexture } from './texture-sample.js';

// Stamps `count` positioned/scaled/rotated copies of one source texture
// into a single shared destination - ALWAYS exactly ONE destination
// texture and, since this uses real WebGL2 instancing (drawArraysInstanced
// + per-instance vertex attributes, gl.vertexAttribDivisor), exactly ONE
// draw call, no matter how large count is. An earlier version of this
// issued one gl.drawArrays call per instance from a JS loop - fine for a
// handful of instances, but at a few thousand the sheer number of
// individual GL driver calls (each with its own uniform uploads) was
// enough to tank the framerate outright. Building the per-instance data
// into one buffer and drawing it in one instanced call moves that cost
// from "N driver calls" to "one CPU-side loop filling a Float32Array",
// which is dramatically cheaper.
//
//   const use = useInstances(state);
//   const dots = use(Instance).tick(base, 2000, (i, n) => ({
//     x: i / n, y: 0.5, scale: 0.02, rotation: t * 30,
//   }));
//
// Most project code should reach this through particle2d() below instead
// (no useInstances()/use() boilerplate needed) - Instance itself is only
// exported for cases that want explicit control over the persistent
// object (e.g. holding onto it across nodes).
//
// callback(i, count) returns any of:
//   x, y        - this instance's center, 0..1 across the full square
//                 canvas (same uv space every effect already uses) -
//                 default 0.5, 0.5 (dead center)
//   scale       - size of this instance as a fraction of the full frame,
//                 same convention as the Scale effect (1.0 = fills the
//                 whole frame). A number scales both axes evenly; an
//                 {x, y} object (or separate scaleX/scaleY) scales them
//                 independently. Default 1.
//   rotation    - degrees (matches the Rotate effect). Default 0.
//   opacity     - 0..1 alpha multiplier for this instance. Default 1.
// Any field left out keeps its default - a bare `{}` draws one full-frame
// copy of the source, same as not using Instance at all.
//
// The destination is cleared to fully transparent at the start of every
// tick (not accumulated across frames), and instances are composited with
// standard alpha-over blending - gaps between instances, and anything
// beyond `count` copies, stay transparent rather than turning black.
const INSTANCE_VERT = `#version 300 es
in vec2 position;    // shared unit quad, per-VERTEX (divisor 0)
in vec2 iOffset;      // per-INSTANCE center, 0..1 (divisor 1)
in vec2 iScale;       // per-INSTANCE scale (divisor 1)
in float iRotation;   // per-INSTANCE radians (divisor 1)
in float iOpacity;    // per-INSTANCE 0..1 (divisor 1)
out vec2 vLocal;
out float vOpacity;
void main() {
  vLocal = position * 0.5 + 0.5;
  vOpacity = iOpacity;
  float c = cos(iRotation);
  float s = sin(iRotation);
  // position is the shared [-1,1] quad - left as-is (iScale = 1) it
  // already spans the whole clip-space frame, matching the Scale
  // effect's "1.0 = no change" convention.
  vec2 scaled = position * iScale;
  vec2 rotated = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
  vec2 centerClip = iOffset * 2.0 - 1.0;
  gl_Position = vec4(rotated + centerClip, 0.0, 1.0);
}`;

const INSTANCE_FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vOpacity;
out vec4 outColor;
uniform sampler2D uSrc;
void main() {
  vec4 c = texture(uSrc, vLocal);
  outColor = vec4(c.rgb, c.a * vOpacity);
}`;

const FLOATS_PER_INSTANCE = 6; // x, y, scaleX, scaleY, rotation, opacity
const STRIDE = FLOATS_PER_INSTANCE * 4; // bytes

export class Instance {
  constructor() {
    this.gl = getGL();
    this.texture = null;
    this.fbo = null;
    this.width = 0;
    this.height = 0;
    this.program = null;
    this.vao = null;
    this.instanceBuffer = null;
    this.capacity = 0;
    this.data = null;
  }

  _ensureProgram() {
    if (this.program) return;
    const gl = this.gl;
    this.program = compileProgram(gl, INSTANCE_FRAG, INSTANCE_VERT);
    this.locs = {
      position: gl.getAttribLocation(this.program, 'position'),
      iOffset: gl.getAttribLocation(this.program, 'iOffset'),
      iScale: gl.getAttribLocation(this.program, 'iScale'),
      iRotation: gl.getAttribLocation(this.program, 'iRotation'),
      iOpacity: gl.getAttribLocation(this.program, 'iOpacity'),
      uSrc: gl.getUniformLocation(this.program, 'uSrc'),
    };

    // A dedicated VAO isolates this class's attribute/divisor state from
    // every other class in this project (GLSL/effects draw through the
    // context's one shared default VAO, and never touch divisors at all -
    // without this, vertexAttribDivisor(loc, 1) set here would silently
    // leak onto whatever unrelated draw next happens to reuse that same
    // attribute location).
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(this.locs.position);
    gl.vertexAttribPointer(this.locs.position, 2, gl.FLOAT, false, 0, 0);

    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.enableVertexAttribArray(this.locs.iOffset);
    gl.vertexAttribPointer(this.locs.iOffset, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(this.locs.iOffset, 1);
    gl.enableVertexAttribArray(this.locs.iScale);
    gl.vertexAttribPointer(this.locs.iScale, 2, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribDivisor(this.locs.iScale, 1);
    gl.enableVertexAttribArray(this.locs.iRotation);
    gl.vertexAttribPointer(this.locs.iRotation, 1, gl.FLOAT, false, STRIDE, 16);
    gl.vertexAttribDivisor(this.locs.iRotation, 1);
    gl.enableVertexAttribArray(this.locs.iOpacity);
    gl.vertexAttribPointer(this.locs.iOpacity, 1, gl.FLOAT, false, STRIDE, 20);
    gl.vertexAttribDivisor(this.locs.iOpacity, 1);

    gl.bindVertexArray(null);
  }

  _ensureSize(width, height) {
    if (this.texture && this.width === width && this.height === height) return;
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.width = width;
    this.height = height;
    this.texture = createTexture(gl, width, height);
    this.fbo = createFramebuffer(gl, this.texture);
  }

  _ensureCapacity(count) {
    if (count <= this.capacity) return;
    const gl = this.gl;
    this.capacity = count;
    this.data = new Float32Array(count * FLOATS_PER_INSTANCE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
  }

  tick(source, count, callback) {
    this._ensureProgram();
    const gl = this.gl;

    // Matches the square GL canvas resolution (same default every other
    // texture-producing node uses) so this composes through the rest of
    // the graph with no extra resizing step.
    const { width, height } = screenSize();
    this._ensureSize(width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (source && source.texture && count > 0) {
      // Same feedback-loop hazard GLSL.tick() guards against - reading a
      // texture while it's the active render target is a hard WebGL rule
      // violation, not just bad practice.
      if (source.texture === this.texture) {
        throw new Error(
          'Instance: source is this same instance\'s own output texture - reading a texture ' +
          'while it\'s the active render target isn\'t allowed by WebGL. Route feedback through ' +
          'a Lag or Delay node instead.'
        );
      }

      this._ensureCapacity(count);
      const data = this.data;
      for (let i = 0; i < count; i++) {
        const p = callback(i, count) || {};
        const x = p.x ?? 0.5;
        const y = p.y ?? 0.5;
        const scale = p.scale ?? 1;
        const uniform = typeof scale === 'number';
        let sx = uniform ? scale : (scale.x ?? 1);
        let sy = uniform ? scale : (scale.y ?? 1);
        if (p.scaleX != null) sx = p.scaleX;
        if (p.scaleY != null) sy = p.scaleY;
        const rotation = ((p.rotation ?? 0) * Math.PI) / 180;
        const opacity = p.opacity ?? 1;
        const o = i * FLOATS_PER_INSTANCE;
        data[o] = x;
        data[o + 1] = y;
        data[o + 2] = sx;
        data[o + 3] = sy;
        data[o + 4] = rotation;
        data[o + 5] = opacity;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * FLOATS_PER_INSTANCE);

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.program);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform1i(this.locs.uSrc, 0);

      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count); // ONE draw call, regardless of count
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this;
  }
  dispose() {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
  }
}

// particle2d(source, cols, rows, stamp, options) - the batteries-included
// "mosaic" entry point: samples `source` down to a cols x rows grid (see
// sampleTexture) and stamps one copy of `stamp` (e.g. dot()/pixel(), see
// stamps.js) per cell, sized by that cell's value - no callback, no
// useInstances()/use() boilerplate, just call it directly from a node's
// code(). Persistent identity (so the destination texture survives tick
// to tick instead of being rebuilt from scratch) comes from the same
// "current node + call order" trick preview() uses (see nextCallKey() in
// current-node.js), not an explicit state argument - call it more than
// once in one node's code() for independent particle systems, same way a
// second preview() call gets its own card instead of clobbering the
// first.
//
//   const stamp = dot();
//   const out = particle2d(inputs.src, 24, 24, stamp, { t, min: 0.15, shakeSpeed: 1 });
//
// options:
//   t           - current time, only needed if shakeSpeed > 0. Default 0.
//   min         - floor for a cell's size, as a fraction of 1/cols (a
//                 fully dark cell still draws at this size rather than
//                 vanishing to nothing). Default 0.15.
//   shakeSpeed  - 0 (default) draws a perfectly static grid; > 0 adds a
//                 per-cell time-based position jitter at that speed, so
//                 it feels a little alive instead of frozen.
//   shakeAmount - magnitude of that jitter, in uv units. Default 0.006.
//   channel     - which of sampleTexture's channels drives size/opacity:
//                 'lightness' (default), 'red', 'green', or 'blue'.
//
// Need custom per-instance placement instead (a Pattern-driven layout, or
// anything that isn't "a grid sized by brightness")? Reach for Instance
// directly (use(Instance).tick(source, count, callback)) - particle2d is
// this one specific, common shape of it, not a replacement for it.
const particleCache = new Map(); // key (nodeId or "nodeId#n") -> Instance
let particleCallCounts = new Map(); // nodeId -> how many times particle2d() has been called THIS tick

export function beginParticleTick() {
  particleCallCounts = new Map();
}

// particle2d() keys its Instance cache by call site (nodeId/"nodeId#n"),
// NOT through useInstances - so a removed node's particle systems live
// OUTSIDE node.state and graph.js's normal disposeState() walk can't see
// them. Called from graph.js when a node id disappears from the project,
// so these don't leak the same way an unwired VideoSource would.
export function disposeParticlesForNode(nodeId) {
  for (const [key, inst] of particleCache) {
    if (key === nodeId || key.startsWith(`${nodeId}#`)) {
      inst.dispose();
      particleCache.delete(key);
    }
  }
}

export function particle2d(source, cols, rows, stamp, options = {}) {
  const { t = 0, min = 0.15, shakeSpeed = 0, shakeAmount = 0.006, channel = 'lightness' } = options;

  const key = nextCallKey(particleCallCounts);
  if (key == null) return { texture: null, width: 0, height: 0 };

  let inst = particleCache.get(key);
  if (!inst) {
    inst = new Instance();
    particleCache.set(key, inst);
  }

  if (!source || !source.texture) return inst.tick(null, 0, () => ({}));

  const count = cols * rows;
  const values = sampleTexture(source, { cols, rows, channel });

  return inst.tick(stamp, count, (i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const v = values[row * cols + col];
    const jx = shakeSpeed ? Math.sin(t * shakeSpeed * 2 + i * 12.9) * shakeAmount : 0;
    const jy = shakeSpeed ? Math.cos(t * shakeSpeed * 1.7 + i * 7.3) * shakeAmount : 0;
    return {
      x: (col + 0.5) / cols + jx,
      y: 1 - (row + 0.5) / rows + jy, // row 0 = visual top
      scale: (1 / cols) * (min + v * 0.85),
      opacity: 0.4 + v * 0.6,
    };
  });
}

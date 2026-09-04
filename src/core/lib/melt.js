import { getGL } from './context.js';
import { GLSL } from './glsl.js';
import { compileProgram, drawFullscreenQuad, createTexture, createFramebuffer } from '../../gl/gl-context.js';

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;

void main() {
  outColor = texture(uInput, vUv);
}`;

// A cheap "fake pixel sorting" drip: real pixel sorting (sorting each
// row/column's pixels by brightness) is a real sort per row every frame -
// expensive, and hard to do on a GPU at all. This fakes the same "melting
// downward" look for a fraction of the cost: pick a line (a single row or
// column), and every tick, feed that line's OWN live content back into
// itself, sliding a little further away and fading a little more each
// time - the trail is really just last tick's trail, shifted and dimmed,
// not a fresh sort of anything.
const MELT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uPrev;
uniform float uAxis;      // 0 = horizontal line (pick a y), 1 = vertical line (pick an x)
uniform float uLine;      // 0..1 BASE position of the line along that axis
uniform float uSections;  // how many independent segments to split the CROSS axis into (1 = one shared line, the old behavior)
uniform float uJitter;    // 0..1 max random offset from uLine each section's own line gets
uniform float uSeed;      // change for a different random per-section pattern
uniform float uThickness; // half-width (uv units) of the source strip - keep this near one texel for a clean "single row" look
uniform float uDrip;      // uv units this tick's trail has slid away from the line, versus last tick's
uniform float uDieOff;    // per-tick brightness/alpha multiplier on the trail - 1 = never fades, lower fades faster

// Cheap deterministic 1D hash - same sin/fract trick lib/pattern.js's own
// JS-side hash() uses, just GLSL-side here so it can run per-fragment.
// Deterministic in SEED and section index alone (not time/position), so
// a section's own line sits still tick to tick instead of flickering -
// only changing uSeed reshuffles the pattern.
float hash11(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
}

void main() {
  float coord = mix(vUv.y, vUv.x, uAxis);
  float cross = mix(vUv.x, vUv.y, uAxis); // the OTHER axis - which section this pixel falls into

  // Each section gets its OWN line, jittered from the shared base uLine -
  // this is what makes one section's drip start somewhere else entirely
  // from its neighbor, instead of one clean line the whole width/height.
  float section = floor(cross * max(uSections, 1.0));
  float rand = hash11(section + uSeed * 97.13);
  float lineHere = clamp(uLine + (rand * 2.0 - 1.0) * uJitter, 0.0, 1.0);

  if (abs(coord - lineHere) <= uThickness) {
    // The strip itself - always THIS section's own line position, not
    // wherever in the (thin) band this exact pixel happens to fall, so
    // each section's band reads as one clean source row/column, not a
    // smear of several adjacent ones.
    vec2 stripUv = uAxis > 0.5 ? vec2(lineHere, vUv.y) : vec2(vUv.x, lineHere);
    outColor = texture(uSrc, stripUv);
  } else if (coord < lineHere) {
    // The drip zone: this tick's trail is last tick's trail (uPrev, this
    // same shader's own previous output - see Melt.tick()'s feedback
    // texture below), sampled a little closer to the line than here, and
    // dimmed - so old content keeps sliding further away and fading with
    // every tick, exactly like Translate+decay inside a feedback loop,
    // just baked into one pass instead of a chain of nodes. Below the
    // line (lower vUv.y - this app's uv convention has y increasing
    // upward) is "away" for a horizontal line, so a default axis: 'y'
    // melt drips downward, matching how melting actually looks.
    vec2 prevUv = uAxis > 0.5 ? vec2(vUv.x + uDrip, vUv.y) : vec2(vUv.x, vUv.y + uDrip);
    outColor = texture(uPrev, prevUv) * uDieOff;
  } else {
    // The other side of the line - untouched, plain live src.
    outColor = texture(uSrc, vUv);
  }
}`;

// new Melt() inside a node's code(), or use(Melt) via useInstances.
// tick(src, opts) - see MELT_FRAG above for what each option does. Try
// animating `line` yourself (e.g. `line: 0.5 + Math.sin(t) * 0.3`) for a
// line that wanders within a range instead of sitting still - the trail
// keeps dripping from wherever the line currently is.
//
// sections (default 1, the original single-line behavior): splits the
// CROSS axis into that many independent segments, each getting its own
// randomly-jittered line instead of one shared line the whole width/
// height - e.g. axis: 'y', sections: 12 gives 12 vertical columns, each
// starting its drip from a different row. jitter (0..1) is how far from
// `line` each section's own line can land; seed reshuffles which section
// gets which offset (same seed -> same pattern every time, change it for
// a different one).
export class Melt {
  constructor(filter = 'linear') {
    this.gl = getGL();
    this.filter = filter;
    this._pass = new GLSL({ filter });
    this._feedbackTex = null;
    this._feedbackFbo = null;
    this._feedbackW = 0;
    this._feedbackH = 0;
    this._copyProgram = null;
    this._hasFeedback = false; // false until a real frame exists to read back
  }

  _ensureFeedback(width, height) {
    if (this._feedbackTex && this._feedbackW === width && this._feedbackH === height) return;
    const gl = this.gl;
    if (this._feedbackTex) gl.deleteTexture(this._feedbackTex);
    if (this._feedbackFbo) gl.deleteFramebuffer(this._feedbackFbo);
    this._feedbackW = width;
    this._feedbackH = height;
    this._feedbackTex = createTexture(gl, width, height, { filter: this.filter });
    this._feedbackFbo = createFramebuffer(gl, this._feedbackTex);
    this._copyProgram ??= compileProgram(gl, PASSTHROUGH_FRAG);
    this._hasFeedback = false; // resized - old content doesn't match anymore, start fresh
  }

  _copyInto(source, fbo, width, height) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this._copyProgram);
    const loc = gl.getUniformLocation(this._copyProgram, 'uInput');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(loc, 0);
    drawFullscreenQuad(gl, this._copyProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  tick(
    src,
    { axis = 'y', line = 0.5, sections = 1, jitter = 0.2, seed = 0, thickness = 0.004, drip = 0.01, dieOff = 0.95 } = {}
  ) {
    if (!src || !src.texture) return src;
    const width = src.width || this.gl.canvas.width;
    const height = src.height || this.gl.canvas.height;
    this._ensureFeedback(width, height);

    const uPrev = this._hasFeedback ? { texture: this._feedbackTex, width, height } : src;
    this._pass.tick(MELT_FRAG, {
      uSrc: src,
      uPrev,
      uAxis: axis === 'x' ? 1 : 0,
      uLine: line,
      uSections: sections,
      uJitter: jitter,
      uSeed: seed,
      uThickness: thickness,
      uDrip: drip,
      uDieOff: dieOff,
    });

    this._copyInto(this._pass, this._feedbackFbo, width, height);
    this._hasFeedback = true;
    return this._pass;
  }

  dispose() {
    this._pass.dispose();
    if (this._feedbackTex) this.gl.deleteTexture(this._feedbackTex);
    if (this._feedbackFbo) this.gl.deleteFramebuffer(this._feedbackFbo);
    if (this._copyProgram) this.gl.deleteProgram(this._copyProgram);
  }
}

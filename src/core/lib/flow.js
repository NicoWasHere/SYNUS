import { getGL } from './context.js';
import { GLSL } from './glsl.js';
import { BLUR } from './fx/shaders.js';
import { Composite } from './composite.js';
import { Noise } from './noise.js';
import { Displace } from './fx/effects.js';
import { compileProgram, drawFullscreenQuad, createTexture, createFramebuffer } from '../../gl/gl-context.js';

// Color-preserving bright-pass extraction - UNLIKE the shared Threshold
// effect (which collapses everything to a flat grayscale value), this
// keeps src's own rgb untouched and only gates ALPHA by how far luma is
// above uLevel. That's what makes the glow come out the same color as
// whatever it's glowing off of - and it's also literally the "original
// texture with only the parts that pass threshold, so all the black is
// gone" layer used directly in the final composite below, not just an
// intermediate on the way to something else.
const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uLevel;
uniform float uSoftness;

void main() {
  vec4 c = texture(uSrc, vUv);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float v = smoothstep(uLevel - uSoftness * 0.5, uLevel + uSoftness * 0.5, luma);
  outColor = vec4(c.rgb, c.a * v);
}`;

// Same bright-pass, but premultiplied (rgb scaled by v too, not just
// alpha) - this is the actual SOURCE fed into the blur pyramid below, so
// a texel right at the threshold edge contributes proportionally LESS to
// the blurred average instead of bleeding in at full strength regardless
// of how "barely above threshold" it is. The shared BLUR shader has no
// concept of alpha-weighted sampling, so this has to be baked in before
// it ever runs.
const BRIGHT_PREMULT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uLevel;
uniform float uSoftness;

void main() {
  vec4 c = texture(uSrc, vUv);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float v = smoothstep(uLevel - uSoftness * 0.5, uLevel + uSoftness * 0.5, luma);
  outColor = vec4(c.rgb * v, v);
}`;

// A plain multiply-gain pass, reused for three different jobs below:
// weighting one blur-pyramid level before summing it with the others,
// applying the overall wide/tight gain at the end of each pyramid, and
// decaying the fed-back previous frame. Scales both rgb AND alpha (this
// pipeline stays premultiplied throughout, not just at the first step).
//
// Clamping is PER CHANNEL, not by overall brightness - which means a high
// enough gain shifts a saturated color toward white rather than just
// getting brighter (the low channels catch up to the already-clipped
// high one), the same reason a camera's blown-out highlights lose their
// color. This is what made tightGain=6 turn a red glow flat white - keep
// gain values modest (under ~2-3) if the glow's hue actually matters to
// you; there's no color-preserving way to want gain=6 AND keep the hue,
// short of a proper tone-mapping curve instead of a plain clamp.
const GAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uGain;

void main() {
  vec4 c = texture(uSrc, vUv);
  outColor = vec4(clamp(c.rgb * uGain, 0.0, 1.0), clamp(c.a * uGain, 0.0, 1.0));
}`;

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;

void main() {
  outColor = texture(uInput, vUv);
}`;

// A "blur pyramid": the SAME bright source blurred independently at
// several exponentially increasing radii (not cascaded - each level
// reads the original, not the previous level's output), then summed with
// weight 1/radius per level. Weighting by 1/radius (not a flat 1/N or
// geometric falloff) is a direct, literal read of "brightness ~ 1/x
// where x is the distance": the widest, most-spread-out level ends up
// contributing the least, the tightest/least-blurred level the most, so
// the result is bright right at the source and fades continuously over a
// long distance instead of the flat plateau-then-cliff shape a
// dilate/"grow" operation produces. Reusing the existing BLUR shader at
// each radius (rather than a bespoke large-kernel blur) is the "be
// smart, reuse what's already here" call - its fixed 5-tap kernel can
// show mild banding at the largest radii rather than a perfectly smooth
// falloff; a proper many-tap separable blur would fix that at the cost
// of a fair bit more shader complexity, worth revisiting if the banding
// is actually visible in practice.
function blurPyramid(source, blurInstances, gainInstances, combineInstances, texel, baseRadius) {
  let acc = null;
  for (let i = 0; i < blurInstances.length; i++) {
    const radius = baseRadius * Math.pow(2, i);
    blurInstances[i].tick(BLUR, { uSrc: source, uTexel: texel, uAmount: radius });
    const weight = 1 / radius;
    gainInstances[i].tick(GAIN_FRAG, { uSrc: blurInstances[i], uGain: weight });
    acc = i === 0 ? gainInstances[0] : combineInstances[i - 1].tick(acc, gainInstances[i], 'add', 1);
  }
  return acc;
}

const WIDE_LEVELS = 4;
const TIGHT_LEVELS = 2;

// new Flow() inside a node's code(). tick(src, { threshold, softness,
// wideBaseRadius, wideGain, wobbleAmount, wobbleSpeed, feedback,
// tightBaseRadius, tightGain, t }).
//
// This is the heavy, full-detail glow - a multi-level weighted blur
// pyramid (per direction) plus noise-driven wobble plus a feedback loop,
// roughly 30 draw calls a tick. That cost is real: if it's dropping your
// tps more than you want, reach for Bloom (lib/bloom.js) instead - same
// 4-layer composite stack, same idea, but a single blur pass per
// direction and no wobble/feedback, at a fraction of the draw calls.
// Flow is for when the wobble/feedback look is specifically what you're
// after and you can afford the cost; Bloom is the default-reach effect.
//
// The composite stack, back to front (this is the actual point of the
// whole class - everything above is just building these four layers):
//   1. src itself (the original, untouched)
//   2. the WIDE glow (long, soft falloff - see blurPyramid above),
//      wobbled (Noise + Displace, so different regions drift
//      independently instead of the whole glow translating together)
//      and fed back against a decayed copy of its own previous frame
//      (persistent texture, same "copy into your own separate texture"
//      trick Lag/Delay use, so this never reads the exact texture it's
//      writing into) - 'screen' blend, so it can't wash the image out to
//      flat white just by being bright
//   3. the crisp, color-true bright-pass cutout (BRIGHT_FRAG) laid back
//      on top via 'over' - wherever it's above threshold this restores
//      the ORIGINAL sharp detail/color the blur softened away; wherever
//      it's below threshold it's fully transparent, so the wide glow
//      from step 2 shows through untouched
//   4. a second, TIGHT glow pyramid (shorter base radius, fewer levels,
//      stronger gain - a "hot rim" right at the edge of what's glowing),
//      also 'screen'ed on top
//
// Entirely GPU-resident - every step is a GLSL draw call, nothing here
// ever calls sampleTexture or reads pixels back to JS.
export class Flow {
  constructor() {
    this.gl = getGL();
    this._bright = new GLSL();
    this._brightPremult = new GLSL();

    this._wideBlur = Array.from({ length: WIDE_LEVELS }, () => new GLSL());
    this._wideLevelGain = Array.from({ length: WIDE_LEVELS }, () => new GLSL());
    this._wideCombine = Array.from({ length: WIDE_LEVELS - 1 }, () => new Composite());
    this._wideFinalGain = new GLSL();

    this._tightBlur = Array.from({ length: TIGHT_LEVELS }, () => new GLSL());
    this._tightLevelGain = Array.from({ length: TIGHT_LEVELS }, () => new GLSL());
    this._tightCombine = Array.from({ length: TIGHT_LEVELS - 1 }, () => new Composite());
    this._tightFinalGain = new GLSL();

    this._noise = new Noise(64, 64);
    this._wobble = new Displace();

    this._decay = new GLSL();
    this._freshScaled = new GLSL();
    this._feedbackCombine = new Composite();

    this._stepA = new Composite(); // src + wide glow
    this._stepB = new Composite(); // + crisp cutout
    this._stepC = new Composite(); // + tight glow

    // The feedback texture is deliberately NOT a GLSL instance - it only
    // ever gets written to via the plain copy program below, never
    // rendered into by a shader that also reads from it, so there's no
    // need for GLSL's own feedback-loop guard here.
    this._feedbackTex = null;
    this._feedbackFbo = null;
    this._feedbackW = 0;
    this._feedbackH = 0;
    this._copyProgram = null;
    this._hasFeedback = false; // false until the first real frame exists to feed back
  }

  _ensureFeedback(width, height) {
    if (this._feedbackTex && this._feedbackW === width && this._feedbackH === height) return;
    const gl = this.gl;
    if (this._feedbackTex) gl.deleteTexture(this._feedbackTex);
    if (this._feedbackFbo) gl.deleteFramebuffer(this._feedbackFbo);
    this._feedbackW = width;
    this._feedbackH = height;
    this._feedbackTex = createTexture(gl, width, height);
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
    {
      threshold = 0.6,
      softness = 0.2,
      wideBaseRadius = 4,
      wideGain = 1.5,
      wobbleAmount = 0.015,
      wobbleSpeed = 0.15,
      feedback = 0.85,
      tightBaseRadius = 1,
      tightGain = 2,
      t = 0,
    } = {}
  ) {
    if (!src || !src.texture) return src;
    const width = src.width || this.gl.canvas.width;
    const height = src.height || this.gl.canvas.height;
    const texel = [1 / width, 1 / height];

    this._bright.tick(BRIGHT_FRAG, { uSrc: src, uLevel: threshold, uSoftness: softness });
    this._brightPremult.tick(BRIGHT_PREMULT_FRAG, { uSrc: src, uLevel: threshold, uSoftness: softness });

    // Wide, soft, long-fading glow
    const wide = blurPyramid(
      this._brightPremult,
      this._wideBlur,
      this._wideLevelGain,
      this._wideCombine,
      texel,
      wideBaseRadius
    );
    this._wideFinalGain.tick(GAIN_FRAG, { uSrc: wide, uGain: wideGain });

    const noiseTex = this._noise.tick({ scale: 3, seed: t * wobbleSpeed, octaves: 3, type: 'fbm' });
    const wobbled = this._wobble.tick(this._wideFinalGain, noiseTex, wobbleAmount);

    this._ensureFeedback(width, height);
    let wideGlow = wobbled;
    if (feedback > 0 && this._hasFeedback) {
      // A genuine weighted average (decayed_prev*feedback + fresh*(1-feedback)),
      // NOT decayed_prev + fresh - the latter is an unbounded leaky
      // integrator (steady state converges toward fresh/(1-feedback), which
      // saturates to white after enough ticks for almost any non-trivial
      // fresh contribution and any feedback close to 1) whereas a proper
      // weighted average can never exceed the brighter of its two inputs,
      // so it stays stable indefinitely instead of slowly washing out.
      this._decay.tick(GAIN_FRAG, { uSrc: { texture: this._feedbackTex, width, height }, uGain: feedback });
      this._freshScaled.tick(GAIN_FRAG, { uSrc: wobbled, uGain: 1 - feedback });
      wideGlow = this._feedbackCombine.tick(this._decay, this._freshScaled, 'add', 1);
    }
    this._copyInto(wideGlow, this._feedbackFbo, width, height);
    this._hasFeedback = true;

    // Tight, intense, short-falloff "hot rim" glow
    const tight = blurPyramid(
      this._brightPremult,
      this._tightBlur,
      this._tightLevelGain,
      this._tightCombine,
      texel,
      tightBaseRadius
    );
    this._tightFinalGain.tick(GAIN_FRAG, { uSrc: tight, uGain: tightGain });

    // The composite stack described above.
    let out = this._stepA.tick(src, wideGlow, 'screen', 1);
    out = this._stepB.tick(out, this._bright, 'over', 1);
    out = this._stepC.tick(out, this._tightFinalGain, 'screen', 1);
    return out;
  }

  dispose() {
    this._bright.dispose();
    this._brightPremult.dispose();

    for (const g of this._wideBlur) g.dispose();
    for (const g of this._wideLevelGain) g.dispose();
    for (const c of this._wideCombine) c.dispose();
    this._wideFinalGain.dispose();

    for (const g of this._tightBlur) g.dispose();
    for (const g of this._tightLevelGain) g.dispose();
    for (const c of this._tightCombine) c.dispose();
    this._tightFinalGain.dispose();

    this._noise.dispose();
    this._wobble.dispose();

    this._decay.dispose();
    this._freshScaled.dispose();
    this._feedbackCombine.dispose();

    this._stepA.dispose();
    this._stepB.dispose();
    this._stepC.dispose();

    // The feedback texture/fbo/program are raw GL objects, not wrapped in
    // a class with its own dispose() - see the constructor's comment on
    // why they're plain fields in the first place.
    const gl = this.gl;
    if (this._feedbackTex) gl.deleteTexture(this._feedbackTex);
    if (this._feedbackFbo) gl.deleteFramebuffer(this._feedbackFbo);
    if (this._copyProgram) gl.deleteProgram(this._copyProgram);
  }
}

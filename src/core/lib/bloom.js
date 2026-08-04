import { getGL } from './context.js';
import { GLSL } from './glsl.js';
import { BLUR } from './fx/shaders.js';
import { Composite } from './composite.js';

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

// new Bloom() inside a node's code(). tick(src, { threshold, softness,
// wideRadius, wideGain, tightRadius, tightGain }) - the basic, cheap
// glow: same 4-layer composite stack as Flow (lib/flow.js), just built
// from a SINGLE blur pass per direction instead of a multi-level
// weighted pyramid, and no noise-wobble/feedback loop - about 8 draw
// calls a tick instead of Flow's ~30. Reach for this by default; only
// use Flow if you specifically want the wobble/feedback look and can
// afford the extra cost (it visibly drops tps on a loaded scene).
//
// The composite stack, back to front:
//   1. src itself (the original, untouched)
//   2. a WIDE, soft glow (one blur pass at wideRadius) - 'screen' blend,
//      so it can't wash the image out to flat white just by being bright
//   3. the crisp, color-true bright-pass cutout (BRIGHT_FRAG) laid back
//      on top via 'over' - restores the ORIGINAL sharp detail/color
//      wherever it's above threshold; fully transparent below threshold,
//      so the wide glow from step 2 shows through untouched there
//   4. a second, TIGHT glow (shorter radius, stronger gain - a "hot rim"
//      right at the edge of what's glowing), also 'screen'ed on top
//
// Entirely GPU-resident - every step is a GLSL draw call, nothing here
// ever calls sampleTexture or reads pixels back to JS.
export class Bloom {
  constructor() {
    this.gl = getGL();
    this._bright = new GLSL();
    this._wideBlur = new GLSL();
    this._wideGain = new GLSL();
    this._tightBlur = new GLSL();
    this._tightGain = new GLSL();
    this._stepA = new Composite(); // src + wide glow
    this._stepB = new Composite(); // + crisp cutout
    this._stepC = new Composite(); // + tight glow
  }

  tick(src, { threshold = 0.6, softness = 0.2, wideRadius = 6, wideGain = 1.5, tightRadius = 2, tightGain = 2 } = {}) {
    if (!src || !src.texture) return src;
    const width = src.width || this.gl.canvas.width;
    const height = src.height || this.gl.canvas.height;
    const texel = [1 / width, 1 / height];

    this._bright.tick(BRIGHT_FRAG, { uSrc: src, uLevel: threshold, uSoftness: softness });

    this._wideBlur.tick(BLUR, { uSrc: this._bright, uTexel: texel, uAmount: wideRadius });
    this._wideGain.tick(GAIN_FRAG, { uSrc: this._wideBlur, uGain: wideGain });

    this._tightBlur.tick(BLUR, { uSrc: this._bright, uTexel: texel, uAmount: tightRadius });
    this._tightGain.tick(GAIN_FRAG, { uSrc: this._tightBlur, uGain: tightGain });

    let out = this._stepA.tick(src, this._wideGain, 'screen', 1);
    out = this._stepB.tick(out, this._bright, 'over', 1);
    out = this._stepC.tick(out, this._tightGain, 'screen', 1);
    return out;
  }
  dispose() {
    this._bright.dispose();
    this._wideBlur.dispose();
    this._wideGain.dispose();
    this._tightBlur.dispose();
    this._tightGain.dispose();
    this._stepA.dispose();
    this._stepB.dispose();
    this._stepC.dispose();
  }
}

// Every stdlib effect's full GLSL source lives here as a plain string.
// Keeping them as complete, standalone strings (not fragments assembled
// at call time) is what makes explode() possible later - it's printing
// text that already exists, not reconstructing anything.
//
// To add a new effect: write its shader below following this pattern,
// then add one entry to registry.js pointing at it. Nothing else in the
// engine needs to change.

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

// Shared helper: sample a texture, but return transparent black outside
// 0..1 instead of clamping/wrapping. Used by any effect that moves the
// sample coordinate away from vUv (rotate, scale, translate).
const SAMPLE_CLAMPED = `
vec4 sampleClamped(sampler2D tex, vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4(0.0);
  }
  return texture(tex, uv);
}
`;

// Shared helper for the modulate-family effects below (modulate,
// displace, modulateScale, modulateRotate): how to sample a uv/xy
// coordinate that's been pushed outside 0..1 by the modulation.
// uFillMode: 0 = 'clamp' (repeats the nearest edge pixel outward - can
// smear if that edge is a hard color boundary), 1 = 'transparent' (0
// alpha outside 0..1, same convention Rotate/Scale already use via
// sampleClamped above - no smear, but a visible cutoff), 2 = 'wrap'
// (tiles the source - real Hydra never sets an explicit texture wrap
// mode, so it inherits WebGL's own default of REPEAT; the "folds into a
// 3D-plane" look a big modulateScale amount gets in Hydra comes from
// repeatedly tiling near where the scale divisor crosses zero, not from
// anything scale-specific - 'wrap' here reproduces that same look).
const FILL_HELPER = `
vec4 sampleFill(sampler2D tex, vec2 uv, float fillMode) {
  if (fillMode > 1.5) return texture(tex, fract(uv));
  if (fillMode > 0.5) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture(tex, uv);
  }
  return texture(tex, clamp(uv, 0.0, 1.0));
}
`;

// Shared helper: RGB <-> HSV, needed only by hueShift.
const HSV_HELPERS = `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;

export const ROTATE = `${HEADER}${SAMPLE_CLAMPED}
uniform sampler2D uSrc;
uniform float uAngle; // radians

void main() {
  vec2 centered = vUv - 0.5;
  float s = sin(uAngle);
  float c = cos(uAngle);
  vec2 rotated = vec2(
    centered.x * c - centered.y * s,
    centered.x * s + centered.y * c
  );
  outColor = sampleClamped(uSrc, rotated + 0.5);
}`;

export const SCALE = `${HEADER}${SAMPLE_CLAMPED}
uniform sampler2D uSrc;
uniform vec2 uScale; // x, y scale factors (1.0 = no change)

void main() {
  vec2 centered = vUv - 0.5;
  vec2 scaled = centered / uScale;
  outColor = sampleClamped(uSrc, scaled + 0.5);
}`;

export const FLIP = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uFlip; // 1.0 = flip that axis, 0.0 = leave it

void main() {
  vec2 uv = vUv;
  uv.x = mix(uv.x, 1.0 - uv.x, uFlip.x);
  uv.y = mix(uv.y, 1.0 - uv.y, uFlip.y);
  outColor = texture(uSrc, uv);
}`;

export const TRANSLATE = `${HEADER}${SAMPLE_CLAMPED}
uniform sampler2D uSrc;
uniform vec2 uOffset; // in uv units, 0..1
uniform float uWrap; // 0 = shifted-off content becomes transparent (default), 1 = it loops back around the opposite edge

void main() {
  vec2 uv = vUv - uOffset;
  outColor = uWrap > 0.5 ? texture(uSrc, fract(uv)) : sampleClamped(uSrc, uv);
}`;

export const CHANNEL_MIX = `${HEADER}
uniform sampler2D uSrc;
uniform vec3 uMixR; // output.r = dot(input.rgb, uMixR)
uniform vec3 uMixG;
uniform vec3 uMixB;

void main() {
  vec4 c = texture(uSrc, vUv);
  vec3 mixed = vec3(dot(c.rgb, uMixR), dot(c.rgb, uMixG), dot(c.rgb, uMixB));
  outColor = vec4(mixed, c.a);
}`;

export const BRIGHTNESS = `${HEADER}
uniform sampler2D uSrc;
uniform float uAmount; // additive, -1..1

void main() {
  vec4 c = texture(uSrc, vUv);
  outColor = vec4(c.rgb + uAmount, c.a);
}`;

export const CONTRAST = `${HEADER}
uniform sampler2D uSrc;
uniform float uAmount; // 1.0 = no change

void main() {
  vec4 c = texture(uSrc, vUv);
  outColor = vec4((c.rgb - 0.5) * uAmount + 0.5, c.a);
}`;

export const SATURATION = `${HEADER}
uniform sampler2D uSrc;
uniform float uAmount; // 0 = grayscale, 1 = no change, >1 = boosted

void main() {
  vec4 c = texture(uSrc, vUv);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  outColor = vec4(mix(vec3(luma), c.rgb, uAmount), c.a);
}`;

export const HUE_SHIFT = `${HEADER}${HSV_HELPERS}
uniform sampler2D uSrc;
uniform float uShift; // in turns, 0..1 (i.e. degrees / 360)

void main() {
  vec4 c = texture(uSrc, vUv);
  vec3 hsv = rgb2hsv(c.rgb);
  hsv.x = fract(hsv.x + uShift);
  outColor = vec4(hsv2rgb(hsv), c.a);
}`;

// Brightness + contrast + saturation + opacity in one pass, all with a
// "1 (or 0 for brightness) leaves it unchanged" default - useful when
// you want to nudge several of these together without chaining four
// separate effect nodes.
export const GRADE = `${HEADER}
uniform sampler2D uSrc;
uniform float uBrightness; // additive, -1..1, 0 = no change
uniform float uContrast;   // 1.0 = no change
uniform float uSaturation; // 0 = grayscale, 1 = no change
uniform float uOpacity;    // multiplies alpha, 1 = no change

void main() {
  vec4 c = texture(uSrc, vUv);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 rgb = mix(vec3(luma), c.rgb, uSaturation);
  rgb = (rgb - 0.5) * uContrast + 0.5;
  rgb += uBrightness;
  outColor = vec4(rgb, c.a * uOpacity);
}`;

// A fixed 5x5 binomial-weighted (1 4 6 4 1) blur kernel - the actual
// blur "amount" scales the spacing between the 25 samples rather than
// their count, so this stays a small, fixed number of texture fetches
// regardless of how strong the blur looks. uTexel is injected
// automatically for every effect - see effects.js's makeEffectClass().
export const BLUR = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uAmount; // spacing between samples, in texels - 0 = no blur

void main() {
  float w[5] = float[5](1.0, 4.0, 6.0, 4.0, 1.0);
  vec4 sum = vec4(0.0);
  float totalW = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 offset = vec2(float(x), float(y)) * uTexel * uAmount;
      float weight = w[x + 2] * w[y + 2];
      sum += texture(uSrc, clamp(vUv + offset, 0.0, 1.0)) * weight;
      totalW += weight;
    }
  }
  outColor = sum / totalW;
}`;

// A radial ("zoom") blur, streaking every sample toward/away from
// center - visually distinct from BLUR above (uniform, directionless)
// the way a real lens's motion/zoom blur reads differently from a
// simple soft-focus blur.
export const LENS_BLUR = `${HEADER}
uniform sampler2D uSrc;
uniform float uAmount; // streak strength, 0 = no blur

void main() {
  vec2 dir = vUv - 0.5;
  vec4 sum = vec4(0.0);
  const int SAMPLES = 12;
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    vec2 uv = vUv - dir * uAmount * t * 0.15;
    sum += texture(uSrc, clamp(uv, 0.0, 1.0));
  }
  outColor = sum / float(SAMPLES);
}`;

export const THRESHOLD = `${HEADER}
uniform sampler2D uSrc;
uniform float uLevel;    // 0..1, luma cutoff
uniform float uSoftness; // smoothstep width around uLevel, 0 = hard cut

void main() {
  vec4 c = texture(uSrc, vUv);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float v = smoothstep(uLevel - uSoftness * 0.5, uLevel + uSoftness * 0.5, luma);
  outColor = vec4(vec3(v), c.a);
}`;

// Sobel edge detection on luma - gradient magnitude, not direction, so
// the result is a plain "how much of an edge is here" grayscale map.
export const EDGE = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uAmount; // multiplies the result before clamping to 0..1

float edgeLuma(sampler2D tex, vec2 uv) {
  return dot(texture(tex, uv).rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  float tl = edgeLuma(uSrc, vUv + uTexel * vec2(-1.0, 1.0));
  float t  = edgeLuma(uSrc, vUv + uTexel * vec2( 0.0, 1.0));
  float tr = edgeLuma(uSrc, vUv + uTexel * vec2( 1.0, 1.0));
  float l  = edgeLuma(uSrc, vUv + uTexel * vec2(-1.0, 0.0));
  float r  = edgeLuma(uSrc, vUv + uTexel * vec2( 1.0, 0.0));
  float bl = edgeLuma(uSrc, vUv + uTexel * vec2(-1.0,-1.0));
  float b  = edgeLuma(uSrc, vUv + uTexel * vec2( 0.0,-1.0));
  float br = edgeLuma(uSrc, vUv + uTexel * vec2( 1.0,-1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float g = clamp(length(vec2(gx, gy)) * uAmount, 0.0, 1.0);
  vec4 c = texture(uSrc, vUv);
  outColor = vec4(vec3(g), c.a);
}`;

// Classic single-pass emboss convolution on luma - a mid-gray field with
// raised/sunken edges, the traditional "engraved" look.
export const EMBOSS = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uAmount;

float embossLuma(sampler2D tex, vec2 uv) {
  return dot(texture(tex, uv).rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  float sum =
    embossLuma(uSrc, vUv + uTexel * vec2(-1.0, 1.0)) * -2.0 +
    embossLuma(uSrc, vUv + uTexel * vec2( 0.0, 1.0)) * -1.0 +
    embossLuma(uSrc, vUv + uTexel * vec2(-1.0, 0.0)) * -1.0 +
    embossLuma(uSrc, vUv                            ) *  1.0 +
    embossLuma(uSrc, vUv + uTexel * vec2( 1.0, 0.0)) *  1.0 +
    embossLuma(uSrc, vUv + uTexel * vec2( 0.0,-1.0)) *  1.0 +
    embossLuma(uSrc, vUv + uTexel * vec2( 1.0,-1.0)) *  2.0;
  float g = clamp(sum * uAmount + 0.5, 0.0, 1.0);
  vec4 c = texture(uSrc, vUv);
  outColor = vec4(vec3(g), c.a);
}`;

// Folds one half of the frame onto the other (per axis) and stretches
// it back out to fill the whole thing - the result only ever shows
// content from one half, mirrored about center. Distinct from Flip
// (which flips the WHOLE image, showing everything, just reversed).
// uHalf: 0 = left, 1 = right, 2 = top, 3 = bottom - THAT half keeps its
// own original content; the OTHER half is overwritten with a mirrored
// copy of it (not a symmetric "fold both halves toward center" - the
// named half is always the source, never the one that gets replaced).
// vUv.y = 1 is visual top (see HEADER's own convention).
export const MIRROR = `${HEADER}
uniform sampler2D uSrc;
uniform float uHalf;

void main() {
  vec2 uv = vUv;
  if (uHalf < 0.5) { // left -> cloned onto right
    uv.x = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
  } else if (uHalf < 1.5) { // right -> cloned onto left
    uv.x = uv.x > 0.5 ? uv.x : 1.0 - uv.x;
  } else if (uHalf < 2.5) { // top -> cloned onto bottom
    uv.y = uv.y > 0.5 ? uv.y : 1.0 - uv.y;
  } else { // bottom -> cloned onto top
    uv.y = uv.y < 0.5 ? uv.y : 1.0 - uv.y;
  }
  outColor = texture(uSrc, uv);
}`;

export const TILE = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uRepeat; // number of repeats per axis

void main() {
  outColor = texture(uSrc, fract(vUv * uRepeat));
}`;

// Polar-coordinate wedge mirroring around center - the classic
// kaleidoscope look.
export const KALEIDOSCOPE = `${HEADER}
uniform sampler2D uSrc;
uniform float uSegments;

void main() {
  vec2 centered = vUv - 0.5;
  float radius = length(centered);
  float angle = atan(centered.y, centered.x);
  float wedge = 6.28318530718 / max(uSegments, 1.0);
  angle = mod(angle, wedge);
  angle = abs(angle - wedge * 0.5);
  vec2 uv = vec2(cos(angle), sin(angle)) * radius + 0.5;
  outColor = texture(uSrc, clamp(uv, 0.0, 1.0));
}`;

// Hydra-style modulation: a second texture's own luma pushes every
// sample coordinate uniformly (same offset for x and y) - a softer,
// more "flowing" distortion than DISPLACE below, which pushes x/y
// independently from the map's separate r/g channels.
export const MODULATE = `${HEADER}${FILL_HELPER}
uniform sampler2D uSrc;
uniform sampler2D uMap;
uniform float uAmount;
uniform float uFillMode;

void main() {
  float m = dot(texture(uMap, vUv).rgb, vec3(0.299, 0.587, 0.114)) - 0.5;
  vec2 uv = vUv + vec2(m) * uAmount;
  outColor = sampleFill(uSrc, uv, uFillMode);
}`;

// uMap's red channel pushes uSrc's sample coordinate on x; green pushes
// it on y - a REAL 2-channel map (r != g, e.g. Noise with mono: false)
// gives fully independent x/y displacement. The green sample is ALSO
// taken from an offset uv rather than vUv directly, so a plain grayscale
// map (r == g at every pixel, which is what most sources are - a photo, a
// mono Noise, ...) still doesn't collapse into a diagonal-only shift: with
// both channels reading the same value at the same position, offset.x and
// offset.y would always be equal, which is what made this feel like it
// "wasn't doing anything" distinctive (a uniform diagonal push reads as
// barely different from no displacement at all on most content).
export const DISPLACE = `${HEADER}${FILL_HELPER}
uniform sampler2D uSrc;
uniform sampler2D uMap;
uniform float uAmount;
uniform float uFillMode;

void main() {
  float dx = texture(uMap, vUv).r - 0.5;
  float dy = texture(uMap, vUv + vec2(0.13, 0.29)).g - 0.5;
  vec2 offset = vec2(dx, dy) * 2.0 * uAmount;
  outColor = sampleFill(uSrc, vUv + offset, uFillMode);
}`;

// Hydra's own modulateScale: uMap's r/g channels push uSrc's scale
// (zoom) independently per axis around the frame's center, instead of
// offsetting uv position the way MODULATE/DISPLACE above do. Ported
// straight from hydra-synth's glsl-functions.js (same formula, same
// uniform names renamed to this project's own uAmount-family convention).
export const MODULATE_SCALE = `${HEADER}${FILL_HELPER}
uniform sampler2D uSrc;
uniform sampler2D uMap;
uniform float uMultiple;
uniform float uOffset;
uniform float uFillMode;

void main() {
  vec4 c = texture(uMap, vUv);
  vec2 xy = vUv - 0.5;
  xy *= 1.0 / vec2(uOffset + uMultiple * c.r, uOffset + uMultiple * c.g);
  xy += 0.5;
  outColor = sampleFill(uSrc, xy, uFillMode);
}`;

// Hydra's own modulateRotate: uMap's red channel pushes uSrc's rotation
// angle around the frame's center. Ported straight from hydra-synth's
// glsl-functions.js.
export const MODULATE_ROTATE = `${HEADER}${FILL_HELPER}
uniform sampler2D uSrc;
uniform sampler2D uMap;
uniform float uMultiple;
uniform float uOffset;
uniform float uFillMode;

void main() {
  vec4 c = texture(uMap, vUv);
  vec2 xy = vUv - 0.5;
  float angle = uOffset + c.r * uMultiple;
  float s = sin(angle);
  float co = cos(angle);
  xy = mat2(co, -s, s, co) * xy;
  xy += 0.5;
  outColor = sampleFill(uSrc, xy, uFillMode);
}`;

export const VIGNETTE = `${HEADER}
uniform sampler2D uSrc;
uniform float uAmount; // 0 = none, 1 = fully dark at the edges
uniform float uRadius; // 0..1, where the darkening starts

void main() {
  vec4 c = texture(uSrc, vUv);
  float d = distance(vUv, vec2(0.5));
  float falloff = smoothstep(uRadius, 0.71, d); // 0.71 ~= corner distance
  outColor = vec4(c.rgb * (1.0 - falloff * uAmount), c.a);
}`;

export const PIXELATE = `${HEADER}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uSize; // block size, in texels

void main() {
  vec2 grid = uTexel * max(uSize, 1.0);
  vec2 uv = floor(vUv / grid) * grid + grid * 0.5;
  outColor = texture(uSrc, uv);
}`;

export const POSTERIZE = `${HEADER}
uniform sampler2D uSrc;
uniform float uLevels; // color levels per channel, e.g. 4

void main() {
  vec4 c = texture(uSrc, vUv);
  float levels = max(uLevels, 2.0);
  vec3 rgb = clamp(floor(c.rgb * levels) / (levels - 1.0), 0.0, 1.0);
  outColor = vec4(rgb, c.a);
}`;

// Color lookup via a 2D "unrolled" LUT strip - the common format used by
// most LUT PNGs floating around (e.g. exported from After Effects/many
// online converters): uSize square blocks laid out left-to-right, each
// block sizeXsize texels, one block per B slice. R selects the x
// position within a block, G the y position, B selects (and blends
// between, for smoothness) which block.
export const COLOR_LOOKUP = `${HEADER}
uniform sampler2D uSrc;
uniform sampler2D uLut;
uniform float uSize;        // number of B-slices (also each block's width/height, in blocks)
uniform float uBlockTexels; // texels per block (the LUT texture's own width / uSize)
uniform float uAmount;      // 0 = original, 1 = fully graded

vec3 lutLookup(vec3 color) {
  float size = max(uSize, 2.0);
  float sliceF = clamp(color.b, 0.0, 1.0) * (size - 1.0);
  float slice0 = floor(sliceF);
  float slice1 = min(slice0 + 1.0, size - 1.0);
  float t = sliceF - slice0;
  // Insets r into the block's inner texel-center range (never landing
  // exactly on r=0/r=1, i.e. never exactly on the seam between this
  // block and its neighbor) - GL_LINEAR filtering has no idea the
  // texture is actually several logically-separate blocks side by side,
  // so sampling exactly at a seam blends this block's edge color with
  // the ADJACENT block's, a real (not cosmetic) bug at exactly r=0 or
  // r=1 - ordinary, common input values, not rare corner cases.
  float rInset = (clamp(color.r, 0.0, 1.0) * (uBlockTexels - 1.0) + 0.5) / uBlockTexels;
  // 1.0 - g, not g: every CPU->GPU upload in this project goes through
  // UNPACK_FLIP_Y_WEBGL (see gl-context.js), which puts a source image's
  // own row 0 (its visual top) at v=1, not v=0 - so sampling at v=g
  // directly would fetch the row for (1-g) instead of g. G doesn't need
  // the same block-seam inset r does: it addresses the LUT's full
  // height directly (no repeating sub-blocks along that axis), and
  // CLAMP_TO_EDGE means g=0/g=1 just clamp to the true edge texel rather
  // than bleeding into an unrelated region the way an un-inset r would.
  float g = 1.0 - clamp(color.g, 0.0, 1.0);
  vec2 uv0 = vec2((slice0 + rInset) / size, g);
  vec2 uv1 = vec2((slice1 + rInset) / size, g);
  return mix(texture(uLut, uv0).rgb, texture(uLut, uv1).rgb, t);
}

void main() {
  vec4 c = texture(uSrc, vUv);
  vec3 graded = lutLookup(c.rgb);
  outColor = vec4(mix(c.rgb, graded, uAmount), c.a);
}`;

// Cuts a hole in uSrc using a SEPARATE mask source's own shape - unlike
// Matte (which mixes two full sources through a third mask), this only
// ever touches uSrc's alpha, keeping its rgb untouched. mode: 0 =
// lightness (the mask's luma - right for a plain black/white shape), 1 =
// the mask's own alpha (right for an already-cutout mask, e.g. a Mask/
// ChromaKey/Instance/particle2d result).
export const MASK = `${HEADER}
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform float uMode;   // 0 = lightness, 1 = alpha
uniform float uInvert; // 0/1

void main() {
  vec4 src = texture(uSrc, vUv);
  vec4 m = texture(uMask, vUv);
  float v = uMode > 0.5 ? m.a : dot(m.rgb, vec3(0.299, 0.587, 0.114));
  if (uInvert > 0.5) v = 1.0 - v;
  outColor = vec4(src.rgb, src.a * v);
}`;

// Keys out pixels close to uKeyColor (plain Euclidean distance in rgb,
// not a full YUV-based key like a dedicated switcher does, but cheap and
// effective for a solid, evenly-lit backdrop) - green/blue screen style.
// uSimilarity is the distance threshold (smaller = only near-exact
// matches get keyed), uSmoothness feathers the cutoff edge instead of a
// hard cut.
export const CHROMA_KEY = `${HEADER}
uniform sampler2D uSrc;
uniform vec3 uKeyColor;
uniform float uSimilarity;
uniform float uSmoothness;

void main() {
  vec4 src = texture(uSrc, vUv);
  float dist = distance(src.rgb, uKeyColor);
  float alpha = smoothstep(uSimilarity, uSimilarity + uSmoothness, dist);
  outColor = vec4(src.rgb, src.a * alpha);
}`;

// The "Ramp + Lookup" palette-mapping trick: recolors uSrc entirely from
// a 1D gradient (uRamp - e.g. a Ramp() generator, or any wide/short
// texture) by using uSrc's OWN value (lightness by default) as the x
// position to sample that gradient at. This is NOT the same tool as
// ColorLookup above - ColorLookup remaps full rgb -> rgb through a real
// baked 3D LUT; this only ever looks at one scalar per pixel and repaints
// everything along a single color gradient (a duotone/gradient-map
// effect, not full color grading).
export const GRADIENT_MAP = `${HEADER}
uniform sampler2D uSrc;
uniform sampler2D uRamp;
uniform float uChannel; // 0 = lightness, 1 = red, 2 = green, 3 = blue

void main() {
  vec4 src = texture(uSrc, vUv);
  float v;
  if (uChannel < 0.5) v = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  else if (uChannel < 1.5) v = src.r;
  else if (uChannel < 2.5) v = src.g;
  else v = src.b;
  vec3 mapped = texture(uRamp, vec2(clamp(v, 0.0, 1.0), 0.5)).rgb;
  outColor = vec4(mapped, src.a);
}`;

// Radial lens distortion - positive uAmount bulges outward (fisheye:
// content pushed toward the edges bows out toward the viewer), negative
// pinches inward (pincushion). The classic "r' = r*(1 + k*r^2)" barrel
// distortion formula, applied around the frame's own center.
export const FISHEYE = `${HEADER}${SAMPLE_CLAMPED}
uniform sampler2D uSrc;
uniform float uAmount; // 0 = none, >0 = bulge/fisheye, <0 = pinch

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r2 = dot(p, p);
  vec2 distorted = p * (1.0 + uAmount * r2);
  outColor = sampleClamped(uSrc, distorted * 0.5 + 0.5);
}`;

export const INVERT = `${HEADER}
uniform sampler2D uSrc;
uniform float uAmount; // 0 = original, 1 = fully inverted

void main() {
  vec4 c = texture(uSrc, vUv);
  outColor = vec4(mix(c.rgb, 1.0 - c.rgb, uAmount), c.a);
}`;

// Recolors src's own lightness into a black -> uColor duotone - a
// one-line "give this a color" tool, as opposed to gradientMap above
// (an arbitrary multi-stop gradient) or colorLookup (a full 3D LUT).
export const COLORIZE = `${HEADER}
uniform sampler2D uSrc;
uniform vec3 uColor;

void main() {
  vec4 c = texture(uSrc, vUv);
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  outColor = vec4(uColor * luma, c.a);
}`;

// A tiny cheap hash, reused by both CRT (for its per-band glitch offset)
// and FilmGrain (for its per-pixel noise) - not the same shape as
// Noise.js's actual value-noise generator, this is just meant to look
// like static/dirt, not smooth clouds.
const HASH = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// Glitchy CRT: chromatic aberration (R/G/B sampled with a slight x
// offset), horizontal scanlines, a vignette, and `uBarCount` simultaneous
// horizontal tear bars (each `uBarSize` texels thick, uv.x kicked
// sideways for anything inside one) - an explicit count/size per tick,
// not a per-row probability roll, so "0 bars" is really none and "1 bar"
// is really exactly one. MAX_BARS caps the loop at compile time (GLSL
// needs a constant upper bound); uBarCount can still be 0..anything, the
// loop just breaks early once it's satisfied.
const MAX_BARS = 8;

export const CRT = `${HEADER}${SAMPLE_CLAMPED}${HASH}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uAmount; // 0 = off, 1 = full intensity (default)
uniform float uTime;
uniform float uBarCount; // how many simultaneous tear bars this tick (capped at ${MAX_BARS})
uniform float uBarSize;  // each bar's thickness, in texels

void main() {
  vec2 uv = vUv;
  float glitchStep = floor(uTime * 6.0);
  float barThickness = uBarSize * uTexel.y;

  for (int i = 0; i < ${MAX_BARS}; i++) {
    if (float(i) >= uBarCount) break;
    float seed = float(i) * 17.0 + glitchStep * 100.0;
    float barY = hash(vec2(seed, 1.0));
    if (abs(uv.y - barY) < barThickness * 0.5) {
      float dir = hash(vec2(seed, 2.0)) - 0.5;
      uv.x += dir * 0.3 * uAmount;
    }
  }

  float aberration = 0.004 * uAmount;
  float r = sampleClamped(uSrc, uv + vec2(aberration, 0.0)).r;
  float g = sampleClamped(uSrc, uv).g;
  float b = sampleClamped(uSrc, uv - vec2(aberration, 0.0)).b;
  float a = sampleClamped(uSrc, uv).a;

  float scan = sin(uv.y * 800.0) * 0.5 + 0.5;
  vec3 col = vec3(r, g, b) * mix(1.0, scan, 0.25 * uAmount);

  vec2 centered = uv - 0.5;
  float vignette = 1.0 - dot(centered, centered) * 0.6 * uAmount;

  outColor = vec4(col * vignette, a);
}`;

// Animated per-pixel noise added to rgb - uTime keeps it a moving grain
// instead of a fixed dirty-lens pattern baked into one frame.
export const FILM_GRAIN = `${HEADER}${HASH}
uniform sampler2D uSrc;
uniform float uAmount; // 0 = none, ~0.1 = subtle, ~0.5 = heavy
uniform float uTime;

void main() {
  vec4 src = texture(uSrc, vUv);
  float grain = hash(vUv * 1000.0 + uTime * 60.0) - 0.5;
  outColor = vec4(src.rgb + grain * uAmount, src.a);
}`;

// 1-bit ordered (Bayer 4x4) dithering - unlike Threshold/Posterize (a
// flat per-pixel cutoff, which bands and loses detail), an ordered dither
// spreads the quantization error across a repeating pattern so gradients
// still read as gradients at a glance, the classic "old Mac bitmap" look.
// uScale is the on-screen size (in texels) of one dither cell.
export const BITMAP = `${HEADER}
uniform sampler2D uSrc;
uniform float uScale;
uniform vec3 uColorA; // dark
uniform vec3 uColorB; // light

float bayer(ivec2 cell) {
  float m[16] = float[16](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );
  return m[cell.y * 4 + cell.x];
}

void main() {
  vec4 src = texture(uSrc, vUv);
  float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  ivec2 cell = ivec2(mod(floor(gl_FragCoord.xy / max(uScale, 1.0)), 4.0));
  float threshold = (bayer(cell) + 0.5) / 16.0;
  vec3 col = luma > threshold ? uColorB : uColorA;
  outColor = vec4(col, src.a);
}`;

// Thresholds r/g/b independently (each channel becomes flat 0 or 1 on
// its own) instead of one shared luma cutoff (see Threshold) - up to 8
// distinct output colors, the "RGB glitch poster" look.
export const CHANNEL_THRESHOLD = `${HEADER}
uniform sampler2D uSrc;
uniform vec3 uLevels; // per-channel threshold, r/g/b independently

void main() {
  vec4 src = texture(uSrc, vUv);
  vec3 col = step(uLevels, src.rgb);
  outColor = vec4(col, src.a);
}`;

// Periodic horizontal (or vertical) lines that ALWAYS oscillate up/down
// (a sine wave riding each line's own position, animated by uTime) -
// src's own lightness at a point drives how far THAT point's wave swings
// (uMaxWobble), not the line's thickness (uThickness is its own fixed
// parameter now). Each line gets its OWN random phase + a little
// frequency variation (via HASH, keyed on that line's own band index) so
// neighboring lines wobble independently instead of all being identical
// copies of the same wave. Dark content still draws no line at all,
// which is what makes the pattern read as tracing/conforming to
// whatever's bright in the frame rather than a uniform grid painted over
// everything. A simpler, single-pass approximation of "trace the
// silhouette" - not a literal per-row edge scan.
export const SCAN_LINES = `${HEADER}${HASH}
uniform sampler2D uSrc;
uniform float uSpacing;         // texels between adjacent line centers
uniform float uThickness;       // BASE line thickness, in texels, at luma = 0
uniform float uThicknessAmount; // extra thickness, in texels, added at luma = 1 (0 = flat, not luma-driven)
uniform float uMaxWobble;       // max wave swing, in texels, at luma = 1
uniform float uWobbleFreq;      // spatial frequency of the wave along the line's own length
uniform float uVertical;        // 0 = horizontal lines, 1 = vertical
uniform vec3 uColor;
uniform float uThreshold;       // luma cutoff - which side depends on uThresholdMode
uniform float uThresholdMode;   // 0 = exclude src darker than uThreshold, 1 = exclude src brighter than it
uniform float uTime;            // keeps the oscillation moving
uniform float uSeed;            // reshuffles the per-line random phase/frequency jitter

void main() {
  vec4 src = texture(uSrc, vUv);
  float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));

  // "across" = the axis that decides which line-band a pixel falls in
  // (perpendicular to the lines); "along" = the axis a line runs along,
  // which is what the wave's phase travels down.
  float acrossPx = mix(gl_FragCoord.y, gl_FragCoord.x, uVertical);
  float alongPx = mix(gl_FragCoord.x, gl_FragCoord.y, uVertical);

  float cellSize = max(uSpacing, 1.0);
  float center = cellSize * 0.5;
  float bandIndex = floor(acrossPx / cellSize);

  float phaseJitter = hash(vec2(bandIndex, uSeed)) * 6.2831853;
  float freqJitter = 0.7 + hash(vec2(bandIndex, uSeed + 0.5)) * 0.6;

  float wave = sin(alongPx * uWobbleFreq * freqJitter + uTime + phaseJitter) * (luma * uMaxWobble);
  float linePos = mod(acrossPx - wave, cellSize);
  float halfThickness = max(uThickness + uThicknessAmount * luma, 0.0) * 0.5;

  float within = step(abs(linePos - center), halfThickness);
  float passesThreshold = uThresholdMode > 0.5 ? step(luma, uThreshold) : step(uThreshold, luma);
  float visible = within * passesThreshold;

  outColor = vec4(uColor * visible, src.a * visible);
}`;

// Extracts a sub-rectangle of src and stretches it to fill the whole
// frame - the "cut this part out and blow it up" meaning of crop, as
// opposed to Mask (cuts a hole in place, doesn't reposition/rescale
// anything) or Scale/Translate (moves the WHOLE frame, not a sub-region).
// uRect is x,y (top-left corner, 0..1, y=0 at the top - same convention
// ComposeAt/compose-at.js uses) and w,h (size, 0..1).
export const CROP = `${HEADER}${SAMPLE_CLAMPED}
uniform sampler2D uSrc;
uniform vec4 uRect;

void main() {
  vec2 screenUv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 sourceUv = uRect.xy + screenUv * uRect.zw;
  outColor = sampleClamped(uSrc, vec2(sourceUv.x, 1.0 - sourceUv.y));
}`;

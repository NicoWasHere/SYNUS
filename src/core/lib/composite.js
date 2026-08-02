import { GLSL } from './glsl.js';

// Mode name -> integer code. GLSL can't switch on a string, so the mode
// is looked up here in JS and passed down as a uniform - as a float, not
// an int: GLSL.tick()'s uniform-setting code sends every plain JS number
// through gl.uniform1f() (that's also how it sends booleans, as 0.0/1.0 -
// see glsl.js), so a uniform declared `int` here would silently never
// actually get set (a real bug this had until now - every mode ended up
// behaving like 'over', since the uMode uniform stayed at its compiled-in
// default of 0 no matter what was requested). Small integers like these
// are exactly representable as floats, so comparing with `==` in the
// shader below is still exact, no epsilon needed.
const MODES = {
  over: 0,
  atop: 1,
  xor: 2,
  multiply: 10,
  screen: 11,
  darken: 12,
  lighten: 13,
  add: 14,
  difference: 15,
  hardLight: 16,
  softLight: 17,
  // "lighten"/"darken" above are per-CHANNEL min/max - they can pull
  // e.g. a's red and b's blue into the same output pixel. These two
  // instead compare each pixel's overall luminance and keep that whole
  // pixel (all channels together, from whichever side won) - Photoshop
  // calls this pair "Lighter/Darker Color" for the same reason.
  lightest: 18,
  darkest: 19,
};

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMode;
uniform float uOpacity;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 blendColor(float mode, vec3 cb, vec3 cs) {
  if (mode == 10.0) return cb * cs;                            // multiply
  if (mode == 11.0) return 1.0 - (1.0 - cb) * (1.0 - cs);       // screen
  if (mode == 12.0) return min(cb, cs);                         // darken
  if (mode == 13.0) return max(cb, cs);                         // lighten
  if (mode == 14.0) return clamp(cb + cs, 0.0, 1.0);            // add
  if (mode == 15.0) return abs(cb - cs);                        // difference
  if (mode == 16.0) {                                           // hard light
    vec3 mult = cb * (2.0 * cs);
    vec3 scr = 1.0 - (1.0 - cb) * (1.0 - (2.0 * cs - 1.0));
    return mix(mult, scr, step(0.5, cs));
  }
  if (mode == 17.0) {                                           // soft light (W3C formula)
    vec3 dLow = ((16.0 * cb - 12.0) * cb + 4.0) * cb;
    vec3 dHigh = sqrt(cb);
    vec3 d = mix(dHigh, dLow, step(cb, vec3(0.25)));
    vec3 low = cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
    vec3 high = cb + (2.0 * cs - 1.0) * (d - cb);
    return mix(low, high, step(0.5, cs));
  }
  if (mode == 18.0) return luma(cs) > luma(cb) ? cs : cb;       // lightest (whole-pixel)
  if (mode == 19.0) return luma(cs) < luma(cb) ? cs : cb;       // darkest (whole-pixel)
  return cs;
}

void main() {
  vec4 cb = texture(uA, vUv); // backdrop (a)
  vec4 cs = texture(uB, vUv); // source (b)
  cs.a *= uOpacity;

  // Color blend modes (>= 10): the W3C compositing-and-blending formula -
  // Co = Cs(1-ab) + Cb(1-as) + blend(Cb,Cs)*ab*as, ao = as + ab(1-as).
  // Using the blend result ONLY where both layers actually have coverage
  // (weighted by ab*as) is what makes this alpha-correct: naively doing
  // e.g. multiply(cb.rgb, cs.rgb) directly and mixing by alpha afterward
  // breaks the moment one side has zero alpha but a leftover rgb of
  // (0,0,0) (any cleared/transparent region) - multiply against that
  // black is black, so anywhere a was transparent but b had content,
  // the result went solid black instead of just showing b. This
  // formula never multiplies the raw colors together outside the actual
  // overlap (weighted by ab*as), so a transparent side just falls out.
  if (uMode >= 10.0) {
    vec3 blended = blendColor(uMode, cb.rgb, cs.rgb);
    vec3 rgb = cs.rgb * (1.0 - cb.a) + cb.rgb * (1.0 - cs.a) + blended * cb.a * cs.a;
    float outA = cs.a + cb.a * (1.0 - cs.a);
    outColor = vec4(rgb, outA);
    return;
  }

  if (uMode == 1.0) { // atop: b shows only where a already has coverage
    vec3 rgb = cs.rgb * cs.a * cb.a + cb.rgb * cb.a * (1.0 - cs.a);
    outColor = vec4(rgb, cb.a);
    return;
  }
  if (uMode == 2.0) { // xor: only where exactly one of a/b has coverage
    float outA = cb.a * (1.0 - cs.a) + cs.a * (1.0 - cb.a);
    vec3 rgb = cb.a > cs.a ? cb.rgb : cs.rgb;
    outColor = vec4(rgb, outA);
    return;
  }

  // over (default): b composited on top of a
  float outA = cs.a + cb.a * (1.0 - cs.a);
  vec3 rgb = mix(cb.rgb, cs.rgb, cs.a);
  outColor = vec4(rgb, outA);
}`;

// new Composite() inside a node's code(). tick(a, b, mode, opacity)
// combines two texture-bearing values, b layered onto a, using either a
// Porter-Duff compositing mode ('over', 'atop', 'xor') or a color blend
// mode ('multiply', 'screen', 'darken', 'lighten', 'add', 'difference',
// 'hardLight', 'softLight', 'lightest', 'darkest'). `opacity` (0..1,
// default 1) fades b's contribution before compositing - 0 shows only
// a, 1 is full strength.
export class Composite {
  constructor() {
    this._glsl = new GLSL();
  }
  tick(a, b, mode = 'over', opacity = 1) {
    const code = MODES[mode];
    if (code === undefined) {
      throw new Error(`Composite: unknown mode "${mode}" (try: ${Object.keys(MODES).join(', ')})`);
    }
    this._glsl.tick(FRAG, { uA: a, uB: b, uMode: code, uOpacity: opacity });
    return this._glsl;
  }
}

const MATTE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uMatte;

void main() {
  vec4 a = texture(uA, vUv);
  vec4 b = texture(uB, vUv);
  float m = dot(texture(uMatte, vUv).rgb, vec3(0.299, 0.587, 0.114));
  outColor = mix(a, b, m);
}`;

// new Matte() inside a node's code(). tick(a, b, matte) mixes a and b
// per-pixel using a third source's own luminance as the mix factor (0 =
// all a, 1 = all b) - a luma matte/mask, the classic way to key one
// layer through the shape of a separate (often plain black/white)
// source instead of relying on that source's own alpha channel.
export class Matte {
  constructor() {
    this._glsl = new GLSL();
  }
  tick(a, b, matte) {
    this._glsl.tick(MATTE_FRAG, { uA: a, uB: b, uMatte: matte });
    return this._glsl;
  }
}

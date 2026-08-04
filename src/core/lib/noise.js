import { GLSL } from './glsl.js';

// Two families, closer to TouchDesigner's Noise TOP than to a single
// "the" noise function: 'fbm' (smooth, cloudy - multiple octaves of
// classic hash-based value noise, TD's "Harmonic Summation"-ish look)
// and 'cellular' (Worley/Voronoi distance field - TD's "Pebble"/
// "Alligator" family look). Both are grayscale; combine with Grade/
// ChannelMix/a Composite mode for anything more colorful.
const NOISE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uScale;
uniform float uSeed;
uniform float uOctaves;
uniform float uType; // 0 = fbm, 1 = cellular

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash2(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amp * valueNoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return value;
}

float cellular(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash2(i + neighbor);
      float dist = length(neighbor + point - f);
      minDist = min(minDist, dist);
    }
  }
  return minDist;
}

void main() {
  vec2 p = vUv * uScale + uSeed;
  float n = uType > 0.5 ? 1.0 - clamp(cellular(p), 0.0, 1.0) : fbm(p, int(uOctaves));
  outColor = vec4(vec3(n), 1.0);
}`;

// new Noise() inside a node's code(). tick({ scale, seed, octaves, type })
// - a generator, not an effect (no `src`, same idea as Ramp).
// `seed` is just an offset added to the sample position on both axes -
// there's no built-in animation, but passing t (this node's own third
// code() argument) there animates it for free: noise.tick({ seed: t }).
// `octaves` only matters for type: 'fbm' (more octaves = more fine
// detail layered on top, at a small extra cost per octave, capped at 8).
//
// IMPORTANT: use tick()'s RETURN VALUE, not the Noise instance itself -
// see ramp.js's own comment for why (same convention as Composite/Bloom/
// every fx effect): const out = noise.tick({...}); return { screen: out };
export class Noise {
  // No width/height default here - leave them undefined so GLSL's own
  // default (the live screenSize(), not a fixed 512) takes over.
  constructor(width, height) {
    this._glsl = new GLSL({ width, height });
  }

  tick({ scale = 4, seed = 0, octaves = 4, type = 'fbm' } = {}) {
    this._glsl.tick(NOISE_FRAG, {
      uScale: scale,
      uSeed: seed,
      uOctaves: octaves,
      uType: type === 'cellular' ? 1 : 0,
    });
    return this._glsl;
  }
  dispose() {
    this._glsl.dispose();
  }
}

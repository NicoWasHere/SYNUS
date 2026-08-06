import { GLSL } from './glsl.js';

// Four families, closer to TouchDesigner's Noise TOP than to a single
// "the" noise function - 'value' (smooth/blobby, classic hash-interpolated
// value noise), 'perlin' (smoother and more "flowing" than value noise -
// gradient-based, the actual Perlin algorithm rather than value noise
// wearing its name), 'voronoi' (Worley/cellular distance field - TD's
// "Pebble"/"Alligator" look), and 'static' (pure per-pixel/per-frame TV
// static, no smoothing at all - decorrelated noise, not a cloud).
//
// Genuinely 3D: `z` is its own axis, sampled independently of the x/y
// plane - animate z (pass t) to morph the pattern in place, with NO x/y
// panning at all. `seed` is a fixed per-instance offset (for two Noise
// instances to look different from each other), not something you'd
// normally animate - z is what TouchDesigner's own Noise TOP calls its
// third axis for exactly this reason.
const NOISE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uScale;
uniform vec2 uSeed;
uniform float uZ;
uniform float uOctaves;
uniform float uType; // 0 = value, 1 = perlin, 2 = voronoi, 3 = static
uniform float uMono; // 1 = grayscale (r=g=b), 0 = decorrelated per-channel color

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 hash3(vec3 p) {
  return vec3(
    hash(p + vec3(0.0, 0.0, 0.0)),
    hash(p + vec3(13.7, 41.3, 7.9)),
    hash(p + vec3(71.9, 19.1, 53.3))
  );
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

vec3 gradDir(vec3 p) {
  return normalize(hash3(p) * 2.0 - 1.0);
}

float perlinNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(gradDir(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
  float n100 = dot(gradDir(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(gradDir(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(gradDir(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(gradDir(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(gradDir(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(gradDir(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(gradDir(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z) * 0.5 + 0.5;
}

float fbm(vec3 p, int octaves, float type) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amp * (type < 0.5 ? valueNoise(p) : perlinNoise(p));
    p *= 2.0;
    amp *= 0.5;
  }
  return value;
}

float voronoi(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float minDist = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash3(i + neighbor);
        float dist = length(neighbor + point - f);
        minDist = min(minDist, dist);
      }
    }
  }
  return minDist;
}

// Deliberately NOT smoothed - a fresh, uncorrelated random value per cell
// per frame is exactly what makes this read as flickering static rather
// than a slowly-drifting cloud (which is all the other three types are).
// p.z (uZ, typically t) is used RAW, not floored - hash()'s own nonlinear
// scramble already turns any small continuous change in it into a
// completely different-looking output, which is the actual flicker.
float staticNoise(vec3 p) {
  return hash(vec3(floor(p.xy), p.z));
}

float sampleNoise(vec3 p, float type, int octaves) {
  if (type < 1.5) return fbm(p, octaves, type);
  if (type < 2.5) return 1.0 - clamp(voronoi(p), 0.0, 1.0);
  return staticNoise(p);
}

void main() {
  vec3 p = vec3(vUv * uScale + uSeed, uZ);
  float r = sampleNoise(p, uType, int(uOctaves));
  if (uMono > 0.5) {
    outColor = vec4(vec3(r), 1.0);
  } else {
    // Same field, offset far enough in x/z per channel to decorrelate the
    // VALUES while keeping the same scale/character - a colorful cloud/
    // static instead of a literal r=g=b gray one, without needing to
    // sample three totally different noise fields.
    float g = sampleNoise(p + vec3(17.3, 0.0, 9.1), uType, int(uOctaves));
    float b = sampleNoise(p + vec3(0.0, 0.0, 33.7), uType, int(uOctaves));
    outColor = vec4(r, g, b, 1.0);
  }
}`;

const TYPE_CODES = { value: 0, fbm: 0, perlin: 1, voronoi: 2, cellular: 2, static: 3 };

// new Noise() inside a node's code(). tick({ scale, seed, z, octaves, type, mono })
// - a generator, not an effect (no `src`, same idea as Ramp).
//
//   const out = use(Noise).tick({ type: 'perlin', z: t, mono: false });
//
// scale: how many noise "cells" fit across the frame.
// seed: a fixed [x, y] offset (or a single number for both axes) - for
//   making two Noise instances look different, not for animating.
// z: the noise field's third axis - animate THIS (pass t) to morph the
//   pattern in place with no x/y panning at all, unlike seed.
// octaves: only matters for type 'value'/'perlin' (more octaves = more
//   fine detail layered on top, capped at 8).
// type: 'value' | 'perlin' | 'voronoi' | 'static' ('fbm'/'cellular' still
//   accepted as aliases for 'value'/'voronoi').
// mono: true (default) for grayscale, false for a decorrelated-per-
//   channel color version of the same field.
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

  tick({ scale = 4, seed = 0, z = 0, octaves = 4, type = 'value', mono = true } = {}) {
    const seedVec = Array.isArray(seed) ? seed : [seed, seed];
    this._glsl.tick(NOISE_FRAG, {
      uScale: scale,
      uSeed: seedVec,
      uZ: z,
      uOctaves: octaves,
      uType: TYPE_CODES[type] ?? 0,
      uMono: mono ? 1 : 0,
    });
    return this._glsl;
  }
  dispose() {
    this._glsl.dispose();
  }
}

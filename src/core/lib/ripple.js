import { GLSL } from './glsl.js';

// One HEADER + one uPoint/uFreq/uAmp/uSpeed uniform quartet + one wave
// contribution per point - built fresh only when the COUNT of points
// changes, same pattern as compose-at.js's buildShader().
function buildShader(n) {
  let decls = '';
  let body = '';
  for (let i = 0; i < n; i++) {
    decls += `uniform vec2 uPoint${i};\nuniform float uFreq${i};\nuniform float uAmp${i};\nuniform float uSpeed${i};\n`;
    body += `
  {
    vec2 delta = vUv - uPoint${i};
    float dist = length(delta);
    vec2 dir = dist > 0.0001 ? delta / dist : vec2(0.0);
    float wave = sin(dist * uFreq${i} - uTime * uSpeed${i});
    float weight = 1.0 / (dist * dist + 0.001);
    totalOffset += dir * wave * uAmp${i} * weight;
    totalWeight += weight;
  }`;
  }
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uTime;
${decls}
void main() {
  vec2 totalOffset = vec2(0.0);
  float totalWeight = 0.0;
${body}
  vec2 offset = totalWeight > 0.0 ? totalOffset / totalWeight : vec2(0.0);
  outColor = texture(uSrc, clamp(vUv + offset, 0.0, 1.0));
}`;
}

// new Ripple() inside a node's code(), or use(Ripple) via useInstances.
// tick(src, points, t) - each point radiates its own outward-moving wave,
// and where more than one point's waves reach the same pixel they blend
// (inverse-square-distance weighted) rather than one replacing the other:
//
//   const out = use(Ripple).tick(inputs.src, [
//     { x: 0.3, y: 0.5, frequency: 40, amplitude: 0.02, speed: 4 },
//     { x: 0.7, y: 0.5, frequency: 20, amplitude: 0.03, speed: 2 },
//   ], t);
//
// points: array of { x, y (0..1, uv space), frequency = 40 (ripples per
// unit distance - higher = tighter rings), amplitude = 0.02 (how far
// pixels get pushed), speed = 4 (how fast the rings travel outward) }.
// Right next to a point, its own pattern dominates almost completely
// (weight grows sharply as distance shrinks); roughly equidistant between
// two points is where you actually see a genuine blend of both.
export class Ripple {
  constructor() {
    this._glsl = new GLSL();
    this._cachedCount = -1;
    this._frag = '';
  }

  tick(src, points = [], t = 0) {
    const n = points.length;
    if (n !== this._cachedCount) {
      this._frag = buildShader(n);
      this._cachedCount = n;
    }
    const uniforms = { uSrc: src, uTime: t };
    points.forEach((p, i) => {
      uniforms[`uPoint${i}`] = [p.x, p.y];
      uniforms[`uFreq${i}`] = p.frequency ?? 40;
      uniforms[`uAmp${i}`] = p.amplitude ?? 0.02;
      uniforms[`uSpeed${i}`] = p.speed ?? 4;
    });
    this._glsl.tick(this._frag, uniforms);
    return this._glsl;
  }
  dispose() {
    this._glsl.dispose();
  }
}

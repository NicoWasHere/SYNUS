import { GLSL } from './glsl.js';

// One HEADER + one uPoint/uRadius/uAmount uniform trio + one warp step per
// point - built fresh only when the COUNT of points changes, same pattern
// as compose-at.js's buildShader().
function buildShader(n) {
  let decls = '';
  let body = '';
  for (let i = 0; i < n; i++) {
    decls += `uniform vec2 uPoint${i};\nuniform float uRadius${i};\nuniform float uAmount${i};\n`;
    body += `
  {
    vec2 delta = uv - uPoint${i};
    float dist = length(delta);
    if (uRadius${i} > 0.0 && dist < uRadius${i}) {
      float percent = 1.0 - dist / uRadius${i};
      float factor = 1.0 + uAmount${i} * percent * percent;
      uv = uPoint${i} + delta / factor;
    }
  }`;
  }
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
${decls}
void main() {
  vec2 uv = vUv;
${body}
  outColor = texture(uSrc, clamp(uv, 0.0, 1.0));
}`;
}

// new Warp() inside a node's code(), or use(Warp) via useInstances.
// tick(src, points) - a localized bulge/pinch per point, not a full-frame
// distortion:
//
//   const out = use(Warp).tick(inputs.src, [{ x: 0.5, y: 0.5, radius: 0.4, amount: 0.8 }]);
//
// points: array of { x, y (0..1, uv space), radius = 0.3 (0..1, how far
// the warp reaches before fading to no effect), amount = 0.5 }. Positive
// amount magnifies/bulges outward around that point (like a lens held
// over it); negative pinches/shrinks toward it. Points compose in array
// order - overlapping points all take effect rather than the last one
// replacing the others, so e.g. a big gentle bulge and a small sharp
// pinch can sit on top of each other.
export class Warp {
  constructor() {
    this._glsl = new GLSL();
    this._cachedCount = -1;
    this._frag = '';
  }

  tick(src, points = []) {
    const n = points.length;
    if (n !== this._cachedCount) {
      this._frag = buildShader(n);
      this._cachedCount = n;
    }
    const uniforms = { uSrc: src };
    points.forEach((p, i) => {
      uniforms[`uPoint${i}`] = [p.x, p.y];
      uniforms[`uRadius${i}`] = p.radius ?? 0.3;
      uniforms[`uAmount${i}`] = p.amount ?? 0.5;
    });
    this._glsl.tick(this._frag, uniforms);
    return this._glsl;
  }
  dispose() {
    this._glsl.dispose();
  }
}

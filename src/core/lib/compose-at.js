import { GLSL } from './glsl.js';

// One HEADER + one uTex/uRect pair + one composite-step per rect, built
// fresh only when the COUNT of rects changes (GLSL.tick()'s own _compile()
// caching means recompiling the same source every tick is already free,
// but this avoids even building the string when nothing changed).
function buildShader(n) {
  let decls = '';
  let body = '';
  for (let i = 0; i < n; i++) {
    decls += `uniform sampler2D uTex${i};\nuniform vec4 uRect${i}; // x,y (top-left, 0..1), w,h\n`;
    body += `
  {
    vec4 r = uRect${i};
    vec2 screenUv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 local = (screenUv - r.xy) / r.zw;
    if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
      vec4 c = texture(uTex${i}, vec2(local.x, 1.0 - local.y));
      outColor = mix(outColor, c, c.a);
    }
  }`;
  }
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
${decls}
void main() {
  outColor = vec4(0.0);
${body}
}`;
}

// new ComposeAt() inside a node's code(), or use(ComposeAt) via
// useInstances - the runtime half of the $compose_at(n)$ editor shortcut
// (see ui/compose-at-tool.js for the placement UI that generates a
// node's rects). tick(rects) composites each rect's own texture into its
// own rectangle of the frame - a lightweight picture-in-picture / multi-
// viewport layout tool.
//
// rects: array of { value, x, y, w, h } - value is anything with a
// .texture (an `inputs.x` port, an effect's output, ...); x/y are the
// rect's TOP-LEFT corner (0..1, y=0 at the top, matching how you'd place
// it on screen); w/h are its size (0..1). Rects are drawn in array order,
// so a later entry overlaps an earlier one where they intersect.
//
// A rect whose `value` is missing (e.g. an unwired input port) doesn't
// throw, but its sampler uniform never gets set for that tick, so it'll
// show whatever an earlier rect's texture happened to leave bound rather
// than staying reliably blank - wire every rect's input if you don't
// want that.
export class ComposeAt {
  constructor() {
    this._glsl = new GLSL();
    this._cachedCount = -1;
    this._frag = '';
  }

  tick(rects) {
    const n = rects.length;
    if (n !== this._cachedCount) {
      this._frag = buildShader(n);
      this._cachedCount = n;
    }
    const uniforms = {};
    rects.forEach((r, i) => {
      uniforms[`uTex${i}`] = r.value;
      uniforms[`uRect${i}`] = [r.x, r.y, r.w, r.h];
    });
    this._glsl.tick(this._frag, uniforms);
    return this._glsl;
  }
  dispose() {
    this._glsl.dispose();
  }
}

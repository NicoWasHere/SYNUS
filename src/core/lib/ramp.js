import { GLSL } from './glsl.js';

const RAMP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uAngle; // radians - direction the gradient travels
uniform vec3 uFrom;
uniform vec3 uTo;

void main() {
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  float t = clamp(dot(vUv - 0.5, dir) + 0.5, 0.0, 1.0);
  outColor = vec4(mix(uFrom, uTo, t), 1.0);
}`;

// new Ramp() inside a node's code(). tick({ angle, from, to }) - a
// generator, not an effect (no `src` - there's nothing to process, it
// draws its own gradient from scratch every tick). angle is in degrees
// (0 = left-to-right, 90 = bottom-to-top); from/to are [r,g,b] in 0..1.
//
// IMPORTANT: use tick()'s RETURN VALUE, not the Ramp instance itself -
// same convention as Composite/Bloom/every fx effect (Rotate, Scale,
// ...), which all wrap an internal GLSL instance and hand back THAT from
// tick() rather than owning a .texture directly the way Canvas2D/GLSL/
// HydraSource do:
//   const ramp = use(Ramp);
//   const out = ramp.tick({ angle: 45 });  // <- out has .texture, ramp doesn't
//   return { screen: out };                //    NOT { screen: ramp }
export class Ramp {
  // No width/height default here - leave them undefined so GLSL's own
  // default (the live screenSize(), not a fixed 512) takes over.
  constructor(width, height) {
    this._glsl = new GLSL({ width, height });
  }

  tick({ angle = 0, from = [0, 0, 0], to = [1, 1, 1] } = {}) {
    this._glsl.tick(RAMP_FRAG, { uAngle: (angle * Math.PI) / 180, uFrom: from, uTo: to });
    return this._glsl;
  }
}

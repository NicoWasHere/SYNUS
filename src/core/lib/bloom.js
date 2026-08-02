import { GLSL } from './glsl.js';
import { THRESHOLD, BLUR } from './fx/shaders.js';
import { Composite } from './composite.js';

// new Bloom() inside a node's code(). tick(src, { threshold, blurAmount,
// intensity }) - unlike the single-shader effects in fx/, bloom is
// genuinely a 3-pass operation (bright-pass extraction, blur that,
// additively combine with the original) and can't be expressed as one
// fragment shader, so this is a hand-written class instead of a
// fx/registry.js entry - the same reason Composite/Matte are their own
// classes rather than effects.
//
// Each pass owns its own GLSL/Composite instance (constructed once,
// reused every tick), so this is exactly as cheap per-frame as any other
// lib class here - three draw calls, not three new allocations.
export class Bloom {
  constructor() {
    this._bright = new GLSL();
    this._blur = new GLSL();
    this._combine = new Composite();
  }

  tick(src, { threshold = 0.6, blurAmount = 3, intensity = 1 } = {}) {
    this._bright.tick(THRESHOLD, { uSrc: src, uLevel: threshold, uSoftness: 0.2 });
    const blurTexel = [1 / this._bright.width, 1 / this._bright.height];
    this._blur.tick(BLUR, { uSrc: this._bright, uTexel: blurTexel, uAmount: blurAmount });
    return this._combine.tick(src, this._blur, 'add', intensity);
  }
}

import { getGL, screenSize } from './context.js';
import { GLSL } from './glsl.js';

// new Fill() inside a node's code(), or use(Fill). tick(src, mode, { width,
// height, blurAmount }) finds src's actual content (via alpha, not
// width/height - so it still works after e.g. a Scale shrinks something
// inside the same buffer) and scales it to fill a frame (default
// screenSize()). mode: 'scale' (cover - uniform zoom, no distortion, crops
// overflow) | 'stretch' (distorts to fill exactly, no cropping) | 'tile' |
// 'mirror' | 'blur' (default - extends/averages nearby color into the gap,
// the one to reach for on irregular or diagonal shapes a rectangle doesn't
// fit well).
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uBlurred; // only sampled in 'blur' mode - ignored otherwise
uniform vec2 uRectMin;      // detected content rect, in uSrc's own uv space
uniform vec2 uRectMax;
uniform vec2 uRectCenter;
uniform vec2 uMapScale;      // contain-fit scale (target <-> source)
uniform vec2 uCoverMapScale; // cover-fit scale (target <-> source)
uniform float uMode;         // 0 scale, 1 stretch, 2 tile, 3 mirror, 4 blur

vec2 mirrorFold(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  return mix(f, 1.0 - f, mod(i, 2.0));
}

void main() {
  vec2 rectSpan = max(uRectMax - uRectMin, vec2(0.0001));

  if (uMode < 0.5) { // scale: uniform zoom to cover, no distortion
    vec2 uv = uRectCenter + (vUv - 0.5) * uCoverMapScale;
    vec4 c = texture(uSrc, clamp(uv, uRectMin, uRectMax));
    outColor = vec4(c.rgb, 1.0); // forced opaque - never re-darken toward black by alpha
    return;
  }
  if (uMode < 1.5) { // stretch: distort to fill exactly
    vec4 c = texture(uSrc, uRectMin + vUv * rectSpan);
    outColor = vec4(c.rgb, 1.0);
    return;
  }

  // tile / mirror / blur: crisp contain-fit foreground, composited over a
  // background that fills the rest.
  vec2 sourceUv = uRectCenter + (vUv - 0.5) * uMapScale;
  vec4 bg;
  if (uMode < 2.5) {
    vec2 rel = (sourceUv - uRectMin) / rectSpan;
    bg = texture(uSrc, uRectMin + fract(rel) * rectSpan);
  } else if (uMode < 3.5) {
    vec2 rel = (sourceUv - uRectMin) / rectSpan;
    bg = texture(uSrc, uRectMin + mirrorFold(rel) * rectSpan);
  } else {
    bg = texture(uBlurred, vUv);
  }

  vec4 fg = vec4(0.0);
  if (sourceUv.x >= uRectMin.x && sourceUv.x <= uRectMax.x && sourceUv.y >= uRectMin.y && sourceUv.y <= uRectMax.y) {
    fg = texture(uSrc, sourceUv);
  }
  // bg.rgb is used AS-IS (not re-darkened toward black by its own alpha
  // first) - it's meant to be a guaranteed-opaque backdrop, and doing
  // that darkened it wherever the fill hadn't fully "saturated" back to
  // alpha 1 (a real color was already found and averaged in - alpha
  // there is just confidence, not a reason to dim it).
  outColor = vec4(mix(bg.rgb, fg.rgb, fg.a), 1.0);
}`;

const ALPHA_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
void main() { outColor = texture(uSrc, vUv); }`;

// Same 5x5 weighted blur every other blur here uses, EXCEPT it weights
// each tap's color contribution by that tap's own alpha - a fully
// transparent neighbor (typically black, since that's what "nothing
// drawn here" clears to) contributes NOTHING to the color average
// instead of dragging it toward black. Repeated passes progressively
// extend real color outward from wherever it actually exists into
// nearby gaps - genuinely "average the closest color", not a blur that
// happens to sit on top of one, which is what makes this the mode that
// still looks reasonable around an irregular or diagonal edge (where a
// straight rect's corners don't match the actual shape).
const FILL_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uAmount;

void main() {
  float w[5] = float[5](1.0, 4.0, 6.0, 4.0, 1.0);
  vec3 colorSum = vec3(0.0);
  float alphaSum = 0.0;
  float weightSum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec4 c = texture(uSrc, clamp(vUv + vec2(float(x), float(y)) * uTexel * uAmount, 0.0, 1.0));
      float weight = w[x + 2] * w[y + 2];
      colorSum += c.rgb * c.a * weight;
      alphaSum += c.a * weight;
      weightSum += weight;
    }
  }
  vec3 rgb = alphaSum > 0.001 ? colorSum / alphaSum : vec3(0.0);
  outColor = vec4(rgb, alphaSum / weightSum);
}`;

const MODE_INDEX = { scale: 0, stretch: 1, tile: 2, mirror: 3, blur: 4 };
const BBOX_GRID = 48; // fine enough to find a rect without a heavy readback

export class Fill {
  constructor(filter = 'linear') {
    this.gl = getGL();
    this.filter = filter;
    this._composite = new GLSL({ filter });
    this._bboxPass = new GLSL({ width: BBOX_GRID, height: BBOX_GRID, filter: 'linear' });
    this._bboxBuf = new Uint8Array(BBOX_GRID * BBOX_GRID * 4);
    this._cover = null; // built lazily - only 'blur' mode needs it
    this._blurA = null;
    this._blurB = null;
    this._blurC = null;
    this._blurD = null;
    this._size = { width: -1, height: -1 };
  }

  // Tightest rect (in uSrc's own 0..1 uv space) containing every pixel
  // whose alpha is above a small noise floor - a real GPU->CPU readback,
  // same tradeoff sampleTexture's own doc comment makes, for the same
  // reason (a small fixed grid keeps the cost bounded). Falls back to
  // the whole frame if src has no real alpha anywhere.
  _detectContentRect(src) {
    this._bboxPass.tick(ALPHA_PASSTHROUGH, { uSrc: src });
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._bboxPass.fbo);
    gl.readPixels(0, 0, BBOX_GRID, BBOX_GRID, gl.RGBA, gl.UNSIGNED_BYTE, this._bboxBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const buf = this._bboxBuf;
    const threshold = 13; // ~0.05 * 255
    let minCol = BBOX_GRID, maxCol = -1, minRow = BBOX_GRID, maxRow = -1;
    for (let row = 0; row < BBOX_GRID; row++) {
      for (let col = 0; col < BBOX_GRID; col++) {
        if (buf[(row * BBOX_GRID + col) * 4 + 3] > threshold) {
          if (col < minCol) minCol = col;
          if (col > maxCol) maxCol = col;
          if (row < minRow) minRow = row;
          if (row > maxRow) maxRow = row;
        }
      }
    }
    if (maxCol < 0) return [0, 0, 1, 1];

    // readPixels' row 0 is v=0 (GL convention) - that already matches uv.y
    // directly, no flip needed (unlike sampleTexture's OWN row flip, which
    // exists only to make ITS OWN returned array read "row 0 = visual top"
    // for callers - not relevant here since this converts straight to uv).
    return [minCol / BBOX_GRID, minRow / BBOX_GRID, (maxCol + 1) / BBOX_GRID, (maxRow + 1) / BBOX_GRID];
  }

  _ensureBlurPasses(width, height) {
    if (this._cover && this._size.width === width && this._size.height === height) return;
    this._cover?.dispose();
    this._blurA?.dispose();
    this._blurB?.dispose();
    this._blurC?.dispose();
    this._blurD?.dispose();
    this._cover = new GLSL({ width, height, filter: this.filter });
    this._blurA = new GLSL({ width, height, filter: this.filter });
    this._blurB = new GLSL({ width, height, filter: this.filter });
    this._blurC = new GLSL({ width, height, filter: this.filter });
    this._blurD = new GLSL({ width, height, filter: this.filter });
    this._size = { width, height };
  }

  tick(src, mode = 'blur', { width, height, blurAmount } = {}) {
    if (!src || !src.texture) return src;
    const target = screenSize();
    const w = width ?? target.width;
    const h = height ?? target.height;
    // Default scales with the target frame instead of a fixed number -
    // wider spacing between the SAME 5 taps costs nothing extra, so
    // there's no reason the default shouldn't just always reach far
    // enough to cover the whole frame regardless of how small, off-
    // center, or oddly-shaped (a thin rotating rectangle, say) the real
    // content is. /14 keeps the 4-pass 1x/2x/4x/8x pyramid below's total
    // reach (~15x this number) comfortably past the frame's own size.
    blurAmount ??= Math.max(w, h) / 14;
    const srcW = src.width || w;
    const srcH = src.height || h;

    const [x0, y0, x1, y1] = this._detectContentRect(src);
    const rectMin = [x0, y0];
    const rectMax = [x1, y1];
    const rectCenter = [(x0 + x1) / 2, (y0 + y1) / 2];
    const rectW = Math.max((x1 - x0) * srcW, 1);
    const rectH = Math.max((y1 - y0) * srcH, 1);

    const containScale = Math.min(w / rectW, h / rectH);
    const mapScale = [w / containScale / srcW, h / containScale / srcH];
    const coverScale = Math.max(w / rectW, h / rectH);
    const coverMapScale = [w / coverScale / srcW, h / coverScale / srcH];

    let blurredTex = null;
    if (mode === 'blur') {
      this._ensureBlurPasses(w, h);
      this._cover.tick(
        `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uRectCenter;
uniform vec2 uCoverMapScale;
void main() {
  vec2 uv = uRectCenter + (vUv - 0.5) * uCoverMapScale;
  outColor = texture(uSrc, clamp(uv, 0.0, 1.0));
}`,
        { uSrc: src, uRectCenter: rectCenter, uCoverMapScale: coverMapScale }
      );
      // Each pass reaches further than the last (1x, 2x, 4x, 8x) instead
      // of four equal small passes - a small/off-center/oddly-shaped
      // (e.g. a thin rotated rectangle) piece of content can leave a gap
      // far bigger than any single pass's own 5-tap radius covers, and
      // this reaches ~15x further for the same 4 passes (same "blur
      // pyramid" idea Bloom/Flow already use elsewhere here).
      const texel = [1 / w, 1 / h];
      this._blurA.tick(FILL_BLUR, { uSrc: this._cover, uTexel: texel, uAmount: blurAmount });
      this._blurB.tick(FILL_BLUR, { uSrc: this._blurA, uTexel: texel, uAmount: blurAmount * 2 });
      this._blurC.tick(FILL_BLUR, { uSrc: this._blurB, uTexel: texel, uAmount: blurAmount * 4 });
      this._blurD.tick(FILL_BLUR, { uSrc: this._blurC, uTexel: texel, uAmount: blurAmount * 8 });
      blurredTex = this._blurD;
    }

    this._composite.tick(COMPOSITE_FRAG, {
      uSrc: src,
      uBlurred: blurredTex ?? src,
      uRectMin: rectMin,
      uRectMax: rectMax,
      uRectCenter: rectCenter,
      uMapScale: mapScale,
      uCoverMapScale: coverMapScale,
      uMode: MODE_INDEX[mode] ?? 4,
    });
    return this._composite;
  }

  dispose() {
    this._composite.dispose();
    this._bboxPass.dispose();
    this._cover?.dispose();
    this._blurA?.dispose();
    this._blurB?.dispose();
    this._blurC?.dispose();
    this._blurD?.dispose();
  }
}

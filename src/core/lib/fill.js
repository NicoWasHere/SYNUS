import { getGL, screenSize } from './context.js';
import { GLSL } from './glsl.js';
import { BLUR } from './fx/shaders.js';

// Composites src over a background that fills the rest of the frame
// using one of four strategies. Anywhere src is transparent (a letterbox
// margin, a webcam's own cropped edge, a chroma-keyed hole, content that
// was Scale'd down inside the SAME full-size buffer, ...) shows the same
// background through, via plain alpha-over compositing - "if it's
// transparent, it gets filled" falls out of that for free.
//
// uRectMin/uRectMax/uRectCenter/uMapScale are all precomputed in JS from
// a DETECTED content rect (see _detectContentRect below) - deliberately
// NOT from src.width/src.height. Width/height only tells you the size of
// the underlying BUFFER, not where the real content sits inside it - true
// for ImageSource/VideoSource's own letterboxing (a smaller buffer,
// matching its real native aspect), but false the moment content got
// smaller via a GLSL effect (use(Scale).tick(src, {x:0.5}), say) INSIDE
// a same-size buffer: width/height still reports the full frame, so
// there'd be no margin left for Fill to even know about, let alone fill.
// Detecting the occupied rect from alpha directly handles both cases
// the same way, and correctly finds an off-center or irregular hole too.
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uBlurred; // only sampled in 'blur' mode - ignored otherwise
uniform vec2 uRectMin;      // detected content rect, in uSrc's own uv space
uniform vec2 uRectMax;
uniform vec2 uRectCenter;
uniform vec2 uMapScale;     // precomputed contain-fit scale (target ↔ source)
uniform float uMode;        // 0 = stretch, 1 = tile, 2 = mirror, 3 = blur

vec2 mirrorFold(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  vec2 flip = mod(i, 2.0);
  return mix(f, 1.0 - f, flip);
}

void main() {
  vec2 sourceUv = uRectCenter + (vUv - 0.5) * uMapScale;
  vec2 rectSpan = max(uRectMax - uRectMin, vec2(0.0001));

  vec4 bg;
  if (uMode < 0.5) {
    // stretch - the detected rect (not the whole buffer) distorted to fill the frame
    bg = texture(uSrc, uRectMin + vUv * rectSpan);
  } else if (uMode < 1.5) {
    vec2 rel = (sourceUv - uRectMin) / rectSpan;
    bg = texture(uSrc, uRectMin + fract(rel) * rectSpan); // tile
  } else if (uMode < 2.5) {
    vec2 rel = (sourceUv - uRectMin) / rectSpan;
    bg = texture(uSrc, uRectMin + mirrorFold(rel) * rectSpan); // mirror
  } else {
    bg = texture(uBlurred, vUv); // blur - a separately pre-blurred cover-fit pass
  }

  vec4 fg = vec4(0.0);
  if (sourceUv.x >= uRectMin.x && sourceUv.x <= uRectMax.x && sourceUv.y >= uRectMin.y && sourceUv.y <= uRectMax.y) {
    fg = texture(uSrc, sourceUv);
  }

  vec3 bgRgb = mix(vec3(0.0), bg.rgb, bg.a); // guarantees full opacity even if bg itself has holes
  outColor = vec4(mix(bgRgb, fg.rgb, fg.a), 1.0);
}`;

const ALPHA_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
void main() { outColor = texture(uSrc, vUv); }`;

const MODE_INDEX = { stretch: 0, tile: 1, mirror: 2, blur: 3 };
const BBOX_GRID = 48; // fine enough to find a rect without a heavy readback

// new Fill() inside a node's code(), or use(Fill) via useInstances.
// tick(src, mode = 'blur', { width, height, blurAmount = 20 } = {}) -
// detects where src's own content ACTUALLY is (a coarse alpha readback,
// see _detectContentRect below - genuinely not free, same tradeoff
// sampleTexture's own doc comment describes, which is why the grid is
// small) and scales THAT up to fill a target frame (default
// screenSize(), override via width/height) without ever distorting the
// crisp foreground copy - only the background (everywhere outside/inside
// that content that's transparent) uses `mode`:
//
//   const out = use(Fill).tick(inputs.webcam, 'blur');
//   const out = use(Fill).tick(inputs.src, 'mirror', { width: 1080, height: 1920 });
//
// mode: 'stretch' (background = the detected content rect distorted to
// exactly fill the frame), 'tile' (background = that rect repeated at
// its own on-screen size), 'mirror' (same repeat, alternating reflected
// copies - no seam at the tile edges), 'blur' (background = a heavily
// blurred, 'cover'-scaled copy - the "blurred sidebar" look phone apps
// use for portrait photos in a landscape frame). blurAmount only matters
// for 'blur' mode - sample spacing in texels per pass (3 passes, same
// reasoning as Bloom's own wide blur: one 5x5 pass alone bands at a
// large radius, a few passes compound into an actually smooth blur).
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
    this._size = { width: -1, height: -1 };
  }

  // Finds the tightest rect (in uSrc's own 0..1 uv space) containing
  // every pixel whose alpha is above a small noise floor - a real GPU→CPU
  // readback (gl.readPixels), so it costs something every call, same
  // honest tradeoff sampleTexture's own doc comment makes for the same
  // reason (a small fixed grid keeps that cost bounded regardless of
  // src's own real resolution). Falls back to the whole frame [0,0,1,1]
  // if nothing in src has any real alpha at all (avoids a degenerate
  // zero-size rect).
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

    // readPixels' row 0 is the BOTTOM of the texture (GL convention), and
    // this project's own uv convention has v=1 at the visual TOP (see
    // gl-context.js's UNPACK_FLIP_Y_WEBGL) - flip before converting to uv.
    const x0 = minCol / BBOX_GRID;
    const x1 = (maxCol + 1) / BBOX_GRID;
    const y0 = (BBOX_GRID - 1 - maxRow) / BBOX_GRID;
    const y1 = (BBOX_GRID - minRow) / BBOX_GRID;
    return [x0, y0, x1, y1];
  }

  _ensureBlurPasses(width, height) {
    if (this._cover && this._size.width === width && this._size.height === height) return;
    this._cover?.dispose();
    this._blurA?.dispose();
    this._blurB?.dispose();
    this._blurC?.dispose();
    this._cover = new GLSL({ width, height, filter: this.filter });
    this._blurA = new GLSL({ width, height, filter: this.filter });
    this._blurB = new GLSL({ width, height, filter: this.filter });
    this._blurC = new GLSL({ width, height, filter: this.filter });
    this._size = { width, height };
  }

  tick(src, mode = 'blur', { width, height, blurAmount = 20 } = {}) {
    if (!src || !src.texture) return src;
    const target = screenSize();
    const w = width ?? target.width;
    const h = height ?? target.height;
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

    let blurredTex = null;
    if (mode === 'blur') {
      this._ensureBlurPasses(w, h);
      const coverScale = Math.max(w / rectW, h / rectH);
      const coverMapScale = [w / coverScale / srcW, h / coverScale / srcH];
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
      const texel = [1 / w, 1 / h];
      this._blurA.tick(BLUR, { uSrc: this._cover, uTexel: texel, uAmount: blurAmount });
      this._blurB.tick(BLUR, { uSrc: this._blurA, uTexel: texel, uAmount: blurAmount });
      this._blurC.tick(BLUR, { uSrc: this._blurB, uTexel: texel, uAmount: blurAmount });
      blurredTex = this._blurC;
    }

    this._composite.tick(COMPOSITE_FRAG, {
      uSrc: src,
      uBlurred: blurredTex ?? src,
      uRectMin: rectMin,
      uRectMax: rectMax,
      uRectCenter: rectCenter,
      uMapScale: mapScale,
      uMode: MODE_INDEX[mode] ?? 3,
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
  }
}

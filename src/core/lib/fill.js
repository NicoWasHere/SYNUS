import { getGL, screenSize } from './context.js';
import { GLSL } from './glsl.js';
import { BLUR } from './fx/shaders.js';

// Composites src (whatever its own native width/height is, letterboxed
// to fit the target size preserving aspect - the same math ImageSource's
// own 'contain' fit uses) over a background that fills the rest of the
// frame using one of four strategies. Anywhere src itself is ALSO
// transparent (not just the letterbox margin - a webcam's own cropped
// edge, a chroma-keyed hole, ...) shows the same background through too,
// via plain alpha-over compositing - "if it's transparent, it gets
// filled" falls out of that for free, no special-casing needed.
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uBlurred; // only sampled in 'blur' mode - ignored otherwise
uniform vec2 uContentInv;   // target size / content's own on-screen (contain-fit) size
uniform float uMode;        // 0 = stretch, 1 = tile, 2 = mirror, 3 = blur

vec2 mirrorFold(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  vec2 flip = mod(i, 2.0);
  return mix(f, 1.0 - f, flip);
}

void main() {
  vec2 contentUv = (vUv - 0.5) * uContentInv + 0.5;

  vec4 bg;
  if (uMode < 0.5) {
    bg = texture(uSrc, vUv); // stretch - the whole frame, distorted to fit
  } else if (uMode < 1.5) {
    bg = texture(uSrc, fract(contentUv)); // tile
  } else if (uMode < 2.5) {
    bg = texture(uSrc, mirrorFold(contentUv)); // mirror
  } else {
    bg = texture(uBlurred, vUv); // blur - a separately pre-blurred cover-fit pass
  }

  vec4 fg = vec4(0.0);
  if (contentUv.x >= 0.0 && contentUv.x <= 1.0 && contentUv.y >= 0.0 && contentUv.y <= 1.0) {
    fg = texture(uSrc, contentUv);
  }

  vec3 bgRgb = mix(vec3(0.0), bg.rgb, bg.a); // guarantees full opacity even if bg itself has holes
  outColor = vec4(mix(bgRgb, fg.rgb, fg.a), 1.0);
}`;

const MODE_INDEX = { stretch: 0, tile: 1, mirror: 2, blur: 3 };

// new Fill() inside a node's code(), or use(Fill) via useInstances.
// tick(src, mode = 'blur', { width, height, blurAmount = 20 } = {}) -
// scales src (using ITS OWN width/height, same as every other texture-
// bearing value here) up to fill a target frame (default screenSize(),
// override via width/height for e.g. filling just viewportSize()) without
// ever distorting the crisp foreground copy - only the background (the
// letterbox margin, or any hole already in src) uses `mode`:
//
//   const out = use(Fill).tick(inputs.webcam, 'blur');
//   const out = use(Fill).tick(inputs.src, 'mirror', { width: 1080, height: 1920 });
//
// mode: 'stretch' (background = src distorted to exactly fill the frame),
// 'tile' (background = src repeated at its own on-screen size), 'mirror'
// (same repeat, alternating reflected copies - no seam at the tile
// edges), 'blur' (background = a heavily blurred, 'cover'-scaled copy of
// src - the "blurred sidebar" look phone apps use for portrait photos in
// a landscape frame). blurAmount only matters for 'blur' mode - sample
// spacing in texels per pass (3 passes, same reasoning as Bloom's own
// wide blur: one 5x5 pass alone bands at a large radius, a few passes
// compound into an actually smooth blur).
export class Fill {
  constructor(filter = 'linear') {
    this.gl = getGL();
    this.filter = filter;
    this._composite = new GLSL({ filter });
    this._cover = null; // built lazily - only 'blur' mode needs it
    this._blurA = null;
    this._blurB = null;
    this._blurC = null;
    this._size = { width: -1, height: -1 };
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
    const nativeW = src.width || w;
    const nativeH = src.height || h;

    const containScale = Math.min(w / nativeW, h / nativeH);
    const contentInv = [w / (nativeW * containScale), h / (nativeH * containScale)];

    let blurredTex = null;
    if (mode === 'blur') {
      this._ensureBlurPasses(w, h);
      const coverScale = Math.max(w / nativeW, h / nativeH);
      const coverInv = [w / (nativeW * coverScale), h / (nativeH * coverScale)];
      this._cover.tick(
        `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uCoverInv;
void main() {
  vec2 uv = (vUv - 0.5) * uCoverInv + 0.5;
  outColor = texture(uSrc, clamp(uv, 0.0, 1.0));
}`,
        { uSrc: src, uCoverInv: coverInv }
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
      uContentInv: contentInv,
      uMode: MODE_INDEX[mode] ?? 3,
    });
    return this._composite;
  }

  dispose() {
    this._composite.dispose();
    this._cover?.dispose();
    this._blurA?.dispose();
    this._blurB?.dispose();
    this._blurC?.dispose();
  }
}

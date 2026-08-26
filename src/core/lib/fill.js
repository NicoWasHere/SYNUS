import { getGL } from './context.js';
import { GLSL } from './glsl.js';

const GRID = 64; // rows to detect content extent for - finer = closer boundaries, still cheap

// new Fill() inside a node's code(), or use(Fill). tick(src, mode = 'mirror')
// fills src's transparent areas: cuts the frame into GRID rows, finds where
// each row's OWN real content starts/ends, and extends that same row
// outward to cover the rest of it - either mirroring or copying (tiling)
// it. A row with no content of its own borrows the NEAREST row that has
// some instead (extending that row's own fill vertically too) - which is
// what guarantees the whole frame ends up covered even when the real
// content is small and off to one side, not just letterboxed edges.
const ALPHA_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
void main() { outColor = texture(uSrc, vUv); }`;

const ROW_FILL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
// GRID x 1: r = row's content start, g = end, b = has-any-content, a = nearest row (with content) to borrow if not
uniform sampler2D uRowLut;
uniform float uMode; // 0 = mirror, 1 = copy/tile

float mirrorFold(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(f, 1.0 - f, mod(i, 2.0));
}

void main() {
  vec4 lut = texture(uRowLut, vec2(vUv.y, 0.5));
  float rowY = vUv.y;
  if (lut.b < 0.5) {
    // nothing in this row at all - borrow the nearest row that has
    // something, and extend THAT row's own fill instead.
    rowY = lut.a;
    lut = texture(uRowLut, vec2(rowY, 0.5));
  }

  float span = max(lut.g - lut.r, 0.0001);
  float rel = (vUv.x - lut.r) / span;
  float sampledRel = uMode < 0.5 ? mirrorFold(rel) : fract(rel);
  vec4 c = texture(uSrc, vec2(lut.r + sampledRel * span, rowY));
  outColor = vec4(c.rgb, 1.0);
}`;

const MODE_INDEX = { mirror: 0, copy: 1 };

export class Fill {
  constructor(filter = 'linear') {
    this.gl = getGL();
    this._rowPass = new GLSL({ filter });
    this._gridPass = new GLSL({ width: GRID, height: GRID, filter: 'linear' });
    this._gridBuf = new Uint8Array(GRID * GRID * 4);
    this._rowLutData = new Uint8Array(GRID * 4);

    const gl = this.gl;
    this._rowLutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._rowLutTex);
    // NEAREST, not LINEAR - this is discrete per-row data (start/end/
    // hasContent/nearest-row-index), not a smooth gradient. Interpolating
    // between two ADJACENT rows' unrelated values right at a grid-cell
    // boundary produced a visible thin seam line every GRID-th row.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Single alpha readback (same tradeoff sampleTexture's own doc comment
  // makes) finds, for every row, the [start,end] span (0..1) of that
  // row's own real content, plus (for a row with none at all) the
  // nearest row that DOES have some - uploaded as one tiny GRID-long
  // lookup texture the fragment shader reads per-pixel.
  _updateRowLut(src) {
    this._gridPass.tick(ALPHA_PASSTHROUGH, { uSrc: src });
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._gridPass.fbo);
    gl.readPixels(0, 0, GRID, GRID, gl.RGBA, gl.UNSIGNED_BYTE, this._gridBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const buf = this._gridBuf;
    const threshold = 13; // ~0.05 * 255
    const hasContent = new Array(GRID).fill(false);
    const starts = new Array(GRID).fill(0);
    const ends = new Array(GRID).fill(0);
    for (let row = 0; row < GRID; row++) {
      let minCol = GRID, maxCol = -1;
      for (let col = 0; col < GRID; col++) {
        if (buf[(row * GRID + col) * 4 + 3] > threshold) {
          if (col < minCol) minCol = col;
          maxCol = col;
        }
      }
      // Require at least 2 cells, not just 1 - a single-cell-wide row is
      // typically just the extreme tip of a diagonal/rotated shape (an
      // almost-single-point cross-section, often anti-aliased/dim rather
      // than solid color) - tiling THAT sliver across dozens of borrowing
      // rows reads as a barely-colored smear, not a real fill. Treating
      // it as "no reliable content" here instead lets this row (and
      // anything that would have borrowed from it) fall through to the
      // nearest WIDER row instead.
      if (maxCol >= 0 && maxCol - minCol + 1 >= 2) {
        hasContent[row] = true;
        starts[row] = minCol / GRID;
        ends[row] = (maxCol + 1) / GRID;
      }
    }

    // Nearest row (by index distance) that has content, for a row that
    // has none at all - a plain two-sweep nearest-true scan.
    const nearest = new Array(GRID).fill(-1);
    let last = -1;
    for (let row = 0; row < GRID; row++) {
      if (hasContent[row]) last = row;
      nearest[row] = last;
    }
    last = -1;
    for (let row = GRID - 1; row >= 0; row--) {
      if (hasContent[row]) last = row;
      if (nearest[row] < 0) nearest[row] = last;
      else if (last >= 0 && Math.abs(last - row) < Math.abs(nearest[row] - row)) nearest[row] = last;
    }

    for (let row = 0; row < GRID; row++) {
      const i = row * 4;
      this._rowLutData[i + 0] = Math.round(starts[row] * 255);
      this._rowLutData[i + 1] = Math.round(ends[row] * 255);
      this._rowLutData[i + 2] = hasContent[row] ? 255 : 0;
      // +0.5: the CENTER of that row's own texel, not its edge - looking
      // up exactly on a texel boundary would blend 50/50 with whichever
      // neighboring row sits on the other side of it (LUT uses LINEAR
      // filtering), not purely the intended row's own data.
      this._rowLutData[i + 3] = nearest[row] >= 0 ? Math.round(((nearest[row] + 0.5) / GRID) * 255) : 0;
    }

    gl.bindTexture(gl.TEXTURE_2D, this._rowLutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRID, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._rowLutData);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  tick(src, mode = 'mirror') {
    if (!src || !src.texture) return src;
    this._updateRowLut(src);
    this._rowPass.tick(ROW_FILL_FRAG, {
      uSrc: src,
      uRowLut: { texture: this._rowLutTex },
      uMode: MODE_INDEX[mode] ?? 0,
    });
    return this._rowPass;
  }

  dispose() {
    this._rowPass.dispose();
    this._gridPass.dispose();
    this.gl.deleteTexture(this._rowLutTex);
  }
}

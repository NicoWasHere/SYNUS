import { getGL } from './context.js';
import { GLSL } from './glsl.js';

// sampleTexture(value, { cols, rows, channel }) reads `value`'s texture
// down to a coarse cols x rows grid and returns one number per cell (0..1)
// as a flat row-major array (index = row * cols + col, row 0 = visual
// top). `channel` picks what that number means - 'lightness' (default,
// the standard luminance-weighted average of r/g/b), or a single raw
// channel: 'red', 'green', 'blue'. This is a REAL GPU->CPU readback
// (gl.readPixels) - genuinely not free, which is why it samples a coarse
// grid instead of every pixel.
//
// Implementation note: rather than cols*rows separate readPixels calls
// (one per cell - each has its own per-call driver overhead), this
// renders `value` down into a tiny cols x rows GLSL instance first (the
// GPU's own bilinear filtering does the actual downsampling/averaging
// as part of that draw, "for free" alongside work the GPU is doing
// anyway) and then does exactly ONE readPixels call for the whole small
// buffer - the cost that scales with the requested grid size, not with
// gl.readPixels call count.
const PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
void main() { outColor = texture(uSrc, vUv); }`;

// Keyed by "colsxrows" and shared across every sampleTexture() call in
// the whole project, not per-caller - there's no reason two different
// nodes asking for the same 8x8 grid should each keep their own copy of
// this tiny downsampling pass.
const downsamplers = new Map();

function getDownsampler(cols, rows) {
  const key = `${cols}x${rows}`;
  let g = downsamplers.get(key);
  if (!g) {
    g = new GLSL({ width: cols, height: rows });
    downsamplers.set(key, g);
  }
  return g;
}

const CHANNEL_INDEX = { red: 0, green: 1, blue: 2 }; // lightness has no single index - handled separately below

export function sampleTexture(value, { cols = 8, rows = 8, channel = 'lightness' } = {}) {
  if (!value || !value.texture) return new Array(cols * rows).fill(0);
  const gl = getGL();
  const small = getDownsampler(cols, rows);
  small.tick(PASSTHROUGH, { uSrc: value });

  gl.bindFramebuffer(gl.FRAMEBUFFER, small.fbo);
  const buf = new Uint8Array(cols * rows * 4);
  gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const channelIndex = CHANNEL_INDEX[channel]; // undefined for 'lightness' - falls through to the luminance formula below

  const out = new Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    // readPixels' y=0 is the BOTTOM of the texture (GL convention), and
    // every texture in this project already has its visual "top" at the
    // HIGH end of that axis (see gl-context.js's UNPACK_FLIP_Y_WEBGL,
    // and lib/fx/shaders.js's colorLookup, which hit this same thing) -
    // so row 0 (meant to be the visual top) has to read from the far
    // end of the buffer, not the near end.
    const flippedRow = rows - 1 - row;
    for (let col = 0; col < cols; col++) {
      const idx = (flippedRow * cols + col) * 4;
      out[row * cols + col] =
        channelIndex != null
          ? buf[idx + channelIndex] / 255
          : (0.299 * buf[idx] + 0.587 * buf[idx + 1] + 0.114 * buf[idx + 2]) / 255;
    }
  }
  return out;
}

import { getGL } from './context.js';
import {
  compileProgram,
  drawFullscreenQuad,
  createTexture,
  createFramebuffer,
} from '../../gl/gl-context.js';

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;

void main() {
  outColor = texture(uInput, vUv);
}`;

// Lazily-created, shared across all previews - one small offscreen target
// every preview draws into before reading pixels back, so a 512x512 node
// texture only ever costs a readPixels() at preview resolution (default
// 96x96), not full size, regardless of how many preview widgets are open.
let previewGl = null;
let previewProgram = null;
let previewFbo = null;
let previewTex = null;
let previewW = 0;
let previewH = 0;

function ensurePreviewTarget(width, height) {
  const gl = getGL();
  if (previewGl === gl && previewW === width && previewH === height) return;
  previewGl = gl;
  previewW = width;
  previewH = height;
  if (!previewProgram) previewProgram = compileProgram(gl, PASSTHROUGH_FRAG);
  previewTex = createTexture(gl, width, height);
  previewFbo = createFramebuffer(gl, previewTex);
}

// readTextureToImageData(texture, width, height=width) - draws `texture`
// into the shared small offscreen target, reads it back, and returns an
// ImageData ready for ctx2d.putImageData(). WebGL's origin is bottom-left
// and Canvas2D's is top-left, so the row order is flipped during the copy
// below rather than leaving the preview upside down. `height` defaults to
// `width` for the common square-thumbnail case (a plain texture/photo
// preview); pass both explicitly for a non-square source that would
// otherwise get squashed - a Pattern's plot (see main.js's updatePreviews())
// being the main case, since squeezing a wide line-graph-with-axis-labels
// into a square thumbnail is what made its text illegible.
export function readTextureToImageData(texture, width, height = width) {
  const gl = getGL();
  ensurePreviewTarget(width, height);

  gl.bindFramebuffer(gl.FRAMEBUFFER, previewFbo);
  gl.viewport(0, 0, width, height);
  gl.useProgram(previewProgram);
  const loc = gl.getUniformLocation(previewProgram, 'uInput');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(loc, 0);
  drawFullscreenQuad(gl, previewProgram);

  const pixels = new Uint8ClampedArray(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // flip vertically: WebGL reads bottom-to-top, ImageData expects top-to-bottom
  const flipped = new Uint8ClampedArray(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    const srcStart = (height - 1 - row) * rowBytes;
    flipped.set(pixels.subarray(srcStart, srcStart + rowBytes), row * rowBytes);
  }

  return new ImageData(flipped, width, height);
}

import { Canvas2D } from './canvas2d.js';

// dot(size)/pixel(size) - ready-made stamp textures for particle2d()'s
// `stamp` argument (or use(Instance).tick()'s source): a filled white
// circle and a filled white square, on a transparent background, at
// `size` x `size`. Cheap and read-only once drawn, so unlike Instance
// (which needs its own destination per call site) these are just cached
// by size and shared across every caller in the whole project - two
// different nodes both asking for dot(64) get the exact same texture,
// same as two nodes asking sampleTexture() for the same cols x rows grid
// share its downsampler.
const dotCache = new Map(); // size -> Canvas2D
const pixelCache = new Map(); // size -> Canvas2D

export function dot(size = 64) {
  let canvas = dotCache.get(size);
  if (!canvas) {
    canvas = new Canvas2D(size, size);
    const { ctx } = canvas;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    canvas.upload();
    dotCache.set(size, canvas);
  }
  return canvas;
}

export function pixel(size = 64) {
  let canvas = pixelCache.get(size);
  if (!canvas) {
    canvas = new Canvas2D(size, size);
    const { ctx } = canvas;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    canvas.upload();
    pixelCache.set(size, canvas);
  }
  return canvas;
}

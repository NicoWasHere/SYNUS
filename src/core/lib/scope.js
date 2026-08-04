import { Canvas2D } from './canvas2d.js';

// new Scope(length = 128) inside a node's code(), or use(Scope, length)
// via useInstances. Unlike Pattern.plot() (which plots a MATHEMATICAL
// FUNCTION over a domain - stateless, nothing to do with time passing),
// Scope keeps its OWN rolling ring buffer of whatever value you feed it
// each tick and draws THAT history scrolling by - an oscilloscope, not a
// function plot. Same visual conventions as Pattern.plot() (auto-scaled
// y-axis, a zero-crossing reference line, labeled min/max) so the two
// read as one family - see lib/pattern.js's plot() for the shared design.
//
//   const scope = use(Scope);
//   const trace = scope.tick(pulse.value);
//   preview(trace);  // or return { screen: trace }
export class Scope {
  constructor(length = 128) {
    this.length = length;
    this._buffer = [];
    this._canvas = null;
  }

  // tick(value, { width, height, range, color }) - pushes `value` onto
  // the ring buffer (oldest sample drops once `length` is exceeded),
  // draws the whole buffer as a scrolling line graph (newest sample at
  // the right edge, like a real oscilloscope), and returns the Canvas2D
  // instance (has .texture) - same "use tick()'s return value" convention
  // as Ramp/Noise/Pattern.plot(). range: fixed [min, max] y-axis, same as
  // Pattern.plot() - omit it to auto-scale to this buffer's own current
  // min/max instead (the right choice for a value whose range you don't
  // already know, e.g. a raw exported number).
  tick(value, { width = 512, height = 192, range, color = 'rgb(140,217,140)' } = {}) {
    this._buffer.push(value);
    if (this._buffer.length > this.length) this._buffer.shift();

    if (!this._canvas || this._canvas.width !== width || this._canvas.height !== height) {
      this._canvas = new Canvas2D(width, height);
    }
    const canvas = this._canvas;
    const { ctx } = canvas;
    ctx.clearRect(0, 0, width, height);

    let min, max;
    if (range) {
      [min, max] = range;
    } else {
      min = Math.min(...this._buffer);
      max = Math.max(...this._buffer);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      const mid = Number.isFinite(min) ? min : 0;
      min = mid - 0.5;
      max = mid + 0.5;
    }
    const span = max - min;

    const lineWidth = Math.max(1, height / 96);
    // Zero-crossing reference line, only drawn if 0 actually falls within
    // the current y-scale - same as Pattern.plot().
    if (min <= 0 && 0 <= max) {
      const zeroY = height - ((0 - min) / span) * height;
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = Math.max(1, lineWidth / 2);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(width, zeroY);
      ctx.stroke();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    const n = this._buffer.length;
    const step = width / this.length;
    for (let i = 0; i < n; i++) {
      // Right-aligned: the newest sample always sits at the right edge,
      // so a buffer that hasn't filled up yet scrolls in from the right
      // instead of stretching a handful of samples across the full width.
      const px = width - (n - 1 - i) * step;
      const py = height - ((this._buffer[i] - min) / span) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const fontSize = Math.max(9, Math.round(height * 0.05));
    const pad = Math.max(2, Math.round(fontSize * 0.25));
    const fmt = (v) => Number(v.toFixed(2)).toString();
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(max), pad, pad);
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(min), pad, height - pad);

    canvas.upload();
    return canvas;
  }
  dispose() {
    this._canvas?.dispose();
  }
}

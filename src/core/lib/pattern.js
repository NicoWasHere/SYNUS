import { Canvas2D } from './canvas2d.js';

// new Pattern(x => someNumber) - wraps a plain JS function, x in, a
// number out. Cheap to construct (it's just the function, nothing GPU-
// side happens until .plot() is called - see below), so building one
// fresh every tick is fine: `new Pattern(x => x * 2)`.
//
// JavaScript has no operator overloading - `pattern * 2` can never
// return a new Pattern, it'll just coerce `pattern` to NaN. The methods
// below (.map/.mul/.add/.clip) are the actual equivalent, and they
// chain: `pat.clip(3, 4).mul(2)`. .set() is the one exception - it
// mutates THIS instance instead of returning a new one, see below.
//
// A Pattern held in persistent state (state.lfo ??= ..., or
// use(Pattern, ...)) only ever runs its construction argument ONCE -
// editing `Pattern.sin(1)` to `Pattern.ramp(1)` on a later patch send has
// no effect on its own, same reason changing a three.js node's geometry
// doesn't (see lib/patch-flag.js's newPatch, and .set() below).
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

export class Pattern {
  constructor(fn) {
    if (fn instanceof Pattern) fn = fn.fn; // new Pattern(otherPattern) just copies its function
    this.fn = typeof fn === 'function' ? fn : () => 0;
  }

  // The "pattern reader" half: the value at one x.
  read(x) {
    return this.fn(x);
  }

  // Swaps this SAME instance's wrapped function in place, unlike every
  // other method here (.map/.mul/.add/.clip, the static shape factories)
  // which all return a NEW Pattern instead. That distinction matters for
  // a Pattern held in persistent state (`use(Pattern, ...)`, or
  // `state.lfo ??= new Pattern(...)`): reassigning `state.lfo = new
  // Pattern(...)` on a later patch send loses whatever's cached ON that
  // instance (.plot()'s own canvas, see below) and starts it over, where
  // `state.lfo.set(...)` keeps the same instance - and the same cache -
  // while still changing what it actually computes. Also what makes a
  // truly dynamic pattern possible: call .set() every tick with fresh
  // values baked in, e.g. `lfo.set(Pattern.ramp(1, t % 100).fn)` for a
  // ramp whose phase keeps drifting with time, since Pattern.ramp(freq,
  // phase) itself only bakes in whatever freq/phase were at the moment
  // it was called. Accepts either a plain function or another Pattern
  // (unwrapped the same way the constructor does). Returns `this` so it
  // chains: `lfo.set(fn).read(t)`.
  set(fn) {
    if (fn instanceof Pattern) fn = fn.fn;
    this.fn = typeof fn === 'function' ? fn : () => 0;
    return this;
  }

  // A whole range at once, for instancing (see Instance in instance.js) -
  // end is exclusive, same convention as a normal for loop. get(0, 5) ->
  // 5 values (0,1,2,3,4); get(0, 1, 0.25) -> 4 values.
  get(start, end, step = 1) {
    const out = [];
    if (step > 0) for (let x = start; x < end; x += step) out.push(this.fn(x));
    else if (step < 0) for (let x = start; x > end; x += step) out.push(this.fn(x));
    return out;
  }

  // The general-purpose "chop": wraps this pattern's OUTPUT through an
  // arbitrary function. Every other transform method below is just a
  // named shorthand for a specific map().
  map(f) {
    return new Pattern((x) => f(this.fn(x)));
  }

  mul(k) {
    return this.map((v) => v * k);
  }

  add(k) {
    return this.map((v) => v + k);
  }

  // Loops (not clamps) x into [lo, hi) before evaluating this pattern -
  // scrubbing x past the region wraps back into it, like a loop marker,
  // rather than holding the last value or clamping the output number.
  clip(lo, hi) {
    const span = hi - lo;
    return new Pattern((x) => {
      if (span <= 0) return this.fn(lo);
      const wrapped = lo + (((x - lo) % span) + span) % span;
      return this.fn(wrapped);
    });
  }

  // Plots this pattern over `range` as a line graph, for preview() - not
  // an effect or a generator in the GLSL sense, just a Canvas2D drawing,
  // since the wrapped function is arbitrary JS and can't run on the GPU.
  // Caches its own small canvas/texture on `this` - reuse the SAME
  // Pattern instance across ticks (e.g. via useInstances) for that
  // caching to actually help; a fresh `new Pattern(fn)` every tick
  // means a fresh plot canvas every tick too. Default range is [0, 1] -
  // plain preview(pattern) (see preview-sink.js/main.js, which call this
  // automatically for a bare Pattern value) passes no range at all, so
  // this default is what you see unless you ask for something else, via
  // preview(pattern, { range: [a, b] }) or by calling .plot() yourself.
  //
  // Default size (512x192) is drawn at real resolution, not just
  // upscaled later - preview() cards downscale it to their own small
  // thumbnail regardless, but rendering this straight to screen (a much
  // bigger square canvas) stretches whatever resolution it was actually
  // drawn at, and the OLD default (256x64) turned visibly blocky at that
  // size. Pass a bigger { width, height } (e.g. screenSize()'s own
  // numbers) for a plot meant to fill the screen - line width, sample
  // count, and font size below all scale with height/width automatically
  // so a bigger plot doesn't just blow up the same thin line and tiny
  // 9px labels.
  plot({ width = 512, height = 192, range = [0, 1], samples, color = 'rgb(140,217,140)' } = {}) {
    samples ??= Math.max(128, Math.round(width / 2));
    if (!this._canvas || this._canvas.width !== width || this._canvas.height !== height) {
      this._canvas = new Canvas2D(width, height);
    }
    const canvas = this._canvas;
    const { ctx } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Sampled first, drawn second: the y-axis auto-scales to whatever
    // this pattern ACTUALLY returns over `range`, rather than assuming a
    // fixed 0..1. Pattern.sin/.ramp/.square/.triangle/.random/.pulse all
    // happen to output 0..1, so this comes out the same for those - but
    // a custom `new Pattern(fn)` (or .set(fn)) can return anything, e.g.
    // `x => 2 * x` over a sliding [t-10, t] window returns values nowhere
    // near 0..1 once t is more than a few seconds in - a fixed 0..1
    // y-scale would draw that curve entirely off-canvas, not "low res",
    // genuinely invisible.
    const [start, end] = range;
    const values = new Array(samples);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < samples; i++) {
      const x = start + ((end - start) * i) / (samples - 1);
      const v = this.fn(x);
      values[i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      const mid = Number.isFinite(min) ? min : 0;
      min = mid - 0.5;
      max = mid + 0.5;
    }
    const span = max - min;

    const lineWidth = Math.max(1, height / 96);
    // A zero-crossing reference line, not just a fixed vertical center -
    // only meaningful (and only drawn) if 0 actually falls within the
    // data's own range.
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
    for (let i = 0; i < samples; i++) {
      const px = (i / (samples - 1)) * width;
      const py = height - ((values[i] - min) / span) * height; // max plots near the top, min near the bottom
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Axis labels: y is this plot's ACTUAL sampled min/max (see above),
    // x is whatever `range` was asked for. Font size scales with height
    // so a big rendered plot gets legible labels, not the same fixed 9px
    // blown up into a blur.
    const fontSize = Math.max(9, Math.round(height * 0.05));
    const pad = Math.max(2, Math.round(fontSize * 0.25));
    const fmt = (n) => Number(n.toFixed(2)).toString();
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(max), pad, pad);
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(min), pad, height - fontSize - pad);
    ctx.fillText(fmt(start), pad, height - pad);
    ctx.textAlign = 'right';
    ctx.fillText(fmt(end), width - pad, height - pad);

    canvas.upload();
    return canvas;
  }

  // Convenience constructors for the common LFO shapes - each already
  // outputs 0..1 (except sin, which is also 0..1 - a plain -1..1 sine is
  // just Pattern.sin(freq).mul(2).add(-1)). freq/phase scale/shift x
  // before the shape is applied.
  static sin(freq = 1, phase = 0) {
    return new Pattern((x) => Math.sin((x * freq + phase) * Math.PI * 2) * 0.5 + 0.5);
  }
  static ramp(freq = 1, phase = 0) {
    return new Pattern((x) => {
      const p = x * freq + phase;
      return ((p % 1) + 1) % 1;
    });
  }
  static square(freq = 1, phase = 0) {
    return new Pattern((x) => {
      const p = x * freq + phase;
      const frac = ((p % 1) + 1) % 1;
      return frac < 0.5 ? 1 : 0;
    });
  }
  // Like square, but with a controllable duty cycle instead of a fixed
  // 50% - width is the fraction of each cycle that reads 1 (default 0.1:
  // a short blip, on for 1/10th of the cycle then off), so pulse(freq, 1)
  // is identical to square(freq).
  static pulse(freq = 1, width = 0.1, phase = 0) {
    return new Pattern((x) => {
      const p = x * freq + phase;
      const frac = ((p % 1) + 1) % 1;
      return frac < width ? 1 : 0;
    });
  }
  static triangle(freq = 1, phase = 0) {
    return new Pattern((x) => {
      const p = x * freq + phase;
      const frac = ((p % 1) + 1) % 1;
      return frac < 0.5 ? frac * 2 : 2 - frac * 2;
    });
  }
  static random(freq = 1, phase = 0) {
    return new Pattern((x) => hash(Math.floor(x * freq + phase)));
  }
}

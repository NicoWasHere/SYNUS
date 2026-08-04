import { Canvas2D } from './canvas2d.js';

function toCss(color) {
  if (Array.isArray(color)) {
    const [r, g, b] = color;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  return color; // already a hex string (COLORS.X, colorPicker(), or a literal) - a valid CSS color as-is
}

// new Gradient() inside a node's code(), or use(Gradient, width, height)
// via useInstances. tick(colors, stops) draws a multi-stop linear
// gradient with Canvas2D's own real gradient interpolation (not
// reimplemented in GLSL) and returns it (has .texture) - the "hand-drawn
// ramp" half of the Ramp -> GradientMap palette trick (see gradientMap in
// fx/registry.js), just built from an arbitrary list of colors instead of
// one angle + two colors.
//
//   const out = use(Gradient).tick([COLORS.RED, '#00ff00', COLORS.BLUE]);
//   preview(out);  // or return { screen: out }
//
// `stops` (0..1, same length as `colors`) is optional - omit it and the
// colors are spaced evenly (0, 1/(n-1), ..., 1), which is almost always
// what you want:
//
//   const out = use(Gradient).tick([COLORS.RED, COLORS.BLUE], [0, 0.8]);
//
// Only actually redraws the canvas when colors/stops CHANGE from the
// last tick (cheap to check, a real redraw is not) - safe to call every
// tick with live values (colorPicker(), a slider-driven stop, ...)
// without needing a newPatch-guarded one-time build the way a hand-
// written Canvas2D gradient node otherwise would.
export class Gradient {
  constructor(width = 256, height = 8) {
    this._canvas = new Canvas2D(width, height);
    this._lastKey = null;
  }

  tick(colors, stops) {
    const resolvedStops = stops ?? colors.map((_, i) => (colors.length === 1 ? 0 : i / (colors.length - 1)));
    const key = JSON.stringify([colors, resolvedStops]);
    if (key !== this._lastKey) {
      const { ctx, width, height } = this._canvas;
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      colors.forEach((color, i) => grad.addColorStop(resolvedStops[i], toCss(color)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      this._canvas.upload();
      this._lastKey = key;
    }
    return this._canvas;
  }
  dispose() {
    this._canvas.dispose();
  }
}

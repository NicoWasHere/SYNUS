import { Gradient } from './gradient.js';
import { Translate } from './fx/effects.js';

// COLORMAPS.viridis / .plasma / ... - arrays of hex color stops, ready to
// drop straight into Gradient or gradientMap wherever they'd otherwise
// take a hand-picked list of colors:
//
//   const out = use(Gradient).tick(COLORMAPS.viridis);
//   preview(out);
//
// Want a texture directly (not the raw stop array) - optionally scrolling
// like the default project's rainbow1 - use the Colormap class below
// instead: use(Colormap).tick('viridis', t * 0.1).
//
// Each is a handful of representative stops (not a full 256-entry lookup
// table) - Gradient/gradientMap already interpolate between stops with
// real gradient math, so a short list reproduces the well-known original
// closely enough to recognize, without needing the whole table. Sequential
// maps (viridis..turbo) go dark->light and read well as a 0..1 ramp;
// diverging maps (coolwarm, spectral) run low-mid-high through a neutral
// midpoint; tab10/tab20 are qualitative/categorical (10 or 20 flatly
// distinct colors, no implied order) - meant for coloring N discrete
// groups (e.g. COLORMAPS.tab10[i % 10]), not as a gradient.
export const COLORMAPS = {
  // Sequential (perceptually-uniform, the matplotlib "viridis family")
  viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
  plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
  inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  cividis: ['#00204d', '#00336f', '#39486b', '#575d6d', '#7b7a77', '#a59c74', '#d3c164', '#ffe945'],

  // Sequential (classic, single/multi-hue)
  cool: ['#00ffff', '#ff00ff'],
  hot: ['#0b0000', '#ff0000', '#ffff00', '#ffffff'],
  spring: ['#ff00ff', '#ffff00'],
  summer: ['#008066', '#ffff66'],
  autumn: ['#ff0000', '#ffff00'],
  winter: ['#0000ff', '#00ff80'],
  bone: ['#000000', '#546c7a', '#a8d4d8', '#ffffff'],
  copper: ['#000000', '#7f4f2c', '#ffa066'],
  ocean: ['#004000', '#005f80', '#0000ff', '#ffffff'],
  earth: ['#0000a0', '#00a050', '#a08000', '#603000', '#ffffff'],

  // Rainbow / full-spectrum
  turbo: ['#30123b', '#4145ab', '#26bce1', '#1ae4b6', '#a2fc3c', '#f9c53d', '#f56918', '#c22a06', '#7a0403'],
  jet: ['#000080', '#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000', '#800000'],
  rainbow: ['#6b00b3', '#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff7f00', '#ff0000'],

  // Diverging (low - neutral midpoint - high)
  coolwarm: ['#3b4cc0', '#88a6fc', '#dddddd', '#f7a889', '#b40426'],
  spectral: ['#9e0142', '#f46d43', '#fee08b', '#e6f598', '#66c2a5', '#5e4fa2'],

  // Qualitative/categorical - index into these (COLORMAPS.tab10[i % 10]),
  // don't treat them as a gradient.
  tab10: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
  tab20: [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896',
    '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7',
    '#bcbd22', '#dbdb8d', '#17becf', '#9edae5',
  ],
};

// new Colormap() inside a node's code(), or use(Colormap) via
// useInstances. tick(name, scroll) - a named COLORMAPS entry as a texture,
// same as Gradient.tick() but you just name the map instead of pasting
// its stop array:
//
//   const out = use(Colormap).tick('viridis');
//
// scroll (default 0) shifts it sideways, wrapping around - pass t * speed
// for a moving band of color, the same look as the default project's
// rainbow1 but from any named map:
//
//   const out = use(Colormap).tick('viridis', t * 0.1);
export class Colormap {
  constructor(width = 256, height = 8) {
    this._gradient = new Gradient(width, height);
    this._translate = new Translate();
  }

  tick(name, scroll = 0) {
    const stops = COLORMAPS[name];
    if (!stops) throw new Error(`Colormap: unknown colormap "${name}" - known: ${Object.keys(COLORMAPS).join(', ')}`);
    const out = this._gradient.tick(stops);
    if (!scroll) return out;
    return this._translate.tick(out, { x: scroll, wrap: true });
  }
  dispose() {
    this._gradient.dispose();
    this._translate.dispose();
  }
}

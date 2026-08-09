import { Gradient } from './gradient.js';

// COLORMAPS.viridis / .plasma / ... - already textures (has .texture),
// built once on first access and cached forever after - the colors never
// change, so there's nothing to redo per tick:
//
//   preview(COLORMAPS.viridis);
//   return { screen: COLORMAPS.viridis };
//
// To scroll one (the same moving-color-band look as the default project's
// rainbow1), run it through Translate's own wrap option:
//
//   const out = use(Translate).tick(COLORMAPS.viridis, { x: t * 0.1, wrap: true });
//
// That works, but most colormaps AREN'T cyclic (viridis's first stop is
// dark purple, its last is yellow - nothing like rainbow1's hue(), whose
// value at phase 0 and phase 1 are identically red) - scrolling one with
// wrap therefore shows a visible seam/jump right where it wraps around.
// COLORMAPS.loop.<name> is a palindrome version of the same stops
// (forward then backward: c0..cN..c0) - still built once and cached the
// same way, but genuinely seamless to scroll since its own start and end
// already match:
//
//   const out = use(Translate).tick(COLORMAPS.loop.viridis, { x: t * 0.1, wrap: true });
//
// tab10/tab20 are the exception - qualitative/categorical (10 or 20
// flatly distinct colors, no implied order), so those stay plain hex
// arrays to index (COLORMAPS.tab10[i % 10]) rather than a gradient.
const GRADIENT_STOPS = {
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
};

const QUALITATIVE = {
  tab10: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
  tab20: [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896',
    '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7',
    '#bcbd22', '#dbdb8d', '#17becf', '#9edae5',
  ],
};

const textureCache = {};
function buildTexture(name) {
  if (!textureCache[name]) {
    textureCache[name] = new Gradient(256, 8).tick(GRADIENT_STOPS[name]);
  }
  return textureCache[name];
}

const loopCache = {};
function buildLoopTexture(name) {
  if (!loopCache[name]) {
    const stops = GRADIENT_STOPS[name];
    const palindrome = [...stops, ...stops.slice(0, -1).reverse()];
    loopCache[name] = new Gradient(256, 8).tick(palindrome);
  }
  return loopCache[name];
}

export const COLORMAPS = { ...QUALITATIVE, loop: {} };
for (const name of Object.keys(GRADIENT_STOPS)) {
  Object.defineProperty(COLORMAPS, name, {
    enumerable: true,
    get: () => buildTexture(name),
  });
  Object.defineProperty(COLORMAPS.loop, name, {
    enumerable: true,
    get: () => buildLoopTexture(name),
  });
}

// Lightweight signature-help: a static registry of every lib class's
// constructor and tick() signature (hand-kept in sync with the real
// code, not inferred), plus the small resolver editor.js calls to figure
// out which one (if any) applies at the caret. This is deliberately not
// a real language server - it doesn't parse the file into an AST, know
// about scoping, or track types across function calls. It covers the
// patterns this project's own code actually uses (use(X).tick(...),
// use(X, ctorArgs).tick(...), and a variable holding either), and simply
// shows nothing if the caret isn't inside a call it recognizes.
export const SIGNATURES = {
  // No `tick` entry for GLSL, HydraSource, or Html below - their real
  // signature is `tick(multiLineRawStringOfShader/DSL/HTML, ...)`, which
  // makes for a popup that's more clutter than help. The constructor tip
  // alone still shows for `use(GLSL` / `use(HydraSource` / `use(Html`.
  GLSL: {
    ctor: "new GLSL({ width = 512, height = 512, filter = 'linear' } = {})  // filter: 'linear' | 'nearest'",
  },
  Canvas2D: {
    ctor: "new Canvas2D(width = 512, height = 512, filter = 'linear')  // filter: 'linear' | 'nearest'",
  },
  Html: {
    ctor: 'new Html(width = 512, height = 512)',
  },
  Composite: {
    ctor: 'new Composite()',
    tick:
      "composite.tick(a, b, mode = 'over', opacity = 1)\n" +
      '// modes: over, atop, xor, multiply, screen, darken, lighten, add,\n' +
      '// difference, hardLight, softLight, lightest, darkest',
  },
  Matte: {
    ctor: 'new Matte()',
    tick: 'matte.tick(a, b, matteTexture)  // luma of matteTexture mixes a/b',
  },
  Lag: {
    ctor: "new Lag(every = 1, filter = 'linear')  // filter: 'linear' | 'nearest' (see feedback-loop blur)",
    tick: 'lag.tick(value, every = this.every)  // holds, updates once every N ticks',
  },
  Delay: {
    ctor: "new Delay(ticks = 1, filter = 'linear')  // filter: 'nearest' avoids blur building up in a feedback loop",
    tick: 'delay.tick(value, ticks = this.ticks)  // shows value from N ticks ago',
  },
  ImageSource: {
    ctor: 'new ImageSource(width = 512, height = 512)',
    tick: 'img.tick(url)  // also just works for animated GIFs',
  },
  VideoSource: {
    ctor: 'new VideoSource(width = 512, height = 512)',
    tick: 'vid.tick(url)  // loops, muted, autoplays',
  },
  WebcamSource: {
    ctor: 'new WebcamSource(width = 512, height = 512)',
    tick: 'cam.tick()  // no args - check cam.error if the permission was denied',
  },
  HydraSource: {
    ctor: 'new HydraSource(width = 512, height = 512)',
  },
  ThreeSource: {
    ctor: 'new ThreeSource(width = 512, height = 512)',
    tick: 'three.tick(scene, camera)  // real THREE.Scene/Camera - build with the THREE global',
  },
  ScreenOutput: {
    ctor: 'new ScreenOutput()',
    tick: 'screenOutput.tick({ uInput })  // render() does this for you',
  },

  // fx effects - every one of these classes takes no constructor args;
  // all the actual parameters are in tick()'s second argument onward.
  Rotate: { ctor: 'new Rotate()', tick: 'rotate.tick(src, degrees = 0)' },
  Scale: {
    ctor: 'new Scale()',
    tick: 'scale.tick(src, { x = 1, y = 1 })\n// or scale.tick(src, factor) to scale both axes evenly',
  },
  Flip: { ctor: 'new Flip()', tick: 'flip.tick(src, { x = false, y = false })' },
  Translate: { ctor: 'new Translate()', tick: 'translate.tick(src, { x = 0, y = 0 })  // 0..1 uv units' },
  ChannelMix: {
    ctor: 'new ChannelMix()',
    tick: 'channelMix.tick(src, { r = [1,0,0], g = [0,1,0], b = [0,0,1] })',
  },
  Brightness: { ctor: 'new Brightness()', tick: 'brightness.tick(src, amount = 0)  // additive, -1..1' },
  Contrast: { ctor: 'new Contrast()', tick: 'contrast.tick(src, amount = 1)  // 1.0 = no change' },
  Saturation: {
    ctor: 'new Saturation()',
    tick: 'saturation.tick(src, amount = 1)  // 0 = grayscale, 1 = no change',
  },
  HueShift: { ctor: 'new HueShift()', tick: 'hueShift.tick(src, degrees = 0)  // degrees' },
  Grade: {
    ctor: 'new Grade()',
    tick: 'grade.tick(src, { brightness = 0, contrast = 1, saturation = 1, opacity = 1 })\n// every default leaves that channel unchanged',
  },
  Blur: { ctor: 'new Blur()', tick: 'blur.tick(src, amount = 1)  // sample spacing in texels, 0 = none' },
  LensBlur: { ctor: 'new LensBlur()', tick: 'lensBlur.tick(src, amount = 0.3)  // radial/zoom streak, 0 = none' },
  Threshold: {
    ctor: 'new Threshold()',
    tick: 'threshold.tick(src, { level = 0.5, softness = 0 })',
  },
  Edge: { ctor: 'new Edge()', tick: 'edge.tick(src, amount = 1)  // Sobel gradient magnitude' },
  Emboss: { ctor: 'new Emboss()', tick: 'emboss.tick(src, amount = 1)' },
  Mirror: { ctor: 'new Mirror()', tick: 'mirror.tick(src, { x = true, y = false })  // folds that axis' },
  Tile: {
    ctor: 'new Tile()',
    tick: 'tile.tick(src, { x = 2, y = 2 })\n// or tile.tick(src, n) for both axes evenly',
  },
  Kaleidoscope: { ctor: 'new Kaleidoscope()', tick: 'kaleidoscope.tick(src, segments = 6)' },
  Modulate: {
    ctor: 'new Modulate()',
    tick: "modulate.tick(src, mapTexture, amount = 0.1)  // map's luma pushes uv uniformly",
  },
  Displace: {
    ctor: 'new Displace()',
    tick: "displace.tick(src, mapTexture, amount = 0.1)  // map's r/g push uv.x/uv.y independently",
  },
  Vignette: {
    ctor: 'new Vignette()',
    tick: 'vignette.tick(src, { amount = 0.5, radius = 0.3 })',
  },
  Pixelate: { ctor: 'new Pixelate()', tick: 'pixelate.tick(src, size = 8)  // block size in texels' },
  Posterize: { ctor: 'new Posterize()', tick: 'posterize.tick(src, levels = 4)  // color levels per channel' },
  Bloom: {
    ctor: 'new Bloom()',
    tick: 'bloom.tick(src, { threshold = 0.6, blurAmount = 3, intensity = 1 })',
  },
  ColorLookup: {
    ctor: 'new ColorLookup()',
    tick: "colorLookup.tick(src, lutTexture, { size = 8, amount = 1 })\n// load lutTexture with img.tick(url, { fit: 'stretch' }) - see media.js",
  },
  Ramp: {
    ctor: 'new Ramp(width = 512, height = 512)',
    tick: "out = ramp.tick({ angle = 0, from = [0,0,0], to = [1,1,1] })\n// use out, not ramp itself - ramp is the wrapper, tick()'s return value is the actual texture",
  },
  Noise: {
    ctor: 'new Noise(width = 512, height = 512)',
    tick: "out = noise.tick({ scale = 4, seed = 0, octaves = 4, type = 'fbm' })\n// use out, not noise itself - noise is the wrapper, tick()'s return value is the actual texture",
  },
  Instance: {
    ctor: 'use(Instance)  // owns one shared destination texture, however large count is',
    tick:
      'instance.tick(source, count, (i, count) => ({ x, y, scale, rotation, opacity }))\n' +
      '// x,y: 0..1 center (default 0.5); scale: fraction of full frame, number or {x,y} (default 1);\n' +
      '// rotation: degrees (default 0); opacity: 0..1 (default 1). Cleared+recomposited every tick.\n' +
      '// Real GPU instancing (one draw call no matter how large count is). For a grid sized by\n' +
      '// texture brightness with no custom callback, use particle2d() instead - see GLOBALS below.',
  },
  Pattern: {
    ctor:
      'new Pattern(x => number)  // or Pattern.sin/.ramp/.square/.triangle/.random/.pulse(freq, phase)\n' +
      '// pat.set(fn) mutates this SAME instance in place (keeps .plot()\'s cache) - use it for a\n' +
      '// pattern that needs to change on every tick, or across a patch send without losing state.',
    set: 'pat.set(fn)  // fn: x => number, or Pattern.sin/.ramp/.square/.triangle/.random/.pulse(...)',
  },
};

// Pattern's static shape factories - not in SIGNATURES above because
// those are all instance-level (ctor/tick/set); these are looked up by
// findSignatureAt() below via a dedicated Pattern.xxx( check instead.
const PATTERN_SHAPES = {
  sin: 'Pattern.sin(freq = 1, phase = 0)  // sine, remapped to 0..1',
  ramp: 'Pattern.ramp(freq = 1, phase = 0)  // sawtooth, 0 -> 1 then jumps back to 0',
  square: 'Pattern.square(freq = 1, phase = 0)  // 1 for the first half of each cycle, 0 for the second',
  triangle: 'Pattern.triangle(freq = 1, phase = 0)  // linear up then linear down',
  random: 'Pattern.random(freq = 1, phase = 0)  // a new random 0..1 value each integer step (stepped hold)',
  pulse: 'Pattern.pulse(freq = 1, width = 0.1, phase = 0)  // like square, but width sets the duty cycle',
};

// Plain function calls, not tied to any class - shown the moment the
// caret is inside one of these directly (no receiver to resolve).
const GLOBALS = {
  render: 'render(value)  // last call this tick wins',
  preview:
    'preview(value, options?)  // opts this node into a floating preview card\n' +
    '// a bare Pattern auto-plots (default range [0, 1]) - pass { range: [a, b] } to override',
  screenSize: 'screenSize()  // -> { width, height } of the SQUARE canvas (can be bigger than what you see)',
  viewportSize: 'viewportSize()  // -> { width, height } of the real, visible (non-square) box',
  mouse: 'mouse()  // -> { x, y } 0..1 over the visible viewport, (0,0) top-left',
  keyPulse: "keyPulse('a')  // -> 1 while that key is held, 0 otherwise (ignored while typing in the editor)",
  newPatch:
    "newPatch  // true for the one tick right after a send succeeds, false otherwise - not a function call\n" +
    '// use in a one-time-setup guard to also rebuild on every patch: if (!state.x || newPatch) { ... }',
  sampleTexture:
    "sampleTexture(value, { cols = 8, rows = 8, channel = 'lightness' })\n" +
    "// channel: 'lightness' (default) | 'red' | 'green' | 'blue'\n" +
    '// -> flat array (0..1) per cell, row-major, row 0 = visual top',
  useInstances: 'useInstances(state)  // -> use(Ctor, ...ctorArgs), construct-once-per-call-order',
  nodeFunction:
    'nodeFunction((use, ...args) => result)  // -> a reusable callable with its OWN persistent state\n' +
    '// build once (e.g. state.fx ??= nodeFunction(...)), then call the result like any function',
  particle2d:
    "particle2d(source, cols, rows, stamp, { t, min = 0.15, shakeSpeed = 0, shakeAmount = 0.006, channel = 'lightness' })\n" +
    '// mosaic of `stamp` (e.g. dot()/pixel()) sized by source brightness per cell - no callback needed.\n' +
    '// no useInstances() needed - call directly from code(). Call it twice for two independent systems.',
  dot: 'dot(size = 64)  // -> a cached white circle texture, transparent bg - use as particle2d()\'s stamp',
  pixel: 'pixel(size = 64)  // -> a cached white square texture, transparent bg - use as particle2d()\'s stamp',
  ascii2d:
    "ascii2d(source, cols, rows, { channel = 'lightness', ramp = ' .:-=+*#%@', color = 'white' })\n" +
    '// one character per cell (darkest -> lightest along `ramp`), no shake - a static text grid.',
  explode: "explode(name)  // raw source for an effect or node template, e.g. explode('rotate')",
};

// Scans backward from `pos` for the nearest `(` that is still open at
// `pos` (i.e. the call the caret is currently inside the arguments of).
function findEnclosingOpenParen(text, pos) {
  let depth = 0;
  for (let i = pos - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ')') depth++;
    else if (c === '(') {
      if (depth === 0) return i;
      depth--;
    }
    // deliberately not string/template-literal aware - see file header.
  }
  return null;
}

// Given the index of a `)`, finds the index of its matching `(`.
function findMatchingOpenParen(text, closeIdx) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    const c = text[i];
    if (c === ')') depth++;
    else if (c === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

// The identifier expression (letters/digits/underscore/dots only)
// immediately before `openParenIdx`, e.g. "use", "render", "cam.tick",
// or just "tick" if a `)` (from a chained call) breaks the scan first.
function extractCallee(text, openParenIdx) {
  let j = openParenIdx - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  const end = j + 1;
  while (j >= 0 && /[\w.]/.test(text[j])) j--;
  return { callee: text.slice(j + 1, end), calleeStart: j + 1 };
}

// For `varName.tick(`, finds the class passed to varName's most recent
// `varName = use(ClassName` assignment before `beforeIdx`. Not real
// scope analysis - just the last textual match, which is enough for the
// single-function-body style every node's code() is written in here.
function resolveVariableClass(text, beforeIdx, varName) {
  const re = new RegExp(`\\b${varName}\\s*=\\s*use\\(\\s*([A-Za-z_]\\w*)`, 'g');
  const before = text.slice(0, beforeIdx);
  let match;
  let last = null;
  while ((match = re.exec(before))) last = match[1];
  return last;
}

// For a bare "tick" callee (receiver hidden behind a `)`, e.g.
// `use(Lag).tick(`), checks whether that `)` closes a `use(ClassName...)`
// call and returns ClassName if so.
function resolveUseCallImmediatelyBefore(text, calleeStart) {
  const before = text.slice(0, calleeStart);
  if (!/\)\s*\.\s*$/.test(before)) return null;
  const closeIdx = before.lastIndexOf(')');
  const openIdx = findMatchingOpenParen(text, closeIdx);
  if (openIdx == null) return null;
  const { callee } = extractCallee(text, openIdx);
  if (callee !== 'use') return null;
  const arg = text.slice(openIdx + 1, closeIdx);
  const m = arg.match(/^\s*([A-Za-z_]\w*)/);
  return m && m[1];
}

// While typing use(...)'s first argument, returns up to 4 matching class
// names (prefix matches first, then substring matches) - `null` once
// there's nothing left to suggest: the caret isn't in that position at
// all, nothing matches what's typed so far, or what's typed already
// names a real class exactly (findSignatureAt's ctor tip takes over at
// that point instead - see editor.js, which checks this first).
export function findUseCompletions(text, pos) {
  const openParenIdx = findEnclosingOpenParen(text, pos);
  if (openParenIdx == null) return null;
  const { callee } = extractCallee(text, openParenIdx);
  if (callee !== 'use') return null;
  const argSoFar = text.slice(openParenIdx + 1, pos);
  // The identifier group is optional so bare `use(` (nothing typed yet)
  // still matches - it's the `$` anchor doing the real work here,
  // rejecting anything once a comma/space/etc shows the first argument
  // is already finished.
  const m = argSoFar.match(/^\s*([A-Za-z_]\w*)?$/);
  if (!m) return null;
  const typed = m[1] || '';
  const names = Object.keys(SIGNATURES);
  if (names.includes(typed)) return null;
  const lower = typed.toLowerCase();
  const starts = names.filter((n) => n.toLowerCase().startsWith(lower));
  const contains = names.filter((n) => !starts.includes(n) && n.toLowerCase().includes(lower));
  const matches = [...starts, ...contains];
  if (typed !== '' && matches.length === 0) return null;
  return matches.slice(0, 4);
}

// The one function editor.js calls: `null` if the caret isn't inside a
// call this registry recognizes, otherwise `{ title, text }` to show.
export function findSignatureAt(text, pos) {
  const openParenIdx = findEnclosingOpenParen(text, pos);
  if (openParenIdx == null) return null;
  let { callee, calleeStart } = extractCallee(text, openParenIdx);
  if (!callee) return null;
  // A chained call like `use(Rotate).tick(` has nothing but a `)`
  // immediately before ".tick" - extractCallee's [\w.] scan happily
  // crosses that leading dot too (it doesn't distinguish "a random dot"
  // from "the receiver.method dot"), so `callee` comes back as ".tick"
  // with an empty receiver rather than bare "tick". Normalizing it away
  // here (and nudging calleeStart past it) means resolveUseCallImmedi-
  // atelyBefore below can assume calleeStart always sits right after
  // that dot, whether or not there was a real receiver in front of it.
  if (callee.startsWith('.')) {
    callee = callee.slice(1);
    calleeStart += 1;
  }

  if (callee === 'use') {
    const arg = text.slice(openParenIdx + 1, pos);
    const m = arg.match(/^\s*([A-Za-z_]\w*)/);
    const cls = m && SIGNATURES[m[1]];
    return cls && cls.ctor ? { title: `new ${m[1]}`, text: cls.ctor } : null;
  }

  if (GLOBALS[callee]) {
    return { title: callee, text: GLOBALS[callee] };
  }

  if (SIGNATURES[callee] && SIGNATURES[callee].ctor) {
    return { title: `new ${callee}`, text: SIGNATURES[callee].ctor };
  }

  const patternShape = callee.match(/^Pattern\.(\w+)$/);
  if (patternShape && PATTERN_SHAPES[patternShape[1]]) {
    return { title: callee, text: PATTERN_SHAPES[patternShape[1]] };
  }

  const dotTick = callee.match(/^(.+)\.tick$/);
  const isBareTick = callee === 'tick';
  if (dotTick || isBareTick) {
    const clsName = dotTick
      ? resolveVariableClass(text, calleeStart, dotTick[1])
      : resolveUseCallImmediatelyBefore(text, calleeStart);
    const cls = clsName && SIGNATURES[clsName];
    return cls && cls.tick ? { title: `${clsName}.tick`, text: cls.tick } : null;
  }

  // Same resolution as .tick above, for Pattern's .set(fn) - shows the
  // available shape statics (Pattern.sin/.ramp/.square/.triangle/.random/
  // .pulse) the moment the caret is inside a .set( call, the same way
  // use( shows matching class names. Only Pattern has .set() right now,
  // so this can't misfire onto some other class's unrelated method.
  const dotSet = callee.match(/^(.+)\.set$/);
  const isBareSet = callee === 'set';
  if (dotSet || isBareSet) {
    const clsName = dotSet
      ? resolveVariableClass(text, calleeStart, dotSet[1])
      : resolveUseCallImmediatelyBefore(text, calleeStart);
    const cls = clsName && SIGNATURES[clsName];
    return cls && cls.set ? { title: `${clsName}.set`, text: cls.set } : null;
  }

  return null;
}

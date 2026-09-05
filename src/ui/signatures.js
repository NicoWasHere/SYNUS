import { COLORMAPS } from '../core/lib/colormaps.js';

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
    ctor: "new GLSL({ width = screenSize(), height = screenSize(), filter = 'linear' } = {})  // filter: 'linear' | 'nearest'",
  },
  Canvas2D: {
    ctor: "new Canvas2D(width = screenSize(), height = screenSize(), filter = 'linear')  // filter: 'linear' | 'nearest'",
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
    tick:
      "matte.tick(a, b, matteTexture, { mode = 'lightness' })  // mode: 'lightness' | 'alpha'\n" +
      '// matteTexture\'s lightness (or alpha) mixes a/b: 0 = all a, 1 = all b',
  },
  Layer: {
    ctor: 'new Layer()',
    tick:
      "layer.tick(textures, mode = 'over', opacity = 1)\n" +
      '// reduces an array of textures into one, bottom to top, same modes as Composite',
  },
  ComposeAt: {
    ctor: 'new ComposeAt()',
    tick:
      'composeAt.tick(rects)  // rects: [{ value, x, y, w, h }, ...]\n' +
      '// x,y = top-left corner (0..1, y=0 at top), w,h = size - places each value in its own box.\n' +
      '// See $compose_at(n)$ to place boxes visually instead of by hand.',
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
    tick:
      "vid.tick(url, { fit = 'contain', start = 0, end = 100, speed = 1, reverse = false })  // loops, muted, autoplays\n" +
      '// start/end: 0..100, percent of the video\'s own duration - trims both playback and looping\n' +
      '// to that window, e.g. { start: 25, end: 75 } loops only the middle half\n' +
      '// speed: playbackRate (0.5 = half, 2 = double). reverse: true steps currentTime BACKWARD by\n' +
      '// hand instead (browsers don\'t reliably support negative playbackRate) - speed still applies.\n' +
      'vid.jumpToRandom(start = 0, end = 100)  // seeks to a new random point in that window - call it\n' +
      '// yourself (a button(), a beat pulse, ...), not something that happens on its own every tick',
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
    tick:
      'three.tick(scene, camera)  // real THREE.Scene/Camera - build with the THREE global\n' +
      "three.toTexture(value, { width, height, key = 'default' })  // -> THREE.CanvasTexture\n" +
      "// projects one of this project's own texture-bearing values onto a mesh's material.map",
  },
  ModelSource: {
    ctor: 'new ModelSource()',
    tick:
      "model = modelSource.tick(source)  // source: URL string or files.get('name.glb')\n" +
      '// loads a glTF/GLB file - returns the loaded THREE.Group once ready, null while still loading',
  },
  Extrude: {
    ctor: 'new Extrude()',
    tick:
      "mesh = extrude.tick(src, { depth = 0.3, resolution = 32, threshold = 20 })\n" +
      '// reads src\'s own alpha at a resolution x resolution grid and builds a real 3D mesh -\n' +
      '// one box per covered cell, extruded along Z by depth, colored from that cell\'s own RGB.\n' +
      '// returns a THREE.Mesh (same object every tick) - add it to your own scene once, then\n' +
      '// light/orbit/rotate it like any other three.js mesh (see the $extrude$ template)',
  },
  ScreenOutput: {
    ctor: 'new ScreenOutput()',
    tick: 'screenOutput.tick({ uInput })  // render() does this for you',
  },
  PhysicsWorld: {
    ctor: 'new PhysicsWorld({ gravity = 1 })  // matter-js 2D physics - positions in pixels, angle in degrees',
    tick:
      'world.addBall({ x, y, radius = 20, restitution = 0.8, friction = 0.05 })  // -> id\n' +
      'world.addPlatform({ x, y, width, height = 20, angle = 0, restitution = 0.8 })  // static, -> id\n' +
      'world.setAngle(id, degrees)  // rotates any body, e.g. a static platform, on demand each tick\n' +
      'world.remove(id) / world.get(id)  // get -> { id, kind, x, y, angle, vx, vy, radius|width/height }\n' +
      'world.all()  // -> array of every body, same shape as get()\n' +
      'world.tick(dtMs = 1000/60)  // call once per code() tick, advances the simulation',
  },

  // fx effects - every one of these classes takes no constructor args;
  // all the actual parameters are in tick()'s second argument onward.
  Rotate: { ctor: 'new Rotate()', tick: 'rotate.tick(src, degrees = 0)' },
  Scale: {
    ctor: 'new Scale()',
    tick: 'scale.tick(src, { x = 1, y = 1 })\n// or scale.tick(src, factor) to scale both axes evenly',
  },
  Flip: {
    ctor: 'new Flip()',
    tick:
      "flip.tick(src, { x = false, y = false, point = { x: 0.5, y: 0.5 }, fill = 'clamp' })\n" +
      '// point is what each flipped axis reflects around (default: center) - an off-center point\n' +
      "// can push content outside 0..1; fill: 'clamp' | 'transparent' | 'wrap' decides what shows there",
  },
  Translate: {
    ctor: 'new Translate()',
    tick: 'translate.tick(src, { x = 0, y = 0, wrap = false })  // 0..1 uv units; wrap: true loops content around instead of leaving it transparent',
  },
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
  Mirror: {
    ctor: 'new Mirror()',
    tick:
      "mirror.tick(src, half = 'left', point = 0.5, fill = 'clamp')  // half: 'left' | 'right' | 'top' | 'bottom'\n" +
      '// THAT half keeps its own content; the OTHER half becomes a mirrored copy of it. point (0..1) is\n' +
      "// where the split happens (default: true center) - e.g. mirror(src, 'left', 0.7) keeps the left\n" +
      "// 70% and mirrors it into the rest. fill: 'clamp' | 'transparent' | 'wrap' for when an off-center\n" +
      '// point runs out of source before reaching the edge',
  },
  Tile: {
    ctor: 'new Tile()',
    tick: 'tile.tick(src, { x = 2, y = 2 })\n// or tile.tick(src, n) for both axes evenly',
  },
  Kaleidoscope: { ctor: 'new Kaleidoscope()', tick: 'kaleidoscope.tick(src, segments = 6)' },
  Modulate: {
    ctor: 'new Modulate()',
    tick:
      "modulate.tick(src, mapTexture, amount = 0.1, fill = 'clamp')  // map's luma pushes uv uniformly\n" +
      "// fill: 'clamp' (stretch edge) | 'transparent' (0 alpha outside) | 'wrap' (tile - Hydra's own default)",
  },
  Displace: {
    ctor: 'new Displace()',
    tick:
      "displace.tick(src, mapTexture, amount = 0.1, fill = 'clamp')  // map's r/g push uv.x/uv.y independently\n" +
      '// green is sampled from an offset uv too, so even a grayscale map (r == g) still gives real 2-axis motion\n' +
      "// fill: 'clamp' (stretch edge) | 'transparent' (0 alpha outside) | 'wrap' (tile - Hydra's own default)",
  },
  ModulateScale: {
    ctor: 'new ModulateScale()',
    tick:
      "modulateScale.tick(src, mapTexture, multiple = 1, offset = 1, fill = 'clamp')\n" +
      "// map's r/g channels push src's own scale (zoom) independently per axis, around center - ported from Hydra\n" +
      "// fill: 'clamp' (stretch edge) | 'transparent' (0 alpha outside) | 'wrap' (tile - the \"folds into a 3D plane\" look)",
  },
  ModulateRotate: {
    ctor: 'new ModulateRotate()',
    tick:
      "modulateRotate.tick(src, mapTexture, multiple = 1, offset = 0, fill = 'clamp')\n" +
      "// map's red channel pushes src's own rotation angle around center - ported from Hydra\n" +
      "// fill: 'clamp' (stretch edge) | 'transparent' (0 alpha outside) | 'wrap' (tile - Hydra's own default)",
  },
  Vignette: {
    ctor: 'new Vignette()',
    tick: 'vignette.tick(src, { amount = 0.5, radius = 0.3 })',
  },
  Pixelate: { ctor: 'new Pixelate()', tick: 'pixelate.tick(src, size = 8)  // block size in texels' },
  Posterize: { ctor: 'new Posterize()', tick: 'posterize.tick(src, levels = 4)  // color levels per channel' },
  Bloom: {
    ctor: 'new Bloom()',
    tick:
      'bloom.tick(src, { threshold = 0.6, softness = 0.2, wideRadius = 6, wideGain = 1.5,\n' +
      '                   tightRadius = 2, tightGain = 2 })\n' +
      '// basic/cheap glow - one blur pass per direction, no wobble/feedback (~8 draws a tick vs\n' +
      "// Flow's ~30). Reach for this by default; use Flow for the wobble/feedback look.",
  },
  Flow: {
    ctor: 'new Flow()',
    tick:
      'flow.tick(src, { threshold, softness, wideBaseRadius, wideGain, wobbleAmount, wobbleSpeed,\n' +
      '                  feedback, tightBaseRadius, tightGain, t })\n' +
      '// threshold=0.6 softness=0.2 wideBaseRadius=2 wideGain=1.5 wobbleAmount=0.015 wobbleSpeed=0.15\n' +
      '// feedback=0.85 tightBaseRadius=1 tightGain=2 - t is needed for wobble/feedback to animate.\n' +
      '// Heavy (~30 draws/tick) - if tps drops more than you want, use Bloom instead.',
  },
  Transition: {
    ctor: "new Transition(filter = 'linear')",
    tick:
      "transition.tick(src, { trigger = false, mode = 'flash', color, duration = 0.4 })\n" +
      '// blends FROM a solid color TO src over `duration` seconds, restarting every time `trigger`\n' +
      '// goes from false to true - pass trigger: newPatch for a flash/fade on every Send\n' +
      "// mode: 'flash' (default color white, fast snap-back) | 'fade' (default color black, linear\n" +
      '// crossfade) - color overrides either mode\'s default',
  },
  Melt: {
    ctor: "new Melt(filter = 'linear')",
    tick:
      "melt.tick(src, { axis = 'y', line = 0.6, sections = 200, jitter = 0.01, t = 0, seed = t,\n" +
      "                  thickness = 0.004, drip = 0.01, dieOff = 0.99, output = 'comp' })\n" +
      "// axis: 'y' picks a horizontal line, 'x' a vertical one - line is its 0..1 position along that axis\n" +
      '// fake pixel sorting: feeds that single row/column back into itself every tick, sliding `drip`\n' +
      '// further away and fading by `dieOff` each time - animate `line` yourself for a wandering source\n' +
      '// sections: splits the CROSS axis into that many independently-drifting drips instead of one\n' +
      '// shared line - jitter (0..1) is how far each section\'s own line can land from `line`\n' +
      '// seed defaults to t (pass your own node\'s t), so the pattern keeps subtly reshuffling as t moves -\n' +
      '// pass a fixed seed yourself (e.g. seed: 0) for a still pattern instead\n' +
      "// output: 'comp' (default) shows the untouched side as plain src - 'trail' makes it transparent,\n" +
      '// returning just the drip on its own to composite yourself',
  },
  Fill: {
    ctor: 'new Fill()',
    tick:
      "fill.tick(src, mode = 'mirror')  // mode: 'mirror' | 'copy'\n" +
      "// finds each row's own content span (via alpha) and extends it sideways to fill that row -\n" +
      "// an empty row borrows the nearest row that has something, so the whole frame ends up covered",
  },
  ColorLookup: {
    ctor: 'new ColorLookup()',
    tick: "colorLookup.tick(src, lutTexture, { size = 8, amount = 1 })\n// load lutTexture with img.tick(url, { fit: 'stretch' }) - see media.js",
  },
  Mask: {
    ctor: 'new Mask()',
    tick:
      "mask.tick(src, maskTexture, { mode = 'lightness', invert = false })\n" +
      '// cuts a hole in src\'s alpha using maskTexture\'s shape - src\'s rgb is untouched',
  },
  ChromaKey: {
    ctor: 'new ChromaKey()',
    tick:
      "chromaKey.tick(src, color)  // or chromaKey.tick(src, { color = '#00ff00', similarity = 0.4, smoothness = 0.1 })\n" +
      '// color: hex string, COLORS.X, or [r,g,b] 0..1 array - keys out pixels near it (green by default)',
  },
  GradientMap: {
    ctor: 'new GradientMap()',
    tick:
      "gradientMap.tick(src, rampTexture, { channel = 'lightness' })  // channel: 'lightness'|'red'|'green'|'blue'\n" +
      '// repaints src from a 1D gradient (e.g. use(Ramp)) sampled at src\'s own value - NOT ColorLookup\'s 3D LUT',
  },
  Fisheye: {
    ctor: 'new Fisheye()',
    tick:
      'fisheye.tick(src, amount = 0.5)\n' +
      '// positive bulges outward (fisheye), negative pinches inward (pincushion), 0 = no change',
  },
  Invert: {
    ctor: 'new Invert()',
    tick: 'invert.tick(src, amount = 1)\n// 0 = original, 1 = fully inverted',
  },
  Colorize: {
    ctor: 'new Colorize()',
    tick:
      "colorize.tick(src, color = '#ffffff')\n" +
      "// recolors src's own lightness into a black -> color duotone. hex string or [r,g,b] 0..1",
  },
  CRT: {
    ctor: 'new CRT()',
    tick:
      'crt.tick(src, 1)  // amount: 0 = off, 1 = full intensity (default)\n' +
      '// chromatic aberration + scanlines + vignette',
  },
  FilmGrain: {
    ctor: 'new FilmGrain()',
    tick: 'filmGrain.tick(src, { amount = 0.1, t = 0 })\n// animated noise added to rgb. t keeps the grain moving',
  },
  Bitmap: {
    ctor: 'new Bitmap()',
    tick:
      "bitmap.tick(src, { scale = 2, colorA = '#000000', colorB = '#ffffff' })\n" +
      "// 1-bit ordered (Bayer) dither - old-Mac bitmap look. scale = dither cell size in texels",
  },
  ChannelThreshold: {
    ctor: 'new ChannelThreshold()',
    tick:
      'channelThreshold.tick(src, { r = 0.5, g = 0.5, b = 0.5 })\n' +
      '// thresholds r/g/b independently (up to 8 output colors) - NOT the same as grayscale Threshold',
  },
  ScanLines: {
    ctor: 'new ScanLines()',
    tick:
      'scanLines.tick(src, { spacing = 20, thickness = 2, thicknessAmount = 0, maxWobble = 10,\n' +
      "                       wobbleFreq = 0.05, vertical = false, color = '#ffffff', threshold = 0.05,\n" +
      "                       thresholdMode = 'below', t = 0, seed = 0 })\n" +
      '// lines always oscillate up/down - src lightness drives wave SWING (maxWobble) AND extra\n' +
      '// thickness (thicknessAmount, added on top of the flat thickness base - 0 keeps it fixed-width).\n' +
      '// t animates it; seed reshuffles the per-line random phase/frequency jitter (each line wobbles\n' +
      "// independently). threshold+thresholdMode exclude one side of src's luma from ever drawing a\n" +
      "// line - 'below' (default) skips dark areas, 'above' skips bright ones instead.",
  },
  Crop: {
    ctor: 'new Crop()',
    tick:
      'crop.tick(src, { x1 = 0, y1 = 0, x2 = 1, y2 = 1 })\n' +
      '// extracts the rectangle BETWEEN two corner points (0..1, either order) and stretches it to\n' +
      "// fill the frame - NOT Mask (cuts a hole in place, doesn't move/rescale anything)",
  },
  AudioSource: {
    ctor: 'new AudioSource(fftSize = 2048)  // fftSize must be a power of 2',
    tick:
      'audio.tick()  // asks mic permission on first call - check audio.error\n' +
      'audio.spectrum(cols = 32)   // -> flat array 0..1, cols bins across the frequency range\n' +
      'audio.band(loHz, hiHz)      // -> 0..1 average magnitude in that Hz range (the EQ half)\n' +
      'audio.waveform(samples = 128)  // -> flat array -1..1, raw time-domain signal (a scope trace)',
  },
  Ramp: {
    ctor: 'new Ramp(width = 512, height = 512)',
    tick: "out = ramp.tick({ angle = 0, from = [0,0,0], to = [1,1,1] })\n// use out, not ramp itself - ramp is the wrapper, tick()'s return value is the actual texture",
  },
  Gradient: {
    ctor: 'new Gradient(width = 256, height = 8)',
    tick:
      'out = gradient.tick(colors, stops)  // colors: hex/[r,g,b]/COLORS.X array. stops: 0..1, optional\n' +
      '// use out, not gradient itself. stops omitted -> evenly spaced. Any number of colors, unlike Ramp',
  },
  Noise: {
    ctor: 'new Noise(width = 512, height = 512)',
    tick:
      "out = noise.tick({ scale = 4, seed = 0, z = 0, octaves = 4, type = 'value', mono = true })\n" +
      "// type: 'value'|'perlin'|'voronoi'|'static'. Animate z (not seed) to morph in place with no x/y pan\n" +
      '// mono: false for a decorrelated color version. use out, not noise itself',
  },
  Warp: {
    ctor: 'new Warp()',
    tick:
      'warp.tick(src, [{ x, y, radius = 0.3, amount = 0.5 }, ...])  // x,y: 0..1\n' +
      '// positive amount bulges/magnifies around that point, negative pinches/shrinks - points compose',
  },
  Ripple: {
    ctor: 'new Ripple()',
    tick:
      'ripple.tick(src, [{ x, y, frequency = 40, amplitude = 0.02, speed = 4 }, ...], t)\n' +
      '// each point radiates its own moving wave - overlapping waves blend (weighted by distance), not replace',
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
      'new Pattern(x => number)  // or Pattern.sin/.ramp/.square/.triangle/.random/.pulse/.sequence(...)\n' +
      '// pat.set(fn) mutates this SAME instance in place (keeps .plot()\'s cache) - use it for a\n' +
      '// pattern that needs to change on every tick, or across a patch send without losing state.',
    set: 'pat.set(fn)  // fn: x => number, or Pattern.sin/.ramp/.square/.triangle/.random/.pulse/.sequence(...)',
  },
  Scope: {
    ctor: 'new Scope(length = 128)  // ring-buffer size, in samples',
    tick:
      "out = scope.tick(value, { width = 512, height = 192, range, color = 'rgb(140,217,140)' })\n" +
      '// use out, not scope itself - like Ramp/Noise/Pattern.plot(), tick() returns the actual texture\n' +
      "// pushes `value` and draws its scrolling history (oscilloscope) - NOT Pattern.plot()'s function\n" +
      '// plot. omit `range` to auto-scale to the buffer\'s own current min/max.',
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
  sequence:
    "Pattern.sequence(values, mode = 'step', freq = 1, phase = 0)  // cycles through a plain array\n" +
    "// mode: 'step' jumps between values, 'smooth' interpolates toward the next (wraps last -> first)\n" +
    "// Hydra's [0,1].smooth() array trick, as a Pattern instead of monkey-patching Array.prototype",
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
  midi:
    'midi.knobs / midi.pads / midi.error  // NOT function calls - live key-value stores\n' +
    "// midi.knobs: { knob_N: 0..1 }, midi.pads: { pad_N: true|false } - grows automatically as\n" +
    '// new CC/note numbers are seen. Reading either triggers the lazy connect. Use midiVelocity(note)\n' +
    "// (raw note number, not 'pad_N') separately if you need press strength.",
  midiKnob:
    'midiKnob(cc, { min = 0, max = 1, default = min })  // -> last CC value, scaled to [min, max]\n' +
    '// connects lazily (permission prompt on first call) - check midiError(). Unknown cc -> default.\n' +
    "// See LPD8.knobs for the factory mapping, or watch the console for '[midi] knob/CC N seen'.",
  midiPad:
    "midiPad(note, { mode = 'momentary' })  // -> true while held ('momentary') or toggled per press ('toggle')\n" +
    "// See LPD8.padsA/padsB/padsC, or watch the console for '[midi] pad/note N seen'.",
  midiVelocity: 'midiVelocity(note)  // -> 0..1 from the most recent press, holds after release (no reset to 0)',
  midiError: 'midiError()  // -> error string if Web MIDI is unsupported/denied, null otherwise',
  LPD8:
    'LPD8.knobs / LPD8.padsA / LPD8.padsB / LPD8.padsC  // ORIGINAL Akai LPD8 factory mapping\n' +
    "// not a function call - the mk2 ships a DIFFERENT default, see LPD8_MK2 instead",
  LPD8_MK2:
    'LPD8_MK2.knobs / LPD8_MK2.padsA / LPD8_MK2.padsB / LPD8_MK2.padsC  // LPD8 mk2 factory mapping\n' +
    '// knobs on CC 20..27, pads on a C-major scale (C4..) rather than chromatic - padsA confirmed\n' +
    "// against real hardware, padsB/padsC are inferred - check the console if they're off",
  newPatch:
    "newPatch  // true for the one tick right after a send succeeds, false otherwise - not a function call\n" +
    '// use in a one-time-setup guard to also rebuild on every patch: if (!state.x || newPatch) { ... }',
  sampleTexture:
    "sampleTexture(value, { cols = 8, rows = 8, channel = 'lightness' })\n" +
    "// channel: 'lightness' (default) | 'red' | 'green' | 'blue'\n" +
    '// -> flat array (0..1) per cell, row-major, row 0 = visual top',
  beatmatch:
    "beatmatch(bpm, t, { pulseWidth = 0.08, shape = 'triangle', subdivide = 1, ...shapeOpts })\n" +
    '// -> { beat, phase, pulse, value, step, stepPhase, stepPulse, stepValue, bpm } - replaces Math.round(t / secondsPerBeat) with real bpm timing\n' +
    "// shape: 'pulse'|'build'|'triangle'|'adsr'|'sawJump'|'inverse' - value is phase reshaped by it, see beatEnvelope\n" +
    '// subdivide: steps per beat for step/stepPhase/stepPulse/stepValue - e.g. 4 to trigger things every 1/4 beat\n' +
    '// stepValue: stepPhase reshaped by the SAME shape - e.g. subdivide:4 + shape:\'pulse\' = 4 spikes per beat',
  beatEnvelope:
    "beatEnvelope(phase, shape = 'triangle', opts)  // -> reshaped 0..1 (or -1..1 for sawJump) value\n" +
    "// 'pulse': {decay=12} quick spike, fast decay | 'build': smooth sine build-and-fall\n" +
    "// 'triangle': {peak=0.5} linear build-and-fall | 'adsr': {attack,decay,sustain,release,sustainLevel}\n" +
    "// 'sawJump': ramps -1..1 then jumps back | 'inverse': {falloff=8} 1/x-style spike+falloff",
  COLORS:
    'COLORS.RED / ORANGE / YELLOW / GREEN / CYAN / BLUE / PURPLE / PINK / WHITE / BLACK\n' +
    '// hex string constants - not a function call, e.g. colorize.tick(src, COLORS.RED)',
  COLORMAPS:
    'COLORMAPS.viridis / plasma / inferno / magma / cividis / turbo / jet / rainbow / coolwarm / spectral / ...\n' +
    '// NOT function calls - each is already a texture, built once and cached: preview(COLORMAPS.viridis)\n' +
    "// to scroll one, run it through Translate's wrap option: use(Translate).tick(COLORMAPS.viridis, { x: t * 0.1, wrap: true })\n" +
    '// most maps aren\'t cyclic though (visible seam where it wraps) - COLORMAPS.loop.<name> is a\n' +
    '// palindrome version of the same stops, genuinely seamless to scroll the same way\n' +
    '// tab10 / tab20 are the exception - plain hex arrays to index (COLORMAPS.tab10[i % 10]), not a gradient\n' +
    '// COLORMAPS.viridis.read(t)  // t: 0..1 -> [r,g,b] 0..1 at that point, e.g. use(Colorize).tick(src, COLORMAPS.viridis.read(x))',
  colorPicker:
    "colorPicker(name, { default = '#ffffff' })  // -> current hex string, from $color_picker$\n" +
    '// floats a color-swatch widget next to this node, same as slider/button/input',
  orbitCamera:
    'orbitCamera(camera, { azimuth = 0, elevation = 0, radius = 3, target = [0,0,0] })\n' +
    '// positions camera on a sphere around target and calls camera.lookAt() - just the ordinary\n' +
    '// THREE.Camera position/lookAt API, spelled out once. See the three/three_sphere/three_text templates.',
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
    "ascii2d(source, cols, rows, { channel = 'lightness', ramp = ' .:-=+*#%@', color = 'white', fontSize })\n" +
    '// one character per cell (darkest -> lightest along `ramp`), no shake - a static text grid.\n' +
    '// fontSize (px) defaults to ~90% of the cell size - set it explicitly for bigger text without\n' +
    '// having to lower cols/rows (which would also coarsen the sampling grid)',
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
//
// Returns { matches, typed } rather than a bare array - editor.js's Tab-
// to-complete needs `typed`'s length to know how much of the text to
// replace (the identifier typed so far always ends exactly at `pos`,
// per the anchored regex below, so the replace range is just
// [pos - typed.length, pos] - no need to hand back an absolute offset).
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
  return { matches: matches.slice(0, 4), typed };
}

// COLORMAPS_KEYS/COLORMAPS_LOOP_KEYS are just their own keys -
// Object.keys() doesn't invoke the lazy per-map getters (see colormaps.js),
// so this can't accidentally trigger a texture build (which needs a live
// GL context) just from listing names for autocomplete.
const COLORMAPS_KEYS = Object.keys(COLORMAPS).filter((k) => k !== 'loop');
const COLORMAPS_LOOP_KEYS = Object.keys(COLORMAPS.loop);

function matchNames(names, typed) {
  if (names.includes(typed)) return null;
  const lower = typed.toLowerCase();
  const starts = names.filter((n) => n.toLowerCase().startsWith(lower));
  const contains = names.filter((n) => !starts.includes(n) && n.toLowerCase().includes(lower));
  const matches = [...starts, ...contains];
  if (matches.length === 0) return null;
  return { matches: matches.slice(0, 4), typed };
}

// Same idea as findUseCompletions above, but for typing COLORMAPS.<name>
// or COLORMAPS.loop.<name> - live-suggests matching colormap keys
// (viridis, plasma, tab10, ...) instead of requiring you to already know/
// remember the exact name.
export function findColormapCompletions(text, pos) {
  const before = text.slice(0, pos);
  const loopMatch = before.match(/\bCOLORMAPS\.loop\.([A-Za-z_]\w*)?$/);
  if (loopMatch) return matchNames(COLORMAPS_LOOP_KEYS, loopMatch[1] || '');
  const m = before.match(/\bCOLORMAPS\.([A-Za-z_]\w*)?$/);
  if (!m) return null;
  return matchNames(COLORMAPS_KEYS, m[1] || '');
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

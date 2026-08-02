// Blank starter node bodies, one per lib class - just the `{ ... }`
// value, no key. Two ways these get used (see explode.js):
//   - explode(name) wraps one in a generated `newXNode: ` key, for
//     pasting in as a whole standalone entry.
//   - the editor's bare $name$ shortcut (ui/editor.js) uses the body
//     as-is, so `red_shift: $node$` expands using whatever key you
//     already typed instead of a placeholder one.
// To add a template for a new lib class: add one entry here with the
// key you want typed inside explode(...) or $...$.
export const NODE_TEMPLATES = {
  glsl: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const glsl = use(GLSL);",
    "    glsl.tick(`#version 300 es",
    "precision highp float;",
    "in vec2 vUv;",
    "out vec4 outColor;",
    "uniform sampler2D uSrc;",
    "",
    "void main() {",
    "  outColor = texture(uSrc, vUv);",
    "}`, { uSrc: inputs.src });",
    "    return { screen: glsl };",
    "  },",
    "},",
  ].join('\n'),

  canvas: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const canvas = use(Canvas2D, 256, 256);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, 256, 256);",
    "    // draw here",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  screen: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs) {",
    "    render(inputs.src);",
    "    return {};",
    "  },",
    "},",
  ].join('\n'),

  null: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs) {",
    "    return { out: inputs.src };",
    "  },",
    "},",
  ].join('\n'),

  // A blank generic node, no lib class committed to yet - the shape
  // every node in this project starts from before you decide whether
  // it needs GLSL, Canvas2D, or nothing at all.
  node: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    return { screen: inputs.src };",
    "  },",
    "},",
  ].join('\n'),

  // Sized via screenSize() rather than a fixed 256x256 - anything drawn
  // at a small fixed resolution either clips against that resolution's
  // own edges once scaled up, or looks soft/aliased from being
  // magnified (a Scale effect, or the final render, stretching a small
  // buffer up to fill a much bigger screen). Drawing it at the real
  // output resolution instead means far more headroom before either
  // problem shows up.
  square: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const canvas = use(Canvas2D, width, height);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, width, height);",
    "    ctx.fillStyle = 'white';",
    "    const size = Math.min(width, height) * 0.4;",
    "    ctx.fillRect((width - size) / 2, (height - size) / 2, size, size);",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  circle: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const canvas = use(Canvas2D, width, height);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, width, height);",
    "    ctx.fillStyle = 'white';",
    "    ctx.beginPath();",
    "    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.23, 0, Math.PI * 2);",
    "    ctx.fill();",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  // Any polygon, not just a triangle - this is a placeholder to hand-edit,
  // add/remove ctx.lineTo(...) calls freely for more or fewer points.
  shape: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const canvas = use(Canvas2D, width, height);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, width, height);",
    "    ctx.fillStyle = 'white';",
    "    const cx = width / 2, cy = height / 2, r = Math.min(width, height) * 0.3;",
    "    ctx.beginPath();",
    "    ctx.moveTo(cx, cy - r);",
    "    ctx.lineTo(cx + r, cy + r);",
    "    ctx.lineTo(cx - r, cy + r);",
    "    ctx.closePath();",
    "    ctx.fill();",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  text: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const canvas = use(Canvas2D, width, height);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, width, height);",
    "    ctx.fillStyle = 'white';",
    "    ctx.font = `${Math.round(height * 0.12)}px sans-serif`;",
    "    ctx.textAlign = 'center';",
    "    ctx.textBaseline = 'middle';",
    "    ctx.fillText('text', width / 2, height / 2);",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  // HTML/CSS instead of ctx.* drawing calls - see lib/html.js for how
  // (and where its real limits are: no cross-origin fonts/images inside
  // the HTML, and the texture updates one tick after the HTML changes,
  // not the same tick, since rasterizing it is asynchronous. Sized via
  // screenSize() for the same reason as the shape templates above.
  html: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const html = use(Html, width, height);",
    "    html.tick(`<div style='color:white;font:${Math.round(height * 0.1)}px sans-serif;text-align:center;padding-top:${height * 0.4}px;'>hello</div>`);",
    "    return { screen: html };",
    "  },",
    "},",
  ].join('\n'),

  // use(Lag, n) fires (updates its held value) once every n ticks -
  // everything else falls through unchanged in between. See lib/lag.js.
  lag: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const held = use(Lag, 10).tick(inputs.src); // fires every 10 ticks",
    "    return { screen: held };",
    "  },",
    "},",
  ].join('\n'),

  // use(Delay, ticks) shows exactly what `src` looked like `ticks` ticks
  // ago, continuously sliding by one frame every tick - unlike Lag, which
  // holds a value for `ticks` ticks then jumps straight to a new one
  // rather than ever showing the frames in between. See lib/delay.js.
  delay: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const ticks = 30; // <- change this; passed to tick()'s second",
    "    // argument (not the constructor) so editing it takes effect live",
    "    const out = use(Delay).tick(inputs.src, ticks);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // use(Composite).tick(a, b, mode, opacity) - see lib/composite.js.
  // NEVER wire `b`'s input to this same node's own output (a direct
  // feedback loop) - reading a texture while it's the active render
  // target isn't allowed by WebGL and will throw. For an actual
  // feedback/trail effect, route the fed-back side through a Lag or
  // Delay node first (they own their own separate texture).
  composite: () => [
    "{",
    "  // modes: over, atop, xor, multiply, screen, darken, lighten, add,",
    "  // difference, hardLight, softLight, lightest, darkest",
    "  in: { a: 'other.output', b: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const out = use(Composite).tick(inputs.a, inputs.b, 'over', 1);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // A working feedback loop: rotates + shrinks + drifts its OWN previous
  // frame and composites fresh content on top of it every tick, building
  // up a spiral/tunnel over time.
  //
  // RENAME_ME below has to become whatever key you give this node - a
  // feedback loop needs to read its own last output, and Lag is what
  // makes that safe: reading a texture while it's the active render
  // target isn't allowed by WebGL (see composite's own comment above),
  // so the fed-back copy is routed through Lag first, which always
  // copies into its own separate texture before anything else touches
  // it - nothing here ever reads the exact texture it's writing into.
  spiral: () => [
    "{",
    "  in: { src: 'other.output', prev: 'RENAME_ME.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const held = use(Lag).tick(inputs.prev, 1); // safe copy of last tick's own output",
    "    let out = use(Rotate).tick(held, 3);         // degrees per tick - bigger = tighter spiral",
    "    out = use(Scale).tick(out, 0.99);             // <1 slowly shrinks the feedback inward",
    "    out = use(Translate).tick(out, { x: 0.002, y: 0 }); // per-tick drift",
    "    out = use(Composite).tick(inputs.src, out, 'lighten', 1);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // A starting point for writing a new GLSL-backed effect node - the
  // useInstances/base boilerplate every one of them needs, without
  // committing to what the effect actually does yet.
  effect: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const base = inputs.src;",
    "    return { screen: base };",
    "  },",
    "},",
  ].join('\n'),

  // Loads a photo OR an animated GIF - from a URL, or a local file (type
  // $load$ in the editor to pick one - no public/ folder or server
  // involved). See lib/media.js for why both a URL and a local GIF work
  // the same way here (the browser animates a loaded GIF on its own;
  // redrawing it every tick is all that's needed).
  image: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const img = use(ImageSource, width, height);",
    "    img.tick('https://your-image-or-gif-url-here');",
    "    // or a local file - type $load$ elsewhere in the editor to pick",
    "    // one and get a node like this one already wired up:",
    "    // img.tick(files.get('your-file-name.jpg'));",
    "    return { screen: img };",
    "  },",
    "},",
  ].join('\n'),

  // Plays (and loops) a video - from a URL, or a local file ($load$). If
  // a loaded local video plays choppy/slow, its source file's own
  // resolution/bitrate is probably more than the browser can decode in
  // real time (common with phone/drone footage) - not something this
  // node can fix, but see editor.js's $downscale$ shortcut, which
  // re-encodes a video client-side to something far smaller first.
  video: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const vid = use(VideoSource, width, height);",
    "    vid.tick('https://your-video-url-here.mp4');",
    "    // or a local file - type $load$ elsewhere in the editor to pick",
    "    // one and get a node like this one already wired up:",
    "    // vid.tick(files.get('your-file-name.mp4'));",
    "    return { screen: vid };",
    "  },",
    "},",
  ].join('\n'),

  // Live camera feed - tick() asks for camera permission the first time
  // it runs (the browser's own permission prompt). See lib/media.js.
  webcam: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const cam = use(WebcamSource, width, height);",
    "    cam.tick();",
    "    return { screen: cam };",
    "  },",
    "},",
  ].join('\n'),

  // Runs real Hydra (hydra-synth) code - osc/shape/noise/voronoi/out/etc,
  // same syntax as the Hydra editor. Only re-evaluates the string when it
  // actually changes, so editing the code below takes effect live without
  // losing Hydra's own internal state. See lib/hydra-source.js for a real
  // limitation worth knowing: those DSL functions land on `window` (the
  // library's own eval sandbox doesn't work without that), so a second
  // simultaneous Hydra node would fight this one over the same names.
  hydra: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const h = use(HydraSource, width, height);",
    "    h.tick(`osc(10, 0.1, 1.2).out()`);",
    "    return { screen: h };",
    "  },",
    "},",
  ].join('\n'),

  // Real three.js - build the scene/camera/mesh however you like with
  // the THREE global, same API as any other three.js project. Scene/
  // camera/mesh are built inside a plain `if (!state.x)` guard, not
  // useInstances - there's no single class to hand use() here, just a
  // handful of separate THREE objects - reused every tick; only their
  // rotation updates. `|| newPatch` means editing what's INSIDE that
  // guard (swapping BoxGeometry for SphereGeometry, say) takes effect on
  // your next Send instead of needing a node reset button click or a
  // rename - see lib/patch-flag.js. See lib/three-source.js.
  three: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const three = use(ThreeSource, width, height);",
    "    if (!state.scene || newPatch) {", // newPatch: rebuild on every send too, not just the first time - see lib/patch-flag.js
    "      state.scene = new THREE.Scene();",
    "      state.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);",
    "      state.camera.position.z = 3;",
    "      state.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));",
    "      state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));",
    "      state.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4488ff }));",
    "      state.scene.add(state.mesh);",
    "    }",
    "    state.mesh.rotation.x = t;",
    "    state.mesh.rotation.y = t * 0.7;",
    "    const out = three.tick(state.scene, state.camera);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // A generator, not an effect - no src, it draws its own gradient every
  // tick. angle is in degrees; from/to are [r,g,b] in 0..1. See lib/ramp.js.
  ramp: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const ramp = use(Ramp);",
    "    const out = ramp.tick({ angle: 0, from: [0, 0, 0], to: [1, 1, 1] });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Another generator (no src) - grayscale, 'fbm' (smooth/cloudy) or
  // 'cellular' (Voronoi/Pebble-like). Passing t as the seed animates it
  // for free, since seed is just an offset into the noise field. See
  // lib/noise.js.
  noise: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const noise = use(Noise);",
    "    const out = noise.tick({ scale: 4, seed: t * 0.2, octaves: 4, type: 'fbm' });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // A Pattern wraps a plain x -> number function - .plot() shows the
  // curve (preview()), .read(x) gets its value at one x. Same instance,
  // so what you SEE is guaranteed to match what you're actually reading.
  // Drives a circle's radius here, but the value is just a number - use
  // it for anything. See lib/pattern.js.
  pattern: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    // use(Pattern) once (no shape argument) so .plot()'s own internal",
    "    // canvas is reused every tick instead of rebuilt from scratch, then",
    "    // .set() the actual shape EVERY tick - cheap (just a function",
    "    // reassignment), and it's what makes editing Pattern.sin(0.3) below",
    "    // to something else actually take effect on your next Send.",
    "    const pat = use(Pattern).set(Pattern.sin(0.3));",
    "    preview(pat, { range: [t - 10, t] }); // bare Pattern auto-plots - default range is [0, 1]",
    "",
    "    const { width, height } = screenSize();",
    "    const canvas = use(Canvas2D, width, height);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, width, height);",
    "    ctx.fillStyle = 'white';",
    "    const v = pat.read(t); // 0..1",
    "    const r = Math.min(width, height) * (0.05 + v * 0.2);",
    "    ctx.beginPath();",
    "    ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);",
    "    ctx.fill();",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  // Rendering a Pattern's plot AS the main visual (not just a small
  // preview() card) needs two things Pattern's own tiny 256x64 default
  // doesn't give you: real resolution (a low-res plot stretched to fill
  // the whole screen turns visibly blocky - see plot()'s own comment in
  // lib/pattern.js) and margin (drawn edge to edge, ANY shape reads as
  // too big/cropped - same reason $square$/$circle$ draw their shape at
  // a fraction of screenSize(), centered, rather than filling it). This
  // draws the plot at a real chunk of screenSize() (not the tiny
  // default), then composites it onto a full screenSize() canvas with
  // margin around it, same spirit as $square$/$circle$.
  pattern_plot: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const pat = use(Pattern).set(Pattern.sin(0.3));",
    "    const { width, height } = screenSize();",
    "    const margin = 0.25; // 25% on each side - tune to taste",
    "    const plotW = Math.round(width * (1 - margin * 2));",
    "    const plotH = Math.round(height * (1 - margin * 2));",
    "    const plotted = pat.plot({ width: plotW, height: plotH, range: [t - 10, t] });",
    "",
    "    const canvas = use(Canvas2D, width, height);",
    "    const { ctx } = canvas;",
    "    ctx.clearRect(0, 0, width, height);",
    "    ctx.drawImage(plotted.canvas, width * margin, height * margin);",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  // nodeFunction() packages a reusable pipeline as a plain callable with
  // its OWN persistent state - build it once (state.x ??= nodeFunction(...))
  // and call the result like any function, from this node or anywhere
  // else you pass it to. Anything that changes tick to tick (degrees
  // here) has to be an argument to the CALL, not just read from this
  // outer scope - the builder callback only ever runs once. See
  // lib/node-function.js.
  node_function: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    state.rotateThenShrink ??= nodeFunction((use, src, degrees) => {",
    "      let out = use(Rotate).tick(src, degrees);",
    "      out = use(Scale).tick(out, 0.9);",
    "      return out;",
    "    });",
    "    const out = state.rotateThenShrink(inputs.src, t * 20);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // An LFO is just a Pattern, read every tick and exported as a plain
  // value - wire some OTHER node's `in` to 'lfo1.value' to actually use it
  // (e.g. use(Rotate).tick(inputs.src, inputs.value * 360)). Swap
  // Pattern.ramp for .sin/.square/.triangle/.random/.pulse for a
  // different shape - see lib/pattern.js. .set() every tick (rather than
  // use(Pattern, Pattern.ramp(0.25))) is what makes that swap actually
  // take effect on your next Send instead of getting stuck.
  lfo: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const lfo = use(Pattern).set(Pattern.ramp(0.25)); // 0..1 ramp, one cycle every 4s",
    "    const value = lfo.read(t);",
    "    return { value };",
    "  },",
    "},",
  ].join('\n'),

  // The plainest possible Pattern.sin use - a slow brightness pulse.
  // See lib/pattern.js for the other built-in shapes (.ramp/.square/
  // .triangle/.random) and the chaining methods (.map/.mul/.add/.clip).
  sine: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const v = Pattern.sin(0.5).read(t); // 0..1, one full cycle every 2 seconds",
    "    const out = use(Brightness).tick(inputs.src, v * 0.6 - 0.3); // -0.3..0.3",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Instance stamps N positioned/scaled copies of ONE source texture into
  // a single shared destination - one texture, one real GPU-instanced
  // draw call, no matter how large count is. Custom per-instance
  // placement via a callback - Patterns are a natural fit for driving it,
  // since .get() hands back exactly `count` values in one call. For a
  // grid sized by texture brightness with no custom callback, see the
  // particle2d template instead. See lib/instance.js.
  instance: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const count = 12;",
    "    const xs = Pattern.ramp(1 / count).get(0, count); // spread 0..1 across the frame",
    "    const sizes = Pattern.sin(0.2, t).get(0, count).map((v) => 0.04 + v * 0.05);",
    "    const out = use(Instance).tick(inputs.src, count, (i) => ({",
    "      x: xs[i],",
    "      y: 0.5,",
    "      scale: sizes[i],",
    "      rotation: t * 40,",
    "    }));",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // particle2d() is the batteries-included version of Instance: samples
  // the source down to a cols x rows grid and stamps one copy of a
  // texture (dot()/pixel(), see lib/stamps.js) per cell, sized by that
  // cell's brightness - no callback, no useInstances()/use() boilerplate.
  // See lib/instance.js.
  particle2d: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const out = particle2d(inputs.src, 24, 24, dot(), { t, min: 0.15, shakeSpeed: 1 });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // ascii2d() is like particle2d() but draws a character per cell instead
  // of a stamped texture, and never shakes - a static text-art grid, ' '
  // for the darkest cells up to '@' for the brightest. See lib/ascii.js.
  ascii: () => [
    "{",
    "  in: { src: 'other.output' },",
    "  code(inputs, state, t) {",
    "    const out = ascii2d(inputs.src, 60, 40);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),
};

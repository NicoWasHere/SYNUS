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
    "  in: { src: 'other.screen' },",
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
    "  in: { src: 'other.screen' },",
    "  code(inputs) {",
    "    render(inputs.src);",
    "    return {};",
    "  },",
    "},",
  ].join('\n'),

  null: () => [
    "{",
    "  in: { src: 'other.screen' },",
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
    "  in: { src: 'other.screen' },",
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
  // Drawn ONCE (guarded by state.drawn, re-armed by newPatch on your next
  // Send) rather than every tick - a plain static shape never changes, so
  // redrawing (ctx.*) and re-uploading (texImage2D) a full-resolution
  // canvas 60 times a second for it is pure wasted work, worse the
  // bigger/higher-DPI your screen is. Same "if (!state.x || newPatch)"
  // one-time-setup convention the three.js templates already use - see
  // lib/patch-flag.js.
  square: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const canvas = use(Canvas2D, width, height);",
    "    if (!state.drawn || newPatch) {",
    "      const { ctx } = canvas;",
    "      ctx.clearRect(0, 0, width, height);",
    "      ctx.fillStyle = 'white';",
    "      const size = Math.min(width, height) * 0.4;",
    "      ctx.fillRect((width - size) / 2, (height - size) / 2, size, size);",
    "      canvas.upload();",
    "      state.drawn = true;",
    "    }",
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
    "    if (!state.drawn || newPatch) {",
    "      const { ctx } = canvas;",
    "      ctx.clearRect(0, 0, width, height);",
    "      ctx.fillStyle = 'white';",
    "      ctx.beginPath();",
    "      ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.23, 0, Math.PI * 2);",
    "      ctx.fill();",
    "      canvas.upload();",
    "      state.drawn = true;",
    "    }",
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
    "    if (!state.drawn || newPatch) {",
    "      const { ctx } = canvas;",
    "      ctx.clearRect(0, 0, width, height);",
    "      ctx.fillStyle = 'white';",
    "      const cx = width / 2, cy = height / 2, r = Math.min(width, height) * 0.3;",
    "      ctx.beginPath();",
    "      ctx.moveTo(cx, cy - r);",
    "      ctx.lineTo(cx + r, cy + r);",
    "      ctx.lineTo(cx - r, cy + r);",
    "      ctx.closePath();",
    "      ctx.fill();",
    "      canvas.upload();",
    "      state.drawn = true;",
    "    }",
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
    "    if (!state.drawn || newPatch) {",
    "      const { ctx } = canvas;",
    "      ctx.clearRect(0, 0, width, height);",
    "      ctx.fillStyle = 'white';",
    "      ctx.font = `${Math.round(height * 0.12)}px sans-serif`;",
    "      ctx.textAlign = 'center';",
    "      ctx.textBaseline = 'middle';",
    "      ctx.fillText('text', width / 2, height / 2);",
    "      canvas.upload();",
    "      state.drawn = true;",
    "    }",
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
    "  in: { src: 'other.screen' },",
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
    "  in: { src: 'other.screen' },",
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
    "  in: { a: 'other.screen', b: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const out = use(Composite).tick(inputs.a, inputs.b, 'over', 1);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Cuts a hole in src using a second texture's shape - unlike composite
  // above (which mixes two FULL sources), this only ever touches src's
  // alpha. maskSrc here is a plain white circle on transparent, drawn
  // once; swap in any shape (a Canvas2D drawing, particle2d output,
  // ChromaKey's result, ...). See lib/fx/registry.js's mask entry.
  mask: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const maskSrc = use(Canvas2D, width, height);",
    "    if (!state.maskDrawn) {",
    "      state.maskDrawn = true;",
    "      const { ctx } = maskSrc;",
    "      ctx.fillStyle = 'white';",
    "      ctx.beginPath();",
    "      ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.3, 0, Math.PI * 2);",
    "      ctx.fill();",
    "      maskSrc.upload();",
    "    }",
    "    const out = use(Mask).tick(inputs.src, maskSrc, { mode: 'lightness' });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Green-screen style keying - swap `color` for whatever your actual
  // backdrop is, and raise `similarity`/`smoothness` until the edges
  // look clean without eating into the subject. See lib/fx/registry.js's
  // chromaKey entry.
  chroma_key: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const out = use(ChromaKey).tick(inputs.src, {",
    "      color: [0, 1, 0], // the backdrop color to key out, 0..1 rgb",
    "      similarity: 0.4,",
    "      smoothness: 0.15,",
    "    });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // The "Ramp -> Lookup" palette-mapping trick, TouchDesigner-style: build
  // a multi-stop gradient by hand with Canvas2D (more control than
  // Ramp's plain 2-color version), then recolor src entirely from it -
  // every pixel's lightness picks which point along the gradient it
  // becomes. See lib/fx/registry.js's gradientMap entry - and note this
  // is a DIFFERENT tool from ColorLookup (a real 3D LUT, full rgb -> rgb
  // grading), not a replacement for it.
  gradient_map: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const ramp = use(Canvas2D, 256, 1);",
    "    if (!state.rampDrawn) {",
    "      state.rampDrawn = true;",
    "      const { ctx } = ramp;",
    "      const grad = ctx.createLinearGradient(0, 0, 256, 0);",
    "      grad.addColorStop(0, '#0a0033');",
    "      grad.addColorStop(0.5, '#ff2d75');",
    "      grad.addColorStop(1, '#ffe86b');",
    "      ctx.fillStyle = grad;",
    "      ctx.fillRect(0, 0, 256, 1);",
    "      ramp.upload();",
    "    }",
    "    const out = use(GradientMap).tick(inputs.src, ramp, { channel: 'lightness' });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Kaleidoscope is already a plain effect (lib/fx/registry.js) - this is
  // just its starter node. segments = number of mirrored wedges.
  kaleidoscope: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const out = use(Kaleidoscope).tick(inputs.src, 6);",
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
    "  in: { src: 'other.screen', prev: 'RENAME_ME.screen' },",
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
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const base = inputs.src;",
    "    let out = base;",
    "    return { screen: out };",
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
    "    vid.tick('https://your-video-url-here.mp4', { start: 0, end: 100 });",
    "    // start/end: 0..100, percent of the video's own duration - trims BOTH",
    "    // playback and looping to that window, e.g. { start: 25, end: 75 }",
    "    // loops only the middle half. Defaults to the whole file.",
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
  // rotation (and the camera, via orbitCamera below) updates. `|| newPatch`
  // means editing what's INSIDE that guard (swapping BoxGeometry for
  // SphereGeometry, say) takes effect on your next Send instead of needing
  // a node reset button click or a rename - see lib/patch-flag.js.
  //
  // orbitCamera(camera, { azimuth, elevation, radius, target }) (see
  // lib/three-camera.js) just wraps the camera's own ordinary
  // position/lookAt calls - moving azimuth over time (t * 0.3 here) orbits
  // around the mesh; drop it entirely (and set camera.position once
  // inside the guard, like before) for a fixed camera. See lib/three-source.js.
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
    "      state.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));",
    "      state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));",
    "      state.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4488ff }));",
    "      state.scene.add(state.mesh);",
    "    }",
    "    state.mesh.rotation.x = t;",
    "    state.mesh.rotation.y = t * 0.7;",
    "    orbitCamera(state.camera, { azimuth: t * 0.3, elevation: 0.3, radius: 3 });",
    "    const out = three.tick(state.scene, state.camera);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // A flat plane in 3D - "rectangle" in the sense of a 2D shape you can
  // still position/rotate/light in a real 3D scene, as opposed to a full
  // BoxGeometry (see the three template above). side: THREE.DoubleSide
  // is what keeps it visible from the back once it rotates past edge-on.
  three_rect: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const three = use(ThreeSource, width, height);",
    "    if (!state.scene || newPatch) {",
    "      state.scene = new THREE.Scene();",
    "      state.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);",
    "      state.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));",
    "      state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));",
    "      state.mesh = new THREE.Mesh(",
    "        new THREE.PlaneGeometry(1.6, 1),",
    "        new THREE.MeshStandardMaterial({ color: 0x4488ff, side: THREE.DoubleSide })",
    "      );",
    "      state.scene.add(state.mesh);",
    "    }",
    "    state.mesh.rotation.y = t;",
    "    orbitCamera(state.camera, { azimuth: t * 0.3, elevation: 0.3, radius: 3 });",
    "    const out = three.tick(state.scene, state.camera);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Projects one of this project's OWN texture-bearing values onto the
  // sphere via three.toTexture() (see lib/three-source.js) - reads the
  // GLSL/Canvas2D/etc result back onto a real THREE.CanvasTexture, since
  // three.js renders in its own separate WebGL context and can't share a
  // raw WebGLTexture from this project's context directly. Swap `noise`
  // for any other node's output (an `inputs.x` wired in via the node's
  // `in: {...}`, say) to project THAT instead.
  three_sphere: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const three = use(ThreeSource, width, height);",
    "    const noise = use(Noise).tick({ scale: 4, seed: t * 0.2 });",
    "    const colored = use(Colorize).tick(noise, COLORS.CYAN);", // punches up contrast so the projection is obvious at a glance - toTexture() itself works with any texture, plain or processed
    "    if (!state.scene || newPatch) {",
    "      state.scene = new THREE.Scene();",
    "      state.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);",
    "      state.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));",
    "      state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));",
    "      state.mesh = new THREE.Mesh(",
    "        new THREE.SphereGeometry(0.8, 32, 32),",
    "        new THREE.MeshStandardMaterial({ color: 0xffffff })",
    "      );",
    "      state.scene.add(state.mesh);",
    "    }",
    "    state.mesh.material.map = three.toTexture(colored);",
    "    state.mesh.material.needsUpdate = true;",
    "    state.mesh.rotation.y = t;",
    "    orbitCamera(state.camera, { azimuth: t * 0.3, elevation: 0.3, radius: 3 });",
    "    const out = three.tick(state.scene, state.camera);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Loads a real glTF/GLB file (see lib/model-source.js) - swap the
  // filename for your own, picked via the "Load file(s)" button (so
  // files.get('your-model.glb') finds it) or a plain URL string instead.
  // Loading is async, so the model doesn't exist for the first several
  // ticks - guard adding it to the scene on it actually being ready.
  three_model: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const three = use(ThreeSource, width, height);",
    "    const model = use(ModelSource).tick(files.get('your-model.glb'));",
    "    if (!state.scene || newPatch) {",
    "      state.scene = new THREE.Scene();",
    "      state.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);",
    "      state.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));",
    "      state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));",
    "      state.added = false;",
    "    }",
    "    if (model && !state.added) {",
    "      state.scene.add(model);",
    "      state.added = true;",
    "    }",
    "    if (state.added) model.rotation.y = t;",
    "    orbitCamera(state.camera, { azimuth: t * 0.3, elevation: 0.3, radius: 3 });",
    "    const out = three.tick(state.scene, state.camera);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // True 3D-extruded text (THREE.TextGeometry) needs a font JSON loaded
  // over the network, which this project doesn't bundle - drawing the
  // label with Canvas2D (already built in) and mapping it onto a plane
  // instead needs no external asset, and is far cheaper to render besides.
  // Both the text-drawing and the scene setup live in the SAME `if` guard
  // here (not two separate ones) so the CanvasTexture is always built
  // from whatever the canvas already has drawn onto it, never one tick
  // stale.
  three_text: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const three = use(ThreeSource, width, height);",
    "    const label = use(Canvas2D, 512, 128);",
    "    if (!state.scene || newPatch) {",
    "      const { ctx } = label;",
    "      ctx.clearRect(0, 0, 512, 128);",
    "      ctx.fillStyle = 'white';",
    "      ctx.font = 'bold 72px sans-serif';",
    "      ctx.textAlign = 'center';",
    "      ctx.textBaseline = 'middle';",
    "      ctx.fillText('hello', 256, 64);",
    "      label.upload();",
    "",
    "      state.scene = new THREE.Scene();",
    "      state.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);",
    "      state.texture = new THREE.CanvasTexture(label.canvas);",
    "      state.mesh = new THREE.Mesh(",
    "        new THREE.PlaneGeometry(2.4, 0.6),",
    "        new THREE.MeshBasicMaterial({ map: state.texture, transparent: true })",
    "      );",
    "      state.scene.add(state.mesh);",
    "    }",
    "    state.mesh.rotation.y = Math.sin(t) * 0.4;",
    "    orbitCamera(state.camera, { azimuth: Math.sin(t * 0.3) * 0.6, elevation: 0.15, radius: 3 });",
    "    const out = three.tick(state.scene, state.camera);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Turns a flat 2D shape into a real, lit, rotatable 3D one via
  // lib/extrude.js's Extrude class - reads the source's alpha on a coarse
  // grid and builds one small extruded box per covered cell (a
  // "voxel-relief" look, not a smooth silhouette - much cheaper to rebuild
  // every tick than real contour tracing). Swap the drawn circle for any
  // other alpha-bearing source (inputs.src, ChromaKey'd footage, text on a
  // Canvas2D, ...) - anything with a shape in its alpha works.
  three_extrude: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const { width, height } = screenSize();",
    "    const three = use(ThreeSource, width, height);",
    "    const extrude = use(Extrude);",
    "    const shape = use(Canvas2D, 256, 256);",
    "    if (!state.scene || newPatch) {",
    "      const { ctx } = shape;",
    "      ctx.clearRect(0, 0, 256, 256);",
    "      ctx.fillStyle = '#4488ff';",
    "      ctx.beginPath();",
    "      ctx.arc(128, 128, 100, 0, Math.PI * 2);",
    "      ctx.fill();",
    "      shape.upload();",
    "",
    "      state.scene = new THREE.Scene();",
    "      state.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);",
    "      state.scene.add(new THREE.DirectionalLight(0xffffff, 2).translateZ(5));",
    "      state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));",
    "      state.added = false;",
    "    }",
    "    const mesh = extrude.tick(shape, { depth: 0.3, resolution: 32 });",
    "    if (!state.added) { state.scene.add(mesh); state.added = true; }",
    "    mesh.rotation.y = t * 0.5;",
    "    orbitCamera(state.camera, { azimuth: t * 0.3, elevation: 0.3, radius: 3 });",
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

  // A multi-stop gradient, live-editable via colorPicker - unlike ramp
  // above (exactly 2 colors, from/to), Gradient (lib/gradient.js) takes
  // any number of colors, evenly spaced by default. $gradient$ (no count)
  // starts you with 2 color pickers; $gradient(5)$ starts you with 5 -
  // see editor.js's NODE_PATTERN, which is what parses the "(5)" part off
  // a bare $name$ shortcut (only this template actually uses the number;
  // every other $name$ template ignores it, same as calling any JS
  // function with an extra argument it doesn't declare). Rename the
  // colorPicker names if you use $gradient$ more than once in the same
  // file - just a starting point, same as every other bare $name$
  // template's generated body, nothing stops renaming it or adding more
  // colorPicker calls + array entries by hand later.
  gradient: (count = 2) => {
    const defaults = ['#ffffff', '#000000', '#ff3366', '#33ff99', '#3366ff', '#ffcc00'];
    const n = Math.max(1, Math.round(count));
    const lines = ["{", "  in: {},", "  code(inputs, state, t) {", "    const use = useInstances(state);"];
    for (let i = 1; i <= n; i++) {
      lines.push(`    const c${i} = colorPicker('gradient${i}', { default: '${defaults[(i - 1) % defaults.length]}' });`);
    }
    const names = Array.from({ length: n }, (_, i) => `c${i + 1}`).join(', ');
    lines.push(`    const out = use(Gradient).tick([${names}]);`, "    preview(out);", "    return { screen: out };", "  },", "},");
    return lines.join('\n');
  },

  // Another generator (no src) - 'value'/'perlin' (smooth/cloudy),
  // 'voronoi' (Pebble-like), or 'static' (flickering TV noise). Passing t
  // as z morphs the field in place (no x/y panning) - see lib/noise.js.
  noise: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const noise = use(Noise);",
    "    const out = noise.tick({ scale: 4, z: t * 0.2, octaves: 4, type: 'perlin' });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Localized bulge/pinch per point - see lib/warp.js. Positive amount
  // magnifies outward, negative pinches inward; add more points for more
  // warps (each composes on top of the others).
  warp: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state) {",
    "    const use = useInstances(state);",
    "    const out = use(Warp).tick(inputs.src, [{ x: 0.5, y: 0.5, radius: 0.4, amount: 0.8 }]);",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // Wave-like ripples radiating from each point, moving with t - see
  // lib/ripple.js. Add more points for more ripple sources; overlapping
  // waves blend rather than one replacing the other.
  ripple: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const out = use(Ripple).tick(inputs.src, [{ x: 0.5, y: 0.5, frequency: 40, amplitude: 0.02, speed: 4 }], t);",
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
    "  in: { src: 'other.screen' },",
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
    "  in: { src: 'other.screen' },",
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
    "  in: { src: 'other.screen' },",
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
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const out = particle2d(inputs.src, 24, 24, dot(), { t, min: 0.15, shakeSpeed: 1 });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // PhysicsWorld wraps matter-js (a real 2D physics engine) - this one
  // drops a ball roughly once a second onto a 45deg platform with
  // restitution cranked way up ("super bouncy"). gravity/restitution/
  // spawn rate are all plain top-of-function numbers - change and see the
  // difference immediately. See lib/physics-world.js.
  physics: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const gravity = 1;",
    "    const bounciness = 1.1; // > 1 gains energy each bounce instead of settling",
    "    const spawnEvery = 1; // seconds",
    "    const { width, height } = screenSize();",
    "    const use = useInstances(state);",
    "    const canvas = use(Canvas2D);",
    "    const { ctx } = canvas;",
    "",
    "    if (!state.world) {",
    "      state.world = new PhysicsWorld({ gravity });",
    "      state.platformId = state.world.addPlatform({",
    "        x: width / 2,",
    "        y: height * 0.7,",
    "        width: width * 0.6,",
    "        angle: 45,",
    "        restitution: bounciness,",
    "      });",
    "      state.lastSpawn = -spawnEvery;",
    "    }",
    "    // static bodies don't rotate on their own - set the angle yourself",
    "    // every tick if you want it moving (here, oscillating +/- 20deg).",
    "    state.world.setAngle(state.platformId, 45 + Math.sin(t) * 20);",
    "    if (t - state.lastSpawn >= spawnEvery) {",
    "      state.world.addBall({ x: width / 2, y: 0, radius: 20 });",
    "      state.lastSpawn = t;",
    "    }",
    "    state.world.tick();",
    "",
    "    ctx.fillStyle = '#000';",
    "    ctx.fillRect(0, 0, width, height);",
    "    for (const body of state.world.all()) {",
    "      ctx.save();",
    "      ctx.translate(body.x, body.y);",
    "      ctx.rotate((body.angle * Math.PI) / 180);",
    "      ctx.fillStyle = body.kind === 'ball' ? '#4ae' : '#888';",
    "      if (body.kind === 'ball') {",
    "        ctx.beginPath();",
    "        ctx.arc(0, 0, body.radius, 0, Math.PI * 2);",
    "        ctx.fill();",
    "      } else {",
    "        ctx.fillRect(-body.width / 2, -body.height / 2, body.width, body.height);",
    "      }",
    "      ctx.restore();",
    "    }",
    "    canvas.upload();",
    "    return { screen: canvas };",
    "  },",
    "},",
  ].join('\n'),

  // ascii2d() is like particle2d() but draws a character per cell instead
  // of a stamped texture, and never shakes - a static text-art grid, ' '
  // for the darkest cells up to '@' for the brightest. See lib/ascii.js.
  ascii: () => [
    "{",
    "  in: { src: 'other.screen' },",
    "  code(inputs, state, t) {",
    "    const out = ascii2d(inputs.src, 60, 40, { fontSize: 16 });",
    "    return { screen: out };",
    "  },",
    "},",
  ].join('\n'),

  // AudioSource pulls a live mic spectrum into plain numbers - nothing
  // here is a texture, this is for driving OTHER things (a Pattern, an
  // Instance/particle2d grid, an effect's parameter) with sound. .band()
  // is the "EQ" half (pull out specific Hz ranges); wrapping .spectrum()
  // as a Pattern for the "scope" half reuses .plot()'s axis labels/auto-
  // scaling/resolution for free instead of drawing a bar graph by hand.
  audio: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    const use = useInstances(state);",
    "    const audio = use(AudioSource);",
    "    audio.tick(); // asks mic permission on first call - check audio.error",
    "",
    "    // EQ: pull out a few specific bands (Hz ranges) - split these",
    "    // wherever actually matches your source material",
    "    const bass = audio.band(20, 250);",
    "    const mid = audio.band(250, 4000);",
    "    const treble = audio.band(4000, 12000);",
    "",
    "    // scope: reread the CURRENT spectrum through a Pattern so",
    "    // .plot() draws it as a live graph - not real-valued math, just",
    "    // indexing into whatever audio.spectrum() returned this tick",
    "    const cols = 64;",
    "    const scope = use(Pattern).set((x) => audio.spectrum(cols)[Math.min(cols - 1, Math.floor(x))]);",
    "    preview(scope, { range: [0, cols] });",
    "",
    "    return { bass, mid, treble };",
    "  },",
    "},",
  ].join('\n'),

  // A quick way to confirm your MIDI controller is actually connected
  // and see what its knobs/pads report - midi.knobs/midi.pads (lib/
  // midi.js) are live key-value stores that grow automatically as you
  // touch each control, keyed by its raw CC/note number, so this works
  // for ANY controller with no hardcoded per-device mapping needed at
  // all. Once you know which numbers matter, swap to midiKnob(cc)/
  // midiPad(note) directly for real use (or LPD8/LPD8_MK2 if you happen
  // to have one of those and its factory numbers already match).
  midi: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    if (midi.error) preview(midi.error);",
    "    preview(midi.knobs);",
    "    preview(midi.pads);",
    "    return { knobs: midi.knobs, pads: midi.pads };",
    "  },",
    "},",
  ].join('\n'),

  // A generic MIDI-knob-driven tempo node - deliberately NOT hardcoded to
  // any one controller's CC numbers (an LPD8 mk1 and mk2 already don't
  // agree - see midi.js's LPD8/LPD8_MK2), so this ships with a placeholder
  // CC to swap for your own: watch console/midi.knobs once (the $midi$
  // template) to find it, same discovery workflow as any other CC/note.
  bpm: () => [
    "{",
    "  in: {},",
    "  code(inputs, state, t) {",
    "    // your CC - see midi.knobs",
    "    const cc = 20;",
    "    const bpm = midiKnob(cc, { min: 60, max: 200, default: 120 });",
    "    const beat = beatmatch(bpm, t, { shape: 'triangle', subdivide: 4 });",
    "    preview({",
    "      bpm: Math.round(bpm),",
    "      beat: beat.beat,",
    "      step: beat.step,",
    "      pulse: beat.pulse,",
    "      stepPulse: beat.stepPulse,",
    "    });",
    "    return {",
    "      bpm,",
    "      beat: beat.beat,",
    "      phase: beat.phase,",
    "      pulse: beat.pulse,",
    "      value: beat.value,",
    "      step: beat.step,",
    "      stepPhase: beat.stepPhase,",
    "      stepPulse: beat.stepPulse,",
    "    };",
    "  },",
    "},",
  ].join('\n'),

  // A generic "which pad was pressed most recently" node - outputs an
  // integer index (0..maxIndex) for driving a $switch(n)$ node. Defaults
  // to the LPD8 mk2's own padsA notes (see LPD8_MK2 in midi.js) since
  // that's the most common real controller this gets used with - swap
  // `allNotes` for your own pad numbers if yours differ (watch console/
  // midi.pads to find them). `maxIndex` caps how many of those get used
  // without needing to shorten the array itself - e.g. leave allNotes at
  // its full 8 and just lower maxIndex for a smaller $switch(n)$.
  pad_index: () => [
    "{",
    "  in: {},",
    "  code(inputs, state) {",
    "    const allNotes = [60, 62, 64, 65, 67, 69, 71, 72];",
    "    const maxIndex = 3;",
    "    const notes = allNotes.slice(0, maxIndex + 1);",
    "    if (state.selected === undefined) state.selected = 0;",
    "    if (!state.prev) state.prev = notes.map(() => false);",
    "    notes.forEach((note, i) => {",
    "      const on = midi.pads[`pad_${note}`] || false;",
    "      if (on && !state.prev[i]) state.selected = i;",
    "      state.prev[i] = on;",
    "    });",
    "    preview({ selected: state.selected });",
    "    return { index: state.selected };",
    "  },",
    "},",
  ].join('\n'),
};

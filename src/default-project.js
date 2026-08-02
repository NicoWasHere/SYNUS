// square1 -> rainbow1 -> transform1 -> comp <-> delay -> null1 -> render1
// Edit anything below - it re-runs on every change. Each node's `state`
// persists across edits (shader programs, canvases, and fx effect
// instances don't get rebuilt unless their code actually changes).

export const nodes = {

  // plain JS, no GLSL at all - draws a white square with Canvas2D
  square1: {
    in: {},
    code(inputs, state, t) {
      const use = useInstances(state);
      const canvas = use(Canvas2D, 256, 256);
      const { ctx } = canvas;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = 'white';
      ctx.fillRect(88, 88, 80, 80);
      canvas.upload();
      return { screen: canvas };
    },
  },

  // GLSL - reads square1's texture, colors it with a moving rainbow hue
  rainbow1: {
    in: { src: 'square1.screen' },
    code(inputs, state, t) {
      const use = useInstances(state);
      const glsl = use(GLSL);
      glsl.tick(
        `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 outColor;
        uniform sampler2D uSrc;
        uniform float uTime;

        vec3 hue(float h) {
          vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          return rgb;
        }

        void main() {
          vec4 src = texture(uSrc, vUv);
          vec3 rainbow = hue(fract(vUv.x + vUv.y + uTime * 0.1));
          outColor = vec4(rainbow * src.a, src.a);
        }`,
        { uSrc: inputs.src, uTime: t }
      );
      return { screen: glsl };
    },
  },

  // effect classes, used directly through use() - no wrapper needed.
  // preview(out) opts this node into a floating preview card next to its
  // own block - previews are off by default, so square1 and rainbow1
  // above show nothing unless you add a preview(...) call to them too.
  transform1: {
    in: { src: 'rainbow1.screen' },
    code(inputs, state, t) {
      const use = useInstances(state);
      let out = use(Rotate).tick(inputs.src, t * 20);  // degrees, spins over time
      out = use(Scale).tick(out, { x: 0.5, y: 0.5 });  // slightly squashed
      preview(out);
      return { screen: out };
    },
  },

  // A feedback loop: composites transform1's live output against delay's
  // fed-back copy of this same loop's own recent history. Safe because
  // `delay` (below) is what's actually wired into `b` here, not `comp`
  // reading its own output directly - see delay's comment for why that
  // distinction is what makes this legal on the GPU.
  comp: {
    // modes: over, atop, xor, multiply, screen, darken, lighten, add,
    // difference, hardLight, softLight, lightest, darkest
    in: { a: 'transform1.screen', b: 'delay.screen' },
    code(inputs, state, t) {
      const use = useInstances(state);
      const out = use(Composite).tick(inputs.b, inputs.a, 'difference', t % 100);
      return { screen: out };
    },
  },

  // Delay owns its own separate texture (a ring buffer) that it copies
  // into - reading `comp`'s output through here rather than directly is
  // what lets `comp` feed back into itself without ever reading the
  // exact texture it's currently rendering into (a WebGL feedback loop,
  // which throws rather than silently freezing - see glsl.js).
  //
  // 'nearest' below (Delay/Translate/Scale's last constructor argument)
  // is what keeps this loop from getting blurrier every iteration -
  // Translate/Scale each resample their input at a fractional/scaled UV,
  // and by default that resampling is bilinear (smooth), which softens
  // the image a little on every single pass; over many ticks that
  // compounds into visible blur. 'nearest' never blends between texels,
  // so it can't accumulate that way - the trade is hard pixel-stepping
  // instead of smoothness. Try switching any of these back to the
  // default 'linear' (or just omit the argument) to see the difference.
  delay: {
    in: { src: 'comp.screen' },
    code(inputs, state, t) {
      const use = useInstances(state);
      const ticks = 1; // <- change this; passed to tick()'s second
      // argument (not the constructor) so editing it takes effect live
      let out = use(Delay, undefined, 'nearest').tick(inputs.src, ticks);
      out = use(Translate, 'nearest').tick(out, { x: 0.01 * ((5) % 2), y: 0.01 });
      out = use(Scale, 'nearest').tick(out, { x: 1.01, y: 1.00 });
      return { screen: out };
    },
  },

  null1: {
    in: { src: 'comp.screen' },
    code(inputs) {
      return { out: inputs.src };
    },
  },

  // render(...) is what actually puts something on screen - move this
  // call to a different node (e.g. render(inputs.src) inside transform1
  // instead) to change what's shown without touching any `in` wiring.
  render1: {
    in: { src: 'null1.out' },
    code(inputs) {
      render(inputs.src);
      return {};
    },
  },
};

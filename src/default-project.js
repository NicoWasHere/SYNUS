// square1 -> rainbow1 -> transform1 -> comp <-> delay -> null1 -> render1
// Edit anything below - it re-runs on every change. Each node's `state`
// persists across edits.

export const nodes = {

  // plain JS, no GLSL - draws a white square with Canvas2D. Drawn at real
  // output resolution (not a small fixed size) so its edge stays crisp -
  // a smaller canvas stretched up to screen size would blur at the edge
  // (bilinear upscaling), which reads as a soft "outline" once composited.
  square1: {
    in: {},
    code(inputs, state, t) {
      const use = useInstances(state);
      const { width, height } = screenSize();
      const canvas = use(Canvas2D, width, height);
      const { ctx } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'white';
      const size = Math.min(width, height) * 0.3;
      ctx.fillRect((width - size) / 2, (height - size) / 2, size, size);
      canvas.upload();
      return { screen: canvas };
    },
  },

  // GLSL - colors square1 with a moving rainbow hue
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

  // effect classes, used directly through use() - preview(out) shows this
  // node's own floating preview card (off by default elsewhere).
  transform1: {
    in: { src: 'rainbow1.screen' },
    code(inputs, state, t) {
      const use = useInstances(state);
      let out = use(Rotate).tick(inputs.src, t * 20);
      out = use(Scale).tick(out, { x: 0.5, y: 0.5 });
      preview(out);
      return { screen: out };
    },
  },

  // Feedback loop: transform1's live output composited against delay's
  // fed-back history (never comp's own output directly - see delay below).
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

  // Delay owns its own separate texture - reading comp's output through
  // here (not directly) is what makes the feedback loop legal on the GPU.
  // 'nearest' below keeps it from getting blurrier every iteration.
  delay: {
    in: { src: 'comp.screen' },
    code(inputs, state, t) {
      const use = useInstances(state);
      const ticks = 1; // <- change this
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

  // render(...) puts something on screen - move this call elsewhere to
  // change what's shown without touching any `in` wiring.
  render1: {
    in: { src: 'null1.out' },
    code(inputs) {
      render(inputs.src);
      return {};
    },
  },
};

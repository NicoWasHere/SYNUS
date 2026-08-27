// DEFAULT_BLOCK_PATCH - what Block mode opens to the very first time
// there's no patch already saved in the URL (see main.js). A worked
// example of the multi-input-port + $expr + FX.mask features, chosen to
// actually demonstrate them rather than start blank: a shape -> that
// shape masks a hand-drawn color gradient -> the masked result spins ->
// renders to screen, in exactly the 4 nodes that reads as on the canvas.
//
// "square" is a plain source.canvasColor slot (a real block, editable
// like any other) - the mask effect's default 'lightness' mode already
// treats a white shape on Canvas2D's transparent (~black) clear as a
// clean cutout, so no raw code is needed for the shape itself.
//
// "colorMap" draws its own gradient via a `raw` slot (there's no
// gradient/ramp source prefab in the palette yet) and then masks it
// with "square"'s output - the wired input port is named 'tex' because
// that's what patch-compiler.js's MULTI_ARG_EFFECTS handling expects a
// mask/gradientMap/colorLookup slot's texture arg to be wired as.
//
// "rotator" spins the masked gradient continuously via $expr (t is
// already in scope in every node's code()) - a deliberate demo of that
// feature too, not just a static angle.
export const DEFAULT_BLOCK_PATCH = {
  version: 1,
  nodes: [
    {
      id: 'square',
      pos: { x: 40, y: 80 },
      in: {},
      inputNames: ['src'],
      extraOutputs: {},
      slots: [{ prefab: 'source.canvasColor', args: { color: '#ffffff', size: 0.5 } }],
    },
    {
      id: 'colorMap',
      pos: { x: 240, y: 80 },
      in: { tex: 'square.out' },
      inputNames: ['tex'],
      extraOutputs: {},
      slots: [
        {
          prefab: 'raw',
          code: [
            'const canvas0 = use(Canvas2D, width, height);',
            '{',
            '  const { ctx } = canvas0;',
            '  const grad = ctx.createLinearGradient(0, 0, width, height);',
            "  grad.addColorStop(0, '#ff3355');",
            "  grad.addColorStop(0.5, '#ffcc33');",
            "  grad.addColorStop(1, '#33ccff');",
            '  ctx.fillStyle = grad;',
            '  ctx.fillRect(0, 0, width, height);',
            '  canvas0.upload();',
            '}',
            'let out = canvas0;',
          ].join('\n'),
        },
        { prefab: 'fx.mask', args: { tex: { $ref: 'tex' }, opts: { mode: 'lightness', invert: false } } },
      ],
    },
    {
      id: 'rotator',
      pos: { x: 440, y: 80 },
      in: { src: 'colorMap.out' },
      inputNames: ['src'],
      extraOutputs: {},
      slots: [{ prefab: 'fx.rotate', args: { $expr: '(t * 30) % 360' } }],
    },
    {
      id: 'screen',
      pos: { x: 640, y: 80 },
      in: { src: 'rotator.out' },
      inputNames: ['src'],
      extraOutputs: {},
      slots: [{ prefab: 'sink.render' }],
    },
  ],
};

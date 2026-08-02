# livecode node env — starter

Every node is the shape `{ in, code }`, the whole project is one text
file edited in the left pane (a real CodeMirror editor, with JS syntax
highlighting and per-node folding), and "which language/engine" is just
whichever `lib` class (`GLSL`, `Canvas2D`, `ScreenOutput`, or an fx
effect class) a node's `code` happens to call - not a node-type choice.
Every node also gets a live inline preview, injected right after its
code block.

## Run it

```
npm install
npm run dev
```

The editor starts with a 4-node example: a plain-JS square, a GLSL node
that rainbow-colors it, a `transform1` node that rotates + scales it
using the fx stdlib (see below), and a render node. Edit any node in
place - the whole file re-runs on every change, but each node's `state`
(shader programs, canvases, fx instances) survives across reloads by
node id.

## Structure

```
livecode-starter/
  index.html                 two-pane layout: #editor-mount (left), #render-pane (right)
  src/
    default-project.js          the starter project, imported as raw text into the editor
    main.js                     wires editor -> project-loader -> graph -> clock -> preview updates
    ui/
      editor.js                   creates the CodeMirror EditorView: JS mode, folding, preview widgets, $explode(...)$
      node-parser.js               parseNodeBlocks() - finds each node's { ... } span in the source text
      preview-widget.js            CodeMirror WidgetType placed after each node + the live registry main.js writes into
    core/
      bus.js                     typed pub/sub store
      clock.js                    base rAF tick with per-node rate multipliers
      graph.js                    holds nodes as { id, code, inputs, state, lastOutputs }, derives cook order, runs tick()
      project-loader.js            loads the editor's text as a real ES module, exposes lib + fx as globals
      lib/
        context.js                  holds the single shared WebGL2 context
        hooks.js                     call-order-keyed caching primitive (createHookScope) - what useInstances is built on
        use-instances.js             useInstances(state) -> use(Ctor, ...args) - "construct once, reuse every tick" for any class
        glsl.js                     GLSL class - `new GLSL()`, `.tick(fragSrc, uniforms)` recompiles only on change
        canvas2d.js                  Canvas2D class - `new Canvas2D(w,h)`, plain ctx.* drawing + .upload()
        screen-output.js             ScreenOutput class - the sink, draws to the visible canvas
        texture-preview.js           downsamples a texture to a small ImageData for the inline preview widgets
        node-templates.js            blank starter node blocks (glsl, canvas, screen, null) - text explode() can return
        explode.js                   explode(name) - dispatches to an effect's raw shader OR a node template
        fx/
          shaders.js                   raw GLSL source for every stdlib effect (rotate, scale, flip, ...)
          registry.js                   table: effect name -> { frag, toUniforms(args) }
          effects.js                     generates one real class per effect (Rotate, Scale, ...) from the registry
  gl/
    gl-context.js                 shared low-level WebGL2 helpers - textures, framebuffers, shader compile, quad draw
```

## Debugging a node

An error thrown inside a node's `code()` is caught per-node so one broken
node doesn't freeze the rest of the graph. Two places to check: the red
strip under the editor, and the browser console - `graph.tick()` does
`console.error('[nodeId]', e)` on every caught error, so a real bug in a
node always shows up there too. `graph.nodes.get('someId').error` from
the console gives you the last message directly.

## The GLSL class

`new GLSL()` takes no source - construct it once per node
(`state.glsl ??= new GLSL()`, or `use(GLSL)`, see below), then call
`.tick(fragSrc, uniforms)` with the *current* shader text every frame. It
only recompiles when that string changes from the last tick. Uniform
values can be a texture-bearing object, a plain number, a boolean, or a
JS array of length 2/3/4 (bound as vec2/vec3/vec4).

## Persisting objects across ticks: useInstances

Every lib class needs to be constructed once and reused every tick, not
recreated 60 times a second - recreating a `GLSL` every frame leaks a
texture and framebuffer every frame, and defeats the "only recompile when
the shader text changes" check `.tick()` does internally. The direct way
to do that is `state.glsl ??= new GLSL()` - construct once, `state`
carries it forward. `useInstances` is that same pattern generalized so
you don't write it by hand for every class:

```js
code(inputs, state, t) {
  const use = useInstances(state);
  const glsl = use(GLSL);          // same instance every tick after the first
  const canvas = use(Canvas2D, 256, 256); // a second, independent instance
  ...
}
```

`use(Ctor, ...args)` works for any constructor, and you can call it as
many times as a node needs persistent objects - each call gets its own
instance, matched up call-to-call by *call order* within the tick (the
same mechanism React hooks use for `useState`). That's what makes this
safe to generalize instead of needing a fixed `type` per node: a node can
mix a `GLSL` and a `Canvas2D`, or use two separate `GLSL` passes, and
each `use()` call still finds its own instance correctly. The one rule
that comes with it: keep `use()` calls unconditional and in the same
order every tick - wrapping one in an `if` can shift the call count
between ticks and make a later call grab the wrong cached instance.

## The fx stdlib

Every effect is an ordinary class, generated from a table of shader +
argument-mapping pairs in `fx/registry.js`, and usable exactly like
`GLSL` or `Canvas2D` - through the same `use()`, no wrapper needed:

```js
transform1: {
  in: { src: 'rainbow1.screen' },
  code(inputs, state, t) {
    const use = useInstances(state);
    let out = use(Rotate).tick(inputs.src, t * 20);   // degrees
    out = use(Scale).tick(out, { x: 1, y: 0.9 });
    return { screen: out };
  },
},
```

An effect isn't a special kind of thing - `Rotate`, `Scale`, and friends
are just more classes, generated automatically from `fx/registry.js` by
`fx/effects.js`. Nine ship by default: `Rotate`, `Scale`, `Flip`,
`Translate`, `ChannelMix`, `Brightness`, `Contrast`, `Saturation`,
`HueShift`.

**Adding a new effect** is two small additions, nothing else changes:
1. Write its GLSL source as a new export in `fx/shaders.js`.
2. Add one entry to the `EFFECTS` table in `fx/registry.js`: which
   shader, and a `toUniforms(...args)` function mapping the plain-JS
   call arguments to the uniform object `GLSL.tick()` expects.

## explode() - read a template instead of writing one

`explode(name)` returns text you can use as a starting point for a new
node, rather than starting from a blank line. Two kinds of name work:

- An effect name (`explode('rotate')`) returns that effect's exact GLSL
  source - useful for dropping into a plain GLSL node body and hand-
  editing from a known-working version, rather than writing a rotate
  shader from scratch.
- A lib-class keyword (`explode('glsl')`, `explode('canvas')`,
  `explode('screen')`, `explode('null')`, `explode('node')`) returns a
  blank starter node block for that kind of node - the same shape as the
  nodes already in `default-project.js`, ready to paste in and rename.
  `explode('node')` is the generic one: no lib class committed to yet.

Both cases return text that already exists somewhere in `fx/registry.js`
or `node-templates.js` - nothing is reconstructed or guessed. Call
`explode('rotate')` from the browser console to print it, or type it
directly in the editor:

**In the editor**, typing `$explode(glsl)$` anywhere and finishing the
closing `$` replaces that text in place with the template, live, the
moment the pattern completes - no need to switch to the console. `$` was
picked deliberately: the pattern requires the literal text `explode(` and
`)$` around the name, so a JS template-literal interpolation like
`${uTime}` elsewhere in a node's code has a different shape and won't be
mistaken for it.

**Adding a template for a new lib class** is one entry in
`node-templates.js` - no changes needed to `explode.js` or `main.js`.

## The editor: syntax highlighting, folding, and per-node preview

The editor is a real CodeMirror 6 instance (`ui/editor.js`), not a plain
textarea:

- **Syntax highlighting** comes from `@codemirror/lang-javascript` -
  it's the standard JS mode, nothing custom, so GLSL/HTML/anything else
  embedded in a template literal just highlights as a string, not as its
  own language.
- **Folding** comes free from CodeMirror's `basicSetup` once the JS
  language is loaded - the fold gutter (small arrows next to line
  numbers) can collapse any node's `{ ... }` block, since object
  literals are foldable syntax nodes in the JS grammar. No custom code
  was needed for this.
- **Per-node preview** is custom (`ui/node-parser.js` +
  `ui/preview-widget.js`): a small hand-written scanner finds the
  character span of every top-level node in the source text (deliberately
  *not* relying on CodeMirror's internal parse tree, since correctly
  walking an unfamiliar grammar's exact node names blind, without a
  browser available to verify against, is a real way to get this subtly
  wrong - see the comment at the top of `node-parser.js` for what it does
  and doesn't handle). A CodeMirror `ViewPlugin` re-runs that scanner on
  every doc change and places a widget right after each node's closing
  brace. Each widget's DOM (a small canvas + a text span) is registered
  in a shared `previewRegistry` Map that `main.js`'s tick loop writes
  into every frame - texture-bearing outputs get drawn into the canvas
  (downsampled on the GPU first via `texture-preview.js`, so the readback
  cost stays small regardless of how many previews are open), anything
  else gets `JSON.stringify`'d into the text span. This is a live pixel
  feed happening 60x/sec entirely outside CodeMirror's own update cycle -
  it never dispatches a transaction, so it can't interfere with typing.
- Which output gets previewed, when a node returns more than one, is
  decided by `main.js`'s `pickPreviewValue()`: prefers a key literally
  named `screen`, then `out`, then whatever the first key is.

**A known rough edge worth knowing about**: `node-parser.js`'s scanner
treats the *entire* contents of a template literal as opaque (see the
comment at the top of that file) - it doesn't specially handle `${...}`
interpolation inside one. This is fine for shader source (which never
uses `${}` - dynamic values go through uniforms instead) but means a
node that interpolates a value directly into a template literal outside
that pattern may get a slightly misplaced preview boundary. If a preview
ever looks like it's attached to the wrong node, that's the first thing
to check.

## Why a node is just `{ in, code }`

`in` is wiring metadata the graph needs *without running any code* - it's
what `cookOrder()` uses to topologically sort nodes. `code(inputs, state, t)`
runs every tick and its return value *is* the node's outputs - there's no
separate `out` block, because outputs usually depend on values only
computed during the tick. Any object with a `.texture` property (GLSL,
Canvas2D, a future video-file class, an fx result) can be handed straight
into another node's `code` or a GLSL uniform - the bus doesn't care what
produced it.

## Where to go next

- **Interactive control nodes** (buttons, sliders, toggles) - now that
  preview exists, these can render through a new `type: 'html'` preview
  mode (plain native `<input>` elements rather than custom-built
  controls) instead of a separate system. A button's `code` publishes `1`
  while pressed and `0` otherwise; a slider publishes its current numeric
  value.
- **More lib classes** - p5.js, a video-file loader, eventually Hydra or
  Three.js. Each is a new file in `core/lib/`, following `canvas2d.js` as
  the template (own your persistent object, expose `.texture`).
- **Detachable render window** - `window.open()` a second document, get
  frames there via a second WebGL context or by transferring `ImageBitmap`s
  each tick. Independent of everything else on this list.
- **Project save/load as a real file** - right now the project only
  exists as whatever's in the editor; a download/open-file-picker pair
  would make it a real file on disk again between sessions.
- **Verify the CodeMirror integration in an actual browser** - this was
  built and build-tested (production `vite build` passes clean, and every
  `@codemirror/*` import resolves) without a real browser available in
  the environment that built it. The parts most worth checking first: the
  fold gutter actually collapsing a node's block, the `$explode(...)$`
  expansion not fighting with the cursor position, and preview widgets
  surviving a doc edit elsewhere in the file without losing their canvas
  (the `eq()` check in `preview-widget.js` is what's supposed to prevent
  that).

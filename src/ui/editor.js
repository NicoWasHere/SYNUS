import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-glsl';
import 'prismjs/components/prism-javascript';
import { explode, nodeTemplateBody, NODE_TEMPLATE_NAMES } from '../core/lib/explode.js';
import { addFile } from '../core/lib/file-registry.js';
import { downscaleVideo } from '../core/lib/video-downscale.js';
import { openDrawTool } from './draw-tool.js';
import { openComposeAtTool } from './compose-at-tool.js';
import { findSignatureAt, findUseCompletions, findColormapCompletions } from './signatures.js';

// Every raw GLSL string in this codebase (see gl-context.js, screen-
// output.js, fx/shaders.js, node-templates.js) is a template literal that
// starts with `#version` - GLSL ES actually requires #version to be the
// very first line of a shader, so this isn't a guess, it's the same rule
// the shader compiler itself enforces. Match that up front and hand the
// inside off to Prism's own 'glsl' grammar (built on 'c'), instead of
// letting the normal 'template-string' rule flatten it into one string
// token the way a node's other backtick strings render.
Prism.languages.insertBefore('javascript', 'template-string', {
  'glsl-template': {
    pattern: /`\s*#version[\s\S]*?`/,
    greedy: true,
    inside: {
      'template-punctuation': { pattern: /^`|`$/, alias: 'string' },
      rest: Prism.languages.glsl,
    },
  },
});

// Hydra DSL syntax highlighting (see lib/hydra-source.js) - best-effort,
// since a hydra program is plain JS underneath (chained function calls),
// not its own real language Prism has a grammar for. There's no single
// required marker the way GLSL has `#version`, so this anchors on the
// template literal's content STARTING with one of Hydra's own generator
// functions - every real hydra program begins with one of these, and a
// plain JS/GLSL backtick string starting with the exact text "osc(" (or
// noise(/voronoi(/etc) immediately after the opening backtick is
// vanishingly unlikely to mean anything else.
const HYDRA_GENERATORS = ['osc', 'noise', 'voronoi', 'shape', 'gradient', 'solid', 'src', 's0', 's1', 's2', 's3'];
// Every other hydra vocabulary word (transforms/modulators/combiners/
// color functions/outputs) - given its own color (aliased to 'keyword',
// the same token class GLSL/JS keywords already use) so a hydra chain's
// OWN function names stand out from a generic `.token.function` call
// instead of looking identical to it.
const HYDRA_WORDS = [
  ...HYDRA_GENERATORS,
  'rotate', 'scale', 'pixelate', 'repeat', 'repeatX', 'repeatY', 'kaleid',
  'scroll', 'scrollX', 'scrollY', 'posterize', 'shift', 'invert',
  'contrast', 'brightness', 'luma', 'thresh', 'color', 'saturate', 'hue',
  'colorama', 'sum', 'r', 'g', 'b', 'a',
  'add', 'sub', 'mult', 'blend', 'diff', 'layer', 'mask',
  'modulate', 'modulateScale', 'modulateRotate', 'modulatePixelate',
  'modulateRepeat', 'modulateRepeatX', 'modulateRepeatY', 'modulateHue', 'modulateKaleid',
  'out', 'render',
];
Prism.languages.insertBefore('javascript', 'template-string', {
  'hydra-template': {
    pattern: new RegExp(`\`\\s*(?:${HYDRA_GENERATORS.join('|')})\\s*\\([\\s\\S]*?\``),
    greedy: true,
    inside: {
      'template-punctuation': { pattern: /^`|`$/, alias: 'string' },
      // 'hydra-word' has to come FIRST in this object - Prism.languages.extend()
      // would append it after javascript's own already-registered 'function'
      // rule (\w+(?=\()), which claims "osc(" etc first and leaves nothing
      // for a later rule to match. A fresh object (not a mutated shared
      // 'javascript') also keeps this scoped to just inside hydra template
      // strings - it doesn't affect normal JS elsewhere in the file.
      rest: {
        'hydra-word': {
          pattern: new RegExp(`\\b(?:${HYDRA_WORDS.join('|')})\\b(?=\\s*[(.])`),
          alias: 'keyword',
        },
        ...Prism.languages.javascript,
      },
    },
  },
});

// $explode(name)$ - matches the exact same pattern the CodeMirror version
// used. Requires the literal text "explode(" and ")$" around the name, so
// a JS template-literal interpolation like ${uTime} elsewhere in a node's
// code has a different shape and can't be mistaken for it.
const EXPLODE_PATTERN = /\$explode\(([\w.]+)\)\$/;

// $name$ - a shorter shortcut for node templates specifically (glsl,
// canvas, square, node, particle2d, ...), letting you write
// `red_shift: $node$` and get the key you already typed instead of a
// generated placeholder one - see nodeTemplateBody() in explode.js. Built
// from the actual template names rather than matching any `$word$`, so
// it can only ever trigger on a real template keyword - a stray "$5$" in
// a comment, or anything not on this list, just sits there inert, the
// same as an unrecognized $explode(name)$ does. Effect names (rotate,
// scale, ...) are deliberately not included here - those stay under
// $explode(name)$ only, since they return raw shader source, not a node
// shape.
//
// The optional "(123)" is a single integer argument passed through to
// the template's own factory function (see explode.js's
// nodeTemplateBody) - $gradient(5)$ for a 5-stop starter instead of the
// default 2, say. Every template factory is free to ignore it (most do);
// $name$ with no parens at all still works exactly as before, arg simply
// comes through as undefined.
const NODE_PATTERN = new RegExp(`\\$(${NODE_TEMPLATE_NAMES.join('|')})(?:\\((\\d+)\\))?\\$`);

// $load$ - not a static template like the ones above (there's nothing to
// insert until a file is actually picked), so it's handled separately in
// tryExpandLoad() rather than through NODE_PATTERN/nodeTemplateBody():
// opens the browser's native file picker, and once a file is chosen,
// inserts a complete, ready-to-use image, video, or 3D model (.glb/.gltf)
// node (whichever the picked file's type is) wired to that file via
// files.get(...) - see file-registry.js. Cancelling the picker just
// removes the `$load$` text with nothing inserted.
const LOAD_PATTERN = /\$load\$/;

// $downscale$ - like $load$, but for a video that's laggy because its
// source file's resolution/bitrate is more than the browser can decode
// smoothly (common with phone/drone footage - see video-downscale.js).
// Picks a video, re-encodes it client-side to something far smaller, and
// inserts a video node wired to THAT result - not the original file.
// This re-encode runs in real time (it can't decode the source faster
// than the browser already does, which is exactly the problem), so a
// placeholder comment sits at the insertion point until it finishes.
const DOWNSCALE_PATTERN = /\$downscale\$/;

// $draw$ - opens a freehand-drawable canvas overlay directly on top of
// the render pane (see ui/draw-tool.js), for turning a hand-drawn shape
// into a real texture without leaving the editor. Finishing (the
// overlay's own Done button, not this pattern completing) inserts a
// complete image node wired to a data: URL of whatever got drawn - white
// strokes on transparent, same convention as dot()/pixel(). Cancelling
// removes the `$draw$` text with nothing inserted, same as $load$.
const DRAW_PATTERN = /\$draw\$/;

// $compose_at(n)$ - opens a box-placement overlay on top of the render
// pane (see ui/compose-at-tool.js) with `n` draggable/resizable boxes,
// one per screen input the generated node will composite (lib/compose-
// at.js's ComposeAt class does the actual per-tick GPU compositing).
// Finishing (the overlay's own Done button) inserts a complete node with
// `n` input ports (in1..inN, each the usual 'other.screen' placeholder)
// pre-wired to a ComposeAt call using the exact boxes you placed.
// Cancelling removes the `$compose_at(n)$` text with nothing inserted,
// same as $draw$/$load$.
const COMPOSE_AT_PATTERN = /\$compose_at\((\d+)\)\$/;

// $feedback$ - a complete, standalone feedback-loop skeleton: an "in"
// passthrough (wire this to your real source), a Composite ("comp") that
// mixes that source against the loop's own fed-back output, a Delay
// (Composite's `b` input MUST go through Delay/Lag, never straight back
// to comp's own output - see the composite template's comment for why),
// and an "effect" node (the $effect$ template's own base/out shape) in
// between Delay and comp to actually process what's looping. Rewire the
// "effect" node's body to whatever transform you want trailing/
// accumulating - same "just a starting point" convention as every other
// bare $name$ template. Standalone only (generates 4 of its own keys),
// same as $draw$/$compose_at$ - not for `someKey: $feedback$`-style use.
const FEEDBACK_PATTERN = /\$feedback\$/;

// $switch(n)$ - a single node with `n` screen inputs (in1..inN, each the
// usual 'other.screen' placeholder) plus an `index` input, whose code just
// returns whichever inN the current (rounded, clamped) index picks out.
// `index` is wired like any other input - in the plain case just a number
// literal or a var, but it can just as well point at something dynamic
// (e.g. a midi.pads-driven "last pad pressed" value) to flip between the
// n sources live. Purely synchronous text, same as $feedback$ - not for
// `someKey: $switch(n)$`-style use, it generates its own key.
const SWITCH_PATTERN = /\$switch\((\d+)\)\$/;

// $slider$/$button$/$input$ - inline snippets for lib/controls.js's
// globals, each expanding to a call with an auto-numbered placeholder
// name (e.g. "slider2" if one "slider(" call already exists) rather than
// a fixed one, since a project can plausibly have several. Unlike
// $load$/$downscale$ these are plain synchronous text, so they're
// expanded the same way as $explode(...)$/$name$ - see tryExpandControl()
// below.
const CONTROL_SNIPPET_PATTERN = /\$(slider|button|input|color_picker)\$/;

// $beatmatch$ - not a controls.js widget (no persistent value, no
// floating UI), just a plain-text snippet the same mechanical way as the
// CONTROL_SNIPPETS above: auto-numbered so two calls in one node's code()
// don't collide as `const beat` redeclarations. Kept as its own pattern/
// expander rather than folded into CONTROL_SNIPPET_PATTERN since it isn't
// actually a control - see tryExpandBeatmatchSnippet() below.
const BEATMATCH_SNIPPET_PATTERN = /\$beatmatch\$/;

// Must match the font/padding declared for .code-editor-wrap in
// index.html exactly - this is the one place that math is duplicated,
// since main.js needs it (via lineTop()) to anchor each node's floating
// preview card to the right pixel row. charWidth can't be hand-written
// the same way (it depends on which of the font-stack's fonts the
// browser actually resolved), so it's measured live instead - see
// measureCharWidth() below.
export const EDITOR_METRICS = { paddingTop: 12, paddingLeft: 16, lineHeight: 13 * 1.6, charWidth: 0 };

export function lineTop(lineIndex) {
  return EDITOR_METRICS.paddingTop + lineIndex * EDITOR_METRICS.lineHeight;
}

// Renders a probe string in the exact editor font and divides its
// measured width by its length - safe only because the font is
// monospace, which is also what makes per-line backdrop widths (see
// updateLineBackdrops() below) possible without a full text-measuring
// canvas per keystroke.
function measureCharWidth() {
  const probe = document.createElement('span');
  probe.style.font = `13px/${EDITOR_METRICS.lineHeight / 13} 'SF Mono', Menlo, Consolas, monospace`;
  probe.style.whiteSpace = 'pre';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.textContent = 'X'.repeat(40);
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width / 40;
  probe.remove();
  return width;
}
EDITOR_METRICS.charWidth = measureCharWidth();

// createEditor({ parent, doc, onDocChanged }) - a plain <textarea> with a
// Prism-highlighted <pre> sitting behind it, rather than a full editor
// component. The textarea owns real editing (typing, click-to-position,
// selection, undo) using the browser's native text handling, so there is
// no custom hit-testing or position math that can drift out of sync -
// that's what CodeMirror's block preview widgets were doing, and why
// clicks could land on the wrong character after a few of them existed.
// The <pre> is purely decorative (pointer-events: none) and just mirrors
// the textarea's text as syntax-highlighted HTML underneath it.
//
// Both elements are sized to their full content height (see resize())
// and only the outer wrap scrolls - there used to be a version where the
// textarea and pre each scrolled independently and were kept in sync by
// copying scrollTop/scrollLeft on every 'scroll' event. That's what
// caused the cursor to drift from the highlighted text after scrolling:
// two separate scroll positions that were merely *kept equal*, rather
// than one scroll position the two elements structurally share, can
// desync by a pixel or two (differing native scrollbar-reserved widths,
// scroll-anchoring, momentum scrolling). With only one scrollable
// ancestor, that class of bug can't happen at all.
export function createEditor({ parent, doc, onDocChanged, onSend, renderPane }) {
  const wrap = document.createElement('div');
  wrap.className = 'code-editor-wrap';

  // Only shown in Perform mode (see index.html's #app.perform-mode rules) -
  // one small blurred bar per non-blank line, sized to hug just that
  // line's own trimmed text, sitting behind the highlighted text like a
  // subtitle caption. Sits behind `pre` in both DOM order and z-index so
  // the text draws on top of it.
  const backdropLayer = document.createElement('div');
  backdropLayer.className = 'line-backdrop-layer';

  const pre = document.createElement('pre');
  pre.className = 'code-highlight';
  const code = document.createElement('code');
  pre.appendChild(code);

  // Highlights an arbitrary [start,end) char-offset span - not just
  // whole lines like backdropLayer above - over whatever showErrors()
  // (main.js) currently considers wrong: an auto-fixed typo, a validate-
  // before-swap rejection, or an ordinary per-node runtime error. Sits
  // right after `pre` (below the textarea, above the highlighted text)
  // so its tinted boxes read as "around" the flagged source.
  const highlightLayer = document.createElement('div');
  highlightLayer.className = 'highlight-layer';

  const textarea = document.createElement('textarea');
  textarea.className = 'code-input';
  textarea.spellcheck = false;
  textarea.wrap = 'off';
  textarea.autocapitalize = 'off';
  textarea.autocomplete = 'off';
  textarea.value = doc;

  // Where preview-panel.js floats each node's preview card. It shares
  // the wrap's scroll position automatically (it's just another
  // absolutely-positioned child of the same scrolling ancestor), so
  // cards stay lined up with their node while scrolling with no JS sync
  // needed - the same trick that fixed the textarea/pre scroll bug.
  const previewLayer = document.createElement('div');
  previewLayer.className = 'preview-overlay';

  // Signature-help popup - see signatures.js for what it does and does
  // not know about. Same coordinate space as previewLayer (an absolutely
  // positioned child of the shared scroll container), so it scrolls with
  // the text with no extra position-tracking code needed.
  const signatureTip = document.createElement('div');
  signatureTip.className = 'signature-tip';
  signatureTip.hidden = true;

  // use(...) autocomplete popup - mutually exclusive with signatureTip
  // (see updateSignatureTip() below, which decides which one, if either,
  // applies at the caret each time). Same positioning scheme as
  // signatureTip; a plain list of up to 4 matching class names.
  const useAutocomplete = document.createElement('div');
  useAutocomplete.className = 'use-autocomplete';
  useAutocomplete.hidden = true;
  // Set by updateSignatureTip() whenever useAutocomplete is showing -
  // { matches, typed } from findUseCompletions(), read by the Tab-key
  // handler below to fill in the top match without re-deriving it.
  let activeUseCompletion = null;

  wrap.append(backdropLayer, pre, highlightLayer, textarea, previewLayer, signatureTip, useAutocomplete);
  parent.appendChild(wrap);

  function highlight() {
    code.innerHTML = Prism.highlight(textarea.value, Prism.languages.javascript, 'javascript');
  }

  // One bar per non-blank line, reusing existing <div>s across calls
  // instead of recreating them every keystroke. Position/width come
  // straight from the plain text (line index + trimmed character count),
  // not from Prism's HTML - so multi-line GLSL template tokens or any
  // other markup never has to be split or reasoned about here.
  function updateLineBackdrops() {
    const lines = textarea.value.split('\n');
    while (backdropLayer.children.length < lines.length) {
      backdropLayer.appendChild(document.createElement('div'));
    }
    while (backdropLayer.children.length > lines.length) {
      backdropLayer.lastChild.remove();
    }
    lines.forEach((line, i) => {
      const bar = backdropLayer.children[i];
      const trimmed = line.trim();
      if (!trimmed) {
        bar.className = '';
        return;
      }
      bar.className = 'line-bg';
      const indent = line.indexOf(trimmed);
      bar.style.top = `${lineTop(i)}px`;
      bar.style.left = `${EDITOR_METRICS.paddingLeft + indent * EDITOR_METRICS.charWidth - 4}px`;
      bar.style.width = `${trimmed.length * EDITOR_METRICS.charWidth + 8}px`;
    });
  }

  // Positions `el` (either popup - they're never shown at once) just
  // below the caret's own line, left-aligned to its column, using the
  // same line/column -> pixel math as updateLineBackdrops() above.
  function positionPopupAtCaret(el, pos) {
    const before = textarea.value.slice(0, pos);
    const line = (before.match(/\n/g) || []).length;
    const col = pos - (before.lastIndexOf('\n') + 1);
    el.style.top = `${lineTop(line) + EDITOR_METRICS.lineHeight + 2}px`;
    el.style.left = `${EDITOR_METRICS.paddingLeft + col * EDITOR_METRICS.charWidth}px`;
  }

  // Same offset -> line/column math as positionPopupAtCaret above, just
  // for an arbitrary [start,end) range instead of a single caret point.
  function offsetToLineCol(pos) {
    const before = textarea.value.slice(0, pos);
    const line = (before.match(/\n/g) || []).length;
    const col = pos - (before.lastIndexOf('\n') + 1);
    return { line, col };
  }

  function addHighlightBox(kind, line, col, len) {
    const box = document.createElement('div');
    box.className = `highlight-box kind-${kind}`;
    box.style.top = `${lineTop(line)}px`;
    box.style.left = `${EDITOR_METRICS.paddingLeft + col * EDITOR_METRICS.charWidth}px`;
    box.style.width = `${Math.max(1, len) * EDITOR_METRICS.charWidth}px`;
    box.style.height = `${EDITOR_METRICS.lineHeight}px`;
    highlightLayer.appendChild(box);
  }

  function clearHighlights() {
    highlightLayer.innerHTML = '';
  }

  // showHighlights(ranges) - ranges: [{ kind: 'warning'|'error', start, end }].
  // A span crossing multiple lines gets one box per visual line it
  // touches (a single absolutely-positioned div can't bend around a
  // line wrap the way a real text-selection highlight can). Called by
  // main.js's showErrors() every time its own entries actually change -
  // see clearHighlights() below for why nothing here needs its own timer.
  function showHighlights(ranges) {
    clearHighlights();
    const text = textarea.value;
    const lines = text.split('\n');
    for (const { kind, start, end } of ranges) {
      const from = offsetToLineCol(start);
      const to = offsetToLineCol(Math.max(end, start + 1));
      if (from.line === to.line) {
        addHighlightBox(kind, from.line, from.col, to.col - from.col);
      } else {
        addHighlightBox(kind, from.line, from.col, (lines[from.line] || '').length - from.col);
        for (let l = from.line + 1; l < to.line; l++) addHighlightBox(kind, l, 0, (lines[l] || '').length);
        addHighlightBox(kind, to.line, 0, to.col);
      }
    }
  }

  // Shows/hides whichever popup (if either) applies at the caret -
  // findUseCompletions()/findColormapCompletions() (live autocomplete
  // while typing use(...)'s first argument, or COLORMAPS.<name>) take
  // priority over findSignatureAt()'s signature tip, since they're
  // mutually exclusive by construction (see signatures.js: a fully-typed,
  // real class/colormap name stops matching as a completion and starts
  // resolving as a signature instead).
  function updateSignatureTip() {
    if (textarea.selectionStart !== textarea.selectionEnd) {
      signatureTip.hidden = true;
      useAutocomplete.hidden = true;
      activeUseCompletion = null;
      return;
    }
    const pos = textarea.selectionStart;
    const text = textarea.value;

    const completion = findUseCompletions(text, pos) || findColormapCompletions(text, pos);
    if (completion) {
      signatureTip.hidden = true;
      useAutocomplete.innerHTML = '';
      for (const name of completion.matches) {
        const row = document.createElement('div');
        row.className = 'use-autocomplete-item';
        row.textContent = name;
        useAutocomplete.appendChild(row);
      }
      positionPopupAtCaret(useAutocomplete, pos);
      useAutocomplete.hidden = false;
      activeUseCompletion = completion;
      return;
    }
    useAutocomplete.hidden = true;
    activeUseCompletion = null;

    const info = findSignatureAt(text, pos);
    if (!info) {
      signatureTip.hidden = true;
      return;
    }
    signatureTip.textContent = info.text;
    positionPopupAtCaret(signatureTip, pos);
    signatureTip.hidden = false;
  }

  // Grows the textarea (and the layers stacked on it) to exactly fit the
  // content so nothing needs its own internal scrollbar - resetting
  // height to 'auto' first is what lets scrollHeight report the
  // content's real height rather than the previous fixed height.
  function resize() {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    previewLayer.style.height = textarea.style.height;
    backdropLayer.style.height = textarea.style.height;
    highlightLayer.style.height = textarea.style.height;
  }

  // Replaces [from, to) with `replacement` via execCommand('insertText') -
  // that keeps the browser's native undo stack intact (a plain
  // textarea.value assignment would sever it). Falls back to a direct
  // splice only if execCommand is unavailable; that path has to drive the
  // render pipeline itself since no real 'input' event follows it.
  function replaceRange(from, to, replacement) {
    const text = textarea.value;
    textarea.setSelectionRange(from, to);
    const inserted = document.execCommand && document.execCommand('insertText', false, replacement);
    if (!inserted) {
      textarea.value = text.slice(0, from) + replacement + text.slice(to);
      textarea.setSelectionRange(from + replacement.length, from + replacement.length);
      handleChange();
    }
  }

  // A completed $explode(name)$ - either an effect's raw shader source or
  // a node template as a full standalone `newXNode: { ... },` entry.
  function tryExpandExplode() {
    const match = textarea.value.match(EXPLODE_PATTERN);
    if (!match) return;
    let template;
    try {
      template = explode(match[1]);
    } catch (e) {
      return; // leave the $explode(...)$ text in place so it can be corrected
    }
    replaceRange(match.index, match.index + match[0].length, template);
  }

  // A completed $name$ - a node template's bare `{ ... },` body, no
  // generated key, for `someKey: $node$`-style use.
  function tryExpandNodeShortcut() {
    const match = textarea.value.match(NODE_PATTERN);
    if (!match) return;
    const arg = match[2] !== undefined ? Number(match[2]) : undefined;
    const body = nodeTemplateBody(match[1], arg);
    if (body == null) return;
    replaceRange(match.index, match.index + match[0].length, body);
  }

  const CONTROL_SNIPPETS = {
    slider: (n) => `slider('slider${n}', { min: 0, max: 1, default: 0.5 })`,
    button: (n) => `button('button${n}', { default: false })`,
    input: (n) => `input('input${n}', { default: 0 })`,
    color_picker: (n) => `colorPicker('color${n}', { default: '#ffffff' })`,
  };
  // $color_picker$'s trigger text (underscored, to read naturally as a
  // phrase) doesn't match its real call name (colorPicker, camelCase like
  // every other global) - this is what tryExpandControlSnippet below
  // counts existing calls against for auto-numbering.
  const CONTROL_CALL_NAMES = { slider: 'slider', button: 'button', input: 'input', color_picker: 'colorPicker' };

  // A completed $slider$/$button$/$input$/$color_picker$ - see
  // CONTROL_SNIPPET_PATTERN above. The inserted call's name is auto-
  // numbered from how many of that same kind of call already exist in
  // the file, so pasting several doesn't produce colliding names by
  // default (still just a starting point - nothing stops renaming it,
  // same as explode()'s generated keys).
  function tryExpandControlSnippet() {
    const match = textarea.value.match(CONTROL_SNIPPET_PATTERN);
    if (!match) return;
    const type = match[1];
    const callName = CONTROL_CALL_NAMES[type];
    const existing = textarea.value.match(new RegExp(`\\b${callName}\\(`, 'g')) || [];
    const snippet = CONTROL_SNIPPETS[type](existing.length + 1);
    replaceRange(match.index, match.index + match[0].length, snippet);
  }

  // A completed $beatmatch$ - see BEATMATCH_SNIPPET_PATTERN above. Auto-
  // numbered the same way as CONTROL_SNIPPETS (counting existing `const
  // beatN =` declarations), just so two in the same node's code() don't
  // collide as redeclarations of the same variable name.
  function tryExpandBeatmatchSnippet() {
    const match = textarea.value.match(BEATMATCH_SNIPPET_PATTERN);
    if (!match) return;
    const existing = textarea.value.match(/\bconst beat\d*\s*=/g) || [];
    const n = existing.length + 1;
    const snippet = `const beat${n} = beatmatch(120, t, { shape: 'triangle' });`;
    replaceRange(match.index, match.index + match[0].length, snippet);
  }

  // Reused across every $load$ trigger rather than created fresh each
  // time - a detached <input type=file> works fine without ever being
  // attached to the document.
  const loadFileInput = document.createElement('input');
  loadFileInput.type = 'file';
  loadFileInput.accept = 'image/*,video/*,.glb,.gltf';

  // .glb/.gltf don't have a reliably-registered MIME type across
  // browsers/OSes (file.type often comes back '' for them, unlike image/
  // video), so this checks the extension instead of file.type.
  function isModelFile(file) {
    return /\.(glb|gltf)$/i.test(file.name);
  }

  // A valid, reasonably-readable object key derived from the picked
  // file's own name (e.g. "portrait.jpg" -> "portrait") rather than a
  // fixed generated name - explode()'s newXNode-style names are fine for
  // a single use, but $load$ can plausibly be triggered several times in
  // one project, and two nodes both named e.g. "newImageNode" would
  // collide immediately.
  function keyFromFilename(name) {
    const base = name.replace(/\.[^/.]+$/, '');
    const ident = base.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^[^a-zA-Z_$]+/, '');
    return ident || 'loaded';
  }

  // Builds a complete `key: { ... },` node entry for a just-picked file:
  // whichever of the image/video/three_model templates matches its type,
  // with the template's own placeholder swapped for files.get(theRealName).
  // Also strips the image/video templates' "or a local file - type
  // $load$..." comment (redundant now, and its literal text would
  // otherwise immediately re-match LOAD_PATTERN the moment it's inserted,
  // re-triggering the picker over and over on the freshly-inserted copy) -
  // three_model has no such comment to begin with, so nothing to strip.
  function buildLoadedNodeEntry(file) {
    addFile(file);
    if (isModelFile(file)) {
      const body = nodeTemplateBody('three_model').replace(/'your-model\.glb'/, JSON.stringify(file.name));
      return `${keyFromFilename(file.name)}: ${body}`;
    }
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const body = nodeTemplateBody(kind)
      .replace(/\n\s*\/\/ or a local file[\s\S]*?files\.get\('your-file-name\.\w+'\)\);/, '')
      .replace(/'https:\/\/your-[\w-]+-url-here[^']*'/, `files.get(${JSON.stringify(file.name)})`);
    return `${keyFromFilename(file.name)}: ${body}`;
  }

  // A completed $load$ - see LOAD_PATTERN above for what this does and
  // why it can't just be another NODE_PATTERN entry.
  function tryExpandLoad() {
    const match = textarea.value.match(LOAD_PATTERN);
    if (!match) return;
    const insertAt = match.index;
    // Removed immediately (rather than left in place until the picker
    // resolves) so it doesn't sit there looking like live, re-triggerable
    // text while the (async, possibly cancelled) picker is open.
    replaceRange(insertAt, insertAt + match[0].length, '');
    loadFileInput.onchange = () => {
      const file = loadFileInput.files[0];
      loadFileInput.value = ''; // so picking the exact same file again still fires 'change'
      if (!file) return;
      replaceRange(insertAt, insertAt, buildLoadedNodeEntry(file));
    };
    loadFileInput.click();
  }

  // "shape1", "shape2", ... - counts existing `shapeN:` keys already in
  // the file, same idea as CONTROL_SNIPPETS' auto-numbering above, so
  // triggering $draw$ more than once doesn't produce colliding keys.
  function nextShapeName() {
    const existing = textarea.value.match(/\bshape\d*\s*:/g) || [];
    return `shape${existing.length + 1}`;
  }

  // A complete `key: { ... },` node entry wired to a drawn shape - an
  // ImageSource loading a data: URL rather than a real file/network URL,
  // which is all a data: URL needs to work here (ImageSource's own
  // `source` argument already accepts any string an <img> src would).
  function buildDrawnNodeEntry(name, dataUrl) {
    return (
      `${name}: {\n` +
      `  in: {},\n` +
      `  code(inputs, state, t) {\n` +
      `    const use = useInstances(state);\n` +
      `    const img = use(ImageSource, 512, 512);\n` +
      `    img.tick(${JSON.stringify(dataUrl)}, { fit: 'contain' });\n` +
      `    return { screen: img };\n` +
      `  },\n` +
      `},`
    );
  }

  // A completed $draw$ - see DRAW_PATTERN above. Same "remove the
  // trigger text immediately, insert the real result once the async part
  // resolves" shape as $load$ above, just with a drawing overlay instead
  // of a file picker.
  function tryExpandDraw() {
    const match = textarea.value.match(DRAW_PATTERN);
    if (!match) return;
    const insertAt = match.index;
    replaceRange(insertAt, insertAt + match[0].length, '');
    openDrawTool({
      renderPane,
      onDone(dataUrl) {
        replaceRange(insertAt, insertAt, buildDrawnNodeEntry(nextShapeName(), dataUrl));
      },
    });
  }

  // "composeAt1", "composeAt2", ... - same auto-numbering idea as
  // nextShapeName() above, so triggering $compose_at(n)$ more than once
  // doesn't produce colliding keys.
  function nextComposeAtName() {
    const existing = textarea.value.match(/\bcomposeAt\d*\s*:/g) || [];
    return `composeAt${existing.length + 1}`;
  }

  // A complete `key: { ... },` node entry wired to a ComposeAt call -
  // one input port per rect (in1..inN, 'other.screen' placeholder like
  // every other template's inputs), each wired into its own box exactly
  // where it was placed. See lib/compose-at.js for what x/y/w/h mean.
  function buildComposeAtNodeEntry(name, rects) {
    const ins = rects.map((_, i) => `      in${i + 1}: 'other.screen',`).join('\n');
    const rectLines = rects
      .map(
        (r, i) =>
          `        { value: inputs.in${i + 1}, x: ${r.x.toFixed(3)}, y: ${r.y.toFixed(3)}, w: ${r.w.toFixed(3)}, h: ${r.h.toFixed(3)} },`
      )
      .join('\n');
    return (
      `${name}: {\n` +
      `  in: {\n${ins}\n  },\n` +
      `  code(inputs, state, t) {\n` +
      `    const use = useInstances(state);\n` +
      `    const composeAt = use(ComposeAt);\n` +
      `    const out = composeAt.tick([\n${rectLines}\n    ]);\n` +
      `    return { screen: out };\n` +
      `  },\n` +
      `},`
    );
  }

  // A completed $compose_at(n)$ - see COMPOSE_AT_PATTERN above. Same
  // "remove the trigger text immediately, insert the real result once
  // the overlay's Done button resolves" shape as $draw$, just with a
  // box-placement overlay (n boxes) instead of freehand drawing.
  function tryExpandComposeAt() {
    const match = textarea.value.match(COMPOSE_AT_PATTERN);
    if (!match) return;
    const count = parseInt(match[1], 10);
    if (!(count > 0)) return;
    const insertAt = match.index;
    replaceRange(insertAt, insertAt + match[0].length, '');
    openComposeAtTool({
      renderPane,
      count,
      onDone(rects) {
        replaceRange(insertAt, insertAt, buildComposeAtNodeEntry(nextComposeAtName(), rects));
      },
    });
  }

  // "fb1", "fb2", ... - same auto-numbering idea as nextShapeName()/
  // nextComposeAtName() above, so triggering $feedback$ more than once
  // doesn't produce colliding keys across its 4 nodes (fb1In, fb1Comp,
  // fb1Delay, fb1Effect, ...).
  function nextFeedbackName() {
    const existing = textarea.value.match(/\bfb\d*In\s*:/g) || [];
    return `fb${existing.length + 1}`;
  }

  // A complete feedback-loop skeleton - see FEEDBACK_PATTERN above for
  // the shape (in -> comp -> delay -> effect -> back into comp).
  function buildFeedbackNodeEntry(n) {
    return [
      `${n}In: {`,
      `  in: { src: 'other.screen' },`,
      `  code(inputs, state, t) {`,
      `    return { screen: inputs.src };`,
      `  },`,
      `},`,
      ``,
      `// modes: over, atop, xor, multiply, screen, darken, lighten, add,`,
      `// difference, hardLight, softLight, lightest, darkest`,
      `${n}Comp: {`,
      `  in: { a: '${n}In.screen', b: '${n}Effect.screen' },`,
      `  code(inputs, state, t) {`,
      `    const use = useInstances(state);`,
      `    const out = use(Composite).tick(inputs.a, inputs.b, 'over', 1);`,
      `    return { screen: out };`,
      `  },`,
      `},`,
      ``,
      `${n}Delay: {`,
      `  in: { src: '${n}Comp.screen' },`,
      `  code(inputs, state, t) {`,
      `    const use = useInstances(state);`,
      `    const ticks = 1; // <- change this; passed to tick()'s second`,
      `    // argument (not the constructor) so editing it takes effect live`,
      `    const out = use(Delay, undefined, 'nearest').tick(inputs.src, ticks);`,
      `    return { screen: out };`,
      `  },`,
      `},`,
      ``,
      `${n}Effect: {`,
      `  in: { src: '${n}Delay.screen' },`,
      `  code(inputs, state, t) {`,
      `    const use = useInstances(state);`,
      `    const base = inputs.src;`,
      `    let out = base; // <- put whatever should trail/accumulate here`,
      `    return { screen: out };`,
      `  },`,
      `},`,
    ].join('\n');
  }

  // A completed $feedback$ - see FEEDBACK_PATTERN above. Same "remove the
  // trigger text, insert the real result" shape as $draw$/$compose_at$,
  // just synchronous (no overlay/picker to wait on).
  function tryExpandFeedback() {
    const match = textarea.value.match(FEEDBACK_PATTERN);
    if (!match) return;
    const insertAt = match.index;
    replaceRange(insertAt, insertAt + match[0].length, buildFeedbackNodeEntry(nextFeedbackName()));
  }

  // "switch1", "switch2", ... - same auto-numbering idea as
  // nextFeedbackName() above, so triggering $switch(n)$ more than once
  // doesn't produce colliding keys.
  function nextSwitchName() {
    const existing = textarea.value.match(/\bswitch\d*\s*:/g) || [];
    return `switch${existing.length + 1}`;
  }

  // A complete `key: { ... },` node entry wired to pick one of `count`
  // screen inputs by `index` - see SWITCH_PATTERN above. `index` is just
  // another input port, so it can be wired to a literal, a var, or
  // anything dynamic the same way in1..inN are.
  function buildSwitchNodeEntry(name, count) {
    const ins = [`      index: 0,`, ...Array.from({ length: count }, (_, i) => `      in${i + 1}: 'other.screen',`)].join(
      '\n'
    );
    const opts = Array.from({ length: count }, (_, i) => `inputs.in${i + 1}`).join(', ');
    return (
      `${name}: {\n` +
      `  in: {\n${ins}\n  },\n` +
      `  code(inputs) {\n` +
      `    const opts = [${opts}];\n` +
      `    const i = Math.max(0, Math.min(opts.length - 1, Math.round(inputs.index)));\n` +
      `    return { screen: opts[i] };\n` +
      `  },\n` +
      `},`
    );
  }

  // A completed $switch(n)$ - see SWITCH_PATTERN above. Same "remove the
  // trigger text, insert the real result" shape as $feedback$ - purely
  // synchronous, no overlay/picker involved.
  function tryExpandSwitch() {
    const match = textarea.value.match(SWITCH_PATTERN);
    if (!match) return;
    const count = parseInt(match[1], 10);
    if (!(count > 0)) return;
    const insertAt = match.index;
    replaceRange(insertAt, insertAt + match[0].length, buildSwitchNodeEntry(nextSwitchName(), count));
  }

  // Separate from loadFileInput above - only video makes sense here,
  // and keeping them apart means picking a file for one never has to
  // reason about the other's onchange handler.
  const downscaleFileInput = document.createElement('input');
  downscaleFileInput.type = 'file';
  downscaleFileInput.accept = 'video/*';

  // Finds `oldText`'s CURRENT position in the textarea (not wherever it
  // was when this was scheduled - real time may have passed, and the
  // user may well have kept typing elsewhere in the meantime) and
  // replaces just that occurrence. Used to swap a $downscale$ placeholder
  // comment for the real result once the re-encode finishes; a no-op if
  // the placeholder isn't there anymore (e.g. the user deleted it).
  function replaceLiteralText(oldText, newText) {
    const at = textarea.value.indexOf(oldText);
    if (at === -1) return;
    replaceRange(at, at + oldText.length, newText);
  }

  // A completed $downscale$ - see DOWNSCALE_PATTERN above. Unlike
  // $load$, this can take a real, possibly long while (it's re-encoding
  // in real time), so a placeholder comment holds the spot until it's
  // done rather than leaving a gap.
  function tryExpandDownscale() {
    const match = textarea.value.match(DOWNSCALE_PATTERN);
    if (!match) return;
    const insertAt = match.index;
    replaceRange(insertAt, insertAt + match[0].length, '');
    downscaleFileInput.onchange = () => {
      const file = downscaleFileInput.files[0];
      downscaleFileInput.value = '';
      if (!file) return;
      const placeholder = `// downscaling ${file.name}... this re-encodes in real time (as long as the source itself plays for), so it can take a while - the node below appears once it's done`;
      replaceRange(insertAt, insertAt, placeholder);
      downscaleVideo(file)
        .then((smaller) => {
          replaceLiteralText(placeholder, buildLoadedNodeEntry(smaller));
        })
        .catch((e) => {
          replaceLiteralText(placeholder, `// downscaling ${file.name} failed: ${e.message}`);
        });
    };
    downscaleFileInput.click();
  }

  function handleChange() {
    highlight();
    resize();
    updateLineBackdrops();
    updateSignatureTip();
    // Any local edit makes every existing highlight's offsets stale
    // (even one typed character shifts everything after it) - clear
    // immediately rather than leaving a highlight box pointing at the
    // wrong text. showErrors() (main.js) re-establishes it, correctly
    // repositioned, only once something actually changes again (the
    // next send/reload) - see showHighlights()'s own comment.
    clearHighlights();
    onDocChanged(textarea.value);
    // tryExpandLoad opens a file picker, which the browser only allows
    // in direct response to a real user gesture ("transient activation")
    // - deferring it to a microtask (like the other two below) turned
    // out to already be too late for that; Chromium silently drops the
    // .click() rather than opening anything. Calling it synchronously
    // here, still inside the same task as the real keystroke that
    // triggered this 'input' event, keeps it inside that window. Its own
    // replaceRange() below re-enters handleChange synchronously too (via
    // the 'input' event execCommand fires) - harmless, since by then the
    // $load$ text is already gone and it's a no-op the second time.
    tryExpandLoad();
    tryExpandDownscale(); // same file-picker/activation reasoning as above
    // Deferred to a microtask so a synchronous expansion here (which
    // itself triggers another 'input' event via execCommand) doesn't
    // re-enter handleChange from inside this same call.
    queueMicrotask(() => {
      tryExpandExplode();
      tryExpandNodeShortcut();
      tryExpandControlSnippet();
      tryExpandBeatmatchSnippet();
      tryExpandDraw(); // no file-picker/fullscreen gesture requirement, unlike Load/Downscale above
      tryExpandComposeAt(); // same reasoning as $draw$ above
      tryExpandFeedback(); // purely synchronous, no overlay/picker involved at all
      tryExpandSwitch(); // same reasoning as $feedback$ above
    });
  }

  function send() {
    onSend(textarea.value);
  }

  // Swaps the ENTIRE document for `fixedSource` - used by main.js's send()
  // right after the prepatch auto-fixer (ui/node-parser.js's
  // scanAndFixNodeSource) rewrites the text, so what's actually sent (and
  // left in the editor afterward) is the corrected version, not what was
  // originally typed.
  //
  // Deliberately NOT routed through replaceRange()'s execCommand path,
  // unlike every other text-changing shortcut in this file - a full-
  // document replaceRange(0, textarea.value.length, ...) called from
  // inside the Send button's own click handler was observed to silently
  // no-op (execCommand('insertText') returning truthy without actually
  // changing the textarea's value at all), even though the exact same
  // call works fine from an ordinary script/microtask context. Direct
  // assignment sidesteps that unreliable legacy API entirely - a full-
  // document swap doesn't need execCommand's fine-grained undo-stack
  // preservation as delicately as a small in-place edit does anyway;
  // the auto-fix is already its own distinct, undoable action via the
  // browser's native undo on this value change.
  function replaceSource(fixedSource) {
    textarea.value = fixedSource;
    textarea.setSelectionRange(fixedSource.length, fixedSource.length);
    handleChange();
  }

  textarea.addEventListener('input', handleChange);
  // Text-changing keys already refresh the tip via handleChange() above -
  // this covers caret movement that ISN'T a text change (arrow keys,
  // clicking to a new position, Home/End/PageUp/Down).
  textarea.addEventListener('keyup', updateSignatureTip);
  textarea.addEventListener('click', updateSignatureTip);
  textarea.addEventListener('blur', () => { signatureTip.hidden = true; });
  textarea.addEventListener('keydown', (e) => {
    // Ctrl+Enter / Cmd+Enter sends the patch - same convention as Strudel
    // and Hydra's own editors. Checked ahead of the plain Enter handler
    // below (which does auto-indent) since this isn't about inserting a
    // newline at all.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
      return;
    }

    // Ctrl+/ / Cmd+/ toggles `//` on every non-blank line the selection
    // touches (whole current line if the selection is just a caret) - on
    // if any of those lines aren't commented yet, off only if every one
    // of them already is, same convention as most code editors.
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = textarea;
      const text = textarea.value;
      const blockStart = text.lastIndexOf('\n', s - 1) + 1;
      const nextBreak = text.indexOf('\n', Math.max(en - 1, blockStart));
      const blockEnd = nextBreak === -1 ? text.length : nextBreak;
      const block = text.slice(blockStart, blockEnd);
      const lines = block.split('\n');
      const nonBlank = lines.filter((line) => line.trim() !== '');
      const allCommented = nonBlank.length > 0 && nonBlank.every((line) => line.trim().startsWith('//'));
      const toggled = lines
        .map((line) => {
          if (line.trim() === '') return line;
          if (allCommented) return line.replace(/^(\s*)\/\/ ?/, '$1');
          const indent = line.match(/^\s*/)[0];
          return `${indent}// ${line.slice(indent.length)}`;
        })
        .join('\n');
      replaceRange(blockStart, blockEnd, toggled);
      textarea.setSelectionRange(blockStart, blockStart + toggled.length);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      // If the use(...) class-name popup is up, Tab fills in its top
      // match instead of indenting - the typed prefix always ends
      // exactly at the caret (see findUseCompletions), so the replace
      // range is just the last `typed.length` characters before it.
      if (!useAutocomplete.hidden && activeUseCompletion && activeUseCompletion.matches.length > 0) {
        const pos = textarea.selectionStart;
        const from = pos - activeUseCompletion.typed.length;
        replaceRange(from, pos, activeUseCompletion.matches[0]);
        useAutocomplete.hidden = true;
        activeUseCompletion = null;
        return;
      }
      const inserted = document.execCommand && document.execCommand('insertText', false, '  ');
      if (!inserted) {
        const { selectionStart: s, selectionEnd: en } = textarea;
        textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(en);
        textarea.setSelectionRange(s + 2, s + 2);
        handleChange();
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = textarea;
      const text = textarea.value;
      const lineStart = text.lastIndexOf('\n', s - 1) + 1;
      const currentLine = text.slice(lineStart, s);
      const indent = (currentLine.match(/^[ \t]*/) || [''])[0];
      // one level deeper right after an opener; and if the very next
      // character is its matching closer (typing Enter inside `{}`),
      // also drop that closer onto its own line at the original indent
      // so it doesn't end up nested one level too deep.
      const opensBlock = '{[('.includes(text[s - 1] || '');
      const closesBlock = '}])'.includes(text[en] || '');
      const firstPart = `\n${indent}${opensBlock ? '  ' : ''}`;
      const insert = opensBlock && closesBlock ? `${firstPart}\n${indent}` : firstPart;

      const inserted = document.execCommand && document.execCommand('insertText', false, insert);
      if (!inserted) {
        textarea.value = text.slice(0, s) + insert + text.slice(en);
        textarea.setSelectionRange(s + insert.length, s + insert.length);
        handleChange();
      }
      if (opensBlock && closesBlock) {
        const caretPos = s + firstPart.length;
        textarea.setSelectionRange(caretPos, caretPos);
      }
    }
  });

  highlight();
  resize();
  updateLineBackdrops();

  return {
    dom: wrap,
    previewLayer,
    getValue: () => textarea.value,
    send,
    replaceSource,
    showHighlights,
    textarea, // so main.js can tell when focus is "actively typing code" (see keyPulse's own doc comment)
  };
}

import defaultSource from './default-project.js?raw';
import { createGLContext } from './gl/gl-context.js';
import { setViewportSize } from './core/lib/context.js';
import { DataBus } from './core/bus.js';
import { Clock } from './core/clock.js';
import { Graph } from './core/graph.js';
import { disposeState } from './core/lib/dispose-state.js';
import { disposeParticlesForNode } from './core/lib/instance.js';
import { disposeAsciiForNode } from './core/lib/ascii.js';
import { loadProject } from './core/project-loader.js';
import { readTextureToImageData } from './core/lib/texture-preview.js';
import { getPreviewRequests } from './core/lib/preview-sink.js';
import { Pattern } from './core/lib/pattern.js';
import { getControlRequests } from './core/lib/controls.js';
import { setMousePosition, setKeyState } from './core/lib/input-state.js';
import { markNewPatch, clearNewPatch } from './core/lib/patch-flag.js';
import { createEditor, lineTop } from './ui/editor.js';
import { PreviewPanel } from './ui/preview-panel.js';
import { ControlPanel } from './ui/control-panel.js';
import { NodeToolbar } from './ui/node-toolbar.js';
import { createConnectionMap } from './ui/connection-map.js';
import { renderJsonTree } from './ui/json-tree.js';
import { getPatchFromUrl, getBlockPatchFromUrl, setPatchInUrl, setPatchAndBlocksInUrl } from './ui/patch-link.js';
import { parseNodeBlocks, offsetToLine, findFoldSpan } from './ui/node-parser.js';
import { DEFAULT_BLOCK_PATCH } from './ui-mobile/default-patch.js';

const appEl = document.getElementById('app');
const editorMount = document.getElementById('editor-mount');
const errorsEl = document.getElementById('errors');
const renderPane = document.getElementById('render-pane');
const modeToggle = document.getElementById('mode-toggle');
const tpsEl = document.getElementById('tps-counter');
const tEl = document.getElementById('t-counter');
const sendBtn = document.getElementById('send-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const resetPatchBtn = document.getElementById('reset-patch-btn');
const blockModeToggle = document.getElementById('block-mode-toggle');
const mobilePane = document.getElementById('mobile-pane');

// Perform mode by default - set before resizeCanvas() below runs, so the
// very first size computation already reflects the fullscreen layout
// rather than briefly sizing for side-by-side and immediately redoing it.
appEl.classList.add('perform-mode');
modeToggle.textContent = 'Side by side';

const glCanvas = document.createElement('canvas');
glCanvas.width = 512;
glCanvas.height = 512;
renderPane.appendChild(glCanvas);
const gl = createGLContext(glCanvas);

// The canvas - both its buffer resolution AND its on-screen display size -
// is a square matching the LARGER of the render pane's current width/
// height, filling the pane edge to edge (cropped to a centered square by
// #render-pane's overflow: hidden on whichever axis is shorter). Content
// reaching the true screen boundary (via the Scale effect or similar) is
// the whole point - shrinking the canvas itself to leave margin would
// mean even a heavily scaled-up shape stops short at that artificial
// inner boundary instead of the real one. Keeping things "reasonably
// sized" by default is a content concern (how big a shape is drawn
// relative to its own source texture, e.g. the *Node templates' use of
// screenSize()), not something to fake by shrinking the canvas.
// Backing-store resolution also scales by devicePixelRatio (capped at 2 -
// a 3x/4x phone-class ratio would quadruple+ every texture's memory for
// a sharpness gain past what's visible anyway) - CSS size stays in real
// (unscaled) px via style.width/height, only the buffer itself grows, the
// same "real resolution, not stretched" reasoning as GLSL/Canvas2D's own
// screenSize()-based defaults above. Without this, a high-DPI/"big
// monitor" display was stretching a 1x-resolution buffer across more
// physical pixels than it had - every node's output plus this canvas
// itself, both fixed by the two changes together.
const MAX_DPR = 2;
function resizeCanvas() {
  const rect = renderPane.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const size = Math.max(1, Math.round(Math.max(rect.width, rect.height) * dpr));
  if (glCanvas.width !== size || glCanvas.height !== size) {
    glCanvas.width = size;
    glCanvas.height = size;
  }
  glCanvas.style.width = `${Math.max(1, Math.round(Math.max(rect.width, rect.height)))}px`;
  glCanvas.style.height = glCanvas.style.width;
  setViewportSize(rect.width, rect.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const bus = new DataBus();
const graph = new Graph(bus);
const clock = new Clock();

// A file-level load failure (e.g. a syntax error) and per-node runtime
// errors are tracked separately and shown together - showErrors() runs
// every tick, so if it only knew about per-node errors it would blank out
// a load error within one frame of reload() setting it (nothing about a
// bad parse ever touches node.error). loadError persists across ticks
// until a later reload() either succeeds (cleared) or fails again
// (replaced) - the graph itself keeps ticking on its last successfully
// loaded node set the whole time; this only fixes the notification being
// invisible, not the (already-working) fallback itself.
let loadError = null;

// nodeId -> { start, end } character offsets of its own block, from the
// same parse updatePreviewPositions() below already does - lets a
// per-node error's own id jump the editor straight to it (see
// jumpToNode()) instead of making you scroll/search a big file to find
// which node an id belongs to, and lets showErrors() highlight that
// node's whole span for any error/warning attributed to it.
let nodeSpans = new Map();

function jumpToNode(nodeId) {
  const span = nodeSpans.get(nodeId);
  if (!span) return;
  view.textarea.focus();
  view.textarea.setSelectionRange(span.start, span.start);
}

// showErrors() runs every tick, but only actually touches the DOM when
// the error set has genuinely changed - rebuilding unconditionally (as a
// naive version of this would) tears down and recreates each .error-line
// element ~every frame, which can make a real click race against its own
// target getting replaced mid-click (the same class of bug the preview
// panel's json-tree cards hit earlier - see ui/json-tree.js's own note).
let lastErrorsKey = null;

// rejectedErrors: set in reload() whenever applyAndValidate() rejects a
// send - the SAME {id, message} pairs the aggregate loadError summary
// below is built from, kept separately (with each one's real node id
// intact) specifically so showErrors() can attribute and highlight each
// one individually, the same way an ordinary node.error already does.
// Cleared the moment a send actually succeeds.
let rejectedErrors = [];

// Every entry showErrors() displays - an ordinary per-node runtime
// error, or one of rejectedErrors above - gets its node's whole block
// highlighted in the editor too (via nodeSpans), not just listed in the
// panel. Only evaluated in response to an actual patch send/eval (see
// reload() below and Graph.tick()'s own per-node try/catch) - never a
// live, as-you-type scan. A file-level loadError (id null - e.g. a raw
// SyntaxError with no reliable node attribution) has nothing to
// highlight and is simply left out of the overlay.
function highlightRangeFor(entry) {
  const span = entry.id && nodeSpans.get(entry.id);
  return span ? { start: span.start, end: span.end } : null;
}

function showErrors() {
  const entries = [];
  if (loadError) entries.push({ id: null, text: loadError });
  for (const e of rejectedErrors) entries.push({ id: e.id, text: `reverted - ${e.message}` });
  for (const node of graph.nodes.values()) {
    if (node.error) entries.push({ id: node.id, text: node.error });
  }

  // Highlight positions are recomputed and redrawn EVERY call, dedup
  // guard or not - nodeSpans (a node's own line/column) keeps shifting
  // as the user types even when the error SET itself hasn't changed, so
  // skipping this alongside the (more expensive) panel rebuild below
  // would leave a highlight box drawn over wherever the flagged node
  // USED to be instead of tracking it live.
  view.showHighlights(entries.map(highlightRangeFor).filter(Boolean));

  const key = JSON.stringify(entries);
  if (key === lastErrorsKey) return;
  lastErrorsKey = key;

  errorsEl.classList.toggle('has-errors', entries.length > 0);
  errorsEl.textContent = '';
  for (const entry of entries) {
    const line = document.createElement('div');
    if (entry.id == null) {
      line.textContent = entry.text;
    } else {
      line.className = 'error-line';
      line.title = 'Click to jump to this node';
      const id = document.createElement('span');
      id.className = 'error-node-id';
      id.textContent = entry.id;
      line.append(id, document.createTextNode(`: ${entry.text}`));
      line.addEventListener('click', () => jumpToNode(entry.id));
    }
    errorsEl.appendChild(line);
  }
}

// Recomputes where each node's preview card should float, from the
// current source text - see ui/node-parser.js. Only needs to run when
// the text actually changes (i.e. alongside reload()), not every tick:
// which node calls preview() can change tick to tick, but where a given
// node *lives in the file* only changes on edit.
function updatePreviewPositions(source) {
  const positions = new Map();
  nodeSpans = new Map();
  for (const block of parseNodeBlocks(source)) {
    positions.set(block.id, lineTop(offsetToLine(source, block.start)));
    nodeSpans.set(block.id, { start: block.start, end: block.end });
  }
  previewPanel.setPositions(positions);
  nodeToolbar.setPositions(positions); // same per-node positions - see ui/node-toolbar.js
  updateFolds();
}

// Rebuilds the fold overlay (see ui/editor.js's showFolds()) from
// whichever nodes are currently collapsed (ui/node-toolbar.js's own
// collapsed Set) - called whenever nodeSpans might have shifted
// (updatePreviewPositions, i.e. every keystroke) and right after the
// collapse button itself is clicked (NodeToolbar's onToggleCollapse).
// findFoldSpan only covers the code() METHOD itself (see node-parser.js) -
// the node's key and its real `in: {...}` stay as ordinary, untouched,
// visible text, so what's collapsed reads like `delay: { in: {...},
// [folded] },` rather than hiding the very thing you'd want to see at a
// glance. The fold's own label shows output keys (node.lastOutputs -
// already known live, no text-parsing needed) since that's the one thing
// NOT otherwise visible once code() is folded away.
function updateFolds() {
  const source = view.getValue();
  const ranges = [];
  for (const id of nodeToolbar.collapsed) {
    const span = nodeSpans.get(id);
    if (!span) continue;
    const foldSpan = findFoldSpan(source, span);
    if (!foldSpan) continue;
    const node = graph.nodes.get(id);
    const outKeys = node ? Object.keys(node.lastOutputs) : [];
    const label = `code(…) { … }  →  out: ${outKeys.join(', ') || '?'}`;
    ranges.push({
      start: foldSpan.start,
      end: foldSpan.end,
      label,
      onClick: () => {
        nodeToolbar.uncollapse(id);
        updateFolds();
      },
    });
  }
  view.showFolds(ranges);
}

// Returns whether the load succeeded, so callers (flashSendResult below)
// can give feedback - on failure the graph is left exactly as it was:
// either loadProject() itself threw (a syntax/import error - applyAndValidate
// is never reached at all), or applyAndValidate() ran a real trial tick
// of the new patch and found something newly broken, in which case it
// already rolled the graph back to exactly its pre-call state on its own
// - either way, the last good patch just keeps running/rendering.
async function reload(source) {
  try {
    const projectNodes = await loadProject(gl, source);
    const result = graph.applyAndValidate(projectNodes, performance.now() / 1000, clock.frame);
    if (!result.ok) {
      // The per-node detail shows up as its own highlighted entry below
      // (rejectedErrors) - this is just the general "what happened" notice.
      loadError = 'patch reverted to previous working version';
      rejectedErrors = result.errors;
      return false;
    }
    updatePreviewPositions(source);
    loadError = null;
    rejectedErrors = [];
    markNewPatch(); // newPatch reads true for the one tick right after this - see lib/patch-flag.js
    return true;
  } catch (e) {
    loadError = `project failed to load: ${e.message}`;
    rejectedErrors = [];
    console.error('project load failed', e);
    return false;
  }
}

// Patch-send model (same convention as Strudel/Hydra's own editors):
// editing the text never runs anything by itself - only Ctrl+Enter (or
// clicking sendBtn) actually sends the current text to reload(). A
// failed send leaves whatever was last successfully sent running
// untouched; it does not clear the screen or blank out the graph.
let flashTimer = null;
function flashSendResult(ok) {
  clearTimeout(flashTimer);
  sendBtn.classList.remove('flash-ok', 'flash-error');
  // Force a reflow so re-adding the same class after clearing it still
  // restarts the CSS transition, in case sends happen faster than the
  // previous flash finished fading.
  void sendBtn.offsetWidth;
  sendBtn.classList.add(ok ? 'flash-ok' : 'flash-error');
  flashTimer = setTimeout(() => sendBtn.classList.remove('flash-ok', 'flash-error'), 600);
}

async function send(text) {
  const ok = await reload(text);
  if (ok) setPatchInUrl(text); // keep the URL's own shareable copy in sync with whatever's actually running
  flashSendResult(ok);
}

// Same as send() above, but for block-mode edits (see ui-mobile/) - the
// text here is core/patch-compiler.js's generated JS, not anything the
// user typed. Persists the JSON patch alongside it (setPatchAndBlocksInUrl,
// not plain setPatchInUrl) so reloading the URL - or opening it on another
// device - can rehydrate the real editable block graph, not just replay
// the generated code as inert text.
async function sendCompiledPatch(source, patchJSON) {
  const ok = await reload(source);
  if (ok) setPatchAndBlocksInUrl(source, patchJSON);
  flashSendResult(ok);
}

// A URL that already has a shared patch in it (see ui/patch-link.js)
// loads THAT instead of the bundled default project - falls back to
// defaultSource if there's no patch in the URL, or it fails to decode.
const initialSource = getPatchFromUrl() ?? defaultSource;
// The mobile block-patch mode's own JSON source of truth, if the URL had
// one - read once at startup and handed to mountMobileUI whenever block
// mode is first actually opened (see blockModeToggle below), same lazy
// pattern as everything else about that mode's cost. sharedBlockPatch
// (not initialBlockPatch) is what decides whether to auto-open block
// mode below - it stays null unless the URL ACTUALLY had one, so a
// plain fresh visit falls back to DEFAULT_BLOCK_PATCH for the CONTENT
// block mode opens to (whenever the user actually chooses it) without
// forcing everyone into block mode just because a bundled default exists.
const sharedBlockPatch = getBlockPatchFromUrl();
const initialBlockPatch = sharedBlockPatch ?? DEFAULT_BLOCK_PATCH;

const view = createEditor({
  parent: editorMount,
  doc: initialSource,
  renderPane,
  onDocChanged(text) {
    // Live and cosmetic only - where each node's preview card (or a
    // control widget) floats follows the text as you type, independent
    // of whether it's been sent yet. Nothing here touches the running
    // graph.
    updatePreviewPositions(text);
  },
  onSend: send,
});

sendBtn.addEventListener('click', () => view.send());

// mouse()/keyPulse() globals (see lib/input-state.js) - mouse position
// is normalized against the render pane's own box (so it always means
// "0..1 across whatever's actually visible", matching Perform mode's
// fullscreen pane just as much as side-by-side's smaller one). Key
// tracking is skipped entirely while focus is in the code editor - the
// whole point of a "pulse" is a deliberate physical key press aimed at
// the running visuals, not every letter typed while writing a node.
window.addEventListener('mousemove', (e) => {
  const rect = renderPane.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  setMousePosition((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
});
window.addEventListener('keydown', (e) => {
  if (document.activeElement === view.textarea) return;
  setKeyState(e.key, true);
});
window.addEventListener('keyup', (e) => {
  setKeyState(e.key, false);
});

const previewPanel = new PreviewPanel(view.previewLayer);
const controlPanel = new ControlPanel(view.previewLayer, previewPanel);
const nodeToolbar = new NodeToolbar(view.previewLayer, graph, { onToggleCollapse: updateFolds });
const connectionMap = createConnectionMap({ parent: view.previewLayer });

modeToggle.addEventListener('click', () => {
  const isPerform = appEl.classList.toggle('perform-mode');
  modeToggle.textContent = isPerform ? 'Side by side' : 'Perform mode';
  resizeCanvas(); // the render pane's box just changed shape (viewport vs its old flex column)
  // Unlike a patch send (which deliberately preserves state - see
  // graph.js), switching layout mode is a rare, deliberate action, not
  // routine editing - a full reset here doesn't have the "blows away my
  // running feedback loop every time I tweak a line" problem a global
  // reset-on-every-send would. Every node starts completely fresh
  // (every `if (!state.x)`/use() call fires again) on the very next tick.
  for (const node of graph.nodes.values()) {
    // Free the OLD state's resources before replacing it - same reason
    // graph.js's syncFromProject() does this on node removal (see
    // dispose-state.js): a plain `node.state = {}` would otherwise leave
    // the previous state's textures/videos/streams as JS garbage.
    disposeState(node.state);
    disposeParticlesForNode(node.id);
    disposeAsciiForNode(node.id);
    node.state = {};
  }
});

// Block mode (ui-mobile/) - a touch node-graph editor as an ALTERNATE
// authoring surface, not a replacement (the code editor is untouched
// either way) - orthogonal to Perform mode above, so this only ever
// toggles its own class (see index.html's shared #editor-pane/
// #mobile-pane structural rules) and never touches appEl's
// 'perform-mode' class. mountMobileUI itself (and patch-compiler.js) are
// dynamically imported on first activation - desktop users who never
// open block mode don't pay for either.
let mobileUI = null;
async function activateBlockMode() {
  appEl.classList.add('block-mode');
  blockModeToggle.textContent = 'Code mode';
  resizeCanvas(); // the render pane's box just changed shape, same reasoning as modeToggle's own handler below
  if (mobileUI) return;

  const [{ mountMobileUI }, { compilePatchToSource, validatePatch }] = await Promise.all([
    import('./ui-mobile/mobile-app.js'),
    import('./core/patch-compiler.js'),
  ]);
  function compileAndSendPatch(patch) {
    const errors = validatePatch(patch);
    if (errors.length) {
      console.warn('block patch has errors, not compiling:', errors);
      return;
    }
    sendCompiledPatch(compilePatchToSource(patch), patch);
  }
  mobileUI = mountMobileUI(mobilePane, { initialPatch: initialBlockPatch, onChange: compileAndSendPatch });
  // PatchStore only calls onChange on a MUTATION, not on construction -
  // without this, the initial patch (whether from the URL or the
  // bundled default-patch.js) sits there fully visible and editable in
  // the touch canvas but never actually rendered until you make some
  // edit, unlike the code editor's own initialSource (see reload(
  // initialSource) near the bottom of this file), which runs immediately.
  compileAndSendPatch(initialBlockPatch);
}

blockModeToggle.addEventListener('click', () => {
  if (appEl.classList.contains('block-mode')) {
    appEl.classList.remove('block-mode');
    blockModeToggle.textContent = 'Block mode';
    resizeCanvas();
  } else {
    activateBlockMode();
  }
});

// A shared link that was saved FROM block mode (see ui/patch-link.js's
// `&blocks=` segment) should land back in block mode too, not force an
// extra manual tap just to see the graph the link was actually pointing
// at - same reasoning as initialSource above falling back to whatever
// the URL already specified. Checked against sharedBlockPatch, NOT
// initialBlockPatch (always truthy now thanks to DEFAULT_BLOCK_PATCH) -
// a plain fresh visit with no shared link should NOT be forced into
// block mode just because a bundled default patch exists for it.
if (sharedBlockPatch) activateBlockMode();

// Real OS-level fullscreen (hides the browser's own tab/address bar
// entirely) - separate from Perform mode above, which is only a layout
// choice within the browser window. requestFullscreen() must be called
// from a real user gesture (this click handler), same restriction as
// the file picker in editor.js. resizeCanvas() runs again on the
// browser's own 'fullscreenchange' event (fired for both entering AND
// exiting, including via Esc, which bypasses this button entirely) since
// #render-pane's box changes size either way.
fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
  resizeCanvas();
});

// Drops any #patch=... hash (see ui/patch-link.js) and does a REAL reload -
// a plain hash change alone is a same-document navigation, which wouldn't
// re-run this whole module and reset all the in-memory state a patch can
// touch (slider/button/colorPicker values, MIDI/audio connections, running
// node state, ...) the way actually landing back on the bundled default
// project should. replaceState first (not just reload()) so the reload
// itself has nothing left in the URL to read back.
resetPatchBtn.addEventListener('click', () => {
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
});

// Backing resolution for a Pattern's auto-plotted preview card - see
// updatePreviews() below. Wider than the normal 96x96 square thumbnail
// (a line graph with axis labels needs the width) and drawn at real
// resolution rather than downsampled into it, which is what actually
// fixes the labels being illegible - see index.html's `.wide` classes
// for the matching DISPLAY size.
const PATTERN_PREVIEW_W = 240;
const PATTERN_PREVIEW_H = 108;

// Previews are opt-in: a node only gets a card for ticks where its
// code() actually calls preview(value) - see lib/preview-sink.js. No
// call, no card, no per-tick texture readback cost.
function updatePreviews() {
  const requests = getPreviewRequests();
  previewPanel.sync([...requests.keys()]);

  for (const [nodeId, { row, canvas, text, collapsedPaths }] of previewPanel.entries) {
    const req = requests.get(nodeId);
    let value = req && req.value;
    const isPattern = value instanceof Pattern;

    // A bare Pattern (not already turned into a texture via its own
    // .plot()) gets auto-plotted here rather than falling through to
    // JSON.stringify(), which would just show `{}` - .plot()'s own
    // default range ([0, 1]) is used unless preview()'s second argument
    // supplied one (preview(pattern, { range: [a, b] })).
    //
    // A plot is drawn wide (a line graph with axis labels needs the
    // width, unlike a plain texture/photo thumbnail), at a size explicit
    // enough for real legibility - squeezing it into the normal square
    // 96x96 thumbnail is what made its axis labels illegible even after
    // Pattern.plot() itself got a higher-resolution default (see
    // lib/pattern.js): the backing resolution was never the bottleneck,
    // the DISPLAYED size was. row/canvas grow to match (see the 'wide'
    // class in index.html) only for pattern previews - a normal texture
    // preview stays at its usual small square.
    if (isPattern) {
      value = value.plot({ width: PATTERN_PREVIEW_W, height: PATTERN_PREVIEW_H, ...req.options });
    }
    row.classList.toggle('wide', isPattern);
    canvas.classList.toggle('wide', isPattern);

    if (value && value.texture) {
      canvas.hidden = false;
      text.hidden = true;
      const w = isPattern ? PATTERN_PREVIEW_W : canvas.width;
      const h = isPattern ? PATTERN_PREVIEW_H : canvas.height;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const imageData = readTextureToImageData(value.texture, w, h);
      canvas.getContext('2d').putImageData(imageData, 0, 0);
    } else {
      canvas.hidden = true;
      text.hidden = false;
      text.textContent = '';
      if (value === undefined) {
        text.textContent = '(no output)';
      } else if (typeof value === 'number') {
        // A plain number's full float representation (e.g. floating-point
        // noise like 0.30000000000000004) is rarely what you want to read
        // at a glance - round it for display only, not the actual value.
        text.textContent = String(Math.round(value * 1e6) / 1e6);
      } else if (value !== null && typeof value === 'object') {
        // Objects/arrays get a one-entry-per-line, expandable/collapsible
        // tree instead of a single JSON.stringify() line - see
        // ui/json-tree.js.
        text.appendChild(renderJsonTree(value, collapsedPaths));
      } else {
        text.textContent = JSON.stringify(value);
      }
    }
  }
}

// Same opt-in idea as updatePreviews() above, but for slider()/button()/
// input() calls - see lib/controls.js.
function updateControls() {
  controlPanel.sync(getControlRequests());
}

// Ticks-per-second diagnostic - counts ticks between updates rather than
// just showing an instantaneous frame delta, so it settles to a stable
// number instead of jittering every frame.
let tpsCount = 0;
let tpsWindowStart = performance.now();
function updateTps() {
  tpsCount++;
  const elapsed = performance.now() - tpsWindowStart;
  if (elapsed >= 500) {
    tpsEl.textContent = `${Math.round((tpsCount * 1000) / elapsed)} tps`;
    tpsCount = 0;
    tpsWindowStart = performance.now();
  }
}

(async () => {
  await reload(initialSource);
  clock.onTick((t, tickCount) => {
    graph.tick(t, tickCount); // newPatch reads true for exactly this one tick, if a send just succeeded
    clearNewPatch();
    showErrors();
    connectionMap.update(graph, jumpToNode); // always on - see connection-map.js
    updatePreviews();
    updateControls();
    updateTps();
    tEl.textContent = `t=${t.toFixed(1)}`;
  }, 1);
  clock.start();
})();

// poke at the running graph from the console while you build:
//   graph.nodes.get('transform1').state
//   graph.nodes.get('render1').error
//   explode('rotate')   // raw shader source for an effect
//   explode('glsl')     // a blank starter GLSL node block
window.graph = graph;
window.view = view;

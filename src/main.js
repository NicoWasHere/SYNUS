import defaultSource from './default-project.js?raw';
import { createGLContext } from './gl/gl-context.js';
import { setViewportSize } from './core/lib/context.js';
import { DataBus } from './core/bus.js';
import { Clock } from './core/clock.js';
import { Graph } from './core/graph.js';
import { loadProject } from './core/project-loader.js';
import { readTextureToImageData } from './core/lib/texture-preview.js';
import { getPreviewRequests } from './core/lib/preview-sink.js';
import { Pattern } from './core/lib/pattern.js';
import { getControlRequests } from './core/lib/controls.js';
import { setMousePosition, setKeyState } from './core/lib/input-state.js';
import { markNewPatch, clearNewPatch } from './core/lib/patch-flag.js';
import { createEditor, lineTop, EDITOR_METRICS } from './ui/editor.js';
import { PreviewPanel } from './ui/preview-panel.js';
import { ControlPanel } from './ui/control-panel.js';
import { ResetPanel } from './ui/reset-panel.js';
import { parseNodeBlocks, offsetToLine } from './ui/node-parser.js';

const appEl = document.getElementById('app');
const editorMount = document.getElementById('editor-mount');
const errorsEl = document.getElementById('errors');
const renderPane = document.getElementById('render-pane');
const modeToggle = document.getElementById('mode-toggle');
const tpsEl = document.getElementById('tps-counter');
const tEl = document.getElementById('t-counter');
const sendBtn = document.getElementById('send-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');

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
function resizeCanvas() {
  const rect = renderPane.getBoundingClientRect();
  const size = Math.max(1, Math.round(Math.max(rect.width, rect.height)));
  if (glCanvas.width !== size || glCanvas.height !== size) {
    glCanvas.width = size;
    glCanvas.height = size;
  }
  glCanvas.style.width = `${size}px`;
  glCanvas.style.height = `${size}px`;
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

function showErrors() {
  const lines = [];
  if (loadError) lines.push(loadError);
  for (const node of graph.nodes.values()) {
    if (node.error) lines.push(`${node.id}: ${node.error}`);
  }
  errorsEl.textContent = lines.join('\n');
}

// Recomputes where each node's preview card should float, from the
// current source text - see ui/node-parser.js. Only needs to run when
// the text actually changes (i.e. alongside reload()), not every tick:
// which node calls preview() can change tick to tick, but where a given
// node *lives in the file* only changes on edit.
function updatePreviewPositions(source) {
  const positions = new Map();
  for (const block of parseNodeBlocks(source)) {
    positions.set(block.id, lineTop(offsetToLine(source, block.start)));
  }
  previewPanel.setPositions(positions);
  resetPanel.setPositions(positions); // same per-node positions - see ui/reset-panel.js
}

// Same idea as updatePreviewPositions above, but for slider()/button()/
// input() calls (see ui/control-panel.js) - these can appear on any line
// inside any node's code(), not just at a node's own top line, so this
// just regex-scans for the call itself rather than using node-parser.js.
// Positioned right after that line's own text (not anchored to the
// right edge like preview cards) since a control widget needs real
// pointer interaction, and sitting over the code itself would get in
// the way of editing it.
const CONTROL_CALL_PATTERN = /\b(?:slider|button|input)\(\s*['"]([^'"]+)['"]/g;
function updateControlPositions(source) {
  const positions = new Map();
  const lines = source.split('\n');
  for (const match of source.matchAll(CONTROL_CALL_PATTERN)) {
    const name = match[1];
    const lineIndex = offsetToLine(source, match.index);
    const lineText = lines[lineIndex] || '';
    positions.set(name, {
      top: lineTop(lineIndex),
      left: EDITOR_METRICS.paddingLeft + lineText.length * EDITOR_METRICS.charWidth + 16,
    });
  }
  controlPanel.setPositions(positions);
}

// Returns whether the load succeeded, so callers (flashSendResult below)
// can give feedback - on failure the graph is left exactly as it was
// (syncFromProject is never reached), same as any other tick where a
// node throws: the last good state just keeps running.
async function reload(source) {
  try {
    const projectNodes = await loadProject(gl, source);
    graph.syncFromProject(projectNodes);
    updatePreviewPositions(source);
    updateControlPositions(source);
    loadError = null;
    markNewPatch(); // newPatch reads true for the one tick right after this - see lib/patch-flag.js
    return true;
  } catch (e) {
    loadError = `project failed to load: ${e.message}`;
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
  flashSendResult(await reload(text));
}

const view = createEditor({
  parent: editorMount,
  doc: defaultSource,
  onDocChanged(text) {
    // Live and cosmetic only - where each node's preview card (or a
    // control widget) floats follows the text as you type, independent
    // of whether it's been sent yet. Nothing here touches the running
    // graph.
    updatePreviewPositions(text);
    updateControlPositions(text);
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
const controlPanel = new ControlPanel(view.previewLayer);
const resetPanel = new ResetPanel(view.previewLayer, graph);

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
  for (const node of graph.nodes.values()) node.state = {};
});

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

  for (const [nodeId, { row, canvas, text }] of previewPanel.entries) {
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
      // A plain number's full float representation (e.g. floating-point
      // noise like 0.30000000000000004) is rarely what you want to read
      // at a glance - round it for display only, not the actual value.
      text.textContent =
        value === undefined
          ? '(no output)'
          : typeof value === 'number'
            ? String(Math.round(value * 1e6) / 1e6)
            : JSON.stringify(value);
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
  await reload(defaultSource);
  clock.onTick((t) => {
    graph.tick(t); // newPatch reads true for exactly this one tick, if a send just succeeded
    clearNewPatch();
    showErrors();
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

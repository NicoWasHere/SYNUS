// One floating card per previewed node, anchored to the top-right of
// that node's own block in the editor (see main.js, which computes each
// node's line via ui/node-parser.js and calls setPositions()). Cards live
// inside the editor's scrolling wrap (see editor.js's previewLayer), so
// they move with the text when you scroll instead of needing their own
// synced scroll position.
//
// A node opts out entirely just by never calling the global preview()
// (see lib/preview-sink.js) - main.js only calls sync() with the ids that
// requested a preview *this tick*, so a node that never asks for one
// never gets a row, canvas, or per-tick texture readback.
//
// A node that calls preview() more than once in one tick gets one card
// per call, keyed "nodeId" (first call), "nodeId#2", "nodeId#3", ... (see
// lib/preview-sink.js) - stacked downward below the node's own position
// rather than each needing its own line-position entry, since only the
// first call's key actually has one.
const STACK_OFFSET = 170; // approximate rendered card height + gap - see _createRow's CSS

function parseKey(id) {
  const match = id.match(/^(.*)#(\d+)$/);
  return match ? { baseId: match[1], index: Number(match[2]) } : { baseId: id, index: 1 };
}

export class PreviewPanel {
  constructor(parent) {
    this.parent = parent;
    this.entries = new Map(); // nodeId (or "nodeId#n") -> { row, canvas, text }
    this.positions = new Map(); // nodeId -> top px, from node-parser.js line numbers
  }

  // Called once per project reload (source changed) with a fresh
  // nodeId -> top-px map. Re-applies immediately to any rows that
  // already exist, in case the node moved in the text.
  setPositions(positions) {
    this.positions = positions;
    for (const [id, entry] of this.entries) {
      this._applyPosition(id, entry.row);
    }
  }

  // Called every tick with exactly the node ids that called preview()
  // this tick: drops rows for ids that stopped (or never started),
  // creates rows for new ids.
  sync(nodeIds) {
    for (const id of [...this.entries.keys()]) {
      if (!nodeIds.includes(id)) {
        this.entries.get(id).row.remove();
        this.entries.delete(id);
      }
    }
    for (const id of nodeIds) {
      if (!this.entries.has(id)) {
        const entry = this._createRow(id);
        this._applyPosition(id, entry.row);
        this.entries.set(id, entry);
        this.parent.appendChild(entry.row);
      }
    }
  }

  _applyPosition(id, row) {
    const { baseId, index } = parseKey(id);
    const base = this.positions.get(baseId);
    const top = (base != null ? base : 4) + (index - 1) * STACK_OFFSET;
    row.style.top = `${top}px`;
  }

  // The y-position just below any preview card(s) currently shown for
  // `nodeId` - lets ControlPanel float its own widgets right under a
  // node's preview stack instead of on top of it, for the common case of
  // a node calling both preview() and slider()/button()/input() (see
  // main.js's updateControls(), which runs right after updatePreviews()
  // every tick, so this always reflects the current tick's cards).
  // Falls back to the node's own top position when it has no cards up.
  getStackBottom(nodeId) {
    const base = this.positions.get(nodeId);
    if (base == null) return 4;
    let maxIndex = 0;
    for (const id of this.entries.keys()) {
      const parsed = parseKey(id);
      if (parsed.baseId === nodeId) maxIndex = Math.max(maxIndex, parsed.index);
    }
    return base + maxIndex * STACK_OFFSET;
  }

  _createRow(id) {
    const row = document.createElement('div');
    row.className = 'node-preview';

    const label = document.createElement('div');
    label.className = 'node-preview-label';
    label.textContent = id;

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    canvas.className = 'node-preview-canvas';

    const text = document.createElement('div');
    text.className = 'node-preview-text';

    row.append(label, canvas, text);
    // main.js rebuilds an object/array preview's json-tree DOM from
    // scratch every tick (the value can change tick to tick), which would
    // otherwise snap every <details> back open the instant after a user
    // collapsed one - this set persists across those rebuilds so
    // ui/json-tree.js can restore each node's open/closed state instead of
    // always defaulting to open. Keyed by path (see json-tree.js), lives
    // for as long as this card does.
    return { row, canvas, text, collapsedPaths: new Set() };
  }
}

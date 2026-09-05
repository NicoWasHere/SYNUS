import { disposeState } from '../core/lib/dispose-state.js';
import { disposeParticlesForNode } from '../core/lib/instance.js';
import { disposeAsciiForNode } from '../core/lib/ascii.js';

// One small row of 3 buttons per node, anchored to the left margin of
// that node's own opening line (same positions Map main.js already
// builds for PreviewPanel - see updatePreviewPositions()). Replaces the
// old single-button ResetPanel - reset is still here, unchanged, plus:
//
//   ↺  reset - clears this node's persistent `state` (unchanged from the
//      old ResetPanel - see its own removed comment for the full "why").
//   ⏸/▶ bypass - toggles node.bypassed (read directly by graph.js's
//      tick(), see there) - a LIVE toggle, takes effect the very next
//      tick, no resend needed. Not part of the saved patch text.
//   ▸/▾ collapse - purely a local UI Set (this.collapsed), read by
//      main.js to decide which nodes' code bodies to visually fold (see
//      ui/editor.js's foldLayer/showFolds) - doesn't touch the graph at
//      all, just how much of the node's own code is drawn on screen.
export class NodeToolbar {
  constructor(parent, graph, { onToggleCollapse } = {}) {
    this.parent = parent;
    this.graph = graph;
    this.onToggleCollapse = onToggleCollapse;
    this.entries = new Map(); // nodeId -> { row, resetBtn, bypassBtn, collapseBtn }
    this.positions = new Map();
    this.collapsed = new Set(); // nodeIds currently code-folded
  }

  isCollapsed(id) {
    return this.collapsed.has(id);
  }

  // Lets a caller (main.js's fold-box click handler - see
  // updateFolds()) collapse a node back off from OUTSIDE this row's own
  // ▸/▾ button, keeping this.collapsed and that button's icon in sync
  // without reaching into the private _refresh() directly.
  uncollapse(id) {
    this.collapsed.delete(id);
    this._refresh(id);
  }

  setPositions(positions) {
    this.positions = positions;
    for (const id of [...this.entries.keys()]) {
      if (!positions.has(id)) {
        this.entries.get(id).row.remove();
        this.entries.delete(id);
        this.collapsed.delete(id);
      }
    }
    for (const id of positions.keys()) {
      if (!this.entries.has(id)) {
        const entry = this._createRow(id);
        this.entries.set(id, entry);
        this.parent.appendChild(entry.row);
      }
      this._refresh(id);
      this._applyPosition(id);
    }
  }

  _applyPosition(id) {
    this.entries.get(id).row.style.top = `${this.positions.get(id) ?? 4}px`;
  }

  // Re-renders whichever button state can change WITHOUT a setPositions()
  // call in between (bypass/collapse, both toggled straight from this
  // row's own click handlers) - called right after each toggle, and once
  // more per node on every setPositions() pass so a freshly (re)created
  // row (e.g. after a node was removed and reappears) still starts
  // showing the right icon.
  _refresh(id) {
    const node = this.graph.nodes.get(id);
    const { bypassBtn, collapseBtn } = this.entries.get(id);
    const bypassed = !!(node && node.bypassed);
    bypassBtn.textContent = bypassed ? '▶' : '⏸';
    bypassBtn.classList.toggle('active', bypassed);
    collapseBtn.textContent = this.collapsed.has(id) ? '▸' : '▾';
  }

  _createRow(id) {
    const row = document.createElement('div');
    row.className = 'node-toolbar';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'node-toolbar-btn';
    resetBtn.textContent = '↺';
    resetBtn.title = `Reset ${id}'s persistent state (re-runs any if (!state.x) setup)`;
    resetBtn.addEventListener('click', () => {
      const node = this.graph.nodes.get(id);
      if (!node) return;
      // Same reasoning as the old ResetPanel - free the OLD state's
      // resources before replacing it, rather than leaving them as JS
      // garbage (see dispose-state.js).
      disposeState(node.state);
      disposeParticlesForNode(id);
      disposeAsciiForNode(id);
      node.state = {};
    });

    const bypassBtn = document.createElement('button');
    bypassBtn.type = 'button';
    bypassBtn.className = 'node-toolbar-btn';
    bypassBtn.title = `Bypass ${id} - pass its first input straight through as output, without touching its code (live toggle, no resend needed)`;
    bypassBtn.addEventListener('click', () => {
      const node = this.graph.nodes.get(id);
      if (!node) return;
      node.bypassed = !node.bypassed;
      this._refresh(id);
    });

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'node-toolbar-btn';
    collapseBtn.title = `Collapse ${id}'s code down to just its in/out shape`;
    collapseBtn.addEventListener('click', () => {
      if (this.collapsed.has(id)) this.collapsed.delete(id);
      else this.collapsed.add(id);
      this._refresh(id);
      this.onToggleCollapse?.();
    });

    row.append(resetBtn, bypassBtn, collapseBtn);
    return { row, resetBtn, bypassBtn, collapseBtn };
  }
}

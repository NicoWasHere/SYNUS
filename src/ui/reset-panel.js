import { disposeState } from '../core/lib/dispose-state.js';
import { disposeParticlesForNode } from '../core/lib/instance.js';
import { disposeAsciiForNode } from '../core/lib/ascii.js';

// One small "reset state" button per node, anchored to the left margin
// of that node's own opening line (see main.js, which computes each
// node's line via ui/node-parser.js and calls setPositions() - same data
// PreviewPanel/ControlPanel already use, just consumed differently here).
//
// Clicking it clears that node's persistent `state` object - the
// deliberate escape hatch for the `if (!state.x) { ...one-time setup... }`
// pattern used all over this project (three.js scene/camera/mesh, a
// Pattern instance, a "drawn once" flag on a stamp canvas, ...). `state`
// otherwise survives every patch-send ON PURPOSE (editing one line in a
// node shouldn't blow away its running feedback buffer or compiled
// shader) - but that same persistence means changing something INSIDE a
// one-time setup block (swapping BoxGeometry for SphereGeometry, say) has
// no visible effect, because the `if (!state.x)` guard that would run the
// new code never fires again. No resend needed - node.code() always
// reads node.state directly, so clearing it here takes effect on the very
// next tick.
//
// Unlike PreviewPanel/ControlPanel, this isn't opt-in per tick - every
// node gets a button, all the time, since any node might rely on this
// pattern whether or not it's visibly doing so right now.
export class ResetPanel {
  constructor(parent, graph) {
    this.parent = parent;
    this.graph = graph;
    this.entries = new Map(); // nodeId -> button element
    this.positions = new Map(); // nodeId -> top px
  }

  setPositions(positions) {
    this.positions = positions;
    for (const id of [...this.entries.keys()]) {
      if (!positions.has(id)) {
        this.entries.get(id).remove();
        this.entries.delete(id);
      }
    }
    for (const id of positions.keys()) {
      if (!this.entries.has(id)) {
        const btn = this._createButton(id);
        this.entries.set(id, btn);
        this.parent.appendChild(btn);
      }
      this._applyPosition(id);
    }
  }

  _applyPosition(id) {
    const btn = this.entries.get(id);
    btn.style.top = `${this.positions.get(id) ?? 4}px`;
  }

  _createButton(id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'node-reset-btn';
    btn.textContent = '↺'; // ↺
    btn.title = `Reset ${id}'s persistent state (re-runs any if (!state.x) setup)`;
    btn.addEventListener('click', () => {
      const node = this.graph.nodes.get(id);
      if (!node) return;
      // Same reasoning as main.js's mode-toggle handler - free the OLD
      // state's resources before replacing it, rather than leaving them
      // as JS garbage (see dispose-state.js).
      disposeState(node.state);
      disposeParticlesForNode(id);
      disposeAsciiForNode(id);
      node.state = {};
    });
    return btn;
  }
}

// PatchStore - holds the current mobile block-patch (see
// core/patch-compiler.js for the JSON shape it holds) in memory and
// exposes the mutation methods the touch UI calls into. Not tied to the
// DOM at all - a small reactive container, same "single source of truth
// + onChange callback" shape as any other store, so canvas.js/node-view.js
// never touch `patch` directly and mobile-app.js has one place to hook a
// debounced recompile+reload.
//
// Every node exposes exactly ONE input port (always named `src`) and ONE
// output port (always named `out`) - this is what keeps the touch canvas's
// wiring gesture simple (one dot in, one dot out, per node, always).
// patch-compiler.js's generated code always `return { out }` for exactly
// this reason. A node needing more than one input is out of scope for v1
// (see the plan's non-goals) - `raw` slots can still reach `inputs.src`
// for anything more elaborate a hand-authored node would have wired.
let nextIdCounter = 1;

export class PatchStore {
  constructor(initialPatch, onChange) {
    this.patch = initialPatch || { version: 1, nodes: [] };
    this.onChange = onChange || (() => {});
    this._changeTimer = null;
  }

  getPatch() {
    return this.patch;
  }

  getNode(id) {
    return this.patch.nodes.find((n) => n.id === id);
  }

  // Debounced so a fast drag (many setPos calls a second) doesn't trigger
  // a recompile+reload per pixel moved - only once movement settles.
  _notify() {
    clearTimeout(this._changeTimer);
    this._changeTimer = setTimeout(() => this.onChange(this.patch), 150);
  }

  addNode({ id, pos = { x: 40, y: 40 }, slots = [] } = {}) {
    const nodeId = id || `node${nextIdCounter++}`;
    if (this.getNode(nodeId)) throw new Error(`Node "${nodeId}" already exists`);
    this.patch.nodes.push({ id: nodeId, pos: { ...pos }, in: {}, slots });
    this._notify();
    return nodeId;
  }

  removeNode(id) {
    this.patch.nodes = this.patch.nodes.filter((n) => n.id !== id);
    for (const node of this.patch.nodes) {
      if (node.in.src === `${id}.out`) delete node.in.src; // nothing left pointing at the removed node
    }
    this._notify();
  }

  setPos(id, pos) {
    const node = this.getNode(id);
    if (!node) return;
    node.pos = { ...pos };
    this._notify();
  }

  // wire(targetId, sourceId) - targetId's `src` input now reads sourceId's
  // `out` output. Always the same two port names (see class comment) -
  // nothing else to specify.
  wire(targetId, sourceId) {
    const target = this.getNode(targetId);
    if (!target || !this.getNode(sourceId) || targetId === sourceId) return;
    target.in.src = `${sourceId}.out`;
    this._notify();
  }

  // unwire(id) - clears id's OWN `src` input (a node's downstream
  // consumers, if any, are untouched - see removeNode for the "id itself
  // is going away, so nothing should be left reading its output" case).
  unwire(id) {
    const node = this.getNode(id);
    if (!node) return;
    delete node.in.src;
    this._notify();
  }

  addSlot(nodeId, slot, index) {
    const node = this.getNode(nodeId);
    if (!node) return;
    const at = index ?? node.slots.length;
    node.slots.splice(at, 0, slot);
    this._notify();
  }

  removeSlot(nodeId, index) {
    const node = this.getNode(nodeId);
    if (!node) return;
    node.slots.splice(index, 1);
    this._notify();
  }

  // Deep-sets a value inside one slot's `args` tree - `path` is an array
  // of keys (e.g. ['x'] for `{ x: ..., y: 1 }`, [] for a bare arg). Used
  // by node-view.js (Phase 3) to write a dragged slider's new value back
  // in as a plain literal, or to swap a leaf between a literal and a
  // `{$control: ...}` descriptor.
  setArgValue(nodeId, slotIndex, path, value) {
    const node = this.getNode(nodeId);
    const slot = node?.slots[slotIndex];
    if (!slot) return;
    if (path.length === 0) {
      slot.args = value;
    } else {
      let target = slot.args;
      for (const key of path.slice(0, -1)) target = target[key];
      target[path[path.length - 1]] = value;
    }
    this._notify();
  }

  // Flattened wire list for rendering - one entry per node that actually
  // has a `src` wire right now.
  listWires() {
    return this.patch.nodes
      .filter((n) => n.in.src)
      .map((n) => ({ targetId: n.id, sourceId: n.in.src.split('.')[0] }));
  }
}

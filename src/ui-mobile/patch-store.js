// PatchStore - holds the current mobile block-patch (see
// core/patch-compiler.js for the JSON shape it holds) in memory and
// exposes the mutation methods the touch UI calls into. Not tied to the
// DOM at all - a small reactive container, same "single source of truth
// + onChange callback" shape as any other store, so canvas.js/node-view.js
// never touch `patch` directly and mobile-app.js has one place to hook a
// debounced recompile+reload.
//
// Every node has a `src` input by default, but can declare MORE named
// input ports (`node.inputNames`, e.g. for a "comp" node reading two
// wired sources by name) - each is its own dot on the touch canvas, and
// each is readable in code as `inputs.<name>` (patch-compiler.js's `in:
// {...}` object literal was always keyed generically, so this needed no
// compiler change, just a way to DECLARE more of them and draw more
// dots). Every node always publishes `out` (the slot chain's running
// value), but can also declare extra named outputs (`node.extraOutputs`,
// e.g. a "bpm" node publishing both `out` and a numeric `bpm`) - each is
// a raw JS expression (same `$expr` convention as node-view.js's per-arg
// "t" toggle) evaluated after every slot has run, so it can read `out`,
// `t`, or a local a `raw` slot declared earlier in the same node.
let nextIdCounter = 1;

const DEFAULT_INPUT_NAMES = ['src'];

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

  addNode({ id, pos = { x: 40, y: 40 }, slots = [], in: inputs = {}, inputNames, extraOutputs = {} } = {}) {
    const nodeId = id || `node${nextIdCounter++}`;
    if (this.getNode(nodeId)) throw new Error(`Node "${nodeId}" already exists`);
    this.patch.nodes.push({
      id: nodeId,
      pos: { ...pos },
      in: { ...inputs },
      inputNames: inputNames ? [...inputNames] : [...DEFAULT_INPUT_NAMES],
      extraOutputs: { ...extraOutputs },
      slots,
    });
    this._notify();
    return nodeId;
  }

  // Declared input ports, in dot order - a patch saved before this field
  // existed just has `src` (matching what compileNode already assumed).
  getInputNames(node) {
    return node.inputNames && node.inputNames.length ? node.inputNames : DEFAULT_INPUT_NAMES;
  }

  addInputPort(nodeId, name) {
    const node = this.getNode(nodeId);
    name = (name || '').trim();
    if (!node || !name) return false;
    const names = this.getInputNames(node);
    if (names.includes(name)) return false;
    node.inputNames = [...names, name];
    this._notify();
    return true;
  }

  // The wire (if any) feeding that port goes with it - same "nothing
  // left pointing at a name that no longer exists" reasoning as
  // removeNode/renameNode, just for a port instead of a whole node.
  removeInputPort(nodeId, name) {
    const node = this.getNode(nodeId);
    if (!node) return;
    node.inputNames = this.getInputNames(node).filter((n) => n !== name);
    delete node.in[name];
    this._notify();
  }

  // Extra outputs beyond the always-present `out` (the slot chain's
  // running value - see compileNode) - each is a raw expression, not a
  // value, so it can be edited (setOutputExpr) after adding without
  // needing a separate "value vs expression" toggle the way a slot arg
  // does; there's no non-expression form for an output to begin with.
  addOutputPort(nodeId, name, expr = 'out') {
    const node = this.getNode(nodeId);
    name = (name || '').trim();
    if (!node || !name || name === 'out' || name in node.extraOutputs) return false;
    node.extraOutputs = { ...node.extraOutputs, [name]: expr };
    this._notify();
    return true;
  }

  removeOutputPort(nodeId, name) {
    const node = this.getNode(nodeId);
    if (!node || !(name in node.extraOutputs)) return;
    const rest = { ...node.extraOutputs };
    delete rest[name];
    node.extraOutputs = rest;
    this._notify();
  }

  setOutputExpr(nodeId, name, expr) {
    const node = this.getNode(nodeId);
    if (!node || !(name in node.extraOutputs)) return;
    node.extraOutputs[name] = expr;
    this._notify();
  }

  // `out` itself defaults to a plain pass-through of the slot chain's own
  // running value (patch-compiler.js emits the bare identifier `out`) -
  // node.outExpr overrides that with a raw expression instead, same
  // $expr convention as everything else, so a node can publish something
  // other than "whatever its slots computed" (e.g. a pure value/computed
  // node with zero slots). Clearing it back to blank or literally "out"
  // just removes the override rather than storing a no-op one.
  setOutExpr(nodeId, expr) {
    const node = this.getNode(nodeId);
    if (!node) return;
    const trimmed = (expr ?? '').trim();
    if (!trimmed || trimmed === 'out') {
      delete node.outExpr;
    } else {
      node.outExpr = expr;
    }
    this._notify();
  }

  removeNode(id) {
    this.patch.nodes = this.patch.nodes.filter((n) => n.id !== id);
    for (const node of this.patch.nodes) {
      for (const port of Object.keys(node.in)) {
        if (node.in[port]?.split('.')[0] === id) delete node.in[port]; // nothing left pointing at the removed node
      }
    }
    this._notify();
  }

  // renameNode(oldId, newId) - false (no-op) on a blank/unchanged/colliding
  // newId or a missing oldId, so a caller (node-view.js's editable title)
  // can just revert its own input on failure rather than needing to
  // pre-validate itself. Every other node's wire gets repointed at the
  // new id, same "nothing left pointing at a name that no longer exists"
  // reasoning as removeNode above - a rename is really just "remove +
  // re-add under a new name" from every OTHER node's perspective.
  renameNode(oldId, newId) {
    newId = newId.trim();
    if (!newId || newId === oldId || this.getNode(newId)) return false;
    const node = this.getNode(oldId);
    if (!node) return false;
    node.id = newId;
    for (const n of this.patch.nodes) {
      for (const port of Object.keys(n.in)) {
        const ref = n.in[port];
        const [sourceId, sourcePort] = ref ? ref.split('.') : [];
        if (sourceId === oldId) n.in[port] = `${newId}.${sourcePort}`;
      }
    }
    this._notify();
    return true;
  }

  setPos(id, pos) {
    const node = this.getNode(id);
    if (!node) return;
    node.pos = { ...pos };
    this._notify();
  }

  // wire(targetId, targetPort, sourceId, sourcePort) - targetId's named
  // input port now reads sourceId's named output port. targetPort/
  // sourcePort default to the original single-port convention ('src'/
  // 'out') so old 2-arg call sites still behave identically. A node
  // wiring its OWN output back into its own input is allowed, not a
  // degenerate case - that's exactly what a "feedback" node (see
  // canvas.js's node-template picker) is: reading last tick's own
  // output, same as Graph's bus.read() already does for any wire.
  wire(targetId, targetPort, sourceId, sourcePort = 'out') {
    const target = this.getNode(targetId);
    if (!target || !this.getNode(sourceId)) return;
    target.in[targetPort] = `${sourceId}.${sourcePort}`;
    this._notify();
  }

  // unwire(id, port) - clears id's own named input port (a node's
  // downstream consumers, if any, are untouched - see removeNode for the
  // "id itself is going away, so nothing should be left reading its
  // output" case, which is the opposite direction from this).
  unwire(id, port = 'src') {
    const node = this.getNode(id);
    if (!node) return;
    delete node.in[port];
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

  // Flattened wire list for rendering - one entry per WIRED input port
  // across every node (a node with 2 wired inputs contributes 2 entries).
  listWires() {
    const wires = [];
    for (const node of this.patch.nodes) {
      for (const [targetPort, ref] of Object.entries(node.in)) {
        if (!ref) continue;
        const [sourceId, sourcePort] = ref.split('.');
        wires.push({ targetId: node.id, targetPort, sourceId, sourcePort: sourcePort || 'out' });
      }
    }
    return wires;
  }
}

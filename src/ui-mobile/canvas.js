// mountMobileCanvas(container, patchStore, { onNodeTap }) - the touch
// node-graph surface: pan (drag the background) and zoom (the slider,
// see below - pinch-to-zoom was tried and dropped, it stayed too
// sensitive/unpredictable on touch even damped) the canvas, drag a node to
// reposition it, drag from any of a node's (right-side, blue) output
// dots to another node's (left-side, gray) input dots to wire them, tap
// a wired input dot to unwire it, tap a node's body (no drag) to open it
// (Phase 3's node-view.js hooks in via `onNodeTap`). Same inline-
// `style.cssText`, plain-DOM, window-level-pointermove/pointerup
// convention as compose-at-tool.js/draw-tool.js - no framework, nothing
// new to learn.
//
// A node can declare more than one input/output port (patch-store.js's
// inputNames/extraOutputs, edited from node-view.js's sheet) - each gets
// its own dot, evenly spaced along the node's left/right edge, so the
// "drag dot A to dot B" wiring gesture stays exactly as uniform as the
// old always-exactly-one-of-each version, just with a specific port
// (tracked via each dot's own dataset.port) at each end instead of an
// implied 'src'/'out'.
const NODE_W = 140;
const NODE_H = 64;
const PORT_SPACING = 26; // vertical gap between stacked dots on a tall (multi-port) node
const DOT_SIZE = 26; // touch-target sized, not just visually-sized

function outputNamesOf(node) {
  return ['out', ...Object.keys(node.extraOutputs || {})];
}

function nodeHeight(patchStore, node) {
  const portCount = Math.max(patchStore.getInputNames(node).length, outputNamesOf(node).length);
  return Math.max(NODE_H, portCount * PORT_SPACING + 20);
}

export function mountMobileCanvas(container, patchStore, { onNodeTap } = {}) {
  container.innerHTML = '';
  container.style.cssText = `
    position: relative; width: 100%; height: 100%; overflow: hidden;
    background: #14161a; touch-action: none;
  `;

  const world = document.createElement('div');
  world.style.cssText = `position: absolute; left: 0; top: 0; transform-origin: 0 0;`;
  container.appendChild(world);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '6000');
  svg.setAttribute('height', '6000');
  svg.style.cssText = `position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible;`;
  world.appendChild(svg);

  const nodeEls = new Map(); // id -> { el, inDot, outDot }

  let pan = { x: 60, y: 60 };
  let zoom = 1;

  function applyWorldTransform() {
    world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  }
  applyWorldTransform();

  function clientToWorld(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }

  // Re-centers the view on one world point, at whatever zoom is
  // currently set - used to snap the camera onto a freshly added node
  // (see the add-node button below) so it's always what you're looking
  // at right after tapping "+ node", not just wherever it happened to land.
  function centerCameraOn(worldX, worldY) {
    const rect = container.getBoundingClientRect();
    pan = { x: rect.width / 2 - worldX * zoom, y: rect.height / 2 - worldY * zoom };
    applyWorldTransform();
  }

  // Evenly spaces N ports top-to-bottom along whichever edge - index 0 at
  // 1/(N+1) of the way down, ..., so a single port sits at the dead
  // center (same spot the old always-one-dot version used) and more
  // ports fan out symmetrically around it as they're added.
  function portPos(node, side, portName) {
    const h = nodeHeight(patchStore, node);
    const names = side === 'in' ? patchStore.getInputNames(node) : outputNamesOf(node);
    const i = Math.max(0, names.indexOf(portName));
    return { x: node.pos.x + (side === 'in' ? 0 : NODE_W), y: node.pos.y + (h * (i + 1)) / (names.length + 1) };
  }

  function renderWires() {
    svg.innerHTML = '';
    for (const wire of patchStore.listWires()) {
      const source = patchStore.getNode(wire.sourceId);
      const target = patchStore.getNode(wire.targetId);
      if (!source || !target) continue;
      const a = portPos(source, 'out', wire.sourcePort);
      const b = portPos(target, 'in', wire.targetPort);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y);
      line.setAttribute('stroke', '#5bb0e0');
      line.setAttribute('stroke-width', '3');
      svg.appendChild(line);
    }
  }

  function layoutNodeEl(entry, node) {
    entry.el.style.left = `${node.pos.x}px`;
    entry.el.style.top = `${node.pos.y}px`;
  }

  function makeNodeEl(node) {
    const el = document.createElement('div');
    el.dataset.nodeId = node.id; // precise hook for automated tests/tooling - not used by canvas.js itself
    el.style.cssText = `
      position: absolute; width: ${NODE_W}px;
      background: #23262e; border: 2px solid #454952; border-radius: 10px;
      color: #eee; font: 13px/1.3 sans-serif; display: flex; align-items: center;
      justify-content: center; user-select: none; touch-action: none; cursor: grab;
      box-sizing: border-box; padding: 0 8px; text-align: center; word-break: break-all;
    `;
    el.textContent = node.id;

    const del = document.createElement('div');
    del.textContent = '×';
    del.title = 'delete node';
    del.style.cssText = `
      position: absolute; right: -10px; top: -12px; width: 22px; height: 22px;
      border-radius: 50%; background: #a83a3a; color: #fff; font: bold 14px/22px sans-serif;
      text-align: center; cursor: pointer; touch-action: none; z-index: 1;
    `;
    el.appendChild(del);

    return { el, del, inDots: new Map(), outDots: new Map() };
  }

  // Rebuilds a node's port dots to match its CURRENT declared inputs/
  // extra outputs (node-view.js's "+ add input"/"+ add output") and
  // resizes the box to fit them. Cheap enough to call on every full
  // refresh() (add/remove/wire/rename) - NOT called from the per-frame
  // drag path (layoutNodeEl, called directly during a body drag) since a
  // dot's own identity has no reason to change mid-drag and constantly
  // tearing down/rebuilding it would be wasted work.
  function syncPorts(entry, node) {
    for (const el of entry.inDots.values()) el.remove();
    for (const el of entry.outDots.values()) el.remove();
    entry.inDots.clear();
    entry.outDots.clear();

    const h = nodeHeight(patchStore, node);
    entry.el.style.height = `${h}px`;

    function makeDot(kind, name, index, count) {
      const dot = document.createElement('div');
      dot.dataset.kind = kind;
      dot.dataset.ownerNodeId = node.id; // NOT dataset.nodeId - that's the node BOX's own unique test hook (see makeNodeEl)
      dot.dataset.port = name;
      dot.title = kind === 'in' ? `${name} - tap to disconnect` : `${name} - drag to another node's input`;
      const side = kind === 'in' ? `left: ${-DOT_SIZE / 2}px;` : `right: ${-DOT_SIZE / 2}px;`;
      dot.style.cssText = `
        position: absolute; ${side} top: ${(h * (index + 1)) / (count + 1)}px; transform: translateY(-50%);
        width: ${DOT_SIZE}px; height: ${DOT_SIZE}px; border-radius: 50%;
        background: ${kind === 'in' ? '#8a8f99' : '#5bb0e0'}; border: 3px solid #14161a; touch-action: none;
      `;
      entry.el.appendChild(dot);
      return dot;
    }

    const inNames = patchStore.getInputNames(node);
    inNames.forEach((name, i) => entry.inDots.set(name, makeDot('in', name, i, inNames.length)));
    const outNames = outputNamesOf(node);
    outNames.forEach((name, i) => entry.outDots.set(name, makeDot('out', name, i, outNames.length)));
  }

  function renderNodes() {
    for (const [id, entry] of nodeEls) {
      if (!patchStore.getNode(id)) {
        entry.el.remove();
        nodeEls.delete(id);
      }
    }
    for (const node of patchStore.getPatch().nodes) {
      let entry = nodeEls.get(node.id);
      if (!entry) {
        entry = makeNodeEl(node);
        world.appendChild(entry.el);
        nodeEls.set(node.id, entry);
        attachNodeInteractions(entry, node.id);
      }
      syncPorts(entry, node);
      layoutNodeEl(entry, node);
    }
  }

  function refresh() {
    renderNodes();
    renderWires();
  }

  function attachNodeInteractions(entry, nodeId) {
    // --- move / tap (body drag) ---
    let dragging = false;
    let moved = false;
    let startClient = null;
    let startPos = null;

    function onMove(e) {
      if (!dragging) return;
      const dx = (e.clientX - startClient.x) / zoom;
      const dy = (e.clientY - startClient.y) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const node = patchStore.getNode(nodeId);
      if (!node) return;
      node.pos = { x: startPos.x + dx, y: startPos.y + dy };
      layoutNodeEl(entry, node);
      renderWires();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const node = patchStore.getNode(nodeId);
      if (node) patchStore.setPos(nodeId, node.pos);
      if (!moved && onNodeTap) onNodeTap(nodeId);
    }

    // --- wire (drag from an output dot) ---
    function startWireDrag(sourcePort) {
      const source = patchStore.getNode(nodeId);
      const a = portPos(source, 'out', sourcePort);
      const dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dragLine.setAttribute('x1', a.x);
      dragLine.setAttribute('y1', a.y);
      dragLine.setAttribute('x2', a.x);
      dragLine.setAttribute('y2', a.y);
      dragLine.setAttribute('stroke', '#5bb0e0');
      dragLine.setAttribute('stroke-width', '3');
      dragLine.setAttribute('stroke-dasharray', '7,5');
      svg.appendChild(dragLine);

      function onWireMove(ev) {
        const w = clientToWorld(ev.clientX, ev.clientY);
        dragLine.setAttribute('x2', w.x);
        dragLine.setAttribute('y2', w.y);
      }
      function onWireUp(ev) {
        window.removeEventListener('pointermove', onWireMove);
        window.removeEventListener('pointerup', onWireUp);
        dragLine.remove();
        const dropEl = document.elementFromPoint(ev.clientX, ev.clientY);
        if (dropEl?.dataset.kind === 'in') {
          patchStore.wire(dropEl.dataset.ownerNodeId, dropEl.dataset.port, nodeId, sourcePort);
          refresh();
        }
      }
      window.addEventListener('pointermove', onWireMove);
      window.addEventListener('pointerup', onWireUp);
    }

    // A single delegated listener per node, reading e.target.dataset at
    // event time - dots get torn down/rebuilt on every port change
    // (syncPorts above), which would otherwise mean re-binding a fresh
    // listener onto each new dot element every time a port is added or
    // removed. Delegation means this listener never needs touching again.
    entry.el.addEventListener('pointerdown', (e) => {
      const kind = e.target.dataset.kind;
      if (e.target === entry.del) return; // its own listener below
      if (kind === 'in') {
        e.stopPropagation();
        return; // unwire is a tap, handled by the 'click' listener below
      }
      if (kind === 'out') {
        e.stopPropagation();
        startWireDrag(e.target.dataset.port);
        return;
      }
      e.stopPropagation();
      dragging = true;
      moved = false;
      startClient = { x: e.clientX, y: e.clientY };
      startPos = { ...patchStore.getNode(nodeId).pos };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    // --- unwire (tap an input dot) ---
    entry.el.addEventListener('click', (e) => {
      if (e.target.dataset.kind !== 'in') return;
      e.stopPropagation();
      const port = e.target.dataset.port;
      if (patchStore.getNode(nodeId)?.in[port]) {
        patchStore.unwire(nodeId, port);
        refresh();
      }
    });

    // --- delete ---
    entry.del.addEventListener('pointerdown', (e) => e.stopPropagation());
    entry.del.addEventListener('click', (e) => {
      e.stopPropagation();
      patchStore.removeNode(nodeId);
      refresh();
    });
  }

  // --- background pan ---
  let panning = false;
  let panStart = null;
  let panOrigin = null;
  function onPanMove(e) {
    if (!panning) return;
    pan = { x: panOrigin.x + (e.clientX - panStart.x), y: panOrigin.y + (e.clientY - panStart.y) };
    applyWorldTransform();
  }
  function onPanUp() {
    panning = false;
    window.removeEventListener('pointermove', onPanMove);
    window.removeEventListener('pointerup', onPanUp);
  }
  container.addEventListener('pointerdown', (e) => {
    if (e.target !== container) return; // a node/dot/button already stopped propagation
    panning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panOrigin = { ...pan };
    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', onPanUp);
  });

  // --- add-node button - just a blank node for now (a template picker
  // for common shapes like feedback/comp is a plausible later addition,
  // but not wanted yet) ---
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+ node';
  addBtn.style.cssText = `
    position: absolute; right: 12px; bottom: 12px; z-index: 5; padding: 12px 16px;
    border-radius: 22px; border: none; background: #3a9d6e; color: #fff; font: 15px sans-serif;
  `;
  addBtn.addEventListener('click', () => {
    const rect = container.getBoundingClientRect();
    const center = clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    // Cascades each new node a little further from the last one (wrapping
    // every 5) instead of always spawning dead-center - repeated taps
    // used to stack every node exactly on top of the previous one, which
    // just looked like nothing had happened.
    const n = patchStore.getPatch().nodes.length % 5;
    const pos = { x: center.x - NODE_W / 2 + n * 36, y: center.y - NODE_H / 2 + n * 36 };
    patchStore.addNode({ pos });
    refresh();
    centerCameraOn(pos.x + NODE_W / 2, pos.y + NODE_H / 2);
  });
  container.appendChild(addBtn);

  // --- zoom bar - a direct slider instead of pinch-to-zoom, which
  // turned out too sensitive/unpredictable on touch even after damping
  // the raw finger-distance ratio (see the top-of-file comment). Always
  // zooms toward the CURRENT viewport center - recomputed from the
  // slider's own current value each move, not a fixed drag-start anchor,
  // since a slider has no discrete gesture start/end the way a pinch does.
  const zoomBar = document.createElement('input');
  zoomBar.type = 'range';
  zoomBar.min = '0.25';
  zoomBar.max = '2.5';
  zoomBar.step = '0.05';
  zoomBar.value = String(zoom);
  zoomBar.title = 'zoom';
  zoomBar.style.cssText = `position: absolute; right: 12px; top: 12px; z-index: 5; width: 120px;`;
  zoomBar.addEventListener('input', () => {
    const rect = container.getBoundingClientRect();
    const anchorWorld = clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    zoom = parseFloat(zoomBar.value);
    pan = { x: rect.width / 2 - anchorWorld.x * zoom, y: rect.height / 2 - anchorWorld.y * zoom };
    applyWorldTransform();
  });
  container.appendChild(zoomBar);

  refresh();
  return { refresh };
}

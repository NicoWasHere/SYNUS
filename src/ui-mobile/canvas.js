// mountMobileCanvas(container, patchStore, { onNodeTap }) - the touch
// node-graph surface: pan/zoom the canvas, drag a node to reposition it,
// drag from a node's (right-side, blue) output dot to another node's
// (left-side, gray) input dot to wire them, tap a wired input dot to
// unwire it, tap a node's body (no drag) to open it (Phase 3's
// node-view.js hooks in via `onNodeTap`). Same inline-`style.cssText`,
// plain-DOM, window-level-pointermove/pointerup convention as
// compose-at-tool.js/draw-tool.js - no framework, nothing new to learn.
//
// Every node has exactly one input dot and one output dot (see
// patch-store.js's class comment for why) - this is what keeps the
// wiring gesture a single, uniform "drag dot A to dot B", never a picker
// of which port you meant.
const NODE_W = 140;
const NODE_H = 64;
const DOT_SIZE = 26; // touch-target sized, not just visually-sized

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

  function portPos(node, side) {
    return { x: node.pos.x + (side === 'in' ? 0 : NODE_W), y: node.pos.y + NODE_H / 2 };
  }

  function renderWires() {
    svg.innerHTML = '';
    for (const wire of patchStore.listWires()) {
      const source = patchStore.getNode(wire.sourceId);
      const target = patchStore.getNode(wire.targetId);
      if (!source || !target) continue;
      const a = portPos(source, 'out');
      const b = portPos(target, 'in');
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
      position: absolute; width: ${NODE_W}px; height: ${NODE_H}px;
      background: #23262e; border: 2px solid #454952; border-radius: 10px;
      color: #eee; font: 13px/1.3 sans-serif; display: flex; align-items: center;
      justify-content: center; user-select: none; touch-action: none; cursor: grab;
      box-sizing: border-box; padding: 0 8px; text-align: center; word-break: break-all;
    `;
    el.textContent = node.id;

    const inDot = document.createElement('div');
    inDot.title = 'input - tap to disconnect';
    inDot.style.cssText = `
      position: absolute; left: ${-DOT_SIZE / 2}px; top: 50%; transform: translateY(-50%);
      width: ${DOT_SIZE}px; height: ${DOT_SIZE}px; border-radius: 50%;
      background: #8a8f99; border: 3px solid #14161a; touch-action: none;
    `;
    const outDot = document.createElement('div');
    outDot.title = 'output - drag to another node’s input';
    outDot.style.cssText = `
      position: absolute; right: ${-DOT_SIZE / 2}px; top: 50%; transform: translateY(-50%);
      width: ${DOT_SIZE}px; height: ${DOT_SIZE}px; border-radius: 50%;
      background: #5bb0e0; border: 3px solid #14161a; touch-action: none;
    `;
    el.appendChild(inDot);
    el.appendChild(outDot);

    const del = document.createElement('div');
    del.textContent = '×';
    del.title = 'delete node';
    del.style.cssText = `
      position: absolute; right: -10px; top: -12px; width: 22px; height: 22px;
      border-radius: 50%; background: #a83a3a; color: #fff; font: bold 14px/22px sans-serif;
      text-align: center; cursor: pointer; touch-action: none;
    `;
    el.appendChild(del);

    return { el, inDot, outDot, del };
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
    entry.el.addEventListener('pointerdown', (e) => {
      if (e.target === entry.inDot || e.target === entry.outDot || e.target === entry.del) return;
      e.stopPropagation();
      dragging = true;
      moved = false;
      startClient = { x: e.clientX, y: e.clientY };
      startPos = { ...patchStore.getNode(nodeId).pos };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    // --- delete ---
    entry.del.addEventListener('pointerdown', (e) => e.stopPropagation());
    entry.del.addEventListener('click', (e) => {
      e.stopPropagation();
      patchStore.removeNode(nodeId);
      refresh();
    });

    // --- unwire (tap the input dot) ---
    entry.inDot.addEventListener('pointerdown', (e) => e.stopPropagation());
    entry.inDot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (patchStore.getNode(nodeId)?.in.src) {
        patchStore.unwire(nodeId);
        refresh();
      }
    });

    // --- wire (drag from the output dot) ---
    entry.outDot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const source = patchStore.getNode(nodeId);
      const a = portPos(source, 'out');
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
        const targetEntry = [...nodeEls.entries()].find(([, en]) => en.inDot === dropEl);
        if (targetEntry) {
          patchStore.wire(targetEntry[0], nodeId);
          refresh();
        }
      }
      window.addEventListener('pointermove', onWireMove);
      window.addEventListener('pointerup', onWireUp);
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

  // --- add-node button (a minimal stand-in - palette.js in Phase 4
  // replaces this with a real "pick a prefab" picker; this just proves
  // out the add/drag/wire mechanics with a blank, slot-less node) ---
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
    patchStore.addNode({ pos: { x: center.x - NODE_W / 2, y: center.y - NODE_H / 2 } });
    refresh();
  });
  container.appendChild(addBtn);

  refresh();
  return { refresh };
}

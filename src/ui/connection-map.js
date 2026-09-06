// createConnectionMap({ parent }) - a toggleable, read-only diagram of
// every node and its `in: {...}` wiring, appended into the SAME
// previewLayer node preview cards float in (see ui/preview-panel.js) -
// pinned to the bottom of it (see index.html's .connection-map: right
// 8px/bottom 0, same column preview cards anchor to) so it always sits
// below every node's own preview card rather than competing with them
// for space. Each node is one plain box styled exactly like a preview
// card (.node-preview) - a bare outline and a label, no fill - stacked
// in one column ordered by dependency depth (a node with no in-graph
// inputs first, anything wired to it below that, and so on - the same
// `sourceKey.split('.')[0]` parsing graph.js's own cookOrder() already
// does to walk the dependency graph), with a thin connector line drawn
// between each real `in` wire once box positions are known. Not a real
// node editor - no dragging, no editing - click a box to jump to that
// node in the code (see main.js's jumpToNode(), passed in as onNodeClick).
export function createConnectionMap({ parent }) {
  const dom = document.createElement('div');
  dom.className = 'connection-map';
  dom.hidden = true;
  parent.appendChild(dom);

  function setVisible(visible) {
    dom.hidden = !visible;
  }

  // depth(id) - longest dependency path from a node with no (in-graph)
  // inputs, memoized across this one update() call. `seen` guards against
  // an accidental cycle (a real feedback loop always routes through a
  // Delay/Lag node whose OWN `in` doesn't point directly back, so this
  // shouldn't normally trigger - just a safety net against an infinite
  // recursion if it somehow does).
  function makeDepthFn(graph) {
    const cache = new Map();
    function depth(id, seen) {
      if (cache.has(id)) return cache.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      const node = graph.nodes.get(id);
      let d = 0;
      if (node) {
        for (const sourceKey of Object.values(node.inputs)) {
          const srcId = sourceKey.split('.')[0];
          if (srcId !== id && graph.nodes.has(srcId)) d = Math.max(d, depth(srcId, seen) + 1);
        }
      }
      cache.set(id, d);
      return d;
    }
    return (id) => depth(id, new Set());
  }

  // update(graph, onNodeClick) - cheap to call every tick (main.js does)
  // since it bails out immediately while hidden; only actually rebuilds
  // the diagram while toggled on, so the map always reflects the CURRENT
  // graph/errors the moment you open it rather than whatever it looked
  // like the last time it was visible.
  function update(graph, onNodeClick) {
    if (dom.hidden) return;
    dom.innerHTML = '';

    const depth = makeDepthFn(graph);
    const ids = [...graph.nodes.keys()].sort((a, b) => depth(a) - depth(b));

    const boxes = new Map(); // id -> box element, for the edge pass below
    for (const id of ids) {
      const node = graph.nodes.get(id);
      const box = document.createElement('div');
      box.className = 'cm-box';
      if (node.error) box.classList.add('cm-box-error');
      else if (node.bypassed) box.classList.add('cm-box-bypassed');
      const label = document.createElement('div');
      label.className = 'cm-box-label';
      label.textContent = id;
      box.appendChild(label);
      box.addEventListener('click', () => onNodeClick(id));
      dom.appendChild(box);
      boxes.set(id, box);
    }

    // Edges: a plain vertical connector between each real `in` wire's two
    // boxes - offsetTop/offsetHeight only mean anything once the boxes
    // above are actually in the DOM, so this has to be a second pass.
    // Depth ordering means a source box is normally directly above its
    // target, but not always adjacent (a value can skip several depths
    // downstream) - a plain vertical line still reads fine either way,
    // just taller.
    for (const id of ids) {
      const node = graph.nodes.get(id);
      const toBox = boxes.get(id);
      for (const sourceKey of Object.values(node.inputs)) {
        const srcId = sourceKey.split('.')[0];
        const fromBox = boxes.get(srcId);
        if (!fromBox) continue; // wired to something outside the current graph (e.g. a typo) - nothing to draw
        const top = fromBox.offsetTop + fromBox.offsetHeight;
        const height = toBox.offsetTop - top;
        if (height <= 0) continue;
        const line = document.createElement('div');
        line.className = 'cm-edge';
        line.style.top = `${top}px`;
        line.style.height = `${height}px`;
        dom.appendChild(line);
      }
    }
  }

  return { dom, setVisible, update };
}

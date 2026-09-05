const SVG_NS = 'http://www.w3.org/2000/svg';
const COL_W = 170;
const ROW_H = 46;
const BOX_W = 140;
const BOX_H = 28;

// createConnectionMap({ parent }) - a toggleable, read-only SVG overlay
// (hidden by default) showing every node as a box and every `in: {...}`
// wire as an arrow, auto-laid-out into columns by dependency depth (a
// node with no in-graph inputs sits in column 0; anything wired to it
// sits one column to the right, and so on) - the same
// `sourceKey.split('.')[0]` parsing graph.js's own cookOrder() already
// does to walk the dependency graph, just for drawing instead of
// execution order. Not a real node editor - no dragging, no editing -
// click a box to jump to that node in the code (see main.js's
// jumpToNode(), passed in as onNodeClick).
export function createConnectionMap({ parent }) {
  const dom = document.createElement('div');
  dom.className = 'connection-map';
  dom.hidden = true;

  const svg = document.createElementNS(SVG_NS, 'svg');
  const defs = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'cm-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const arrowHead = document.createElementNS(SVG_NS, 'path');
  arrowHead.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  arrowHead.setAttribute('class', 'cm-arrowhead');
  marker.appendChild(arrowHead);
  defs.appendChild(marker);
  svg.appendChild(defs);
  dom.appendChild(svg);
  parent.appendChild(dom);

  function toggle() {
    dom.hidden = !dom.hidden;
    return !dom.hidden;
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
  // the SVG while toggled on, so the map always reflects the CURRENT
  // graph/errors the moment you open it rather than whatever it looked
  // like the last time it was visible.
  function update(graph, onNodeClick) {
    if (dom.hidden) return;
    while (svg.lastChild !== defs) svg.removeChild(svg.lastChild);

    const depth = makeDepthFn(graph);
    const ids = [...graph.nodes.keys()];
    const columns = new Map(); // depth -> [ids in that column]
    for (const id of ids) {
      const d = depth(id);
      if (!columns.has(d)) columns.set(d, []);
      columns.get(d).push(id);
    }

    const positions = new Map(); // id -> { x, y } (box's own top-left)
    for (const [d, colIds] of columns) {
      colIds.forEach((id, row) => positions.set(id, { x: 12 + d * COL_W, y: 12 + row * ROW_H }));
    }

    const maxCol = Math.max(0, ...columns.keys());
    const maxRows = Math.max(1, ...[...columns.values()].map((a) => a.length));
    svg.setAttribute('viewBox', `0 0 ${24 + (maxCol + 1) * COL_W} ${24 + maxRows * ROW_H}`);

    // Edges first, so node boxes draw on top of the lines feeding into them.
    for (const id of ids) {
      const node = graph.nodes.get(id);
      const to = positions.get(id);
      for (const sourceKey of Object.values(node.inputs)) {
        const srcId = sourceKey.split('.')[0];
        const from = positions.get(srcId);
        if (!from) continue; // wired to something outside the current graph (e.g. a typo) - nothing to draw
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'cm-edge');
        line.setAttribute('x1', from.x + BOX_W);
        line.setAttribute('y1', from.y + BOX_H / 2);
        line.setAttribute('x2', to.x);
        line.setAttribute('y2', to.y + BOX_H / 2);
        line.setAttribute('marker-end', 'url(#cm-arrow)');
        svg.appendChild(line);
      }
    }

    for (const id of ids) {
      const node = graph.nodes.get(id);
      const { x, y } = positions.get(id);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'cm-node');
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', BOX_W);
      rect.setAttribute('height', BOX_H);
      rect.setAttribute('rx', 4);
      rect.setAttribute('class', node.error ? 'cm-box cm-box-error' : node.bypassed ? 'cm-box cm-box-bypassed' : 'cm-box');
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', x + BOX_W / 2);
      text.setAttribute('y', y + BOX_H / 2 + 4);
      text.textContent = id;
      g.append(rect, text);
      g.addEventListener('click', () => onNodeClick(id));
      svg.appendChild(g);
    }
  }

  return { dom, toggle, update };
}

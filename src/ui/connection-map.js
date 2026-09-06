const SVG_NS = 'http://www.w3.org/2000/svg';
const BOX_W = 130; // must match .connection-map/.cm-box's own CSS width
const ROUTE_LANE_W = 10; // horizontal gap between parallel routed lines
const ROUTE_MARGIN = 24; // how far the innermost routed line juts left of the column

// createConnectionMap({ parent }) - an always-on, read-only diagram of
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
// does to walk the dependency graph).
//
// Most wires just feed the box directly below them - those draw as a
// plain straight connector (see .cm-edge). A wire that instead skips
// past a node (its target isn't the very next one down) or runs
// backwards (a feedback loop, where the target is ABOVE the source) is
// drawn differently: routed out to the LEFT of the column with an
// arrowhead, so it can never be mistaken for "connects to the node it
// happens to be drawn across." Not a real node editor - no dragging, no
// editing - click a box to jump to that node in the code (see main.js's
// jumpToNode(), passed in as onNodeClick).
export function createConnectionMap({ parent }) {
  const dom = document.createElement('div');
  dom.className = 'connection-map';
  parent.appendChild(dom);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cm-routed');
  const defs = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'cm-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
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

  // update(graph, onNodeClick) - called every tick (main.js does); cheap
  // enough (a handful of DOM nodes for any patch this project's actually
  // used with) to just always rebuild rather than trying to diff.
  function update(graph, onNodeClick) {
    dom.querySelectorAll('.cm-box, .cm-edge').forEach((el) => el.remove());
    while (svg.lastChild !== defs) svg.removeChild(svg.lastChild);

    const depth = makeDepthFn(graph);
    const ids = [...graph.nodes.keys()].sort((a, b) => depth(a) - depth(b));
    const orderOf = new Map(ids.map((id, i) => [id, i]));

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

    // Two passes over the same edges: plain adjacent-forward connectors
    // first (cheap div lines, unchanged from before), then everything
    // else routed to the left via the svg - collected here so each
    // routed line can be given its own lane (routedCount) without two
    // unrelated loops racing to assign lanes.
    const routed = [];
    for (const id of ids) {
      const node = graph.nodes.get(id);
      const toBox = boxes.get(id);
      for (const sourceKey of Object.values(node.inputs)) {
        const srcId = sourceKey.split('.')[0];
        const fromBox = boxes.get(srcId);
        if (!fromBox) continue; // wired to something outside the current graph (e.g. a typo) - nothing to draw
        const sourceOrder = orderOf.get(srcId);
        const targetOrder = orderOf.get(id);
        if (targetOrder === sourceOrder + 1) {
          const top = fromBox.offsetTop + fromBox.offsetHeight;
          const height = toBox.offsetTop - top;
          if (height <= 0) continue;
          const line = document.createElement('div');
          line.className = 'cm-edge';
          line.style.top = `${top}px`;
          line.style.height = `${height}px`;
          dom.appendChild(line);
        } else {
          routed.push({ fromBox, toBox });
        }
      }
    }

    if (routed.length === 0) {
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      return;
    }

    const domHeight = dom.scrollHeight;
    const leftExtent = ROUTE_MARGIN + (routed.length - 1) * ROUTE_LANE_W + 12;
    svg.setAttribute('width', `${leftExtent + BOX_W}`);
    svg.setAttribute('height', `${domHeight}`);
    svg.style.left = `${-leftExtent}px`;
    // Local x=0 in this svg lines up with the column's own left edge
    // (dom-local x=0) - every path point below is expressed relative to
    // that, then shifted by boxLeftX so it lands correctly once the svg
    // itself is offset left by leftExtent.
    const boxLeftX = leftExtent;

    routed.forEach(({ fromBox, toBox }, i) => {
      const jut = ROUTE_MARGIN + i * ROUTE_LANE_W;
      const fromY = fromBox.offsetTop + fromBox.offsetHeight / 2;
      const toY = toBox.offsetTop + toBox.offsetHeight / 2;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute(
        'd',
        `M ${boxLeftX} ${fromY} H ${boxLeftX - jut} V ${toY} H ${boxLeftX - 4}`
      );
      path.setAttribute('class', 'cm-routed-edge');
      path.setAttribute('marker-end', 'url(#cm-arrow)');
      svg.appendChild(path);
    });
  }

  return { dom, update };
}

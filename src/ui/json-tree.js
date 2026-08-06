// renderJsonTree(value) -> a DOM node for showing an object/array preview
// (see main.js's updatePreviews()) with one entry per line instead of a
// single JSON.stringify() string, and a <details>/<summary> per nested
// object/array so it can be expanded/collapsed. Primitives render as a
// plain text node, same as before.
function formatPrimitive(value) {
  return typeof value === 'number' ? String(Math.round(value * 1e6) / 1e6) : JSON.stringify(value);
}

// `collapsedPaths` is a Set of dotted key-paths ("" for the root, "a.b"
// for a nested key) the user has explicitly closed - see
// ui/preview-panel.js's _createRow(), which hands each preview card's own
// Set in so it survives main.js rebuilding this tree from scratch every
// tick (the previewed value can change tick to tick). Without it, every
// node would silently snap back open the instant after being collapsed.
export function renderJsonTree(value, collapsedPaths = new Set(), path = '') {
  if (value === null || typeof value !== 'object') {
    return document.createTextNode(formatPrimitive(value));
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);

  const details = document.createElement('details');
  details.className = 'json-tree-node';
  details.open = !collapsedPaths.has(path); // expanded by default, unless the user closed this exact node before

  details.addEventListener('toggle', () => {
    if (details.open) collapsedPaths.delete(path);
    else collapsedPaths.add(path);
  });

  const summary = document.createElement('summary');
  summary.className = 'json-tree-summary';
  summary.textContent = isArray ? `Array(${entries.length})` : `Object {${entries.length}}`;
  details.appendChild(summary);

  const children = document.createElement('div');
  children.className = 'json-tree-children';
  for (const [k, v] of entries) {
    const line = document.createElement('div');
    line.className = 'json-tree-line';
    const childPath = path ? `${path}.${k}` : String(k);

    const keySpan = document.createElement('span');
    keySpan.className = 'json-tree-key';
    keySpan.textContent = `${k}: `;

    if (v !== null && typeof v === 'object') {
      line.append(keySpan, renderJsonTree(v, collapsedPaths, childPath));
    } else {
      const valSpan = document.createElement('span');
      valSpan.className = 'json-tree-val';
      valSpan.textContent = formatPrimitive(v);
      line.append(keySpan, valSpan);
    }
    children.appendChild(line);
  }
  details.appendChild(children);
  return details;
}

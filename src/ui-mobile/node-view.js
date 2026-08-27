// mountNodeView(container, patchStore) - the tap-to-open parameter
// panel: canvas.js's onNodeTap fires show(nodeId), which slides up a
// bottom sheet listing that node's slots, one control row per leaf in
// each slot's `args` tree - built with the SAME createControlRow(req,
// onChange) control-panel.js already uses for the desktop editor's live
// widgets (see that file's own comment), just wired to
// patchStore.setArgValue() instead of setControlValue(). Editing a
// value here edits the PATCH JSON directly, same as everything else in
// ui-mobile/ - the debounced recompile+reload patch-store already does
// on every mutation is what makes the change actually show up.
import { createControlRow } from '../ui/control-panel.js';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !v.$control && !v.$ref;
}

// Walks one slot's `args` tree, yielding { path, value } for every LEAF -
// a leaf is anything that isn't a plain nested object: a literal, an
// array (edited as one opaque value, not recursed into - see the plan's
// non-goals), a `{$control: ...}` descriptor, or a `{$ref: ...}`.
function* walkArgs(node, path = []) {
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) yield* walkArgs(value, [...path, key]);
  } else {
    yield { path, value: node };
  }
}

// Turns one arg-tree leaf into a controls.js-shaped request object
// (createControlRow's own input shape) plus a function that turns a
// freshly-entered raw value back into what should be WRITTEN to that
// leaf (a $control leaf keeps its descriptor, just with a new `default`;
// a plain literal is replaced outright).
function requestForLeaf(path, value) {
  const name = path.join('.') || 'value';
  if (value && typeof value === 'object' && value.$control) {
    const { $control, ...opts } = value;
    const current = opts.default ?? (opts.min != null ? (opts.min + opts.max) / 2 : 0);
    return { req: { name, type: $control, opts, value: current }, toStored: (v) => ({ ...value, default: v }) };
  }
  if (value && typeof value === 'object' && value.$ref) {
    return { readonly: `← ${value.$ref}`, name };
  }
  if (typeof value === 'boolean') {
    return { req: { name, type: 'button', opts: {}, value }, toStored: (v) => v };
  }
  if (typeof value === 'string') {
    return { req: { name, type: 'input', opts: { type: 'text' }, value }, toStored: (v) => v };
  }
  // number, or anything else JSON-literal (null, etc.) - editable as a
  // plain numeric field either way (typing 0 for a non-number is a
  // reasonable fallback, not a crash).
  return { req: { name, type: 'input', opts: { type: 'number' }, value: Number(value) || 0 }, toStored: (v) => v };
}

// createControlRow only builds the DOM + wires the change listener - it
// deliberately never sets the widget's OWN initial displayed value
// (control-panel.js's ControlPanel does that separately, in its
// per-tick _syncValue(), since it has to keep re-syncing anyway). A
// one-shot panel like this one still needs to set it once, right after
// creation, or a range input in particular silently shows the browser's
// own default midpoint (based on whatever min/max it had at ELEMENT
// CREATION, before this code even sets them) instead of the slot's
// actual current value.
function applyInitialValue(entry, req) {
  if (req.type === 'slider') {
    entry.input.value = req.value;
    entry.valueLabel.textContent = Number(req.value).toFixed(2);
  } else if (req.type === 'button') {
    entry.input.classList.toggle('active', !!req.value);
    entry.input.textContent = req.value ? 'on' : 'off';
  } else {
    entry.input.value = req.value;
  }
}

export function mountNodeView(container, patchStore) {
  const sheet = document.createElement('div');
  sheet.dataset.mobileNodeSheet = ''; // precise hook for automated tests/tooling
  sheet.style.cssText = `
    position: absolute; left: 0; right: 0; bottom: 0; max-height: 70%;
    background: #1b1d22; border-top: 2px solid #3a3f4a; border-radius: 16px 16px 0 0;
    color: #eee; font: 13px sans-serif; overflow-y: auto; z-index: 10;
    transform: translateY(110%); transition: transform 160ms ease-out;
    box-sizing: border-box; padding: 14px 16px 24px; pointer-events: auto;
  `;
  container.appendChild(sheet);

  let openNodeId = null;

  function renderSlotRow(nodeId, slot, slotIndex) {
    const box = document.createElement('div');
    box.style.cssText = `border: 1px solid #333844; border-radius: 10px; padding: 8px 10px; margin-bottom: 10px;`;

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;`;
    const title = document.createElement('span');
    title.textContent = slot.prefab;
    title.style.cssText = `font-weight: 600; color: #9fd6ff;`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'remove';
    removeBtn.style.cssText = `background: none; border: 1px solid #a83a3a; color: #e08a8a; border-radius: 6px; font-size: 11px; padding: 3px 8px;`;
    removeBtn.addEventListener('click', () => {
      patchStore.removeSlot(nodeId, slotIndex);
      renderNode(nodeId);
    });
    header.append(title, removeBtn);
    box.appendChild(header);

    if (slot.prefab === 'raw') {
      const code = document.createElement('div');
      code.textContent = slot.code || '';
      code.style.cssText = `font-family: monospace; font-size: 11px; color: #999; white-space: pre-wrap; padding: 4px 0;`;
      box.appendChild(code);
      return box;
    }

    for (const { path, value } of walkArgs(slot.args, [])) {
      const built = requestForLeaf(path, value);
      if (built.readonly) {
        const row = document.createElement('div');
        row.style.cssText = `display: flex; justify-content: space-between; color: #777; padding: 4px 0; font-size: 12px;`;
        row.textContent = `${built.name}: ${built.readonly}`;
        box.appendChild(row);
        continue;
      }
      const entry = createControlRow(built.req, (raw) => {
        patchStore.setArgValue(nodeId, slotIndex, path, built.toStored(raw));
      });
      applyInitialValue(entry, built.req);
      entry.row.style.cssText += `display: flex; align-items: center; gap: 8px; padding: 4px 0;`;
      box.appendChild(entry.row);
    }

    return box;
  }

  function renderNode(nodeId) {
    const node = patchStore.getNode(nodeId);
    sheet.innerHTML = '';
    if (!node) {
      hide();
      return;
    }

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;`;
    const title = document.createElement('div');
    title.textContent = node.id;
    title.style.cssText = `font-size: 16px; font-weight: 700;`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'done';
    closeBtn.style.cssText = `background: #3a9d6e; border: none; color: #fff; border-radius: 8px; padding: 8px 14px; font-size: 13px;`;
    closeBtn.addEventListener('click', hide);
    header.append(title, closeBtn);
    sheet.appendChild(header);

    if (node.slots.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No slots yet - add one from the palette.';
      empty.style.cssText = `color: #888; padding: 8px 0;`;
      sheet.appendChild(empty);
    }
    node.slots.forEach((slot, i) => sheet.appendChild(renderSlotRow(nodeId, slot, i)));
  }

  function show(nodeId) {
    openNodeId = nodeId;
    renderNode(nodeId);
    sheet.style.transform = 'translateY(0)';
  }

  function hide() {
    openNodeId = null;
    sheet.style.transform = 'translateY(110%)';
  }

  // If something else mutates the currently-open node (e.g. a slot
  // added elsewhere), refresh() re-renders it in place without closing.
  function refresh() {
    if (openNodeId) renderNode(openNodeId);
  }

  return { show, hide, refresh };
}

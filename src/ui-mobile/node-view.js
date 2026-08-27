// mountNodeView(container, patchStore) - the tap-to-open parameter
// panel: canvas.js's onNodeTap fires show(nodeId), which slides up a
// bottom sheet listing that node's slots as compact rows. Tapping a
// slot pops its full argument list into the SAME sheet (renderSlotDetail)
// as a scrollable list of control rows - one per leaf in that slot's
// `args` tree - built with the SAME createControlRow(req, onChange)
// control-panel.js already uses for the desktop editor's live widgets
// (see that file's own comment), just wired to patchStore.setArgValue()
// instead of setControlValue(). Editing a value here edits the PATCH
// JSON directly, same as everything else in ui-mobile/ - the debounced
// recompile+reload patch-store already does on every mutation is what
// makes the change actually show up.
import { createControlRow } from '../ui/control-panel.js';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !v.$control && !v.$ref && !('$expr' in v);
}

// Walks one slot's `args` tree, yielding { path, value } for every LEAF -
// a leaf is anything that isn't a plain nested object: a literal, an
// array (edited as one opaque value, not recursed into - see the plan's
// non-goals), a `{$control: ...}` descriptor, a `{$ref: ...}`, or a
// `{$expr: ...}` (a raw JS expression - see requestForLeaf below).
function* walkArgs(node, path = []) {
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) yield* walkArgs(value, [...path, key]);
  } else {
    yield { path, value: node };
  }
}

// Best-effort text to seed the expression input with when a leaf is
// switched INTO expr mode - starting from whatever it currently
// displays (its number/bool/string) rather than a blank box, since
// "t * <old value>" is a far more common edit than "t" from scratch.
function seedExprFrom(req) {
  if (req.type === 'slider' || req.opts?.type === 'number') return String(req.value);
  if (req.type === 'button') return req.value ? 'true' : 'false';
  return JSON.stringify(req.value ?? '');
}

// Turns one arg-tree leaf into a controls.js-shaped request object
// (createControlRow's own input shape) plus a function that turns a
// freshly-entered raw value back into what should be WRITTEN to that
// leaf (a $control leaf keeps its descriptor, just with a new `default`;
// a plain literal is replaced outright). A `{$expr: "..."}` leaf is
// reported separately (`expr: true`) - patch-compiler.js's
// renderArgTree() splices that string into the generated code verbatim
// (not JSON-stringified), so it runs as real JS with `t` (and `state`,
// `inputs`) in scope, letting a param be driven by time instead of
// pinned to one fixed value.
function requestForLeaf(path, value) {
  const name = path.join('.') || 'value';
  if (value && typeof value === 'object' && value.$expr != null) {
    return { expr: true, name, exprValue: String(value.$expr) };
  }
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

const EXPR_TOGGLE_STYLE = `background: #333; border: 1px solid #555; color: #9ece6a; border-radius: 4px; padding: 3px 7px; font: 11px monospace; flex-shrink: 0;`;

export function mountNodeView(container, patchStore, { onAddBlock } = {}) {
  const sheet = document.createElement('div');
  sheet.dataset.mobileNodeSheet = ''; // precise hook for automated tests/tooling
  sheet.style.cssText = `
    position: absolute; left: 0; right: 0; bottom: 0; max-height: 70%;
    background: #1b1d22; border-top: 2px solid #3a3f4a; border-radius: 16px 16px 0 0;
    color: #eee; font: 13px sans-serif; overflow-y: auto; z-index: 10;
    transform: translateY(100vh); transition: transform 160ms ease-out;
    box-sizing: border-box; padding: 14px 16px 24px; pointer-events: auto;
  `;
  container.appendChild(sheet);

  let openNodeId = null;
  let openSlotIndex = null; // null = node overview, an index = that slot's full-options view

  // One leaf's row, in whichever of its two modes it's currently in - a
  // fixed value (slider/input/button, same as always) with a small "t"
  // button that swaps it INTO expr mode, or a raw-expression text field
  // (while in that mode) with a "#" button that swaps it back to a
  // plain number.
  function buildLeafRow(nodeId, slotIndex, path, value) {
    const built = requestForLeaf(path, value);

    if (built.readonly) {
      const row = document.createElement('div');
      row.style.cssText = `display: flex; justify-content: space-between; color: #777; padding: 4px 0; font-size: 12px;`;
      row.textContent = `${built.name}: ${built.readonly}`;
      return row;
    }

    if (built.expr) {
      const row = document.createElement('div');
      row.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 4px 0;`;
      const label = document.createElement('span');
      label.textContent = built.name;
      label.style.cssText = `color: #999; font-size: 11px; min-width: 56px; flex-shrink: 0;`;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = built.exprValue;
      input.placeholder = 't';
      input.spellcheck = false;
      input.style.cssText = `flex: 1; min-width: 0; background: #111; color: #9ece6a; border: 1px solid #444; border-radius: 3px; font: 12px monospace; padding: 5px 6px;`;
      input.addEventListener('input', () => {
        patchStore.setArgValue(nodeId, slotIndex, path, { $expr: input.value });
      });
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.textContent = '#';
      toggleBtn.title = 'switch to a fixed value';
      toggleBtn.style.cssText = EXPR_TOGGLE_STYLE;
      toggleBtn.addEventListener('click', () => {
        const num = parseFloat(input.value);
        patchStore.setArgValue(nodeId, slotIndex, path, Number.isFinite(num) ? num : 0);
        renderSlotDetail(nodeId, slotIndex);
      });
      row.append(label, input, toggleBtn);
      return row;
    }

    const entry = createControlRow(built.req, (raw) => {
      patchStore.setArgValue(nodeId, slotIndex, path, built.toStored(raw));
    });
    applyInitialValue(entry, built.req);
    entry.row.style.cssText += `display: flex; align-items: center; gap: 8px; padding: 4px 0;`;

    const exprBtn = document.createElement('button');
    exprBtn.type = 'button';
    exprBtn.textContent = 't';
    exprBtn.title = 'set relative to time (t)';
    exprBtn.style.cssText = EXPR_TOGGLE_STYLE;
    exprBtn.addEventListener('click', () => {
      patchStore.setArgValue(nodeId, slotIndex, path, { $expr: seedExprFrom(built.req) });
      renderSlotDetail(nodeId, slotIndex);
    });
    entry.row.appendChild(exprBtn);

    return entry.row;
  }

  // Compact overview row - title + remove only, no inline controls (a
  // node with several slots, each with several params, turned into one
  // long stack of every control at once - tapping a slot now pops its
  // own params into a dedicated scrollable view instead).
  function renderSlotSummary(nodeId, slot, slotIndex) {
    const box = document.createElement('div');
    box.style.cssText = `border: 1px solid #333844; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; cursor: pointer;`;

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;
    const title = document.createElement('span');
    title.textContent = slot.prefab;
    title.style.cssText = `font-weight: 600; color: #9fd6ff;`;
    const chevron = document.createElement('span');
    chevron.textContent = '›';
    chevron.style.cssText = `color: #666; font-size: 18px; line-height: 1;`;
    header.append(title, chevron);
    box.appendChild(header);

    box.addEventListener('click', () => {
      openSlotIndex = slotIndex;
      renderSlotDetail(nodeId, slotIndex);
    });

    return box;
  }

  function renderNode(nodeId) {
    openSlotIndex = null;
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
      empty.textContent = 'No slots yet - add one below.';
      empty.style.cssText = `color: #888; padding: 8px 0;`;
      sheet.appendChild(empty);
    }
    node.slots.forEach((slot, i) => sheet.appendChild(renderSlotSummary(nodeId, slot, i)));

    if (onAddBlock) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ add block';
      addBtn.style.cssText = `
        width: 100%; margin-top: 4px; padding: 10px; border-radius: 8px; border: 1px dashed #555;
        background: none; color: #9fd6ff; font: 13px sans-serif;
      `;
      addBtn.addEventListener('click', () => onAddBlock(nodeId));
      sheet.appendChild(addBtn);
    }
  }

  // The "pop up" - every option for ONE slot, as a scrollable list (the
  // sheet itself already scrolls via overflow-y: auto above), reached by
  // tapping that slot's row in the overview.
  function renderSlotDetail(nodeId, slotIndex) {
    const node = patchStore.getNode(nodeId);
    const slot = node?.slots[slotIndex];
    sheet.innerHTML = '';
    if (!node || !slot) {
      openSlotIndex = null;
      renderNode(nodeId);
      return;
    }

    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px;`;
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '‹ back';
    backBtn.style.cssText = `background: #2c2c2c; border: 1px solid #444; color: #eee; border-radius: 8px; padding: 8px 12px; font-size: 13px;`;
    backBtn.addEventListener('click', () => {
      openSlotIndex = null;
      renderNode(nodeId);
    });
    const title = document.createElement('div');
    title.textContent = slot.prefab;
    title.style.cssText = `font-size: 15px; font-weight: 700; color: #9fd6ff; flex: 1; text-align: center;`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'remove';
    removeBtn.style.cssText = `background: none; border: 1px solid #a83a3a; color: #e08a8a; border-radius: 6px; font-size: 11px; padding: 8px 10px;`;
    removeBtn.addEventListener('click', () => {
      patchStore.removeSlot(nodeId, slotIndex);
      openSlotIndex = null;
      renderNode(nodeId);
    });
    header.append(backBtn, title, removeBtn);
    sheet.appendChild(header);

    if (slot.prefab === 'raw') {
      const code = document.createElement('div');
      code.textContent = slot.code || '';
      code.style.cssText = `font-family: monospace; font-size: 11px; color: #999; white-space: pre-wrap; padding: 4px 0;`;
      sheet.appendChild(code);
      return;
    }

    for (const { path, value } of walkArgs(slot.args, [])) {
      sheet.appendChild(buildLeafRow(nodeId, slotIndex, path, value));
    }
  }

  function show(nodeId) {
    openNodeId = nodeId;
    renderNode(nodeId);
    sheet.style.transform = 'translateY(0)';
  }

  function hide() {
    openNodeId = null;
    openSlotIndex = null;
    sheet.style.transform = 'translateY(100vh)';
  }

  // If something else mutates the currently-open node (e.g. a slot
  // added elsewhere), refresh() re-renders it in place without closing -
  // whichever of the overview/slot-detail views is currently open.
  function refresh() {
    if (!openNodeId) return;
    if (openSlotIndex != null) renderSlotDetail(openNodeId, openSlotIndex);
    else renderNode(openNodeId);
  }

  return { show, hide, refresh };
}

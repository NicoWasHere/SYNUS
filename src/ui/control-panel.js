import { setControlValue } from '../core/lib/controls.js';

const STACK_OFFSET = 34; // approx widget row height + gap

// createControlRow(req, onChange) - builds one widget row's DOM for a
// controls.js-shaped request ({ name, type, opts, value }, same shape
// beginControlsTick()/getControlRequests() produce), calling
// onChange(newValue) whenever the user interacts with it. Deliberately
// knows nothing about WHERE that value goes - ControlPanel below wires
// it to setControlValue() (the live desktop-editor widgets), and
// ui-mobile/node-view.js (the mobile block-patch mode's tap-to-open
// parameter panel) wires the exact same row-building code to
// patchStore.setArgValue() instead. One DOM implementation, two very
// different value destinations.
export function createControlRow(req, onChange) {
  const row = document.createElement('div');
  row.className = 'control-widget';
  const entry = { row };

  const label = document.createElement('span');
  label.className = 'control-widget-label';
  label.textContent = req.name;
  row.appendChild(label);
  entry.label = label;

  if (req.type === 'slider') {
    const rangeInput = document.createElement('input');
    rangeInput.type = 'range';
    rangeInput.min = req.opts.min;
    rangeInput.max = req.opts.max;
    rangeInput.step = req.opts.step;
    rangeInput.addEventListener('input', () => onChange(parseFloat(rangeInput.value)));
    const valueLabel = document.createElement('span');
    valueLabel.className = 'control-widget-value';
    row.append(rangeInput, valueLabel);
    entry.input = rangeInput;
    entry.valueLabel = valueLabel;
    return entry;
  }

  if (req.type === 'button') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.addEventListener('click', () => onChange(!btn.classList.contains('active')));
    row.appendChild(btn);
    entry.input = btn;
    return entry;
  }

  if (req.type === 'colorPicker') {
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    // Some interaction paths on a native color swatch (picking a preset
    // rather than dragging the wheel/typing a hex code) only fire
    // 'change', not 'input' - listening to just 'input' meant the app
    // never learned about that pick at all: the native input still
    // LOOKED updated (its own internal state changed), nothing
    // downstream ever saw the new value, and the next resync (once
    // focus left the input, opening _syncValue's activeElement guard)
    // forced the swatch back to the stale app-side value - "works for
    // a second, then resets" the moment you click elsewhere.
    const onPick = () => onChange(colorInput.value);
    colorInput.addEventListener('input', onPick);
    colorInput.addEventListener('change', onPick);
    row.appendChild(colorInput);
    entry.input = colorInput;
    return entry;
  }

  // 'input'
  const textInput = document.createElement('input');
  textInput.type = req.opts.type === 'number' ? 'number' : 'text';
  textInput.addEventListener('input', () => {
    onChange(req.opts.type === 'number' ? parseFloat(textInput.value) || 0 : textInput.value);
  });
  row.appendChild(textInput);
  entry.input = textInput;
  return entry;
}

function parseKey(id) {
  const match = id.match(/^(.*)#(\d+)$/);
  return match ? { baseId: match[1], index: Number(match[2]) } : { baseId: id, index: 1 };
}

// One floating widget per live slider()/button()/input() call, anchored
// to the top-right of the node that called it - same "lives inside the
// editor's own scroll layer, right-edge column" convention as
// PreviewPanel (see main.js, which computes each node's line via
// ui/node-parser.js), rather than sitting inline after the call's own
// text: a control needs to stay associated with its OWNING NODE, not
// with wherever in that node's code it happens to be written.
//
// requests is keyed by call site ("nodeId" or "nodeId#2", ... - see
// controls.js's use()), the same convention preview() uses, which is
// what lets this reuse PreviewPanel's own per-node stacking logic
// (previewPanel.getStackBottom()) to sit right below any preview card(s)
// already shown for that node instead of overlapping them - a real case
// since a node commonly does both preview(value) and slider(...) for the
// same value (see the beatmatch example this was built for).
//
// A control only exists here for ticks where its call actually ran (see
// controls.js's beginControlsTick()/getControlRequests()) - sync() is
// called every tick with exactly those requests, the same convention
// PreviewPanel uses for preview().
export class ControlPanel {
  constructor(parent, previewPanel) {
    this.parent = parent;
    this.previewPanel = previewPanel;
    this.entries = new Map(); // call-site key -> { row, input, ... }
  }

  sync(requests) {
    for (const key of [...this.entries.keys()]) {
      if (!requests.has(key)) {
        this.entries.get(key).row.remove();
        this.entries.delete(key);
      }
    }
    for (const [key, req] of requests) {
      let entry = this.entries.get(key);
      if (!entry) {
        entry = this._createRow(req);
        this.entries.set(key, entry);
        this.parent.appendChild(entry.row);
      } else if (entry.name !== req.name) {
        // Same call site (e.g. still the first slider() call in this
        // node), but the name string itself changed - the row/DOM element
        // is reused rather than recreated (entries is keyed by call site,
        // not name), so without this its label AND its input listener
        // (bound to the OLD name via closure) would silently keep
        // reading/writing the old name's value forever, orphaning the new
        // name at its untouched default.
        entry.name = req.name;
        entry.label.textContent = req.name;
      }
      this._syncValue(entry, req);
    }
    // Positions are re-applied every tick, not just on create - the
    // preview stack a control needs to sit below can change tick to
    // tick (preview() is opt-in too), unlike a preview card's own
    // position, which only changes when the text itself is edited.
    for (const [key, entry] of this.entries) this._applyPosition(key, entry.row);
  }

  _applyPosition(key, row) {
    const { baseId, index } = parseKey(key);
    const base = this.previewPanel ? this.previewPanel.getStackBottom(baseId) : 4;
    row.style.top = `${base + (index - 1) * STACK_OFFSET}px`;
  }

  _createRow(req) {
    // entry.name is mutable (sync() above updates it if the same call
    // site later reports a different name) - createControlRow's onChange
    // below reads entry.name at fire time rather than closing over
    // req.name directly, so a rename takes effect immediately without
    // needing to recreate the DOM element.
    const entry = createControlRow(req, (value) => setControlValue(entry.name, value));
    entry.name = req.name;
    return entry;
  }

  // Pulls the widget's displayed value in line with controls.js's actual
  // current value - only when the widget ISN'T the thing the user is
  // actively dragging/typing into (document.activeElement), so an
  // external sync doesn't fight a keystroke or in-progress drag.
  _syncValue(entry, req) {
    if (req.type === 'slider') {
      // min/max/step come from opts, which controls.js recomputes fresh
      // every tick (unlike the DOM element, which only had these set
      // once at _createRow time) - keep the widget's range in sync so a
      // project can change them later (e.g. a slider whose max depends
      // on a live value), the same fix Pattern needed for the same
      // "construct once, ignore later arg changes" reason.
      entry.input.min = req.opts.min;
      entry.input.max = req.opts.max;
      entry.input.step = req.opts.step;
      // The numeric readout is a read-only display, not something a drag
      // could "fight" - update it unconditionally (req.value already
      // reflects the in-progress drag, via setControlValue -> controls.js's
      // values map -> read back into req.value the very next tick) rather
      // than gating it behind the same activeElement check that protects
      // the thumb's own .value below. Without this split, the label only
      // ever caught up once the slider lost focus (a click elsewhere),
      // which read as "frozen while dragging."
      entry.valueLabel.textContent = Number(req.value).toFixed(2);
    }
    if (document.activeElement === entry.input) return;
    if (req.type === 'slider') {
      entry.input.value = req.value;
    } else if (req.type === 'button') {
      entry.input.classList.toggle('active', !!req.value);
      entry.input.textContent = req.value ? 'on' : 'off';
    } else {
      entry.input.value = req.value;
    }
  }
}

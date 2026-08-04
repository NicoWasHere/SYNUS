import { setControlValue } from '../core/lib/controls.js';

const STACK_OFFSET = 34; // approx widget row height + gap

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
    const { name } = req;
    const row = document.createElement('div');
    row.className = 'control-widget';

    const label = document.createElement('span');
    label.className = 'control-widget-label';
    label.textContent = name;
    row.appendChild(label);

    if (req.type === 'slider') {
      const rangeInput = document.createElement('input');
      rangeInput.type = 'range';
      rangeInput.min = req.opts.min;
      rangeInput.max = req.opts.max;
      rangeInput.step = req.opts.step;
      rangeInput.addEventListener('input', () => setControlValue(name, parseFloat(rangeInput.value)));
      const valueLabel = document.createElement('span');
      valueLabel.className = 'control-widget-value';
      row.append(rangeInput, valueLabel);
      return { row, input: rangeInput, valueLabel };
    }

    if (req.type === 'button') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.addEventListener('click', () => setControlValue(name, !btn.classList.contains('active')));
      row.appendChild(btn);
      return { row, input: btn };
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
      const onPick = () => setControlValue(name, colorInput.value);
      colorInput.addEventListener('input', onPick);
      colorInput.addEventListener('change', onPick);
      row.appendChild(colorInput);
      return { row, input: colorInput };
    }

    // 'input'
    const textInput = document.createElement('input');
    textInput.type = req.opts.type === 'number' ? 'number' : 'text';
    textInput.addEventListener('input', () => {
      setControlValue(name, req.opts.type === 'number' ? parseFloat(textInput.value) || 0 : textInput.value);
    });
    row.appendChild(textInput);
    return { row, input: textInput };
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

import { setControlValue } from '../core/lib/controls.js';

// One floating widget per live slider()/button()/input() call, anchored
// next to the line it's declared on (see main.js, which finds that line
// via a regex over the source text and calls setPositions()) - same
// "lives inside the editor's own scroll layer" trick as PreviewPanel, so
// these scroll with the text for free.
//
// A control only exists here for ticks where its call actually ran (see
// controls.js's beginControlsTick()/getControlRequests()) - sync() is
// called every tick with exactly those requests, the same convention
// PreviewPanel uses for preview().
export class ControlPanel {
  constructor(parent) {
    this.parent = parent;
    this.entries = new Map(); // name -> { row, input }
    this.positions = new Map(); // name -> top px
  }

  setPositions(positions) {
    this.positions = positions;
    for (const [name, entry] of this.entries) {
      this._applyPosition(name, entry.row);
    }
  }

  sync(requests) {
    for (const name of [...this.entries.keys()]) {
      if (!requests.has(name)) {
        this.entries.get(name).row.remove();
        this.entries.delete(name);
      }
    }
    for (const [name, req] of requests) {
      let entry = this.entries.get(name);
      if (!entry) {
        entry = this._createRow(name, req);
        this._applyPosition(name, entry.row);
        this.entries.set(name, entry);
        this.parent.appendChild(entry.row);
      }
      this._syncValue(entry, req);
    }
  }

  _applyPosition(name, row) {
    const pos = this.positions.get(name);
    row.style.top = `${pos ? pos.top : 4}px`;
    row.style.left = `${pos ? pos.left : 4}px`;
  }

  _createRow(name, req) {
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
    if (document.activeElement === entry.input) return;
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
}

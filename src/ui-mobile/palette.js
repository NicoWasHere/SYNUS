// mountPalette(container, patchStore) - the "add a block" picker.
// show(nodeId) opens it (as a bottom sheet, same shape as node-view.js's
// own) listing every EFFECTS key from fx/registry.js (so a future effect
// added there shows up here automatically, zero extra code - the whole
// point of building on top of the registry instead of a hand-maintained
// list) plus a small fixed set of source/sink kinds. Tapping one appends
// a slot to `nodeId` via patchStore.addSlot with sensible starting args.
import { EFFECTS } from '../core/lib/fx/registry.js';

// Best-effort starting args for the common single-number/simple-object
// effects, so tapping one in the palette gives an immediately-useful
// slider rather than an empty/undefined argument. Deliberately NOT
// exhaustive (see the mobile-mode plan's non-goals) - anything not
// listed here falls back to a generic 0..1 slider, still perfectly
// editable afterward in node-view.js, just without a curated range.
const DEFAULT_ARGS = {
  rotate: { $control: 'slider', min: 0, max: 360, step: 1, default: 0 },
  scale: {
    x: { $control: 'slider', min: 0.1, max: 3, step: 0.01, default: 1 },
    y: { $control: 'slider', min: 0.1, max: 3, step: 0.01, default: 1 },
  },
  brightness: { $control: 'slider', min: -1, max: 1, step: 0.01, default: 0 },
  contrast: { $control: 'slider', min: 0, max: 3, step: 0.01, default: 1 },
  saturation: { $control: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
  hueShift: { $control: 'slider', min: 0, max: 360, step: 1, default: 0 },
  blur: { $control: 'slider', min: 0, max: 10, step: 0.1, default: 1 },
  lensBlur: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
  pixelate: { $control: 'slider', min: 1, max: 64, step: 1, default: 8 },
  posterize: { $control: 'slider', min: 2, max: 16, step: 1, default: 4 },
  invert: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
  fisheye: { $control: 'slider', min: -1, max: 1, step: 0.01, default: 0.5 },
  kaleidoscope: { $control: 'slider', min: 1, max: 24, step: 1, default: 6 },
  vignette: {
    amount: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    radius: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
  },
  threshold: {
    level: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    softness: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0 },
  },
  colorize: '#ffffff',
  chromaKey: '#00ff00',
};

const FALLBACK_ARG = { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 };

const FIXED_ITEMS = [
  { prefab: 'source.canvasColor', label: 'solid color', args: { color: '#ffffff', size: 0.3 } },
  { prefab: 'source.image', label: 'image', args: { url: '' } },
  { prefab: 'source.video', label: 'video', args: { url: '', opts: {} } },
  { prefab: 'value.number', label: 'number', args: { $control: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 } },
  { prefab: 'sink.render', label: 'render to screen', args: undefined },
];

export function mountPalette(container, patchStore, { onAdded } = {}) {
  const sheet = document.createElement('div');
  sheet.dataset.mobilePaletteSheet = '';
  sheet.style.cssText = `
    position: absolute; left: 0; right: 0; bottom: 0; max-height: 70%;
    background: #1b1d22; border-top: 2px solid #3a3f4a; border-radius: 16px 16px 0 0;
    color: #eee; font: 13px sans-serif; overflow-y: auto; z-index: 20;
    transform: translateY(100vh); transition: transform 160ms ease-out;
    box-sizing: border-box; padding: 14px 16px 24px; pointer-events: auto;
  `;
  container.appendChild(sheet);

  let targetNodeId = null;

  function item(label, onPick) {
    const row = document.createElement('div');
    row.textContent = label;
    row.style.cssText = `padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; background: #23262e; cursor: pointer;`;
    row.addEventListener('click', () => {
      onPick();
      hide();
    });
    return row;
  }

  function render() {
    sheet.innerHTML = '';
    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;`;
    const title = document.createElement('div');
    title.textContent = 'Add a block';
    title.style.cssText = `font-size: 16px; font-weight: 700;`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'cancel';
    closeBtn.style.cssText = `background: #444; border: none; color: #fff; border-radius: 8px; padding: 8px 14px; font-size: 13px;`;
    closeBtn.addEventListener('click', hide);
    header.append(title, closeBtn);
    sheet.appendChild(header);

    for (const fx of FIXED_ITEMS) {
      sheet.appendChild(
        item(fx.label, () => {
          patchStore.addSlot(targetNodeId, { prefab: fx.prefab, args: fx.args });
          onAdded?.(targetNodeId);
        })
      );
    }

    const divider = document.createElement('div');
    divider.textContent = 'effects';
    divider.style.cssText = `color: #777; font-size: 11px; text-transform: uppercase; margin: 12px 0 6px;`;
    sheet.appendChild(divider);

    for (const key of Object.keys(EFFECTS)) {
      sheet.appendChild(
        item(key, () => {
          patchStore.addSlot(targetNodeId, { prefab: `fx.${key}`, args: DEFAULT_ARGS[key] ?? FALLBACK_ARG });
          onAdded?.(targetNodeId);
        })
      );
    }
  }

  function show(nodeId) {
    targetNodeId = nodeId;
    render();
    sheet.style.transform = 'translateY(0)';
  }

  function hide() {
    targetNodeId = null;
    sheet.style.transform = 'translateY(100vh)';
  }

  return { show, hide };
}

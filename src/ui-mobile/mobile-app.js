// mountMobileUI(container, { initialPatch, onChange }) - the mobile
// block-patch mode's entry point, wiring together every ui-mobile/ piece:
// patch-store.js (the data), canvas.js (touch node graph: place, drag,
// wire, tap a node open), node-view.js (that node's parameter sheet,
// with its own "+ add block" button), and palette.js (the picker that
// button opens - every fx/registry.js effect plus a few fixed source/
// sink kinds, so canvas.js's own "+ node" button only needs to make a
// blank box; everything IN it comes from here). `onChange(patch)` fires
// (debounced) after every edit - the caller (main.js) is what turns that
// into an actual compile+reload.
import { PatchStore } from './patch-store.js';
import { mountMobileCanvas } from './canvas.js';
import { mountNodeView } from './node-view.js';
import { mountPalette } from './palette.js';

export function mountMobileUI(container, { initialPatch, onChange } = {}) {
  container.innerHTML = '';
  container.style.cssText = 'position: relative; width: 100%; height: 100%;';

  // Separate child elements, not shared use of `container` directly -
  // canvas.js clears/owns its own root wholesale (`container.innerHTML =
  // ''`), which would silently wipe out node-view's/palette's sheets the
  // moment they all mounted into the very same element. node-view and
  // palette both only ever APPEND their own sheet once, so sharing
  // sheetHost between just the two of them is fine.
  const canvasHost = document.createElement('div');
  canvasHost.style.cssText = 'position: absolute; inset: 0;';
  const sheetHost = document.createElement('div');
  sheetHost.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';
  container.append(canvasHost, sheetHost);

  const store = new PatchStore(initialPatch, onChange);
  const nodeView = mountNodeView(sheetHost, store, { onAddBlock: (id) => palette.show(id) });
  const palette = mountPalette(sheetHost, store, { onAdded: () => nodeView.refresh() });
  const canvas = mountMobileCanvas(canvasHost, store, { onNodeTap: (id) => nodeView.show(id) });
  return { store, canvas, nodeView, palette };
}

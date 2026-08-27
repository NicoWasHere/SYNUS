// mountMobileUI(container, { initialPatch, onChange }) - the mobile
// block-patch mode's entry point. Through Phase 3: patch-store.js +
// canvas.js (touch node graph: place, drag, wire) + node-view.js (tap a
// node open, edit its slots' parameters with real slider/colorPicker/etc
// widgets). Still no compiling/running (that's what turns `onChange`
// into a recompile, in a later phase) and no real block palette yet
// (palette.js, Phase 4 - canvas.js's own "+ node" button is a stand-in
// until then, and slots can only be added via patchStore.addSlot
// directly for now, not through any UI).
import { PatchStore } from './patch-store.js';
import { mountMobileCanvas } from './canvas.js';
import { mountNodeView } from './node-view.js';

export function mountMobileUI(container, { initialPatch, onChange } = {}) {
  container.innerHTML = '';
  container.style.cssText = 'position: relative; width: 100%; height: 100%;';

  // Separate child elements, not shared use of `container` directly -
  // canvas.js clears/owns its own root wholesale (`container.innerHTML =
  // ''`), which would silently wipe out node-view's sheet the moment
  // both mounted into the very same element.
  const canvasHost = document.createElement('div');
  canvasHost.style.cssText = 'position: absolute; inset: 0;';
  const sheetHost = document.createElement('div');
  sheetHost.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';
  container.append(canvasHost, sheetHost);

  const store = new PatchStore(initialPatch, onChange);
  const nodeView = mountNodeView(sheetHost, store);
  const canvas = mountMobileCanvas(canvasHost, store, { onNodeTap: (id) => nodeView.show(id) });
  return { store, canvas, nodeView };
}

// mountMobileUI(container, { initialPatch, onChange, onNodeTap }) - the
// mobile block-patch mode's entry point. Phase 2 only wires up
// patch-store.js + canvas.js (touch node graph: place, drag, wire) - no
// compiling/running yet (that lands once mobile-app.js starts calling
// core/patch-compiler.js's compilePatchToSource in a later phase), no
// parameter editing yet (node-view.js, Phase 3), no real block palette
// yet (palette.js, Phase 4 - canvas.js's own "+ node" button is a
// stand-in until then). `onChange(patch)` fires (debounced) after every
// edit - a later phase's caller is what turns that into a recompile.
import { PatchStore } from './patch-store.js';
import { mountMobileCanvas } from './canvas.js';

export function mountMobileUI(container, { initialPatch, onChange, onNodeTap } = {}) {
  const store = new PatchStore(initialPatch, onChange);
  const canvas = mountMobileCanvas(container, store, { onNodeTap });
  return { store, canvas };
}

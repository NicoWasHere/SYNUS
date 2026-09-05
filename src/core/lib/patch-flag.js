// newPatch - a plain global (not a function call, unlike mouse()/
// keyPulse()) that reads true for every tick between a successful patch
// send and the NEXT one, cleared back to false right after the first
// tick following THIS send runs. In practice that means: true for
// exactly one tick, right after you hit Send - which is enough for a
// node's own one-time-setup guard to opt into rebuilding on every patch,
// not just the very first time:
//
//   if (!state.scene || newPatch) {
//     state.scene = new THREE.Scene();
//     ...
//   }
//
// This exists because `state` deliberately persists across patch sends
// (see graph.js's syncFromProject) - editing an unrelated line in a node
// shouldn't blow away its running feedback buffer or compiled shader.
// But that same persistence means a plain `if (!state.x)` guard only
// ever fires once, ever, per node - so changing something INSIDE that
// guard (swapping BoxGeometry for SphereGeometry, or which Pattern shape
// a `use(Pattern, ...)` call constructs) has no visible effect on
// resend, because the code that would apply it never runs again. Adding
// `|| newPatch` to that same guard is the opt-in escape hatch: rebuild
// on every patch, not just the first one - a coarser, no-DOM alternative
// to clicking a node's own reset button (see ui/node-toolbar.js), for
// when you'd rather bake "rebuild on edit" into the node itself.
let newPatch = false;

export function markNewPatch() {
  newPatch = true;
}

export function clearNewPatch() {
  newPatch = false;
}

export function getNewPatch() {
  return newPatch;
}

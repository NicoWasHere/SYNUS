import { useInstances } from './use-instances.js';

// nodeFunction((use, ...args) => result) - packages a composed pipeline
// of effects (or anything that needs use()) into a single callable:
//
//   const rotateThenShrink = nodeFunction((use, src, degrees) => {
//     let out = use(Rotate).tick(src, degrees);
//     out = use(Scale).tick(out, 0.9);
//     return out;
//   });
//   ...
//   const out = rotateThenShrink(someTexture, t * 20);
//
// Unlike a node's own code(), which gets `use` from ITS OWN state, the
// function this returns carries its OWN independent, persistent state
// internally - built once, right here, when nodeFunction() itself is
// called - so the effects it constructs (Rotate/Scale above) stay
// correctly cached no matter which node ends up calling the returned
// function, how many times, or from how many different places. That
// also means calling nodeFunction(...) itself is the "construct" step:
// do it once (e.g. `state.fx ??= nodeFunction(...)`, or once at module
// scope to share it across every node in the file) and reuse the
// returned function - calling nodeFunction(...) again builds a brand
// new, separately-stated pipeline, same as `new GLSL()` would.
//
// Anything that changes tick to tick (like a live t) has to be an
// argument to the RETURNED function's own call, not just read from
// somewhere outside - the builder callback only ever runs once.
export function nodeFunction(fn) {
  const state = {};
  return (...args) => {
    const use = useInstances(state);
    return fn(use, ...args);
  };
}

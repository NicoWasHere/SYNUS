import { createHookScope } from './hooks.js';

// useInstances(state) - call once at the top of a node's code(). Returns
// a `use(Ctor, ...args)` function: use(GLSL) either constructs a new
// GLSL instance (first tick) or hands back the same one every tick after
// - so `state.glsl ??= new GLSL()` becomes `const glsl = use(GLSL)`.
//
// This works for ANY class - GLSL, Canvas2D, ScreenOutput, an fx effect
// class (Rotate, Scale, ...), a class you write yourself, eventually
// P5/Hydra - not just one per node. Call use() as many times as a node
// needs persistent objects; each call gets its own instance, keyed by
// call order: keep calls unconditional and in the same order every tick,
// not inside an `if`, or a later call can shift onto the wrong instance.
export function useInstances(state) {
  const scope = createHookScope(state, '_instances');
  return function use(Ctor, ...args) {
    return scope.next(Ctor.name, () => new Ctor(...args));
  };
}

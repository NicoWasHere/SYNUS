// The call-order-keyed caching primitive useInstances() is built on. A
// "hook scope" is a cache living inside one namespace of a node's state
// object - calling .next(prefix, createFn) the Nth time within one tick
// always returns the same cached value it returned the Nth time on the
// previous tick, creating it fresh only the very first time.
export function createHookScope(state, namespace) {
  state[namespace] ??= {};
  const store = state[namespace];
  let callIndex = 0;
  return {
    next(prefix, createFn) {
      const key = `${prefix}_${callIndex++}`;
      store[key] ??= createFn();
      return store[key];
    },
  };
}

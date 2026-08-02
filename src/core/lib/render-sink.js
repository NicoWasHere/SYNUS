import { ScreenOutput } from './screen-output.js';

// render(value) - the global a node's code() calls to put something on
// screen this tick. One ScreenOutput is shared for the whole graph and
// built lazily on first use, then reused across reloads - unlike other
// lib classes, render() isn't tied to any single node's `state`, so
// there's nothing for useInstances to key it by. Whichever node calls
// render() last in cook order wins for that tick - to change what's
// shown, move (or add/remove) the call, no `in` rewiring required.
let sink = null;

export function render(value) {
  sink ??= new ScreenOutput();
  sink.tick({ uInput: value });
}

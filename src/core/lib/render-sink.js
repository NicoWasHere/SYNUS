import { ScreenOutput } from './screen-output.js';

// render(value) - the global a node's code() calls to put something on
// screen this tick. One ScreenOutput is shared for the whole graph and
// built lazily on first use, then reused across reloads - unlike other
// lib classes, render() isn't tied to any single node's `state`, so
// there's nothing for useInstances to key it by. Whichever node calls
// render() last in cook order wins for that tick - to change what's
// shown, move (or add/remove) the call, no `in` rewiring required.
let sink = null;

// setRenderDryRun(true) makes render() a no-op - used by graph.js's
// applyAndValidate() to trial-tick a freshly-sent patch (to see whether
// any node throws) without ever letting that trial actually paint the
// visible canvas, even for one frame, before the patch is confirmed
// good and committed. Always paired with setRenderDryRun(false) in a
// finally block, so a throw during the trial tick can't leave real
// render() calls silently disabled afterward.
let dryRun = false;

export function setRenderDryRun(value) {
  dryRun = value;
}

export function render(value) {
  if (dryRun) return;
  sink ??= new ScreenOutput();
  sink.tick({ uInput: value });
}

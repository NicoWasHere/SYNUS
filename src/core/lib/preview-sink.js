// preview(value) - call from inside a node's code() to show `value` in
// that node's row in the side preview panel this tick, mirroring how
// render(value) picks what hits the screen. Previews are opt-in only: a
// node that never calls preview() gets no panel row at all, so the per-
// tick texture readback in main.js's updatePreviews() only ever runs for
// nodes that actually asked to be shown.
//
// Which node a bare preview(value) call belongs to is implicit - graph.js
// tracks whichever node is currently executing its code() (see
// current-node.js) and tags requests with that id, the same way React
// tracks "the current fiber" during a render pass rather than making
// every hook call name its own component.
//
// Calling preview() more than once in the same node's code() (e.g. once
// for an intermediate number, once for the final texture) gives each
// call its own card instead of the later call overwriting the earlier
// one - keyed by CALL ORDER, same convention as useInstances(): the
// first call each tick keys by the plain node id (unchanged, so a node
// with a single preview() call behaves exactly as before), later calls
// suffix it "#2", "#3", ... - see ui/preview-panel.js for how those get
// positioned (stacked under the node's own card). instance.js's
// particle2d() and ascii.js's ascii2d() use this exact same keying, via
// nextCallKey() in current-node.js.
//
// The optional second argument is display-only options, currently
// meaningful for a raw Pattern value: preview(pattern, { range: [a, b] })
// - see main.js's updatePreviews(), which is what actually calls
// pattern.plot(options) to turn it into something showable. A Pattern you
// already called .plot() on yourself is just a texture by that point, so
// this only matters if you hand preview() the bare Pattern.
import { nextCallKey } from './current-node.js';

let callCounts = new Map(); // nodeId -> how many times preview() has been called THIS tick
let requests = new Map(); // key (nodeId or "nodeId#n") -> { value, options }, valid for the tick just run

export function beginPreviewTick() {
  callCounts = new Map();
  requests = new Map();
}

export function preview(value, options) {
  const key = nextCallKey(callCounts);
  if (key == null) return;
  requests.set(key, { value, options });
}

export function getPreviewRequests() {
  return requests;
}

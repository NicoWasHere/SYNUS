// Tracks whichever node's code() is currently executing - graph.js calls
// setCurrentNode() right before (and after, with null) each node runs.
// Anything that needs to know "which node called me just now" without an
// explicit id argument (preview(), particle2d()) reads it from here
// instead of each keeping its own private copy of the same thing.
let currentNodeId = null;

export function setCurrentNode(id) {
  currentNodeId = id;
}

export function getCurrentNodeId() {
  return currentNodeId;
}

// Shared "which call is this" keying, used by anything that needs a
// persistent object per call SITE without an explicit state argument
// (preview(), particle2d(), ascii2d(), ...): the first call this tick
// from a given node keys by the plain node id (so the common single-call
// case behaves exactly as if it were keyed by node id alone), later calls
// from the SAME node this same tick suffix "#2", "#3", ... - same
// convention throughout this project. `counts` is the CALLER's own Map,
// reset once per tick via its own beginXTick() - kept separate per
// feature so one feature's call count never affects another's numbering.
// Returns null outside of a node's code() (nothing currently executing).
export function nextCallKey(counts) {
  const nodeId = currentNodeId;
  if (nodeId == null) return null;
  const n = (counts.get(nodeId) || 0) + 1;
  counts.set(nodeId, n);
  return n === 1 ? nodeId : `${nodeId}#${n}`;
}

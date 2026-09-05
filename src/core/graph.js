import { setCurrentNode } from './lib/current-node.js';
import { beginPreviewTick } from './lib/preview-sink.js';
import { beginControlsTick } from './lib/controls.js';
import {
  beginParticleTick,
  disposeParticlesForNode,
  snapshotParticleKeys,
  disposeNewParticleKeys,
} from './lib/instance.js';
import { beginAsciiTick, disposeAsciiForNode, snapshotAsciiKeys, disposeNewAsciiKeys } from './lib/ascii.js';
import { disposeState, disposeNewInstances } from './lib/dispose-state.js';
import { setRenderDryRun } from './lib/render-sink.js';

// Every node is just { id, code, inputs, state, error, lastOutputs}.
// "Type" isn't a structural property - it's whichever lib class (GLSL,
// Canvas2D, ScreenOutput, or an fx effect class) a node's code() happens
// to call.
export class Graph {
  constructor(bus) {
    this.bus = bus;
    this.nodes = new Map();
  }

  // Rebuild node entries from a freshly-loaded project file AND prove
  // they actually run before committing to them - replaces the old
  // syncFromProject(), which swapped in new code/inputs (and disposed
  // any removed node's GPU/media resources) unconditionally, before a
  // single line of the new code() had ever executed. A patch that
  // imports fine (loadProject() succeeded - the module parsed, `nodes`
  // has the right shape) can still throw the FIRST time some node's
  // code() body actually runs, and until now that would already have
  // destroyed the previous, working patch.
  //
  // Mechanism: merge in the new code/inputs, run ONE real tick() (the
  // exact same tick() every frame already uses - fully synchronous, so
  // this needs no second/parallel Graph instance ticking concurrently,
  // which would be genuinely unsafe: particle2d()/ascii2d() cache their
  // instances by plain node id in MODULE-LEVEL maps, not scoped per
  // Graph - see instance.js/ascii.js), with render() diverted to a
  // no-op for that one tick (setRenderDryRun) so the trial can never
  // paint the visible canvas even if it would have looked fine. Compare
  // which nodes have a fresh .error afterward against which ALREADY had
  // one before this call - only a node that was CLEAN and is now BROKEN
  // counts as a regression from this specific patch (a pre-existing,
  // unrelated bug elsewhere must never block sending an unrelated fix).
  // If nothing regressed, commit (now actually dispose truly-removed
  // node ids). If something did, roll every touched node back to
  // exactly its pre-call code/inputs/instances and report what broke -
  // the caller (main.js's reload()) keeps the previous patch running
  // untouched and surfaces the rejection instead of the swap.
  //
  // Known limitation: a node that mutates `state` directly (bypassing
  // useInstances - e.g. `state.counter = (state.counter||0)+1`) before
  // throwing later in that same call keeps that mutation even on
  // rollback. Narrow and low-severity (a stray primitive value, not a
  // leaked GPU/media resource) - not solved here, since solving it would
  // mean deep-cloning arbitrary state including GPU objects that can't
  // be cloned at all.
  applyAndValidate(projectNodes, t, tickCount) {
    const preErrorIds = new Set([...this.nodes].filter(([, n]) => n.error).map(([id]) => id));

    const prevCode = new Map(); // existing id -> { code, inputs }, for rollback
    const instanceKeysBefore = new Map(); // existing id -> Set(keys of state._instances), for rollback
    const newIds = []; // ids that did not exist before this call
    const removedIds = []; // ids that existed before, absent from projectNodes

    for (const id of this.nodes.keys()) {
      if (!projectNodes[id]) removedIds.push(id);
    }

    for (const [id, def] of Object.entries(projectNodes)) {
      let node = this.nodes.get(id);
      if (node) {
        prevCode.set(id, { code: node.code, inputs: node.inputs });
        instanceKeysBefore.set(id, new Set(Object.keys(node.state._instances || {})));
      } else {
        newIds.push(id);
        node = { id, state: {}, error: null, lastOutputs: {} };
        this.nodes.set(id, node);
      }
      node.code = def.code;
      node.inputs = def.in || {};
    }
    // removedIds are deliberately left in this.nodes for now - not
    // disposed until we know the rest of this patch actually works.

    const particleKeysBefore = snapshotParticleKeys();
    const asciiKeysBefore = snapshotAsciiKeys();

    setRenderDryRun(true);
    try {
      this.tick(t, tickCount);
    } finally {
      setRenderDryRun(false);
    }

    const newlyBroken = [...this.nodes]
      .filter(([id, n]) => n.error && !preErrorIds.has(id))
      .map(([id, n]) => ({ id, message: n.error }));

    if (newlyBroken.length === 0) {
      for (const id of removedIds) {
        // Free whatever this node's own code() built up (GLSL/Canvas2D
        // textures, a still-playing video, a live mic/camera stream, ...)
        // before dropping it - see dispose-state.js for why this can't
        // just be left to the garbage collector. particle2d()/ascii2d()
        // key their own instance caches by node id rather than through
        // useInstances, so they need their own separate cleanup call.
        const node = this.nodes.get(id);
        disposeState(node.state);
        disposeParticlesForNode(id);
        disposeAsciiForNode(id);
        this.nodes.delete(id);
      }
      return { ok: true };
    }

    // Roll back: undo everything this call just did to the touched nodes.
    for (const id of newIds) {
      // Never existed before this call - fully undo, same as a removal.
      const node = this.nodes.get(id);
      disposeState(node.state);
      disposeParticlesForNode(id);
      disposeAsciiForNode(id);
      this.nodes.delete(id);
    }
    for (const [id, { code, inputs }] of prevCode) {
      const node = this.nodes.get(id);
      node.code = code;
      node.inputs = inputs;
      // Only clear .error if this node was clean before - if it was
      // ALREADY broken (a pre-existing, unrelated bug), leave its error
      // exactly as it was; the trial's own error belongs to the code
      // being rolled back, not to whatever's left in place now.
      if (!preErrorIds.has(id)) node.error = null;
      disposeNewInstances(node.state, instanceKeysBefore.get(id));
    }
    disposeNewParticleKeys(particleKeysBefore);
    disposeNewAsciiKeys(asciiKeysBefore);
    // removedIds were never touched at all - nothing to restore there.
    return { ok: false, errors: newlyBroken };
  }

  cookOrder() {
    const visited = new Set();
    const order = [];
    const visit = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.nodes.get(id);
      if (!node) return;
      for (const sourceKey of Object.values(node.inputs)) {
        const srcId = sourceKey.split('.')[0];
        if (this.nodes.has(srcId)) visit(srcId);
      }
      order.push(id);
    };
    for (const id of this.nodes.keys()) visit(id);
    return order.map((id) => this.nodes.get(id));
  }

  // tickCount: integer frames elapsed since the clock started (see
  // clock.js's own `frame`) - passed through as code()'s 4th argument so a
  // node can do `if (tickCount % 4 === 0) { ...update... }` to only
  // actually change every N ticks, e.g. to slow down a feedback loop that
  // would otherwise update (and so visibly change) every single frame.
  // `t` (seconds) can't do this on its own - dividing/flooring t gives you
  // "every N seconds", not "every N ticks", and framerate can vary.
  tick(t, tickCount) {
    beginPreviewTick(); // clears last tick's preview() requests - see lib/preview-sink.js
    beginControlsTick(); // clears last tick's slider()/button()/input() requests - see lib/controls.js
    beginParticleTick(); // clears last tick's particle2d() call-order counters - see lib/instance.js
    beginAsciiTick(); // clears last tick's ascii2d() call-order counters - see lib/ascii.js
    for (const node of this.cookOrder()) {
      const inputs = {};
      for (const [portName, sourceKey] of Object.entries(node.inputs)) {
        inputs[portName] = this.bus.read(sourceKey);
      }
      setCurrentNode(node.id); // so a preview() call inside code() knows whose row it's for
      try {
        const outputs = node.code(inputs, node.state, t, tickCount) || {};
        for (const [portName, value] of Object.entries(outputs)) {
          this.bus.publish(`${node.id}.${portName}`, value);
        }
        node.lastOutputs = outputs;
        node.error = null;
      } catch (e) {
        node.error = e.message;
        console.error(`[${node.id}]`, e);
        // this node's last-published outputs (and lastOutputs) stay
        // untouched - downstream nodes keep showing the last good frame
      }
    }
    setCurrentNode(null);
  }
}

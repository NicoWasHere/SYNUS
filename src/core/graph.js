import { setCurrentNode } from './lib/current-node.js';
import { beginPreviewTick } from './lib/preview-sink.js';
import { beginControlsTick } from './lib/controls.js';
import { beginParticleTick, disposeParticlesForNode } from './lib/instance.js';
import { beginAsciiTick, disposeAsciiForNode } from './lib/ascii.js';
import { disposeState } from './lib/dispose-state.js';

// Every node is just { id, code, inputs, state, error, lastOutputs}.
// "Type" isn't a structural property - it's whichever lib class (GLSL,
// Canvas2D, ScreenOutput, or an fx effect class) a node's code() happens
// to call.
export class Graph {
  constructor(bus) {
    this.bus = bus;
    this.nodes = new Map();
  }

  // Rebuild node entries from a freshly-loaded project file. `state` is
  // preserved across reloads when a node's id already existed - this is
  // what makes editing one node not reset every other node's persistent
  // objects (shader programs, canvases, fx instances).
  syncFromProject(projectNodes) {
    for (const [id, def] of Object.entries(projectNodes)) {
      let node = this.nodes.get(id);
      if (!node) {
        node = { id, state: {}, error: null, lastOutputs: {} };
        this.nodes.set(id, node);
      }
      node.code = def.code;
      node.inputs = def.in || {};
    }
    for (const id of [...this.nodes.keys()]) {
      if (!projectNodes[id]) {
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
    }
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

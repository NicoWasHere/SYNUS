import { Composite } from './composite.js';

// new Layer() inside a node's code(). tick(textures, mode = 'over', opacity)
// reduces an ARRAY of texture-bearing values down to one by repeatedly
// compositing each on top of the previous - textures[0] on the bottom,
// the last entry on top. Any Composite mode works here ('over' - plain
// straight composite, the default - 'screen', 'multiply', etc.), since
// this is just Composite driven in a loop rather than a new blend of its
// own. One Composite instance is cached per pair-slot (not recreated
// every tick) so this stays GPU-resident like every other effect here.
export class Layer {
  constructor() {
    this._composites = [];
  }
  tick(textures, mode = 'over', opacity = 1) {
    if (!textures || textures.length === 0) return null;
    let acc = textures[0];
    for (let i = 1; i < textures.length; i++) {
      if (!this._composites[i - 1]) this._composites[i - 1] = new Composite();
      acc = this._composites[i - 1].tick(acc, textures[i], mode, opacity);
    }
    return acc;
  }
  dispose() {
    for (const c of this._composites) c.dispose();
  }
}

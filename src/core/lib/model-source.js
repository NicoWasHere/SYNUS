import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveSource } from './media.js';

// new ModelSource() inside a node's code(), or use(ModelSource) via
// useInstances. tick(source) loads a glTF/GLB model - `source` is a plain
// URL string, or a File/Blob (e.g. files.get('chair.glb') from the "Load
// file(s)" button - see file-registry.js), same convention as
// ImageSource/VideoSource. Returns the loaded THREE.Group once ready, or
// null while still loading/if nothing's loaded yet - add it to your own
// scene once you actually have it:
//
//   const use = useInstances(state);
//   const model = use(ModelSource).tick(files.get('chair.glb'));
//   if (model && !state.added) { state.scene.add(model); state.added = true; }
//
// Loading is asynchronous (GLTFLoader itself is callback-based, there's no
// synchronous "load this NOW" version) - tick() kicks off the load once
// per distinct source and returns null until it resolves, the same
// "nothing to show yet" convention as ImageSource/VideoSource before their
// own first frame decodes.
export class ModelSource {
  constructor() {
    this.lastUrl = null;
    this.model = null;
    this.loader = new GLTFLoader();
    this.loadToken = 0;
  }

  tick(source) {
    const url = resolveSource(this, source);
    if (url !== this.lastUrl) {
      this.lastUrl = url;
      this.model = null;
      if (url) {
        const token = ++this.loadToken;
        this.loader.load(
          url,
          (gltf) => {
            if (token !== this.loadToken) return; // a newer source started loading since - this result is stale
            this.model = gltf.scene;
          },
          undefined,
          (err) => {
            if (token !== this.loadToken) return;
            console.error('ModelSource: failed to load', url, err);
          }
        );
      }
    }
    return this.model;
  }

  // Frees the loaded model's own GPU resources (geometry/material buffers -
  // textures are on the material itself, not tracked separately here) and
  // invalidates any load still in flight, so a stale result can't land
  // after this instance is already gone.
  dispose() {
    this.loadToken++;
    if (!this.model) return;
    this.model.traverse((obj) => {
      obj.geometry?.dispose();
      if (!obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((m) => m.dispose());
    });
  }
}

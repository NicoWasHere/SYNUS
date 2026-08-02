import Hydra from 'hydra-synth';
import { getGL } from './context.js';
import { createTexture } from '../../gl/gl-context.js';
import { render } from './render-sink.js';

// new HydraSource(width, height) inside a node's code(), or
// use(HydraSource, width, height) via useInstances. tick(code) runs the
// given Hydra DSL code string (e.g. `osc(10, 0.1, 1.2).out()`) - only
// re-evaluates when the string actually changes, same convention as
// GLSL.tick(fragSrc): edit the string in your node's code() and it takes
// effect live, without re-evaluating (and losing any internal state)
// every single tick.
//
// Hydra manages its own separate WebGL context on its own internal
// canvas (never added to the page - it isn't built to share a context
// the way this project's other lib classes do), so its output is copied
// into our texture the same way Canvas2D/Html/ImageSource are: draw its
// canvas, upload.
//
// A REAL LIMITATION worth knowing: hydra-synth's own "non-global" eval
// mode doesn't actually work as of the installed version (its sandbox
// code path that would avoid this is incomplete upstream, not something
// fixable from here), so this has to run with the library's makeGlobal
// option on - osc/shape/noise/voronoi/out/etc land on `window`, same as
// the real Hydra editor does. That's harmless for a single Hydra node,
// but multiple simultaneous ones will fight over those same global
// names - only whichever evaluated its code most recently is "active"
// for them.
export class HydraSource {
  constructor(width = 512, height = 512) {
    this.gl = getGL();
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.texture = createTexture(this.gl, width, height);
    this.lastCode = null;
    this.lastTime = performance.now();
    this.hydra = new Hydra({
      canvas: this.canvas,
      width,
      height,
      autoLoop: false, // we drive timing ourselves via tick(), like every other lib class here
      makeGlobal: true, // required - see the limitation above
      detectAudio: false, // avoids an unprompted microphone permission request
      enableStreamCapture: false,
    });
    // hydra's makeGlobal mode stomps `window.render` with its own internal
    // per-instance output-routing method (same name as this project's
    // render() global) - restore ours immediately or every render() call
    // anywhere in the project silently turns into a call into hydra
    // instead, which reassigns hydra's *own* render target rather than
    // putting anything on screen.
    window.render = render;
  }

  tick(code) {
    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    if (code !== this.lastCode) {
      this.lastCode = code;
      try {
        this.hydra.eval(code);
      } catch (e) {
        // leave whatever was last running - same "keep the last good
        // frame" behavior as GLSL._compile()'s catch.
      }
    }

    this.hydra.tick(dt);
    window.render = render; // hydra's tick() can also re-touch globals; keep ours pinned

    // hydra always renders to its OWN canvas as a side effect of tick(),
    // regardless of what its `render` global was hijacked to mean above -
    // that part of the pipeline is unaffected by the collision.

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    return this;
  }
}

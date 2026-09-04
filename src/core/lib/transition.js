import { getGL } from './context.js';
import { GLSL } from './glsl.js';

const TRANSITION_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec3 uColor;
uniform float uMix; // 0 = pure uColor, 1 = pure src - see Transition.tick()'s eased progress

void main() {
  vec4 src = texture(uSrc, vUv);
  vec3 rgb = mix(uColor, src.rgb, uMix);
  float a = mix(1.0, src.a, uMix); // opaque during the flash/fade itself, eases to src's own alpha as it settles
  outColor = vec4(rgb, a);
}`;

const DEFAULT_COLOR = { flash: '#ffffff', fade: '#000000' };

function toRgb(color) {
  if (Array.isArray(color)) return color;
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const int = parseInt(full, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

// new Transition() inside a node's code(), or use(Transition) via
// useInstances. tick(src, { trigger, mode, color, duration }) blends FROM
// a solid color TO src over `duration` seconds, restarting every time
// `trigger` goes from false to true - pass the global `newPatch` (see
// lib/patch-flag.js) to get a flash/fade every time you hit Send, same as
// any other global this project's node code already reads (t, mouse(),
// keyPulse(), ...): explicit, not something Transition reaches for on its
// own.
//
//   const out = use(Transition).tick(inputs.src, { trigger: newPatch, mode: 'flash' });
//
// mode: 'flash' (default color white, fast snap-back - a quick bright
//   pulse that settles almost immediately) or 'fade' (default color
//   black, a smooth constant-rate crossfade over the whole duration).
// Pass your own `color` to override either mode's default.
export class Transition {
  constructor(filter = 'linear') {
    this.gl = getGL();
    this._pass = new GLSL({ filter });
    this._prevTrigger = false;
    this._triggerAt = null; // performance.now() ms of the last rising edge, or null if never triggered
  }

  tick(src, { trigger = false, mode = 'flash', color, duration = 0.4 } = {}) {
    if (!src || !src.texture) return src;

    if (trigger && !this._prevTrigger) this._triggerAt = performance.now();
    this._prevTrigger = trigger;

    let progress = 1;
    if (this._triggerAt != null && duration > 0) {
      const elapsed = (performance.now() - this._triggerAt) / 1000;
      progress = Math.min(1, Math.max(0, elapsed / duration));
    }
    // 'flash' eases out fast (cubic) - a quick bright pop that snaps back
    // almost immediately rather than lingering. 'fade' stays linear - a
    // smooth, constant-rate dissolve across the whole duration.
    const eased = mode === 'flash' ? 1 - (1 - progress) ** 3 : progress;

    this._pass.tick(TRANSITION_FRAG, {
      uSrc: src,
      uColor: toRgb(color ?? DEFAULT_COLOR[mode] ?? DEFAULT_COLOR.flash),
      uMix: eased,
    });
    return this._pass;
  }

  dispose() {
    this._pass.dispose();
  }
}

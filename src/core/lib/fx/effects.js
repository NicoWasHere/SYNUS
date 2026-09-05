import { GLSL } from '../glsl.js';
import { EFFECTS } from './registry.js';

function capitalize(name) {
  return name[0].toUpperCase() + name.slice(1);
}

// Turns one EFFECTS table entry into a real class: construct it, call
// .tick(src, ...args) every frame with the current arguments, get back
// the resulting texture-bearing GLSL instance. This is exactly the same
// shape as GLSL/Canvas2D/ScreenOutput - an effect is not a special kind
// of thing, it's just another class, which is what makes it usable
// through useInstances() with no fx-specific machinery at all:
//
//   const use = useInstances(state);
//   const rotated = use(Rotate).tick(inputs.src, t * 20);
//
// Object.defineProperty for `name` below exists only so useInstances'
// internal cache key reads "Rotate_0" instead of "_0" in devtools -
// classes returned from a factory function don't get a name for free
// the way `class Rotate {}` would.
//
// Every effect's constructor takes an optional filter ('linear' default,
// or 'nearest') for its own internal texture - see createTexture() in
// gl-context.js. Only matters if this effect's OUTPUT gets fed back
// through itself or another resampling effect (a feedback loop via Lag/
// Delay) - use(Translate, 'nearest') stops that specific link in the
// chain from softening the image a little more on every pass.
function makeEffectClass(name, frag, toUniforms) {
  const cls = class {
    constructor(filter = 'linear') {
      this._glsl = new GLSL({ filter });
    }
    tick(src, ...args) {
      // uTexel (1 texel of `src`, in uv units) is injected for every
      // effect, not just the ones that use it - a shader that doesn't
      // declare a `uTexel` uniform just ignores it (GLSL.tick() skips
      // any uniform name its compiled program doesn't have). Neighbor-
      // sampling effects (blur, edge, emboss, pixelate) need this to
      // convert "N texels away" into actual uv offsets for src's real
      // resolution, which they'd otherwise have no way to know. GLSL/
      // Canvas2D expose width/height directly; ImageSource/VideoSource/
      // WebcamSource only expose their live size via .canvas (it can
      // shrink after construction - see media.js's capToNativeSize), so
      // that's checked as a fallback rather than assuming one shape.
      //
      // `src` itself can legitimately be undefined/null here (e.g. a
      // node wired to Delay's output before its buffer has filled - see
      // delay.js's tick(), which returns its own `value` argument
      // untouched in that case). GLSL.tick()'s own uniform loop already
      // tolerates a nullish uSrc silently (it just skips setting that
      // uniform) - dereferencing `.width` before ever reaching it would
      // throw first, breaking a case that used to just quietly no-op.
      const srcW = (src && (src.width || (src.canvas && src.canvas.width))) || 1;
      const srcH = (src && (src.height || (src.canvas && src.canvas.height))) || 1;
      const uTexel = [1 / srcW, 1 / srcH];
      this._glsl.tick(frag, { uSrc: src, uTexel, ...toUniforms(...args) });
      return this._glsl;
    }
    dispose() {
      this._glsl.dispose();
    }
  };
  Object.defineProperty(cls, 'name', { value: capitalize(name) });
  return cls;
}

// FX.rotate, FX.scale, ... - lets project code iterate all effects
// generically, and is what each of the individual exports below points
// at (e.g. Rotate === FX.rotate).
export const FX = {};
for (const [name, def] of Object.entries(EFFECTS)) {
  FX[name] = makeEffectClass(name, def.frag, def.toUniforms);
}

// Individual PascalCase exports for direct use with useInstances, e.g.
// use(Rotate).tick(src, 20) - same calling convention as use(GLSL).
export const Rotate = FX.rotate;
export const Scale = FX.scale;
export const Flip = FX.flip;
export const Translate = FX.translate;
export const Position = FX.position;
export const ChannelMix = FX.channelMix;
export const Brightness = FX.brightness;
export const Contrast = FX.contrast;
export const Saturation = FX.saturation;
export const HueShift = FX.hueShift;
export const Grade = FX.grade;
export const Blur = FX.blur;
export const LensBlur = FX.lensBlur;
export const Threshold = FX.threshold;
export const Edge = FX.edge;
export const Emboss = FX.emboss;
export const Mirror = FX.mirror;
export const Tile = FX.tile;
export const Kaleidoscope = FX.kaleidoscope;
export const Modulate = FX.modulate;
export const Displace = FX.displace;
export const ModulateScale = FX.modulateScale;
export const ModulateRotate = FX.modulateRotate;
export const Vignette = FX.vignette;
export const Pixelate = FX.pixelate;
export const Posterize = FX.posterize;
export const ColorLookup = FX.colorLookup;
export const Mask = FX.mask;
export const ChromaKey = FX.chromaKey;
export const GradientMap = FX.gradientMap;
export const Fisheye = FX.fisheye;
export const Invert = FX.invert;
export const Colorize = FX.colorize;
export const CRT = FX.crt;
export const FilmGrain = FX.filmGrain;
export const Bitmap = FX.bitmap;
export const ChannelThreshold = FX.channelThreshold;
export const ScanLines = FX.scanLines;
export const Crop = FX.crop;

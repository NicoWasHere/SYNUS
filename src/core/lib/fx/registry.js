import * as shaders from './shaders.js';

// One entry per effect: which shader it runs, and how to turn the plain
// JS arguments a project passes (e.g. rotate(src, 20)) into the uniform
// object GLSL.tick() expects. This table is consumed by effects.js,
// which generates one class per entry - it's not called directly by
// project code. To add a new effect: write its shader in shaders.js,
// then add one entry here. Nothing else needs to change.
export const EFFECTS = {
  rotate: {
    frag: shaders.ROTATE,
    // rotate(src, degrees)
    toUniforms: (degrees = 0) => ({ uAngle: (degrees * Math.PI) / 180 }),
  },

  scale: {
    frag: shaders.SCALE,
    // scale(src, { x, y })  -  or scale(src, factor) to scale both axes evenly
    toUniforms: (arg = {}) => {
      const { x = 1, y = 1 } = typeof arg === 'number' ? { x: arg, y: arg } : arg;
      return { uScale: [x, y] };
    },
  },

  flip: {
    frag: shaders.FLIP,
    // flip(src, { x: true, y: false })
    toUniforms: ({ x = false, y = false } = {}) => ({ uFlip: [x ? 1 : 0, y ? 1 : 0] }),
  },

  translate: {
    frag: shaders.TRANSLATE,
    // translate(src, { x, y })  -  values in 0..1 uv units
    toUniforms: ({ x = 0, y = 0 } = {}) => ({ uOffset: [x, y] }),
  },

  channelMix: {
    frag: shaders.CHANNEL_MIX,
    // channelMix(src, { r: [1,0,0], g: [0,1,0], b: [0,0,1] })
    toUniforms: ({ r = [1, 0, 0], g = [0, 1, 0], b = [0, 0, 1] } = {}) => ({
      uMixR: r,
      uMixG: g,
      uMixB: b,
    }),
  },

  brightness: {
    frag: shaders.BRIGHTNESS,
    // brightness(src, 0.2)  -  additive, -1..1
    toUniforms: (amount = 0) => ({ uAmount: amount }),
  },

  contrast: {
    frag: shaders.CONTRAST,
    // contrast(src, 1.4)  -  1.0 = no change
    toUniforms: (amount = 1) => ({ uAmount: amount }),
  },

  saturation: {
    frag: shaders.SATURATION,
    // saturation(src, 0)  -  0 = grayscale, 1 = no change
    toUniforms: (amount = 1) => ({ uAmount: amount }),
  },

  hueShift: {
    frag: shaders.HUE_SHIFT,
    // hueShift(src, 90)  -  degrees
    toUniforms: (degrees = 0) => ({ uShift: degrees / 360 }),
  },

  grade: {
    frag: shaders.GRADE,
    // grade(src, { brightness: 0, contrast: 1, saturation: 1, opacity: 1 })
    // every default leaves that channel unchanged - pass only the ones
    // you want to adjust.
    toUniforms: ({ brightness = 0, contrast = 1, saturation = 1, opacity = 1 } = {}) => ({
      uBrightness: brightness,
      uContrast: contrast,
      uSaturation: saturation,
      uOpacity: opacity,
    }),
  },

  blur: {
    frag: shaders.BLUR,
    // blur(src, 2)  -  spacing between samples in texels, 0 = no blur
    toUniforms: (amount = 1) => ({ uAmount: amount }),
  },

  lensBlur: {
    frag: shaders.LENS_BLUR,
    // lensBlur(src, 0.3)  -  radial/zoom streak strength, 0 = none
    toUniforms: (amount = 0.3) => ({ uAmount: amount }),
  },

  threshold: {
    frag: shaders.THRESHOLD,
    // threshold(src, { level: 0.5, softness: 0 })
    toUniforms: ({ level = 0.5, softness = 0 } = {}) => ({ uLevel: level, uSoftness: softness }),
  },

  edge: {
    frag: shaders.EDGE,
    // edge(src, 1)  -  Sobel gradient magnitude, amount scales the result
    toUniforms: (amount = 1) => ({ uAmount: amount }),
  },

  emboss: {
    frag: shaders.EMBOSS,
    // emboss(src, 1)
    toUniforms: (amount = 1) => ({ uAmount: amount }),
  },

  mirror: {
    frag: shaders.MIRROR,
    // mirror(src, { x: true, y: false })  -  folds that axis onto itself
    toUniforms: ({ x = true, y = false } = {}) => ({ uAxis: [x ? 1 : 0, y ? 1 : 0] }),
  },

  tile: {
    frag: shaders.TILE,
    // tile(src, { x: 2, y: 2 })  -  or tile(src, n) for both axes evenly
    toUniforms: (arg = 2) => {
      const { x = 2, y = 2 } = typeof arg === 'number' ? { x: arg, y: arg } : arg;
      return { uRepeat: [x, y] };
    },
  },

  kaleidoscope: {
    frag: shaders.KALEIDOSCOPE,
    // kaleidoscope(src, 6)  -  number of mirrored wedges
    toUniforms: (segments = 6) => ({ uSegments: segments }),
  },

  // modulate/displace both take a SECOND texture-bearing value (not just
  // a number/object) as their first real argument - toUniforms just
  // passes it straight through keyed as a uniform; GLSL.tick() already
  // knows to bind anything with a .texture property as a sampler2D, the
  // same as uSrc itself, so no special-casing was needed here at all.
  modulate: {
    frag: shaders.MODULATE,
    // modulate(src, mapTexture, 0.1)  -  map's luma pushes uv uniformly
    toUniforms: (map, amount = 0.1) => ({ uMap: map, uAmount: amount }),
  },

  displace: {
    frag: shaders.DISPLACE,
    // displace(src, mapTexture, 0.1)  -  map's r/g push uv.x/uv.y independently
    toUniforms: (map, amount = 0.1) => ({ uMap: map, uAmount: amount }),
  },

  vignette: {
    frag: shaders.VIGNETTE,
    // vignette(src, { amount: 0.5, radius: 0.3 })
    toUniforms: ({ amount = 0.5, radius = 0.3 } = {}) => ({ uAmount: amount, uRadius: radius }),
  },

  pixelate: {
    frag: shaders.PIXELATE,
    // pixelate(src, 8)  -  block size in texels
    toUniforms: (size = 8) => ({ uSize: size }),
  },

  posterize: {
    frag: shaders.POSTERIZE,
    // posterize(src, 4)  -  color levels per channel
    toUniforms: (levels = 4) => ({ uLevels: levels }),
  },

  colorLookup: {
    frag: shaders.COLOR_LOOKUP,
    // colorLookup(src, lutTexture, { size: 8, amount: 1 })  -  lutTexture
    // is a "strip" LUT image: `size` square blocks side by side, each
    // size x size texels, one block per blue slice (the common format
    // most LUT PNGs online already use). `size` must match how many
    // blocks the actual image has.
    //
    // IMPORTANT: load lutTexture via `img.tick(url, { fit: 'stretch' })`
    // (see lib/media.js), not the default 'contain' - a LUT strip is
    // always wide and non-square, and letterboxing it would pad it with
    // black bars instead of filling the whole texture, breaking the
    // exact 0..1 addressing this shader relies on.
    toUniforms: (lut, { size = 8, amount = 1 } = {}) => {
      const lutW = (lut && (lut.width || (lut.canvas && lut.canvas.width))) || size * 32;
      return { uLut: lut, uSize: size, uBlockTexels: lutW / size, uAmount: amount };
    },
  },

  mask: {
    frag: shaders.MASK,
    // mask(src, maskTexture, { mode: 'lightness', invert: false })  -
    // cuts a hole in src's alpha using maskTexture's shape; src's rgb is
    // untouched. mode: 'lightness' (default) or 'alpha'.
    toUniforms: (maskTex, { mode = 'lightness', invert = false } = {}) => ({
      uMask: maskTex,
      uMode: mode === 'alpha' ? 1 : 0,
      uInvert: invert ? 1 : 0,
    }),
  },

  chromaKey: {
    frag: shaders.CHROMA_KEY,
    // chromaKey(src, { color: [0,1,0], similarity: 0.4, smoothness: 0.1 })
    // - keys out pixels near `color` (0..1 rgb, green-screen green by
    // default). Raise `similarity` to key a wider range of colors, raise
    // `smoothness` to feather the cutoff edge instead of a hard cut.
    toUniforms: ({ color = [0, 1, 0], similarity = 0.4, smoothness = 0.1 } = {}) => ({
      uKeyColor: color,
      uSimilarity: similarity,
      uSmoothness: smoothness,
    }),
  },

  gradientMap: {
    frag: shaders.GRADIENT_MAP,
    // gradientMap(src, rampTexture, { channel: 'lightness' })  - repaints
    // src entirely from a 1D gradient (rampTexture - e.g. use(Ramp) or a
    // hand-drawn Canvas2D gradient), sampled at src's own lightness/red/
    // green/blue value per pixel. The "Ramp -> Lookup" palette-mapping
    // trick - NOT the same as colorLookup above, which is a full 3D LUT.
    toUniforms: (ramp, { channel = 'lightness' } = {}) => ({
      uRamp: ramp,
      uChannel: { lightness: 0, red: 1, green: 2, blue: 3 }[channel] ?? 0,
    }),
  },

  fisheye: {
    frag: shaders.FISHEYE,
    // fisheye(src, 0.5)  -  positive bulges outward (fisheye), negative
    // pinches inward (pincushion), 0 = no change
    toUniforms: (amount = 0.5) => ({ uAmount: amount }),
  },

  invert: {
    frag: shaders.INVERT,
    // invert(src, 1)  -  0 = original, 1 = fully inverted
    toUniforms: (amount = 1) => ({ uAmount: amount }),
  },

  colorize: {
    frag: shaders.COLORIZE,
    // colorize(src, '#ff3366')  -  recolors src's own lightness into a
    // black -> color duotone. Accepts a hex string or a [r,g,b] 0..1 array.
    toUniforms: (color = '#ffffff') => ({ uColor: toRgb(color) }),
  },

  crt: {
    frag: shaders.CRT,
    // crt(src, { amount = 1, t = 0, bars = 1, barSize = 16 })  -  chromatic
    // aberration + scanlines + vignette + `bars` simultaneous horizontal
    // tear bars (0 for none), each `barSize` texels thick - capped at 8
    // regardless of how high `bars` is set (see MAX_BARS in shaders.js).
    // `t` is needed for the tear positions/timing to actually animate -
    // pass the node's own `t`. barSize's default was 4 (a couple texels,
    // easy to lose entirely against real content/scaling - the mechanism
    // was firing correctly at that size, it just wasn't visible), bumped
    // to 16 so a plain crt(src, { t }) actually shows a tear on-screen.
    toUniforms: ({ amount = 1, t = 0, bars = 1, barSize = 16 } = {}) => ({
      uAmount: amount,
      uTime: t,
      uBarCount: bars,
      uBarSize: barSize,
    }),
  },

  filmGrain: {
    frag: shaders.FILM_GRAIN,
    // filmGrain(src, { amount = 0.1, t = 0 })  -  animated noise added to
    // rgb. `t` keeps the grain moving instead of a fixed static pattern.
    toUniforms: ({ amount = 0.1, t = 0 } = {}) => ({ uAmount: amount, uTime: t }),
  },

  bitmap: {
    frag: shaders.BITMAP,
    // bitmap(src, { scale = 2, colorA = '#000000', colorB = '#ffffff' })  -
    // 1-bit ordered (Bayer) dither, the classic "old Mac bitmap" look.
    // scale is the on-screen size (in texels) of one dither cell.
    toUniforms: ({ scale = 2, colorA = '#000000', colorB = '#ffffff' } = {}) => ({
      uScale: scale,
      uColorA: toRgb(colorA),
      uColorB: toRgb(colorB),
    }),
  },

  channelThreshold: {
    frag: shaders.CHANNEL_THRESHOLD,
    // channelThreshold(src, { r = 0.5, g = 0.5, b = 0.5 })  -  thresholds
    // each channel independently (up to 8 distinct output colors) instead
    // of one shared luma cutoff - see Threshold for the grayscale version.
    toUniforms: ({ r = 0.5, g = 0.5, b = 0.5 } = {}) => ({ uLevels: [r, g, b] }),
  },

  scanLines: {
    frag: shaders.SCAN_LINES,
    // scanLines(src, { spacing = 22, thickness = 2, maxWobble = 50,
    //                   wobbleFreq = 0.05, vertical = false,
    //                   color = '#ffffff', darkCutoff = 0.08, t = 0,
    //                   seed = 0 })
    // Always-oscillating wavy lines - src's own lightness at a point
    // drives how far THAT point's wave swings (maxWobble), not the
    // line's thickness anymore (thickness is its own fixed parameter).
    // Each line gets its own random phase/frequency jitter (see `seed` -
    // change it for a different random pattern) so neighboring lines
    // don't wobble as identical copies of each other. `t` is needed for
    // the oscillation to actually animate - pass the node's own `t`.
    // Never draws over src pixels darker than darkCutoff, so the pattern
    // traces bright content instead of covering the whole frame. Output
    // is transparent wherever no line is drawn - Composite it over a
    // background rather than expecting solid black there.
    toUniforms: ({
      spacing = 20,
      thickness = 2,
      maxWobble = 10,
      wobbleFreq = 0.05,
      vertical = false,
      color = '#ffffff',
      darkCutoff = 0.05,
      t = 0,
      seed = 0,
    } = {}) => ({
      uSpacing: spacing,
      uThickness: thickness,
      uMaxWobble: maxWobble,
      uWobbleFreq: wobbleFreq,
      uVertical: vertical ? 1 : 0,
      uColor: toRgb(color),
      uDarkCutoff: darkCutoff,
      uTime: t,
      uSeed: seed,
    }),
  },

  crop: {
    frag: shaders.CROP,
    // crop(src, { x = 0, y = 0, w = 1, h = 1 })  -  extracts src's
    // [x,y,w,h] sub-rectangle (x,y = top-left corner, 0..1, y=0 at top -
    // same convention as ComposeAt) and stretches it to fill the whole
    // frame. NOT the same as Mask (cuts a hole in place, doesn't move or
    // rescale anything).
    toUniforms: ({ x = 0, y = 0, w = 1, h = 1 } = {}) => ({ uRect: [x, y, w, h] }),
  },
};

function toRgb(color) {
  if (Array.isArray(color)) return color;
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const int = parseInt(full, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

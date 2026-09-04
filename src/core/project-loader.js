import { setGL, screenSize, viewportSize } from './lib/context.js';
import { mouse, keyPulse } from './lib/input-state.js';
import { midi, midiKnob, midiPad, midiVelocity, midiError, LPD8, LPD8_MK2 } from './lib/midi.js';
import { getNewPatch } from './lib/patch-flag.js';
import { sampleTexture } from './lib/texture-sample.js';
import { GLSL } from './lib/glsl.js';
import { Canvas2D } from './lib/canvas2d.js';
import { ScreenOutput } from './lib/screen-output.js';
import { Html } from './lib/html.js';
import { Composite, Matte } from './lib/composite.js';
import { Layer } from './lib/layer.js';
import { ComposeAt } from './lib/compose-at.js';
import { beatmatch, beatEnvelope } from './lib/beatmatch.js';
import { COLORS } from './lib/colors.js';
import { COLORMAPS } from './lib/colormaps.js';
import { Lag } from './lib/lag.js';
import { Delay } from './lib/delay.js';
import { Bloom } from './lib/bloom.js';
import { Flow } from './lib/flow.js';
import { Melt } from './lib/melt.js';
import { Transition } from './lib/transition.js';
import { Fill } from './lib/fill.js';
import { Ramp } from './lib/ramp.js';
import { Gradient } from './lib/gradient.js';
import { Noise } from './lib/noise.js';
import { Warp } from './lib/warp.js';
import { Ripple } from './lib/ripple.js';
import { Pattern } from './lib/pattern.js';
import { Scope } from './lib/scope.js';
import { ImageSource, VideoSource, WebcamSource } from './lib/media.js';
import { files } from './lib/file-registry.js';
import { HydraSource } from './lib/hydra-source.js';
import { ThreeSource } from './lib/three-source.js';
import { ModelSource } from './lib/model-source.js';
import { Extrude } from './lib/extrude.js';
import { PhysicsWorld } from './lib/physics-world.js';
import { orbitCamera } from './lib/three-camera.js';
import * as THREE from 'three';
import { render } from './lib/render-sink.js';
import { preview } from './lib/preview-sink.js';
import { slider, button, input, colorPicker } from './lib/controls.js';
import { useInstances } from './lib/use-instances.js';
import { nodeFunction } from './lib/node-function.js';
import { Instance, particle2d } from './lib/instance.js';
import { ascii2d } from './lib/ascii.js';
import { dot, pixel } from './lib/stamps.js';
import { AudioSource } from './lib/audio-source.js';
import {
  FX,
  Rotate,
  Scale,
  Flip,
  Translate,
  ChannelMix,
  Brightness,
  Contrast,
  Saturation,
  HueShift,
  Grade,
  Blur,
  LensBlur,
  Threshold,
  Edge,
  Emboss,
  Mirror,
  Tile,
  Kaleidoscope,
  Modulate,
  Displace,
  ModulateScale,
  ModulateRotate,
  Vignette,
  Pixelate,
  Posterize,
  ColorLookup,
  Mask,
  ChromaKey,
  GradientMap,
  Fisheye,
  Invert,
  Colorize,
  CRT,
  FilmGrain,
  Bitmap,
  ChannelThreshold,
  ScanLines,
  Crop,
} from './lib/fx/effects.js';
import { explode } from './lib/explode.js';

// Project code is evaluated as a real ES module (via a blob: URL) rather
// than new Function(), specifically so it CAN contain top-level `export`
// (required for `export const nodes = {...}`) and, later, arbitrary
// `import` statements for user-supplied libraries loaded from a CDN.
//
// GLSL / Canvas2D / ScreenOutput / Html / Composite / Matte / Layer / ComposeAt /
// beatmatch / beatEnvelope / COLORS / COLORMAPS / Lag / Delay / Bloom / Flow / Melt / Transition / Fill / Ramp / Gradient / Noise / Warp / Ripple / Pattern / Scope / ImageSource /
// VideoSource / WebcamSource / HydraSource / ThreeSource / ModelSource / Extrude / PhysicsWorld / orbitCamera / THREE /
// screenSize / viewportSize / mouse / keyPulse / midi / midiKnob / midiPad / midiVelocity /
// midiError / LPD8 / LPD8_MK2 / newPatch / sampleTexture / render /
// preview / slider / button / input / colorPicker / useInstances / nodeFunction /
// Instance / particle2d / ascii2d / dot / pixel / AudioSource / explode /
// files, plus every effect
// class (Rotate, Scale, Flip, Translate, ChannelMix, Brightness,
// Contrast, Saturation, HueShift, Grade, Blur, LensBlur, Threshold,
// Edge, Emboss, Mirror, Tile, Kaleidoscope, Modulate, Displace,
// ModulateScale, ModulateRotate, Vignette, Pixelate, Posterize, ColorLookup, Mask, ChromaKey,
// GradientMap, Fisheye, Invert, Colorize, CRT, FilmGrain, Bitmap,
// ChannelThreshold, ScanLines, Crop), are exposed as plain
// globals so project code can write `new GLSL()`, `use(Rotate).tick(...)`,
// `render(out)`, or `preview(out)` with zero import boilerplate. A
// project file is still free to `import` anything else it wants at the
// top of the file.
export async function loadProject(gl, source) {
  setGL(gl);
  window.GLSL = GLSL;
  window.Canvas2D = Canvas2D;
  window.ScreenOutput = ScreenOutput;
  window.Html = Html;
  window.Composite = Composite;
  window.Matte = Matte;
  window.Layer = Layer;
  window.ComposeAt = ComposeAt;
  window.beatmatch = beatmatch;
  window.beatEnvelope = beatEnvelope;
  window.COLORS = COLORS;
  window.COLORMAPS = COLORMAPS;
  window.Lag = Lag;
  window.Delay = Delay;
  window.Bloom = Bloom;
  window.Flow = Flow;
  window.Melt = Melt;
  window.Transition = Transition;
  window.Fill = Fill;
  window.Ramp = Ramp;
  window.Gradient = Gradient;
  window.Noise = Noise;
  window.Warp = Warp;
  window.Ripple = Ripple;
  window.Pattern = Pattern;
  window.Scope = Scope;
  window.ImageSource = ImageSource;
  window.VideoSource = VideoSource;
  window.WebcamSource = WebcamSource;
  window.HydraSource = HydraSource;
  window.ThreeSource = ThreeSource;
  window.ModelSource = ModelSource;
  window.Extrude = Extrude;
  window.PhysicsWorld = PhysicsWorld;
  window.orbitCamera = orbitCamera;
  window.THREE = THREE;
  window.files = files;
  window.screenSize = screenSize;
  window.viewportSize = viewportSize;
  window.mouse = mouse;
  window.keyPulse = keyPulse;
  window.midi = midi;
  window.midiKnob = midiKnob;
  window.midiPad = midiPad;
  window.midiVelocity = midiVelocity;
  window.midiError = midiError;
  window.LPD8 = LPD8;
  window.LPD8_MK2 = LPD8_MK2;
  // A live-reflecting plain property (not a function call, unlike mouse()/
  // keyPulse() above) - see lib/patch-flag.js for what it means and why.
  // Redefined every loadProject() call, but that's harmless/idempotent -
  // it's just re-pointing at the exact same getNewPatch every time.
  Object.defineProperty(window, 'newPatch', { get: getNewPatch, configurable: true });
  window.sampleTexture = sampleTexture;
  window.render = render;
  window.preview = preview;
  window.slider = slider;
  window.button = button;
  window.input = input;
  window.colorPicker = colorPicker;
  window.useInstances = useInstances;
  window.nodeFunction = nodeFunction;
  window.Instance = Instance;
  window.particle2d = particle2d;
  window.ascii2d = ascii2d;
  window.dot = dot;
  window.pixel = pixel;
  window.AudioSource = AudioSource;
  window.explode = explode;
  window.FX = FX;
  window.Rotate = Rotate;
  window.Scale = Scale;
  window.Flip = Flip;
  window.Translate = Translate;
  window.ChannelMix = ChannelMix;
  window.Brightness = Brightness;
  window.Contrast = Contrast;
  window.Saturation = Saturation;
  window.HueShift = HueShift;
  window.Grade = Grade;
  window.Blur = Blur;
  window.LensBlur = LensBlur;
  window.Threshold = Threshold;
  window.Edge = Edge;
  window.Emboss = Emboss;
  window.Mirror = Mirror;
  window.Tile = Tile;
  window.Kaleidoscope = Kaleidoscope;
  window.Modulate = Modulate;
  window.Displace = Displace;
  window.ModulateScale = ModulateScale;
  window.ModulateRotate = ModulateRotate;
  window.Vignette = Vignette;
  window.Pixelate = Pixelate;
  window.Posterize = Posterize;
  window.ColorLookup = ColorLookup;
  window.Mask = Mask;
  window.ChromaKey = ChromaKey;
  window.GradientMap = GradientMap;
  window.Fisheye = Fisheye;
  window.Invert = Invert;
  window.Colorize = Colorize;
  window.CRT = CRT;
  window.FilmGrain = FilmGrain;
  window.Bitmap = Bitmap;
  window.ChannelThreshold = ChannelThreshold;
  window.ScanLines = ScanLines;
  window.Crop = Crop;

  const blob = new Blob([source], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    if (!mod.nodes) {
      throw new Error('project file must `export const nodes = {...}`');
    }
    return mod.nodes;
  } finally {
    URL.revokeObjectURL(url);
  }
}

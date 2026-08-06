// beatmatch(bpm, t) - given a tempo and the project clock's elapsed
// seconds, returns which beat "now" falls on and how far through it we
// are, properly timed off bpm instead of a manually-tuned slider. This
// replaces patterns like `Math.round(t / beat)` (a hand-picked seconds-
// per-beat slider) with a formula driven by an actual bpm value:
//
//   const { beat } = beatmatch(120, t);
//   out = use(Rotate).tick(out, 20 * beat);
//
// beat: integer count of whole beats since t=0 (increments exactly on
//   the beat - use this anywhere the old code used Math.round(t/beat)).
// phase: 0..1 progress through the current beat (0 = right on the beat,
//   approaching 1 = about to tick over) - useful for smooth per-beat
//   interpolation instead of a hard step.
// pulse: true for beats where phase is within `pulseWidth` of 0 - a
//   short "on the beat" window, handy for triggering a hit each beat.
// value: `phase` reshaped by `shape` (see beatEnvelope below) - the
//   actual thing most projects want to drive brightness/scale/etc from,
//   rather than the raw linear phase. Pass `shape` (and any of that
//   shape's own options) straight through beatmatch's own options object.
//
// subdivide: how many even steps to split EACH beat into for the step*
// fields below (default 1 - a "step" IS a beat). Pass 4 to trigger things
// on every quarter-beat (a 16th note if `beat` itself is a quarter note),
// 3 for triplets, etc. - whatever fraction you had in mind by "every
// 1/4 of a beat":
//
//   const { step, stepPulse } = beatmatch(120, t, { subdivide: 4 });
//   if (stepPulse) out = use(Rotate).tick(out, step * 15);
//
// step: integer count of subdivisions since t=0 (like `beat`, but finer -
//   step increments `subdivide` times per beat instead of once).
// stepPhase: 0..1 progress through the CURRENT subdivision (like `phase`,
//   but relative to one step instead of one whole beat).
// stepPulse: true near each subdivision boundary (like `pulse`, but firing
//   `subdivide` times per beat instead of once) - this is what actually
//   answers "how do I make something happen every 1/4 beat": trigger off
//   stepPulse (or watch `step` change), not off a hand-rolled fractional
//   counter like `beat + phase`, which only ever grows continuously and
//   never tells you when you've crossed a subdivision line.
export function beatmatch(bpm, t = 0, { pulseWidth = 0.08, shape = 'triangle', subdivide = 1, ...shapeOpts } = {}) {
  const beatDuration = 60 / bpm;
  const total = t / beatDuration;
  const beat = Math.floor(total);
  const phase = total - beat;
  const pulse = phase < pulseWidth || phase > 1 - pulseWidth;
  const value = beatEnvelope(phase, shape, shapeOpts);
  const stepTotal = total * subdivide;
  const step = Math.floor(stepTotal);
  const stepPhase = stepTotal - step;
  const stepPulse = stepPhase < pulseWidth || stepPhase > 1 - pulseWidth;
  return { beat, phase, pulse, value, bpm, step, stepPhase, stepPulse };
}

// beatEnvelope(phase, shape, opts) - reshapes a 0..1 beat phase (see
// beatmatch above - or any other 0..1 progress value, e.g. a Pattern) into
// one of several named envelope curves. Standalone/exported separately
// from beatmatch so it's also usable against a phase from somewhere else.
//
//   'pulse'    - quick spike right on the beat, fast exponential decay
//   'build'    - smooth (sine-shaped) symmetric build-and-fall
//   'triangle' - the same build-and-fall, but a straight-line ramp
//                instead of smooth - `peak` (0..1) moves the corner
//   'adsr'     - full attack/decay/sustain/release envelope, each phase's
//                length given as a fraction of the beat (must sum to <= 1;
//                whatever's left over holds at sustainLevel)
//   'sawJump'  - ramps -1..1 across the beat, then jumps back to -1
//   'inverse'  - 1/x-style falloff: spikes at the beat, falls off fast
export function beatEnvelope(phase, shape = 'triangle', opts = {}) {
  switch (shape) {
    case 'pulse': {
      const { decay = 12 } = opts;
      return Math.exp(-phase * decay);
    }
    case 'build':
      return Math.sin(phase * Math.PI);
    case 'triangle': {
      const { peak = 0.5 } = opts;
      return phase < peak ? phase / peak : 1 - (phase - peak) / (1 - peak);
    }
    case 'adsr': {
      const { attack = 0.1, decay = 0.2, sustain = 0.4, release = 0.3, sustainLevel = 0.6 } = opts;
      if (phase < attack) return phase / attack;
      if (phase < attack + decay) return 1 - (1 - sustainLevel) * ((phase - attack) / decay);
      if (phase < attack + decay + sustain) return sustainLevel;
      const releaseStart = attack + decay + sustain;
      return sustainLevel * Math.max(0, 1 - (phase - releaseStart) / release);
    }
    case 'sawJump':
      return phase * 2 - 1;
    case 'inverse': {
      const { falloff = 8 } = opts;
      return 1 / (1 + phase * falloff);
    }
    default:
      return phase;
  }
}

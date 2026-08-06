// midi.knobs / midi.pads - plain key-value stores that grow automatically
// the moment a new CC/note number is actually seen from a connected MIDI
// controller, keyed by a readable "knob_N"/"pad_N" string (N = the raw
// CC/note number) rather than a bare number. No hardcoded per-device
// mapping needed at all - different units (even the same model's mk1 vs
// mk2, see LPD8 vs LPD8_MK2 below) send wildly different numbers, so
// discovering them live beats guessing.
//
//   for (const [key, value] of Object.entries(midi.knobs)) { ... }
//   preview(midi.knobs);  // preview() already stringifies a plain object
//                         // for you - don't JSON.stringify() it yourself
//                         // first, or you'll see it double-escaped
//
// midi.pads' values are plain true/false (pressed or not) - use
// midiVelocity(note) separately if you need how hard it was hit.
//
// midi.knobs/midi.pads/midi.error are plain properties (not function
// calls) - just READING midi.knobs or midi.pads is what triggers the
// lazy connect (the browser's own MIDI permission prompt, same
// convention as WebcamSource/AudioSource); check midi.error if it was
// denied or Web MIDI isn't supported at all (Safari doesn't implement it
// as of this writing, and Firefox's implementation has been flaky with
// some real devices - Chrome/Edge are the safe choice). Each returns the
// SAME live object every time, mutated in place as messages arrive - safe
// to destructure/iterate directly.
//
// midiKnob()/midiPad()/midiVelocity() below read from the exact same
// underlying store, scaled/shaped for the common case where you DO
// already know the number you want (from LPD8/LPD8_MK2, or from having
// watched midi.knobs/midi.pads once to find it) - you still pass them
// the raw number, not the "knob_N"/"pad_N" string.
//
// Every CC/note number is ALSO logged to the console (prefixed "[midi]")
// the first time it's added, so you can watch which physical knob/pad
// maps to which number as you touch each one, without needing to
// inspect midi.knobs/midi.pads directly.
let requested = false;
let error = null;

const knobsStore = {}; // "knob_N" -> 0..1 (rounded to 3 digits), grows as new CCs are seen
const padsStore = {}; // "pad_N" -> true/false, grows as new notes are seen
const noteVelocity = new Map(); // raw note number -> 0..1, for midiVelocity() - see its own comment below

// Raw d2/127 has long floating-point tails (e.g. 0.5039370078740157) that
// are meaningless past a knob's actual physical resolution - round for
// storage (not just display) so every consumer (preview(), midiKnob(),
// direct reads of midi.knobs) sees the same tidy number.
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function handleMessage(e) {
  const [status, d1, d2] = e.data;
  const type = status & 0xf0;
  if (type === 0xb0) {
    // control change - a knob
    const key = `knob_${d1}`;
    const isNew = !(key in knobsStore);
    knobsStore[key] = round3(d2 / 127);
    if (isNew) console.log(`[midi] knob/CC ${d1} seen for the first time (value ${knobsStore[key].toFixed(2)})`);
  } else if (type === 0x90 || type === 0x80) {
    // note on/off - a pad. A note-on with velocity 0 counts as a note-off
    // (standard MIDI running-status convention, not every device bothers
    // sending a real 0x80 message).
    const key = `pad_${d1}`;
    const isNew = !(key in padsStore);
    const isOn = type === 0x90 && d2 > 0;
    // A real note-off message's own d2 is usually a meaningless 0 (or a
    // "release velocity" few controllers bother sending) - only update
    // noteVelocity on an actual press, so midiVelocity() holds its last
    // real value after release instead of getting overwritten with that.
    if (isOn) noteVelocity.set(d1, d2 / 127);
    padsStore[key] = isOn;
    if (isNew) console.log(`[midi] pad/note ${d1} seen for the first time`);
  }
}

function ensureConnected() {
  if (requested) return;
  requested = true;
  if (!navigator.requestMIDIAccess) {
    error = 'Web MIDI not supported in this browser (try Chrome/Edge)';
    return;
  }
  navigator
    .requestMIDIAccess()
    .then((access) => {
      const attachAll = () => {
        for (const input of access.inputs.values()) input.onmidimessage = handleMessage;
      };
      attachAll();
      access.onstatechange = attachAll; // devices plugged in/removed after the initial connect
    })
    .catch((e) => {
      error = e.message;
    });
}

export const midi = {
  get knobs() {
    ensureConnected();
    return knobsStore;
  },
  get pads() {
    ensureConnected();
    return padsStore;
  },
  get error() {
    ensureConnected();
    return error;
  },
};

export function midiError() {
  ensureConnected();
  return error;
}

// midiKnob(cc, { min = 0, max = 1, default = min }) -> the last value
// that CC number reported, scaled to [min, max]. `default` is what you
// get before anything's ever been received for that CC - an un-turned
// knob otherwise silently reads 0, indistinguishable from "turned all
// the way down."
export function midiKnob(cc, { min = 0, max = 1, default: def = min } = {}) {
  ensureConnected();
  const key = `knob_${cc}`;
  if (!(key in knobsStore)) return def;
  return round3(min + knobsStore[key] * (max - min));
}

// midiPad(note, { mode = 'momentary' }) -> true while held ('momentary',
// the default - matches how a drum pad naturally feels), or flips once
// per press ('toggle', like button()).
const toggleState = new Map();
const togglePrevOn = new Map();

export function midiPad(note, { mode = 'momentary' } = {}) {
  ensureConnected();
  const on = !!padsStore[`pad_${note}`];
  if (mode === 'toggle') {
    const wasOn = togglePrevOn.get(note) || false;
    if (on && !wasOn) toggleState.set(note, !(toggleState.get(note) || false));
    togglePrevOn.set(note, on);
    return toggleState.get(note) || false;
  }
  return on;
}

// midiVelocity(note) -> 0..1, from the most recent press of that pad -
// stays at its last value after release rather than resetting to 0, so
// you don't have to catch the exact instant of the note-on message to
// read "how hard was it hit."
export function midiVelocity(note) {
  ensureConnected();
  return noteVelocity.get(note) ?? 0;
}

export const LPD8 = {
  knobs: [70, 71, 72, 73, 74, 75, 76, 77],
  padsA: [36, 37, 38, 39, 40, 41, 42, 43],
  padsB: [44, 45, 46, 47, 48, 49, 50, 51],
  padsC: [52, 53, 54, 55, 56, 57, 58, 59],
};

// The mk2's factory default is a DIFFERENT mapping than the original
// LPD8 above - confirmed against a real unit: knobs on CC 20..27, pads
// on a C-major scale (C4..C5) rather than a chromatic run. Only bank A's
// notes were confirmed directly; padsB/padsC below just continue the
// same scale pattern up an octave each and haven't been checked against
// real hardware - if they're off, watch midi.pads (or the console) while
// pressing bank B/C to get the real numbers, same as figuring out any
// unknown mapping.
export const LPD8_MK2 = {
  knobs: [20, 21, 22, 23, 24, 25, 26, 27],
  padsA: [60, 62, 64, 65, 67, 69, 71, 72], // C4 D4 E4 F4 G4 A4 B4 C5
  padsB: [72, 74, 76, 77, 79, 81, 83, 84], // C5..C6, unconfirmed - see comment above
  padsC: [84, 86, 88, 89, 91, 93, 95, 96], // C6..C7, unconfirmed - see comment above
};

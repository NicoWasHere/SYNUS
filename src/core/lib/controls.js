import { nextCallKey } from './current-node.js';

// slider(name, opts) / button(name, opts) / input(name, opts) - the
// globals behind $slider$/$button$/$input$ (see editor.js). Each is
// backed by a plain value keyed by `name`, held in this module (a
// singleton, same pattern as render-sink.js/file-registry.js) - NOT in
// any node's `state`, so it survives every future patch-send: dragging a
// slider, then editing and sending unrelated code elsewhere in the file,
// doesn't reset it back to its default. Only a real page reload does.
//
// Every call also records itself in `requests` (reset once per graph
// tick via beginControlsTick(), same convention as preview-sink.js) so
// main.js's ControlPanel knows which controls are actually live right
// now - a control whose call got deleted (or is behind an `if` that
// didn't run this tick) just stops appearing, no manual cleanup needed.
//
// requests is keyed by CALL SITE (nextCallKey - "nodeId", "nodeId#2", ...
// same convention as preview()), not by `name` - this is what lets
// ControlPanel float each widget next to the node that called it, the
// same way preview cards do, instead of needing its own separate
// position per uniquely-named control. `name` is still the persistent
// value key (see values below); it's carried inside each request too, so
// ControlPanel/setControlValue can still address the right value.
const values = new Map(); // name -> current value
let requests = new Map(); // call-site key -> { name, type, opts, value } for calls made so far THIS tick
let callCounts = new Map(); // nodeId -> how many control calls THIS tick, for nextCallKey

export function beginControlsTick() {
  requests = new Map();
  callCounts = new Map();
}

export function getControlRequests() {
  return requests;
}

// Called by the actual DOM widget (see main.js) when the user drags/
// clicks/types - never by project code itself.
export function setControlValue(name, value) {
  values.set(name, value);
}

function use(name, type, opts, defaultValue) {
  if (!values.has(name)) values.set(name, defaultValue);
  const value = values.get(name);
  const key = nextCallKey(callCounts) ?? name; // falls back to `name` if called outside a node's code()
  requests.set(key, { name, type, opts, value }); // value included so the UI widget can read it without a separate getter
  return value;
}

export function slider(name, { min = 0, max = 1, step = 0.01, default: def = (min + max) / 2 } = {}) {
  return use(name, 'slider', { min, max, step }, def);
}

export function button(name, { default: def = false } = {}) {
  return use(name, 'button', {}, def);
}

export function input(name, { default: def = 0, type = 'number' } = {}) {
  return use(name, 'input', { type }, def);
}

// colorPicker(name, { default: '#ffffff' }) - the global behind
// $color_picker$ (see editor.js). Returns the current hex string; feed it
// straight into Colorize/GradientMap/anything else that takes a color.
export function colorPicker(name, { default: def = '#ffffff' } = {}) {
  return use(name, 'colorPicker', {}, def);
}

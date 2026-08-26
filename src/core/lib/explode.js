import { EFFECTS } from './fx/registry.js';
import { NODE_TEMPLATES } from './node-templates.js';

function capitalize(name) {
  return name[0].toUpperCase() + name.slice(1);
}

// explode(name) - two things it can return, tried in this order:
//   1. an fx effect name ('rotate', 'scale', ...) -> that effect's raw
//      GLSL source, exactly as it runs. Useful for dropping into a plain
//      GLSL node body to start hand-editing from a known-working version.
//   2. a lib class keyword ('glsl', 'canvas', 'screen', 'null', 'node',
//      'square', ...) -> a blank starter node block for that kind of
//      node, as a complete standalone `newXNode: { ... },` entry ready
//      to paste in and rename.
// Both are just returning text that already exists (a shader string or a
// template string) - nothing is reconstructed or guessed. See
// nodeTemplateBody() below for the same block without the generated key -
// what the editor's bare $name$ shortcut uses instead, for when you'd
// rather supply your own key up front.
export function explode(name) {
  if (EFFECTS[name]) return EFFECTS[name].frag;
  if (NODE_TEMPLATES[name]) return `new${capitalize(name)}Node: ${NODE_TEMPLATES[name]()}`;

  const known = [...Object.keys(EFFECTS), ...Object.keys(NODE_TEMPLATES)];
  throw new Error(`explode: no such name "${name}" - known: ${known.join(', ')}`);
}

// nodeTemplateBody(name, arg) - just the `{ ... },` value for a node
// template, no generated key - null if `name` isn't a node template at
// all (as opposed to an effect name, which has no body form to speak
// of). arg is whatever the editor's `$name(arg)$` shortcut parsed out of
// the parens (see editor.js's NODE_PATTERN) - undefined for a bare
// `$name$` with no parens at all. Every template factory takes it
// positionally and is free to ignore it (most do, same as calling any JS
// function with an extra argument it doesn't declare) - currently only
// `gradient` (a stop count) actually uses it.
export function nodeTemplateBody(name, arg) {
  return NODE_TEMPLATES[name] ? NODE_TEMPLATES[name](arg) : null;
}

// The only names the editor's bare $name$ shortcut should ever try to
// match against - deliberately just the node templates, not effect names
// too, so `$node$`, `$square$`, etc. work but `$rotate$` (an effect, not
// a node shape) does not - that one's still `$explode(rotate)$`.
export const NODE_TEMPLATE_NAMES = Object.keys(NODE_TEMPLATES);

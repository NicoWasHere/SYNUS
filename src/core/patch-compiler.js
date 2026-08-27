// compilePatchToSource(patch) -> a real SYNUS project source string
// ("export const nodes = {...}"), fed straight into the existing,
// unmodified loadProject() pipeline the same way hand-typed code is.
//
// A patch node has NO fixed "kind" - it's a generic box: external wiring
// (`in`, same "otherId.outPort" convention Graph already uses) plus an
// ORDERED list of `slots`. Each slot independently holds either a premade
// effect/source/sink prefab or a hand-written `raw` snippet, and the
// compiler threads a single running `out` value through them in order -
// literally generating the same shape of code a person would type by
// hand (`let out = inputs.src; out = use(FX.rotate).tick(out, 20); ...`).
// This is what makes a node a "box with slots," not a one-shot effect:
// nothing about a node is special-cased beyond what's dropped into it.
//
// This file is pure (no DOM, no globals) - it only ever produces text.
import { EFFECTS } from './lib/fx/registry.js';

function jsKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

// Renders one arg-tree node into JS source text. `path` accumulates the
// dotted key chain (for a stable control name) as we recurse into plain
// objects/arrays - a leaf's control key is `${nodeId}.${slotIndex}` at the
// top of the tree, or `${nodeId}.${slotIndex}.${path.join('.')}` deeper in.
function renderArgTree(node, nodeId, slotIndex, path) {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    if (node.$control) {
      const key = path.length ? `${nodeId}.${slotIndex}.${path.join('.')}` : `${nodeId}.${slotIndex}`;
      const { $control, ...opts } = node;
      return `${$control}(${JSON.stringify(key)}, ${JSON.stringify(opts)})`;
    }
    if (node.$ref) {
      // Rendered as a read from `inputs` - the patch author is responsible
      // for also wiring a matching port in this node's own `in` object
      // (port name = the dotted path so far), same as any other `in` entry.
      const portName = path.join('.') || 'value';
      return `inputs[${JSON.stringify(portName)}]`;
    }
    const entries = Object.entries(node).map(
      ([k, v]) => `${jsKey(k)}: ${renderArgTree(v, nodeId, slotIndex, [...path, k])}`
    );
    return `{ ${entries.join(', ')} }`;
  }
  if (Array.isArray(node)) {
    return `[${node.map((v, i) => renderArgTree(v, nodeId, slotIndex, [...path, String(i)])).join(', ')}]`;
  }
  return JSON.stringify(node);
}

// One line (or a few) of code() body per slot, in order. `isFirst` tells a
// source slot it's allowed to seed `out` from scratch instead of reading it.
function compileSlot(slot, nodeId, slotIndex, isFirst) {
  const { prefab } = slot;

  if (prefab === 'raw') {
    return slot.code || '';
  }

  if (prefab.startsWith('fx.')) {
    const effectKey = prefab.slice(3);
    if (!EFFECTS[effectKey]) throw new Error(`Unknown fx prefab "${prefab}" (node ${nodeId}, slot ${slotIndex})`);
    const arg = renderArgTree(slot.args, nodeId, slotIndex, []);
    return `out = use(FX.${effectKey}).tick(out, ${arg});`;
  }

  if (prefab === 'source.canvasColor') {
    const colorExpr = renderArgTree(slot.args?.color ?? '#ffffff', nodeId, slotIndex, ['color']);
    const sizeExpr = renderArgTree(slot.args?.size ?? 0.3, nodeId, slotIndex, ['size']);
    // Drawn every tick, not gated behind a one-time `state.drawn` flag like
    // the hand-written `square`/`circle` templates - color/size here are
    // meant to react live to a dragged slider, so re-drawing (cheap for a
    // single filled rect) has to happen every tick to track that.
    return [
      `const canvas${slotIndex} = use(Canvas2D, width, height);`,
      `{`,
      `  const { ctx } = canvas${slotIndex};`,
      `  ctx.clearRect(0, 0, width, height);`,
      `  ctx.fillStyle = ${colorExpr};`,
      `  const size = ${sizeExpr} * Math.min(width, height);`,
      `  ctx.fillRect((width - size) / 2, (height - size) / 2, size, size);`,
      `  canvas${slotIndex}.upload();`,
      `}`,
      `${isFirst ? 'let out' : 'out'} = canvas${slotIndex};`,
    ].join('\n    ');
  }

  if (prefab === 'source.image') {
    const urlExpr = renderArgTree(slot.args?.url ?? '', nodeId, slotIndex, ['url']);
    return `${isFirst ? 'let out' : 'out'} = use(ImageSource, width, height).tick(${urlExpr});`;
  }

  if (prefab === 'source.video') {
    const urlExpr = renderArgTree(slot.args?.url ?? '', nodeId, slotIndex, ['url']);
    const optsExpr = renderArgTree(slot.args?.opts ?? {}, nodeId, slotIndex, ['opts']);
    return `${isFirst ? 'let out' : 'out'} = use(VideoSource, width, height).tick(${urlExpr}, ${optsExpr});`;
  }

  if (prefab === 'value.number') {
    const key = `${nodeId}.${slotIndex}`;
    const opts = { ...slot.args };
    delete opts.$control;
    return `${isFirst ? 'let out' : 'out'} = slider(${JSON.stringify(key)}, ${JSON.stringify(opts)});`;
  }

  if (prefab === 'sink.render') {
    return `render(out);`;
  }

  throw new Error(`Unknown prefab "${prefab}" (node ${nodeId}, slot ${slotIndex})`);
}

function compileNode(node) {
  const inputs = node.in || {};
  const slots = node.slots || [];
  const lines = [`const use = useInstances(state);`, `const { width, height } = screenSize();`];

  const hasSeed = Object.prototype.hasOwnProperty.call(inputs, 'src');
  if (hasSeed) lines.push(`let out = inputs.src;`);

  slots.forEach((slot, i) => {
    const isFirst = !hasSeed && i === 0;
    lines.push(compileSlot(slot, node.id, i, isFirst));
  });

  lines.push(`return { out };`);

  const inSrc = `{ ${Object.entries(inputs)
    .map(([k, v]) => `${jsKey(k)}: ${JSON.stringify(v)}`)
    .join(', ')} }`;

  return [
    `  ${jsKey(node.id)}: {`,
    `    in: ${inSrc},`,
    `    code(inputs, state, t) {`,
    ...lines.map((l) => `      ${l}`),
    `    },`,
    `  },`,
  ].join('\n');
}

export function compilePatchToSource(patch) {
  const body = patch.nodes.map(compileNode).join('\n\n');
  return (
    `// GENERATED FROM A MOBILE BLOCK PATCH - hand edits here won't round-trip back into blocks\n` +
    `export const nodes = {\n${body}\n};\n`
  );
}

// Minimal structural checks, surfaced by the mobile UI's error area -
// deliberately not exhaustive (no cycle detection; Graph's own cookOrder
// already tolerates a cycle no worse than hand-written code would).
export function validatePatch(patch) {
  const errors = [];
  const ids = new Set((patch.nodes || []).map((n) => n.id));

  for (const node of patch.nodes || []) {
    const slots = node.slots || [];
    slots.forEach((slot, i) => {
      if (slot.prefab === 'raw') return;
      if (slot.prefab.startsWith('fx.') && !EFFECTS[slot.prefab.slice(3)]) {
        errors.push(`${node.id}.slots[${i}]: unknown effect "${slot.prefab}"`);
      } else if (
        !slot.prefab.startsWith('fx.') &&
        !['source.canvasColor', 'source.image', 'source.video', 'value.number', 'sink.render'].includes(slot.prefab)
      ) {
        errors.push(`${node.id}.slots[${i}]: unknown prefab "${slot.prefab}"`);
      }
    });

    const isSource = slots[0] && (slots[0].prefab === 'raw' || slots[0].prefab.startsWith('source.') || slots[0].prefab === 'value.number');
    if (!node.in?.src && !isSource && slots.length) {
      errors.push(`${node.id}: no incoming "src" wire and slot 0 isn't a source - nothing seeds "out"`);
    }

    for (const ref of Object.values(node.in || {})) {
      const srcId = ref.split('.')[0];
      if (!ids.has(srcId)) errors.push(`${node.id}: dangling wire "${ref}" - no node "${srcId}"`);
    }
  }

  return errors;
}

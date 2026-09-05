// Finds the character span of every top-level node's object literal
// inside `export const nodes = { ... }`. This is NOT how the project
// actually runs - that's still a real ES module import in
// project-loader.js. This is purely for the editor UI: knowing where
// each node's block starts in the text is what lets main.js anchor that
// node's floating preview card to the right line (see ui/preview-
// panel.js) - it never affects hit-testing or the real caret, so any
// imprecision here is purely cosmetic, unlike the CodeMirror widget bug
// this project used to have.
//
// A naive brace counter breaks the moment a node's shader source (a
// template literal) contains its own '{' / '}' characters - GLSL code
// has plenty of those. So this scanner treats the entire contents of any
// string ('...'), template literal (`...`), or comment (//... or /*...*/)
// as opaque and skips over it without counting braces inside.
//
// KNOWN LIMITATION: ${...} interpolation inside a template literal is
// NOT specially handled - the whole backtick span is skipped as one
// opaque unit, braces and all. This is fine for shader source (which
// never uses ${} - uniforms carry dynamic values instead, not string
// interpolation) but means a node that interpolates a value into a
// template literal outside of that pattern may get a slightly wrong
// block boundary. Worth knowing if boundaries ever look off.

// skipOpaqueSpan(source, i) - if `source[i]` starts a string, template
// literal, or comment, returns the index right after that whole span;
// otherwise returns null (nothing to skip here). Shared by
// parseNodeBlocks and scanAndFixNodeSource below so the two scans can
// never disagree about what counts as "inside a string/comment" - a
// prepatch fix landing INSIDE what parseNodeBlocks would treat as opaque
// (or vice versa) would silently corrupt either scan.
function skipOpaqueSpan(source, i) {
  const ch = source[i];
  if (ch === '`' || ch === "'" || ch === '"') {
    const quote = ch;
    let j = i + 1;
    while (j < source.length && source[j] !== quote) {
      if (source[j] === '\\') j++; // skip the escaped character too
      j++;
    }
    return j + 1; // consume closing quote
  }
  if (ch === '/' && source[i + 1] === '/') {
    let j = i;
    while (j < source.length && source[j] !== '\n') j++;
    return j;
  }
  if (ch === '/' && source[i + 1] === '*') {
    let j = i + 2;
    while (j < source.length && !(source[j] === '*' && source[j + 1] === '/')) j++;
    return j + 2;
  }
  return null;
}

export function parseNodeBlocks(source) {
  const anchorMatch = /nodes\s*=\s*\{/.exec(source);
  if (!anchorMatch) return [];

  const results = [];
  let i = anchorMatch.index + anchorMatch[0].length; // just inside the top-level object, depth 1
  let depth = 1;
  let currentKey = null;
  let currentStart = null;

  while (i < source.length && depth > 0) {
    const skipped = skipOpaqueSpan(source, i);
    if (skipped != null) {
      i = skipped;
      continue;
    }
    const ch = source[i];

    if (depth === 1 && currentKey === null && (ch === '_' || ch === '$' || /[a-zA-Z]/.test(ch))) {
      // Try to read an identifier followed by ':' followed eventually by '{' -
      // that's a top-level node key.
      const idMatch = /^[\w$]+/.exec(source.slice(i));
      if (idMatch) {
        let j = i + idMatch[0].length;
        while (j < source.length && /\s/.test(source[j])) j++;
        if (source[j] === ':') {
          j++;
          while (j < source.length && /\s/.test(source[j])) j++;
          if (source[j] === '{') {
            currentKey = idMatch[0];
            currentStart = i; // start at the node's own key, not the '{'
            i = j;
            continue; // re-read source[i] fresh next iteration - it's now '{'
          }
        }
      }
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 1 && currentKey !== null) {
        results.push({ id: currentKey, start: currentStart, end: i + 1 });
        currentKey = null;
        currentStart = null;
      }
    }

    i++;
  }

  return results;
}

// Character offset -> 0-indexed line number, for positioning a node's
// preview card at the right vertical spot in the editor.
export function offsetToLine(source, offset) {
  let line = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

// scanAndFixNodeSource(source) - the "prepatch" pass: catches and
// auto-fixes the two most common hand-typing mistakes in a `nodes`
// object, before the text is ever handed to the real module loader.
// Mirrors parseNodeBlocks's own scan (same opaque-span skipping, same
// depth counter, same identifier-lookahead at depth 1) with two
// additions:
//
// 1. Missing colon: `someKey { ... }` where `someKey: { ... }` was
//    clearly meant - a bare identifier directly followed by '{' (only
//    whitespace between) has no other legal meaning inside an object
//    literal, so this is unambiguous. Inserts ':' right after the
//    identifier and keeps scanning as if it had been there all along -
//    depth tracking and "closest node" both stay correct for everything
//    downstream.
// 2. Stray text after '}': once a recognized node's own '}' closes back
//    to depth 1, whatever follows (after whitespace/comments, which are
//    left alone) MUST be ',' or the outer '}' that ends the whole
//    `nodes` object - anything else is stray leftover text, deleted up
//    to the next real ',' or '}' (comments/strings inside the stray span
//    are treated as opaque too, so their own characters can't be
//    mistaken for that boundary). Deliberately NOT auto-fixed: an actual
//    mismatched/extra brace character itself - that's structural, not
//    "stray text," and not safe to guess at.
//
// Built as a single left-to-right pass over the UNTOUCHED original
// `source` (so nothing about scanning/detection ever has to account for
// earlier fixes shifting offsets), with the fixed text assembled
// separately, append-only, via a `copiedUpTo` cursor - inserting text
// just appends without advancing it, deleting text advances it past
// whatever's being skipped without copying it. Nothing ever needs
// re-indexing.
export function scanAndFixNodeSource(source) {
  const anchorMatch = /nodes\s*=\s*\{/.exec(source);
  if (!anchorMatch) return { fixedSource: source, warnings: [] };

  const warnings = [];
  let out = '';
  let copiedUpTo = 0;
  function flushTo(pos) {
    out += source.slice(copiedUpTo, pos);
    copiedUpTo = pos;
  }

  let i = anchorMatch.index + anchorMatch[0].length;
  let depth = 1;
  let currentKey = null;

  while (i < source.length && depth > 0) {
    const skipped = skipOpaqueSpan(source, i);
    if (skipped != null) {
      i = skipped;
      continue;
    }
    const ch = source[i];

    if (depth === 1 && currentKey === null && (ch === '_' || ch === '$' || /[a-zA-Z]/.test(ch))) {
      const idMatch = /^[\w$]+/.exec(source.slice(i));
      if (idMatch) {
        const afterId = i + idMatch[0].length;
        let j = afterId;
        while (j < source.length && /\s/.test(source[j])) j++;
        if (source[j] === ':') {
          j++;
          while (j < source.length && /\s/.test(source[j])) j++;
          if (source[j] === '{') {
            currentKey = idMatch[0];
            i = j;
            continue;
          }
        } else if (source[j] === '{') {
          // Missing colon - identifier directly followed by '{'.
          flushTo(afterId);
          out += ':';
          const fixStart = out.length - 1;
          warnings.push({
            type: 'missing-colon',
            nodeId: idMatch[0],
            message: `auto-fixed: added a missing ':' after \`${idMatch[0]}\``,
            fixedRange: [fixStart, fixStart + 1],
          });
          currentKey = idMatch[0];
          i = j; // the original '{'
          continue;
        }
      }
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 1 && currentKey !== null) {
        const closedNodeId = currentKey;
        currentKey = null;
        const afterBrace = i + 1;

        // Peek past whitespace/comments for the next real token.
        let p = afterBrace;
        while (p < source.length) {
          if (/\s/.test(source[p])) {
            p++;
            continue;
          }
          const s = skipOpaqueSpan(source, p);
          if (s != null && source[p] === '/') {
            p = s; // a comment - fine, leave it, keep peeking past it
            continue;
          }
          break;
        }

        if (source[p] !== ',' && source[p] !== '}') {
          // Stray text - find where it ends (the next depth-1 ',' or '}'),
          // treating nested strings/comments as opaque so their own
          // characters can't be mistaken for that boundary.
          let end = p;
          while (end < source.length) {
            const s = skipOpaqueSpan(source, end);
            if (s != null) {
              end = s;
              continue;
            }
            if (source[end] === ',' || source[end] === '}') break;
            end++;
          }
          flushTo(afterBrace);
          copiedUpTo = end; // skip [afterBrace, end) - the stray text itself is never copied
          warnings.push({
            type: 'stray-text',
            nodeId: closedNodeId,
            message: `auto-fixed: removed stray text after \`${closedNodeId}\`'s closing '}'`,
            fixedRange: [out.length, out.length], // deleted, not moved - nothing left to point at but where it was
          });
          i = end;
          continue;
        }
      }
    }

    i++;
  }

  flushTo(source.length);
  return { fixedSource: out, warnings };
}

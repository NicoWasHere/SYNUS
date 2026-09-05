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
// parseNodeBlocks and findNodeIssues below so the two scans can never
// disagree about what counts as "inside a string/comment" - a flagged
// span landing INSIDE what parseNodeBlocks would treat as opaque (or
// vice versa) would misreport where the real problem is.
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

// findNodeIssues(source) - a read-only diagnostic pass: reports anything
// in the `nodes` object that doesn't match the expected shape of an
// entry (`key: { ... }`), for the editor to highlight - never modifies
// the text (an earlier version of this auto-fixed two of these; that
// silently rewriting the user's own text turned out to be more
// surprising than helpful, so now it only ever reports, never changes
// anything). Mirrors parseNodeBlocks's own scan (opaque-span skipping,
// depth counter, identifier-lookahead at depth 1). Flags:
//
// - Missing colon: `someKey { ... }` - a bare identifier directly
//   followed by '{' (only whitespace between) has no other legal
//   meaning inside an object literal.
// - Non-object value: `someKey: 5` or `someKey: somethingElse` - every
//   top-level entry's value must itself be a `{ ... }` object (a node's
//   own `{ in, code(...) {...} }` shape) - anything else means this key
//   isn't actually set up as a node.
// - Unexpected text after a node's own '}': whatever follows (past
//   whitespace/comments, which are left alone) must be ',' or the outer
//   '}' that ends the whole `nodes` object - anything else (often a
//   missing comma before the next key) gets flagged, ending at the next
//   real ',' or '}' (nested strings/comments inside that span are
//   treated as opaque too, so their own characters can't be mistaken
//   for that boundary).
// - Unclosed structure: depth never returns to 0 by the end of the file
//   (a genuine unclosed '{' or missing '}' somewhere) - reported as one
//   issue spanning from whichever node was still open (or the last one
//   that successfully closed, if none was) to the end of the file,
//   since there's no way to know exactly where the missing brace
//   belongs, only that something after that point never closed.
export function findNodeIssues(source) {
  const anchorMatch = /nodes\s*=\s*\{/.exec(source);
  if (!anchorMatch) return [];

  const issues = [];
  let i = anchorMatch.index + anchorMatch[0].length;
  let depth = 1;
  let currentKey = null;
  let currentStart = null;
  let lastCloseEnd = i; // fallback anchor for the "unclosed" report if no node ever closed

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
        const idStart = i;
        const afterId = i + idMatch[0].length;
        let j = afterId;
        while (j < source.length && /\s/.test(source[j])) j++;
        if (source[j] === ':') {
          j++;
          while (j < source.length && /\s/.test(source[j])) j++;
          if (source[j] === '{') {
            currentKey = idMatch[0];
            currentStart = idStart;
            i = j;
            continue;
          }
          issues.push({
            nodeId: idMatch[0],
            message: `\`${idMatch[0]}\` isn't set up as a node - expected \`${idMatch[0]}: { in, code(...) {...} }\``,
            range: [idStart, j],
          });
          i = j;
          continue;
        }
        if (source[j] === '{') {
          issues.push({
            nodeId: idMatch[0],
            message: `\`${idMatch[0]}\` is missing a ':' before its '{'`,
            range: [idStart, afterId],
          });
          currentKey = idMatch[0];
          currentStart = idStart;
          i = j;
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
        const closeEnd = i + 1;
        currentKey = null;
        currentStart = null;
        lastCloseEnd = closeEnd;

        let p = closeEnd;
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

        if (p < source.length && source[p] !== ',' && source[p] !== '}') {
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
          issues.push({
            nodeId: closedNodeId,
            message: `unexpected text after \`${closedNodeId}\`'s closing '}' - missing a comma?`,
            range: [closeEnd, end],
          });
          i = end;
          continue;
        }
      }
    }

    i++;
  }

  if (depth > 0) {
    issues.push({
      nodeId: currentKey,
      message: currentKey
        ? `\`${currentKey}\` (or something inside it) is missing a closing '}'`
        : `a '{' somewhere after this point is never closed`,
      range: [currentStart ?? lastCloseEnd, source.length],
    });
  }

  return issues;
}

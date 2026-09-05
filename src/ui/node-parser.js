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
// otherwise returns null (nothing to skip here). Used by parseNodeBlocks
// below so a node's own shader source (a template literal, often full of
// '{'/'}' from GLSL) doesn't corrupt its brace-depth counting.
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

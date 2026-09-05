import { skipOpaqueSpan } from './node-parser.js';

// formatSource(source) - re-derives every line's OWN indentation from
// bracket depth (2 spaces per level, a line starting with a closer
// dedented one level for itself - the exact style every node template in
// this project already hand-writes), while leaving any line that touches
// a string/template-literal/comment span COMPLETELY untouched - reusing
// the same skipOpaqueSpan() node-parser.js's own parseNodeBlocks() relies
// on to keep a GLSL shader's own `{`/`}` from corrupting brace-depth
// counting. Reformatting a shader/Hydra string's own internal lines
// would be destructive (that whitespace is part of the actual value, not
// incidental formatting), so this only ever touches plain code lines.
//
// Two passes: first walk the whole source once (same char-by-char shape
// as parseNodeBlocks) to record, per line, the bracket depth AT THE
// START of that line and whether the line touches any opaque span at
// all (if even one character of it does, the WHOLE line is left alone -
// conservative on purpose, so a string that doesn't span the entire line
// still can't get its surrounding code's indentation guessed wrong).
// Second pass rebuilds each non-protected line from its recorded depth.
export function formatSource(source) {
  const protectedLines = new Set();
  const lineStartDepth = [0];
  let depth = 0;
  let line = 0;
  let i = 0;

  while (i < source.length) {
    const skipped = skipOpaqueSpan(source, i);
    if (skipped != null) {
      for (let j = i; j < skipped && j < source.length; j++) {
        if (source[j] === '\n') {
          protectedLines.add(line);
          line++;
          lineStartDepth[line] = depth;
        }
      }
      protectedLines.add(line); // the span's own last (or only) line
      i = skipped;
      continue;
    }
    const ch = source[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === '\n') {
      line++;
      lineStartDepth[line] = depth;
    }
    i++;
  }

  return source
    .split('\n')
    .map((text, idx) => {
      if (protectedLines.has(idx)) return text;
      const trimmed = text.trim();
      if (!trimmed) return '';
      const startsWithCloser = /^[}\])]/.test(trimmed);
      const level = Math.max(0, lineStartDepth[idx] - (startsWithCloser ? 1 : 0));
      return '  '.repeat(level) + trimmed;
    })
    .join('\n');
}

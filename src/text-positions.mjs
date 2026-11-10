/** The offset of a 1-based line and column in a text. */
export function offsetAt(text, line, column = 1) {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return Math.min(offset + column - 1, text.length);
}

/** The 1-based line and column of an offset in a text. */
export function positionAt(text, offset) {
  let line = 1;
  let lineStart = 0;
  for (;;) {
    const next = text.indexOf('\n', lineStart);
    if (next === -1 || next >= offset) break;
    line += 1;
    lineStart = next + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

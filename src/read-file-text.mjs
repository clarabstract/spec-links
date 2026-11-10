import fs from 'node:fs';

/** Text without the byte order mark some editors put first. */
export function withoutByteOrderMark(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reads a file from disk as text, without its byte order mark. */
export function readFileText(file) {
  return withoutByteOrderMark(fs.readFileSync(file, 'utf8'));
}

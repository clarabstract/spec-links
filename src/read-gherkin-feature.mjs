import { keyNode } from './key-tree.mjs';

/**
 * A Gherkin file has no keys a path can name: a reference stops at
 * the file and resolves to its `Feature:` line.
 */
export function readGherkinFeature(text) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => /^\s*Feature:/.test(line));
  return {
    root: keyNode(null, 1, 1, 0, text.length),
    line: index === -1 ? 1 : index + 1,
  };
}

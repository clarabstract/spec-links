import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { keyNode } from './key-tree.mjs';

/**
 * Reads a YAML file's mapping keys. A list's items have no keys of
 * their own, but a mapping inside a list still scopes what's in it.
 */
export function readYamlKeys(text) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  const root = keyNode(null, 1, 1, 0, text.length);

  const fill = (owner, value) => {
    if (isMap(value)) {
      for (const pair of value.items) {
        if (!isScalar(pair.key) || !pair.key.range) continue;
        const key = String(pair.key.value);
        const start = pair.key.range[0];
        const end = pair.value?.range ? pair.value.range[2] : pair.key.range[2];
        const { line, col } = lineCounter.linePos(start);
        const child = keyNode(key, line, col, start, end);
        if (!owner.children.has(key)) owner.children.set(key, child);
        fill(child, pair.value);
      }
    } else if (isSeq(value)) {
      for (const item of value.items) {
        if (!(isMap(item) || isSeq(item)) || !item.range) continue;
        const { line, col } = lineCounter.linePos(item.range[0]);
        const child = keyNode(null, line, col, item.range[0], item.range[2]);
        owner.unnamed.push(child);
        fill(child, item);
      }
    }
  };
  fill(root, doc.contents);
  return { root, line: 1 };
}

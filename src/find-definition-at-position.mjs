import path from 'node:path';
import { enclosingKeys } from './key-tree.mjs';
import { findPackageOf } from './spec-folder.mjs';
import { offsetAt } from './text-positions.mjs';

/**
 * Where a key's name is written inside one of the ranges it covers.
 * A key has one line of its own, but a GraphQL type written in several
 * blocks has its name in each: `extend type Query` names `Query` too.
 */
function nameStartIn(text, node, [start, end]) {
  const own = offsetAt(text, node.line, node.column);
  if (start <= own && own <= end) {
    // A quoted YAML key starts at its quote.
    return text.startsWith(node.key, own) ? own : own + 1;
  }
  const extending = /^extend\s+[a-z]+\s+/.exec(text.slice(start, end));
  return extending ? start + extending[0].length : null;
}

/** The range of the key's name the offset is on, or null. */
function nameRangeAt(text, node, offset) {
  const range = node.ranges.find(([start, end]) => start <= offset && offset <= end);
  if (!range) return null;
  const start = nameStartIn(text, node, range);
  if (start === null || !text.startsWith(node.key, start)) return null;
  const end = start + node.key.length;
  return start <= offset && offset <= end ? [start, end] : null;
}

/**
 * Finds the definition whose name is under a position: a YAML key, a
 * GraphQL type, field, enum value or argument, or the line a file
 * with no keys resolves to, as a Gherkin file's `Feature:` line.
 *
 * Returns what the resolver would return for a reference to it, so it
 * can be given to `findReferencesTo`, plus `start` and `end`, the
 * offsets of the name. `path` is null for a key in a mapping inside a
 * list, which no full path names. Returns null when the position isn't
 * on a definition or the file isn't inside a `spec/` folder.
 */
export function findDefinitionAt(resolver, file, text, offset) {
  const site = findPackageOf(file);
  if (!site?.insideSpec) return null;
  let keys;
  try {
    keys = resolver.readKeys(file);
  } catch {
    return null;
  }
  if (!keys.root || keys.text !== text) return null;

  const fileName = path.basename(file).split('.')[0];
  const filePath = [
    ...path.relative(site.specDir, path.dirname(file)).split(path.sep).filter(Boolean),
    fileName,
  ];
  const target = {
    ok: true,
    root: site.root,
    name: null,
    file,
    draft: /\.draft\.[^.]+$/.test(path.basename(file)),
  };

  const chain = enclosingKeys(keys.root, offset);
  const node = chain[chain.length - 1];
  if (chain.length > 1 && node.key !== null) {
    const name = nameRangeAt(text, node, offset);
    if (!name) return null;
    const above = chain.slice(1).map((each) => each.key);
    return {
      ...target,
      kind: 'key',
      line: node.line,
      column: node.column,
      path: above.includes(null) ? null : [...filePath, ...above],
      start: name[0],
      end: name[1],
    };
  }

  // A file with no keys is named by the one line it resolves to.
  if (keys.root.children.size === 0 && keys.root.unnamed.length === 0) {
    const start = offsetAt(text, keys.line, 1);
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    if (text.slice(start, end).trim() === '' || offset < start || offset > end) return null;
    return {
      ...target, kind: 'file', line: keys.line, column: 1, path: filePath, start, end,
    };
  }
  return null;
}

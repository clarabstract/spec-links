// The shape every file reader returns: a tree of the keys a path can
// name, each with the line it's written on and the text ranges it
// covers.

/**
 * @typedef {object} KeyNode
 * @property {string|null} key      null for the file itself and for an
 *                                  unnamed mapping inside a list
 * @property {number} line          1-based
 * @property {number} column        1-based
 * @property {Array<[number, number]>} ranges  offsets it covers
 * @property {Map<string, KeyNode>} children
 * @property {KeyNode[]} unnamed    mappings inside lists, for scoping
 */

export function keyNode(key, line, column, start, end) {
  return {
    key,
    line,
    column,
    ranges: [[start, end]],
    children: new Map(),
    unnamed: [],
  };
}

function covers(node, offset) {
  return node.ranges.some(([start, end]) => start <= offset && offset <= end);
}

/**
 * The nodes that enclose an offset, from the file's root to the
 * innermost key.
 */
export function enclosingKeys(root, offset) {
  const chain = [root];
  let current = root;
  for (;;) {
    let inner = null;
    let innerStart = -1;
    for (const child of [...current.children.values(), ...current.unnamed]) {
      for (const [start, end] of child.ranges) {
        if (start > offset || offset > end) continue;
        // Adjacent keys share a boundary offset; the later one owns it.
        if (start >= innerStart) {
          inner = child;
          innerStart = start;
        }
      }
    }
    if (!inner) return chain;
    chain.push(inner);
    current = inner;
  }
}

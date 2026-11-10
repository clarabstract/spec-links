import { Kind, parse } from 'graphql';
import { keyNode } from './key-tree.mjs';

const TYPE_KINDS = new Set([
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_DEFINITION,
]);
const EXTENSION_KINDS = new Set([
  Kind.OBJECT_TYPE_EXTENSION,
  Kind.INTERFACE_TYPE_EXTENSION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
  Kind.ENUM_TYPE_EXTENSION,
  Kind.UNION_TYPE_EXTENSION,
  Kind.SCALAR_TYPE_EXTENSION,
]);

function named(node) {
  const { line, column } = node.name.loc.startToken;
  return keyNode(node.name.value, line, column, node.loc.start, node.loc.end);
}

/**
 * Reads a GraphQL schema file's definitions: a type, then its fields
 * or enum values, then a field's arguments. A type written in several
 * blocks is one key; each field keeps the line of the block that
 * defines it, and the type's line is its `type` block's when the file
 * has one.
 */
export function readGraphqlDefinitions(text) {
  const doc = parse(text);
  const root = keyNode(null, 1, 1, 0, text.length);

  for (const definition of doc.definitions) {
    const isType = TYPE_KINDS.has(definition.kind);
    if (!isType && !EXTENSION_KINDS.has(definition.kind)) continue;
    const block = named(definition);
    let type = root.children.get(block.key);
    if (!type) {
      type = block;
      root.children.set(block.key, type);
    } else {
      type.ranges.push(block.ranges[0]);
      if (isType) {
        type.line = block.line;
        type.column = block.column;
      }
    }
    const members = definition.fields ?? definition.values ?? [];
    for (const member of members) {
      const child = named(member);
      if (!type.children.has(child.key)) type.children.set(child.key, child);
      for (const argument of member.arguments ?? []) {
        const inner = named(argument);
        if (!child.children.has(inner.key)) {
          child.children.set(inner.key, inner);
        }
      }
    }
  }
  return { root, line: 1 };
}

import path from 'node:path';
import { Kind, parse, visit as visitGraphql } from 'graphql';
import { isScalar, parseDocument, visit as visitYaml } from 'yaml';
import { findSpecMarkers } from './find-spec-markers.mjs';
import { looksLikeReference } from './parse-reference.mjs';

const BRACED = /\{([^{}\s]+)\}/g;

function sitesInYaml(text) {
  const sites = [];
  const doc = parseDocument(text, { prettyErrors: false });
  visitYaml(doc, {
    Scalar(key, node) {
      if (key === 'key' || typeof node.value !== 'string' || !node.range) return;
      const [start, end] = node.range;
      const source = text.slice(start, end);
      if (looksLikeReference(node.value)) {
        const at = start + Math.max(source.indexOf(node.value), 0);
        sites.push({ text: node.value, start: at, end: at + node.value.length, kind: 'value' });
        return;
      }
      for (const match of source.matchAll(BRACED)) {
        if (!looksLikeReference(match[1])) continue;
        const at = start + match.index + 1;
        sites.push({ text: match[1], start: at, end: at + match[1].length, kind: 'brace' });
      }
    },
  });
  return sites;
}

function sitesInGraphql(text) {
  let doc;
  try {
    doc = parse(text);
  } catch {
    return findSpecMarkers(text).map((site) => ({ ...site, kind: 'marker' }));
  }
  const sites = [];
  visitGraphql(doc, {
    Directive(directive) {
      const marker = directive.name.value === 'spec';
      const strings = [];
      for (const argument of directive.arguments ?? []) {
        if (argument.value.kind === Kind.STRING) strings.push(argument.value);
        if (argument.value.kind === Kind.LIST) {
          strings.push(...argument.value.values.filter((v) => v.kind === Kind.STRING));
        }
      }
      for (const string of strings) {
        if (string.block) continue;
        if (!marker && !looksLikeReference(string.value)) continue;
        const start = string.loc.start + 1;
        sites.push({
          text: string.value,
          start,
          end: start + string.value.length,
          kind: marker ? 'marker' : 'value',
        });
      }
    },
  });
  return sites;
}

/**
 * Lists the places in a file's text where a reference is or may be
 * written. Each is `{ text, start, end, kind }`:
 *
 * - `marker`: inside a `@spec(...)` marker, in any file. Always meant
 *   as a reference, so one that doesn't resolve is a mistake.
 * - `brace`: `{...}` inside YAML text, with the shape of a reference.
 * - `value`: a whole YAML value, or a string argument of another
 *   GraphQL directive, with the shape of a reference. Whether it is
 *   one depends on the field, which this tool doesn't know, so treat
 *   it as a reference only when it resolves.
 */
export function listReferenceSites(file, text) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.yaml' || extension === '.yml') return sitesInYaml(text);
  if (extension === '.graphql' || extension === '.gql') return sitesInGraphql(text);
  return findSpecMarkers(text).map((site) => ({ ...site, kind: 'marker' }));
}

/** The reference site that covers an offset, if any. */
export function referenceSiteAt(file, text, offset) {
  return listReferenceSites(file, text).find(
    (site) => site.start <= offset && offset <= site.end,
  ) ?? null;
}

import fs from 'node:fs';
import path from 'node:path';
import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import { readFileText } from './read-file-text.mjs';
import { SPEC_FOLDER } from './spec-folder.mjs';

export const LOCATION_MAP = 'spec-locations.yaml';

/**
 * Where a root says what it's called. A package says it in its
 * manifest. A root that isn't a package says it in the `solution`
 * field of its `spec/solution-spec.yaml`.
 */
export const defaultNameDeclarations = [
  { file: 'package.json', field: 'name' },
  { file: `${SPEC_FOLDER}/solution-spec.yaml`, field: 'solution' },
  { file: `${SPEC_FOLDER}/solution-spec.draft.yaml`, field: 'solution' },
];

/** Every name a root declares for itself, usually one. */
export function readDeclaredNames(root, declarations = defaultNameDeclarations) {
  const names = [];
  for (const { file, field } of declarations) {
    let text;
    try {
      text = readFileText(path.join(root, file));
    } catch {
      continue;
    }
    let value;
    try {
      value = file.endsWith('.json')
        ? JSON.parse(text)?.[field]
        : parseDocument(text).get(field);
    } catch {
      continue;
    }
    if (typeof value === 'string' && !names.includes(value)) names.push(value);
  }
  return names;
}

/**
 * Reads the nearest location map at or above a folder: a flat YAML map
 * of name to a path relative to the map. Returns
 * `{ file, locations }`, each location `{ dir, line }`, or null when
 * there is no map.
 */
export function readLocationMap(fromDir) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const file = path.join(dir, LOCATION_MAP);
    if (fs.existsSync(file)) {
      const lineCounter = new LineCounter();
      const doc = parseDocument(readFileText(file), { lineCounter });
      const locations = new Map();
      if (isMap(doc.contents)) {
        for (const pair of doc.contents.items) {
          if (!isScalar(pair.key) || !isScalar(pair.value)) continue;
          if (typeof pair.value.value !== 'string') continue;
          locations.set(String(pair.key.value), {
            dir: path.resolve(dir, pair.value.value),
            line: lineCounter.linePos(pair.key.range[0]).line,
          });
        }
      }
      return { file, locations };
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Finds the root a name stands for, as seen from a folder. The
 * referencing package's own name comes first, then the location map,
 * then each package locator. Returns `{ root }` or
 * `{ code, message, at }`, where `at` is the map entry at fault.
 */
export function locateNamedRoot(name, fromDir, options = {}) {
  const declarations = options.nameDeclarations ?? defaultNameDeclarations;
  const locators = options.packageLocators ?? [];

  if (options.ownRoot && readDeclaredNames(options.ownRoot, declarations).includes(name)) {
    return { root: options.ownRoot };
  }

  const map = readLocationMap(fromDir);
  const mapped = map?.locations.get(name);
  if (mapped) {
    const at = { file: map.file, line: mapped.line };
    if (!fs.existsSync(mapped.dir)) {
      return {
        code: 'location-missing',
        message: `"${name}" is mapped to ${mapped.dir}, which doesn't exist`,
        at,
      };
    }
    const declared = readDeclaredNames(mapped.dir, declarations);
    if (!declared.includes(name)) {
      return {
        code: 'name-mismatch',
        message: declared.length
          ? `"${name}" is mapped to ${mapped.dir}, which calls itself `
            + `"${declared.join('" and "')}"`
          : `"${name}" is mapped to ${mapped.dir}, which declares no name`,
        at,
      };
    }
    return { root: mapped.dir };
  }

  for (const locate of locators) {
    const root = locate(name, fromDir);
    if (root) return { root };
  }
  return {
    code: 'unknown-name',
    message: map
      ? `nothing called "${name}": it isn't in ${LOCATION_MAP} and isn't an installed package`
      : `nothing called "${name}": there's no ${LOCATION_MAP} at or above `
        + `${fromDir} and it isn't an installed package`,
    at: map ? { file: map.file, line: null } : null,
  };
}

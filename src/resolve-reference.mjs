import fs from 'node:fs';
import path from 'node:path';
import { defaultFileReaders } from './file-readers.mjs';
import { enclosingKeys } from './key-tree.mjs';
import { locateNamedRoot } from './locate-named-root.mjs';
import { locateNodePackage } from './locate-node-package.mjs';
import { parseReference } from './parse-reference.mjs';
import { readFileText } from './read-file-text.mjs';
import {
  SPEC_FOLDER,
  findPackageOf,
  listFolderEntries,
  samePath,
} from './spec-folder.mjs';
import { offsetAt } from './text-positions.mjs';

// `at` is where the resolving stopped, when that is a place: the
// message itself names things by their spec path, never by a file path.
const problem = (code, message, at = null) => ({ ok: false, code, message, at });

/**
 * Makes a resolver. Options, all optional:
 *
 * - `readText(file)`: returns a file's text, for callers that hold
 *   unsaved text. Defaults to reading the file from disk.
 * - `fileReaders`: readers by extension, replacing the default set.
 * - `packageLocators`: functions `(name, fromDir) => folder | null`
 *   asked for a name the location map doesn't have. Defaults to Node's
 *   package resolution.
 * - `nameDeclarations`: where a root declares its name.
 */
export function createResolver(options = {}) {
  const readText = options.readText ?? readFileText;
  const fileReaders = options.fileReaders ?? defaultFileReaders;
  const locating = {
    packageLocators: options.packageLocators ?? [locateNodePackage],
    nameDeclarations: options.nameDeclarations,
  };
  const parsed = new Map();

  /** The file's text and key tree, parsed again only when it changes. */
  function readKeys(file) {
    const text = readText(file);
    const cached = parsed.get(file);
    if (cached && cached.text === text) return cached;
    const reader = fileReaders[path.extname(file).toLowerCase()];
    let entry;
    try {
      entry = { text, ...(reader ? reader(text) : { root: null, line: 1 }) };
    } catch (error) {
      entry = { text, root: null, line: 1, unreadable: error.message };
    }
    parsed.set(file, entry);
    return entry;
  }

  const pathText = (parts) => parts.join('.');

  /** Follows the parts after a key that has bound. */
  function resolveInKeys(target, node, parts, bound) {
    let current = node;
    const keys = [];
    for (const part of parts) {
      const next = current.children.get(part);
      if (!next) {
        const where = [...bound, ...keys].join('.');
        return problem('no-such-key', `${where} has no key "${part}"`, {
          file: target.file,
          line: current.line,
        });
      }
      keys.push(part);
      current = next;
    }
    return {
      ok: true,
      ...target,
      kind: 'key',
      line: current.line,
      column: current.column,
      path: target.path ? [...target.path, ...keys] : null,
    };
  }

  /** Follows parts from a folder: folders, then a file, then keys. */
  function resolveInFolder(root, name, dir, folderParts, parts) {
    const [first, ...rest] = parts;
    const entry = listFolderEntries(dir).get(first);
    const here = folderParts.length ? pathText(folderParts) : `${SPEC_FOLDER}/`;
    if (!entry) {
      return problem('not-found', `${here} has no file or folder "${first}"`, {
        file: dir,
        line: null,
      });
    }
    if (entry.problem) return problem('ambiguous', entry.problem, { file: dir, line: null });
    const reached = [...folderParts, first];
    if (entry.folder) {
      if (rest.length) return resolveInFolder(root, name, entry.folder, reached, rest);
      return {
        ok: true, root, name, file: entry.folder, kind: 'folder',
        line: null, column: null, path: reached, draft: false,
      };
    }
    const target = {
      root, name, file: entry.file, kind: 'file',
      line: 1, column: 1, path: reached, draft: entry.draft,
    };
    let keys;
    try {
      keys = readKeys(entry.file);
    } catch (error) {
      return problem('unreadable', `can't read ${entry.file}: ${error.message}`);
    }
    target.line = keys.line;
    if (!rest.length) return { ok: true, ...target };
    if (keys.unreadable) {
      return problem('unreadable', `can't parse ${entry.file}: ${keys.unreadable}`);
    }
    if (!keys.root) {
      return problem(
        'no-such-key',
        `${pathText(reached)} is a file with no keys, so nothing can follow it`,
        { file: entry.file, line: keys.line },
      );
    }
    return resolveInKeys(target, keys.root, rest, reached);
  }

  /** The offset a reference sits at, or null when the caller gave none. */
  function offsetOf(from, text) {
    if (typeof from.offset === 'number') return from.offset;
    if (typeof from.line === 'number') {
      return offsetAt(text, from.line, from.column ?? 1);
    }
    return null;
  }

  /**
   * Resolves a reference made in a file.
   *
   * `from` is `{ file }` plus where in the file the reference sits,
   * as `offset` or as 1-based `line` and `column`. Without a position
   * the walk starts at the file's top-level keys.
   *
   * Returns `{ ok: true, root, name, file, line, column, kind, path,
   * draft }`, where `kind` is `key`, `file` or `folder`, `path` is the
   * full path from `spec/` and `name` is the name before the colon or
   * null. A folder has no line. On failure returns
   * `{ ok: false, code, message, at }`, where `at` is `{ file, line }`
   * for the place the resolving stopped, or null when there is none;
   * its `line` is null when the place is a folder.
   */
  function resolve(reference, from) {
    const parsedReference = parseReference(reference);
    if (parsedReference.problem) {
      return problem('malformed', parsedReference.problem);
    }
    const { name, parts } = parsedReference;
    const file = path.resolve(from.file);
    const site = findPackageOf(file);

    if (name !== null) {
      const located = locateNamedRoot(name, site?.root ?? path.dirname(file), {
        ...locating,
        ownRoot: site?.root,
      });
      if (!located.root) return problem(located.code, located.message, located.at ?? null);
      const specDir = path.join(located.root, SPEC_FOLDER);
      if (!fs.existsSync(specDir)) {
        return problem(
          'no-spec-folder',
          `"${name}" is at ${located.root}, which has no ${SPEC_FOLDER}/ folder`,
        );
      }
      return resolveInFolder(located.root, name, specDir, [], parts);
    }

    if (!site) {
      return problem(
        'no-spec-folder',
        `${file} isn't in a ${SPEC_FOLDER}/ folder and no folder above it has one`,
      );
    }
    if (!site.insideSpec) {
      return resolveInFolder(site.root, null, site.specDir, [], parts);
    }

    // Local first: the keys around the reference, innermost first.
    const folderParts = path
      .relative(site.specDir, path.dirname(file))
      .split(path.sep)
      .filter(Boolean);
    let keys = null;
    try {
      keys = readKeys(file);
    } catch {
      keys = null;
    }
    if (keys?.root) {
      const offset = offsetOf(from, keys.text);
      const chain = offset === null ? [keys.root] : enclosingKeys(keys.root, offset);
      const own = chain.length > 1 ? chain[chain.length - 1] : null;
      const first = Math.max(chain.length - 2, 0);
      for (let index = first; index >= 0; index -= 1) {
        const match = chain[index].children.get(parts[0]);
        if (!match || match === own) continue;
        // A key under a mapping inside a list can be reached from
        // beside it but has no full path.
        const above = chain.slice(1, index + 1).map((node) => node.key);
        const fileName = path.basename(file).split('.')[0];
        const reached = above.includes(null)
          ? null
          : [...folderParts, fileName, ...above, parts[0]];
        const target = {
          root: site.root, name: null, file,
          draft: /\.draft\.[^.]+$/.test(path.basename(file)),
          path: reached,
        };
        return resolveInKeys(target, match, parts.slice(1), reached ?? [parts[0]]);
      }
    }

    // Then the files and folders beside the file, out to spec/.
    for (let dir = path.dirname(file), depth = folderParts.length; ; depth -= 1) {
      if (listFolderEntries(dir).has(parts[0])) {
        return resolveInFolder(site.root, null, dir, folderParts.slice(0, depth), parts);
      }
      if (samePath(dir, site.specDir)) break;
      dir = path.dirname(dir);
    }
    return problem(
      'not-found',
      `nothing called "${parts[0]}" around this reference: not a key above it `
        + `in ${path.basename(file)}, and not a file or folder beside it up to `
        + `${SPEC_FOLDER}/`,
    );
  }

  return { resolve, readKeys };
}

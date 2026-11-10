import fs from 'node:fs';
import path from 'node:path';
import { listReferenceSites } from './list-reference-sites.mjs';
import { readFileText, withoutByteOrderMark } from './read-file-text.mjs';
import { samePath } from './spec-folder.mjs';
import { positionAt } from './text-positions.mjs';

const MAX_BYTES = 1024 * 1024;

/**
 * Lists the files under a folder worth scanning for references:
 * everything except hidden entries, `node_modules` and files over
 * 1 MB.
 */
export function listFilesToScan(dir) {
  const files = [];
  const walk = (current) => {
    let dirents;
    try {
      dirents = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue;
      const absolute = path.join(current, dirent.name);
      if (dirent.isDirectory()) walk(absolute);
      else if (dirent.isFile() && fs.statSync(absolute).size <= MAX_BYTES) {
        files.push(absolute);
      }
    }
  };
  walk(path.resolve(dir));
  return files;
}

/** True when `found` is the target or, if asked, something inside it. */
export function pointsAt(found, target, includeInside = true) {
  if (!found.path || !target.path) {
    return samePath(found.file, target.file) && found.line === target.line;
  }
  if (!samePath(found.root, target.root)) return false;
  if (found.path.length < target.path.length) return false;
  if (!includeInside && found.path.length !== target.path.length) return false;
  return target.path.every((part, index) => found.path[index] === part);
}

/**
 * True for a value that resolves to the file it is written in, as
 * `entity: booking` does in `entities/booking.yaml`. That is the file
 * saying its own name, which nobody means as a reference.
 */
export function namesOwnFile(site, result, file) {
  if (site.kind !== 'value' || result.kind !== 'file') return false;
  const entryName = (name) => path.basename(name).split('.')[0];
  return samePath(path.dirname(result.file), path.dirname(file))
    && entryName(result.file) === entryName(file);
}

/**
 * Resolves every reference site in a file. Returns each site with its
 * 1-based `line` and `column` and its `result` from the resolver.
 */
export function resolveReferenceSites(resolver, file, text) {
  if (text.includes('\0')) return [];
  return listReferenceSites(file, text).map((site) => ({
    ...site,
    ...positionAt(text, site.start),
    result: resolver.resolve(site.text, { file, offset: site.start }),
  }));
}

/**
 * Finds what references a target, the reverse of resolving. `target`
 * is a result from the resolver; `files` are the files to look in.
 * A reference to something inside the target counts unless
 * `includeInside` is false. Returns `{ file, line, column, start,
 * end, text, kind }` for each reference.
 */
export function findReferencesTo(resolver, target, files, options = {}) {
  const readText = options.readText ?? readFileText;
  const references = [];
  for (const file of files) {
    let text;
    try {
      text = withoutByteOrderMark(readText(file));
    } catch {
      continue;
    }
    for (const site of resolveReferenceSites(resolver, file, text)) {
      if (!site.result.ok || namesOwnFile(site, site.result, file)) continue;
      if (!pointsAt(site.result, target, options.includeInside ?? true)) continue;
      const { result, ...where } = site;
      references.push({ file, ...where });
    }
  }
  return references;
}

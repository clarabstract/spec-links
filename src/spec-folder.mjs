import fs from 'node:fs';
import path from 'node:path';

export const SPEC_FOLDER = 'spec';
const DRAFT = '.draft';

/** A path in the form two spellings of one file share. */
export function pathKey(file) {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Compares two paths the way the file system does. */
export function samePath(a, b) {
  return pathKey(a) === pathKey(b);
}

/** True when a path is a folder or something inside it. */
export function isInside(file, folder) {
  const relative = path.relative(pathKey(folder), pathKey(file));
  return relative === ''
    || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isDirectory(absolute) {
  try {
    return fs.statSync(absolute).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Finds the package a file belongs to: the folder that holds the
 * `spec/` folder the file is in, or else the nearest folder above the
 * file that has a `spec/` folder. Returns
 * `{ root, specDir, insideSpec }`, or null when there is neither.
 */
export function findPackageOf(file) {
  const start = path.dirname(path.resolve(file));
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (path.basename(dir) === SPEC_FOLDER) {
      return { root: path.dirname(dir), specDir: dir, insideSpec: true };
    }
    if (path.dirname(dir) === dir) break;
  }
  for (let dir = start; ; dir = path.dirname(dir)) {
    const specDir = path.join(dir, SPEC_FOLDER);
    if (isDirectory(specDir)) return { root: dir, specDir, insideSpec: false };
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Lists what a path part can name in a folder: each subfolder, and
 * each file without its extension. `item.draft.yaml` is listed as
 * `item` and read in place of `item.yaml`. Hidden entries and names
 * that contain a dot can't be named and are left out.
 *
 * Returns a map of name to `{ folder }`, `{ file, draft }` or
 * `{ problem }` when the name is ambiguous.
 */
export function listFolderEntries(dir) {
  const found = new Map();
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  const slot = (name) => {
    if (!found.has(name)) found.set(name, { folders: [], files: [], drafts: [] });
    return found.get(name);
  };
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue;
    const absolute = path.join(dir, dirent.name);
    if (dirent.isDirectory() || (dirent.isSymbolicLink() && isDirectory(absolute))) {
      if (!dirent.name.includes('.')) slot(dirent.name).folders.push(absolute);
      continue;
    }
    let name = path.basename(dirent.name, path.extname(dirent.name));
    const draft = name.endsWith(DRAFT);
    if (draft) name = name.slice(0, -DRAFT.length);
    if (name === '' || name.includes('.')) continue;
    (draft ? slot(name).drafts : slot(name).files).push(absolute);
  }

  const entries = new Map();
  for (const [name, { folders, files, drafts }] of found) {
    const base = (list) => list.map((item) => path.basename(item)).join(' and ');
    if (folders.length && (files.length || drafts.length)) {
      entries.set(name, {
        problem: `"${name}" is both a folder and a file `
          + `(${base([...files, ...drafts])}) in ${dir}`,
      });
    } else if (folders.length) {
      entries.set(name, { folder: folders[0] });
    } else if (drafts.length > 1 || (!drafts.length && files.length > 1)) {
      entries.set(name, {
        problem: `"${name}" names more than one file `
          + `(${base(drafts.length ? drafts : files)}) in ${dir}`,
      });
    } else if (drafts.length) {
      entries.set(name, { file: drafts[0], draft: true });
    } else {
      entries.set(name, { file: files[0], draft: false });
    }
  }
  return entries;
}

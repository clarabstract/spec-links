import fs from 'node:fs';
import path from 'node:path';

/**
 * The package locator for Node: finds an installed package the way
 * Node does, in the nearest `node_modules` at or above the folder the
 * reference is made from. Returns the package's folder or null.
 *
 * This is the only part that knows about Node. A locator for another
 * language is a function with the same signature.
 */
export function locateNodePackage(name, fromDir) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return fs.realpathSync(candidate);
    }
    if (path.dirname(dir) === dir) return null;
  }
}

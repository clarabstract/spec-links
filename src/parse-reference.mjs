// A reference is `<path>` or `<name>:<path>`. The path is dot-separated
// parts; the name is the package's or solution's own name.

const PART = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/**
 * Splits a reference into its name and parts.
 * Returns `{ name, parts }`, with `name` null when there is no colon,
 * or `{ problem }` when the text isn't a reference.
 */
export function parseReference(text) {
  if (typeof text !== 'string' || text === '') {
    return { problem: 'a reference is a non-empty string' };
  }
  const colon = text.indexOf(':');
  const name = colon === -1 ? null : text.slice(0, colon);
  const path = colon === -1 ? text : text.slice(colon + 1);
  if (name !== null && !NAME.test(name)) {
    return { problem: `"${name}" isn't a package or solution name` };
  }
  if (path === '') {
    return { problem: `"${text}" has no path after the colon` };
  }
  const parts = path.split('.');
  for (const part of parts) {
    if (!PART.test(part)) {
      return {
        problem: part === ''
          ? `"${text}" has an empty part`
          : `"${part}" in "${text}" isn't a key, file or folder name`,
      };
    }
  }
  return { name, parts };
}

/** True when the text has the shape of a reference. */
export function looksLikeReference(text) {
  return !parseReference(text).problem;
}

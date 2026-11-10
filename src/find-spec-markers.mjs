// `@spec(...)` is found with a plain regex, so it works in any file
// without knowing the language. Inside the brackets is either one bare
// path, `@spec(entities.item.rules.one-open)`, or named lists of
// quoted paths, `@spec(enforces: ["...", "..."])`.

const MARKER = /@spec\(([^()]*)\)/g;
const QUOTED = /"([^"\n]*)"|'([^'\n]*)'/g;

/**
 * Finds every reference inside a `@spec(...)` marker. Returns
 * `{ text, start, end }` for each, with offsets into the text given.
 */
export function findSpecMarkers(text) {
  const references = [];
  for (const marker of text.matchAll(MARKER)) {
    const inside = marker[1];
    const insideStart = marker.index + '@spec('.length;
    const quoted = [...inside.matchAll(QUOTED)];
    if (quoted.length) {
      for (const match of quoted) {
        const start = insideStart + match.index + 1;
        const value = match[1] ?? match[2];
        references.push({ text: value, start, end: start + value.length });
      }
      continue;
    }
    const bare = inside.trim();
    if (bare === '') continue;
    const start = insideStart + inside.indexOf(bare);
    references.push({ text: bare, start, end: start + bare.length });
  }
  return references;
}

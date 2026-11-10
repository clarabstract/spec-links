# spec-links

Resolves a spec reference to the exact file and line it names, and
finds what references a spec item.

A package keeps its spec in a `spec/` folder. A reference such as
`entities.booking.rules.no-overlap` names one thing in it. This
package turns the reference into a file and a line, and the other way
round lists every place that references a given thing. It knows how
references are written and read; it knows nothing about what an
entity, a requirement or a schema means.

## How references work

A reference is a path of parts joined by dots. It walks the `spec/`
folder: folders, then a file without its extension, then keys inside
the file.

```
entities.booking.rules.no-overlap
   |        |      |       |
 folder   file    key     key      spec/entities/booking.yaml
```

**A name and a colon** point outside the package.
`room-booking:requirements.book.confirm` is
`requirements.book.confirm` from the `spec/` folder of the package or
solution called `room-booking`. The name is the one the target gives
itself. After the colon the path is always complete.

**Without a colon** the reference resolves inside its own package,
nearest first. It starts at the key it is written under, checks that
key's siblings, then each enclosing mapping up to the top of the
file, then the files and folders beside the file, and so on up to
`spec/`. The nearest match wins on the first part only; the rest of
the path resolves from there or the reference is an error.

```yaml
# spec/entities/booking.yaml
properties:
  room:
    type: entities.room        # spec/entities/room.yaml
lifecycles:
  status:
    starts: states.held        # the sibling key below
    states:
      held: made, not yet confirmed
rules:
  no-overlap:
    rule: No two bookings of a {properties.room} overlap.
```

Only the key a reference is written under is skipped. Keys above it
are candidates like any other, so `type: room` under the property
`room` would find that property, and the entity is written
`entities.room`.

Code outside `spec/` has no keys around it, so a reference there is
a complete path: `@spec(entities.booking.rules.no-overlap)`.

### What a path can name

| File | Parts after the file name |
| --- | --- |
| YAML | mapping keys, as deep as they go |
| GraphQL | a type, then a field or enum value, then an argument; `extend type` is merged |
| Gherkin | nothing; the file resolves to its `Feature:` line |
| anything else | nothing; the file resolves to line 1 |

Two limits follow from the path: a folder and a file in the same
folder can't share a name, and a key can't contain a dot.

A file named `<name>.draft.<extension>` is read in place of
`<name>.<extension>`, and is referenced by the same path.

### Finding another package

A name before a colon is looked up in two steps.

1. `spec-locations.yaml`, the nearest one at or above the referencing
   package. It maps names to folders, relative to itself:

   ```yaml
   room-booking: ../room-booking
   contact-formats: ../contact-formats
   ```

2. Installed Node packages, as `require` would find them from the
   referencing package.

The map only says where something is. The key has to be the name the
target declares, which is `name` in its `package.json` or `solution`
in its `spec/solution-spec.yaml`; a mismatch is an error, and so is a
name found by neither step. A package can reference itself by its own
name.

## Install

It isn't on npm yet. Install it from this repository, at a tag:

```
npm install github:clarabstract/spec-links#v0.1
```

It needs Node 20 or later.

## Use

```js
import { createResolver, findReferencesTo, listFilesToScan } from 'spec-links';

const resolver = createResolver();
const target = resolver.resolve('states.held', {
  file: '/work/room-booking-service/spec/entities/booking.yaml',
  line: 36,
  column: 13,
});
// { ok: true, file: '.../spec/entities/booking.yaml', line: 38, column: 7,
//   kind: 'key', root: '.../room-booking-service', name: null, draft: false,
//   path: ['entities', 'booking', 'lifecycles', 'status', 'states', 'held'] }

const files = listFilesToScan('/work/room-booking-service');
findReferencesTo(resolver, target, files);
// [{ file, line, column, start, end, text, kind }, ...]
```

`resolve(reference, from)` takes the place the reference is written:
`{ file }` with `offset`, or `line` and `column`, or neither for the
top of the file. A reference that doesn't resolve returns
`{ ok: false, code, message, at }`, where `code` is one of
`malformed`, `no-spec-folder`, `not-found`, `no-such-key`,
`ambiguous`, `unreadable`, `unknown-name`, `name-mismatch`,
`location-missing`. The message names things by their spec path.
`at` is `{ file, line }` for the place the resolving stopped, such as
the mapping that lacks the key, or null when there is no such place.

`path` is the complete path of the target from its `spec/` folder.
Two references name the same thing when their `root` and `path` are
equal, however each was written.

`createResolver(options)` takes:

| Option | Use |
| --- | --- |
| `readText(file)` | supply text that isn't on disk, such as an unsaved editor buffer |
| `fileReaders` | how each file extension is read into keys |
| `packageLocators` | how a name is found when the location map doesn't list it; Node by default |
| `nameDeclarations` | where a package or solution declares its name |

### Where references are written

`listReferenceSites(file, text)` returns each place in a file where a
reference is or may be written, as `{ text, start, end, kind }`.

| Kind | Where | Meant as a reference |
| --- | --- | --- |
| `marker` | inside `@spec(...)`, in any file | always |
| `brace` | `{...}` inside YAML text | always |
| `value` | a whole YAML value, or a string argument of a GraphQL directive | only when it resolves |

The package can't tell which YAML fields hold references, so a
`value` is anything shaped like one. `findReferencesTo` counts a
`value` only when it resolves, and leaves out a file naming itself,
as `entity: booking` does in `entities/booking.yaml`.

### What is defined at a position

`findDefinitionAt(resolver, file, text, offset)` is the other
direction: the spec item whose name is written at a position, for an
editor's "find references" on a definition. The name can be a YAML
key, a GraphQL type, field, enum value or argument, or the line a
file with no keys resolves to, such as a `Feature:` line.

It returns what `resolve` returns for a reference to that item, so
the result goes straight to `findReferencesTo`, plus `start` and
`end`, the offsets of the name. `path` is null for a key in a mapping
inside a list. The result is null when the position isn't on a name,
the file isn't inside a `spec/` folder, or `text` isn't the text the
resolver reads for that file.

## Command line

```
spec-links resolve <reference> [--from <file>[:line[:column]]]
spec-links references <reference> [--from <file>[:line[:column]]] [--in <folder>]...
```

`resolve` prints `file:line`. `references` prints each reference as
`file:line:column  text`, looking in every `--in` folder, or the
current folder. Without `--from` the reference is resolved as if
written in a file in the current folder. The exit code is 1 when the
reference doesn't resolve and 2 when the command line is wrong.

## Limits

- The package of a file is found from the nearest folder named `spec`
  above it, or else the nearest folder that contains one. A project
  that keeps unrelated files in a folder called `spec`, as some test
  suites do, is read as if that folder were its spec.
- A key in a mapping inside a YAML list resolves from nearby, but has
  no complete path, so nothing outside the list can reference it.
- Only Node packages are located without a map entry. Another
  language needs its own locator passed in `packageLocators`.

## Tests

```
npm test
```

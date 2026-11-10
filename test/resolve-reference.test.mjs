import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createResolver } from '../src/index.mjs';

const edge = fileURLToPath(new URL('./fixtures/edge/', import.meta.url));
const at = (...parts) => path.join(edge, ...parts);
const resolver = createResolver();

/** Resolves a reference written at the first place `text` appears. */
function resolveAt(file, text, reference = text) {
  const source = fs.readFileSync(file, 'utf8');
  const offset = source.indexOf(text);
  assert.notEqual(offset, -1, `${text} is in ${file}`);
  return resolver.resolve(reference, { file, offset });
}

function assertTarget(result, file, line, pathText) {
  assert.equal(result.ok, true, result.message);
  assert.equal(path.relative(edge, result.file), path.normalize(file));
  assert.equal(result.line, line);
  if (pathText !== undefined) {
    assert.equal(result.path === null ? null : result.path.join('.'), pathText);
  }
}

test('a full path walks folders, then a file, then keys', () => {
  const result = resolveAt(at('app/spec/entities/invoice.yaml'), 'entities.order');
  assertTarget(result, 'app/spec/entities/order.draft.yaml', 1, 'entities.order');
  assert.equal(result.kind, 'file');
  assert.equal(result.name, null);
});

test('a draft is read in place of the final file', () => {
  const from = { file: at('app/src/handler.js') };
  const added = resolver.resolve('entities.order.rules.has-lines', from);
  assertTarget(added, 'app/spec/entities/order.draft.yaml', 10);
  assert.equal(added.draft, true);
  assert.equal(added.kind, 'key');
});

test('a reference inside a draft gets the final path', () => {
  const result = resolveAt(at('app/spec/entities/order.draft.yaml'), 'properties.total');
  assertTarget(result, 'app/spec/entities/order.draft.yaml', 3,
    'entities.order.properties.total');
});

test('the walk checks enclosing keys before the folder', () => {
  const file = at('app/spec/entities/invoice.yaml');
  assertTarget(resolveAt(file, 'properties.order'), 'app/spec/entities/invoice.yaml', 3,
    'entities.invoice.properties.order');
  assertTarget(resolveAt(at('app/spec/plan.yaml'), 'parts.second'),
    'app/spec/plan.yaml', 6, 'plan.parts.second');
});

test('the key a reference sits in is skipped', () => {
  const result = resolveAt(at('app/spec/plan.yaml'), 'checks.speed.fast');
  assertTarget(result, 'app/spec/checks/speed/fast.feature', 1, 'checks.speed.fast');
});

test('a key above the reference binds before a file of the same name', () => {
  // `type: order` under the property `order` finds that property, so
  // the entity has to be written `entities.order`.
  const result = resolveAt(at('app/spec/entities/invoice.yaml'), 'type: order', 'order');
  assertTarget(result, 'app/spec/entities/invoice.yaml', 3,
    'entities.invoice.properties.order');
});

test('the nearest match wins on the first part only', () => {
  const sibling = resolveAt(at('app/spec/plan.yaml'), 'notes.missing');
  assert.equal(sibling.ok, false);
  assert.equal(sibling.code, 'no-such-key');
  const shadowed = resolveAt(at('app/spec/entities/invoice.yaml'), 'rules.paid-once');
  assert.equal(shadowed.code, 'no-such-key');
  assert.equal(shadowed.message, 'entities.invoice.rules has no key "paid-once"');
  assert.equal(path.relative(edge, shadowed.at.file),
    path.normalize('app/spec/entities/invoice.yaml'));
});

test('a key in a mapping inside a list resolves but has no full path', () => {
  const result = resolveAt(at('app/spec/entities/invoice.yaml'), 'amount: label', 'label');
  assertTarget(result, 'app/spec/entities/invoice.yaml', 15, null);
});

test('without a position the walk starts at the top of the file', () => {
  const file = at('app/spec/entities/invoice.yaml');
  assertTarget(resolver.resolve('properties.full', { file }),
    'app/spec/entities/invoice.yaml', 5);
});

test('a position can be given as a line and column', () => {
  const file = at('app/spec/plan.yaml');
  assertTarget(resolver.resolve('checks.speed.fast', { file, line: 4, column: 9 }),
    'app/spec/checks/speed/fast.feature', 1);
});

test('a requirement file resolves to its Feature line', () => {
  const from = { file: at('app/src/handler.js') };
  assertTarget(resolver.resolve('checks.speed.steady', from),
    'app/spec/checks/speed/steady.feature', 3);
  const inside = resolver.resolve('checks.speed.steady.anything', from);
  assert.equal(inside.code, 'no-such-key');
});

test('a folder resolves with no line', () => {
  const result = resolver.resolve('checks.speed', { file: at('app/src/handler.js') });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'folder');
  assert.equal(result.line, null);
});

test('GraphQL definitions resolve as type, field or value, argument', () => {
  const from = { file: at('app/src/handler.js') };
  assertTarget(resolver.resolve('schema.Query', from), 'app/spec/schema.graphql', 1);
  assertTarget(resolver.resolve('schema.Query.orders', from), 'app/spec/schema.graphql', 2);
  const argument = resolver.resolve('schema.Query.orders.after', from);
  assertTarget(argument, 'app/spec/schema.graphql', 2, 'schema.Query.orders.after');
  assert.equal(argument.column, 22);
  assertTarget(resolver.resolve('schema.Status.PAID', from), 'app/spec/schema.graphql', 7);
  assertTarget(resolver.resolve('schema.Order.status', from), 'app/spec/schema.graphql', 12);
});

test('a field added by extend type resolves to the extending block', () => {
  const from = { file: at('app/src/handler.js') };
  assertTarget(resolver.resolve('schema.Query.invoices', from), 'app/spec/schema.graphql', 16);
  assertTarget(resolver.resolve('schema.Query.invoices.order', from),
    'app/spec/schema.graphql', 16);
});

test('code outside spec/ has no local scope', () => {
  const from = { file: at('app/src/handler.js') };
  assertTarget(resolver.resolve('entities.order.rules.paid-once', from),
    'app/spec/entities/order.draft.yaml', 8, 'entities.order.rules.paid-once');
  const local = resolver.resolve('rules.paid-once', from);
  assert.equal(local.code, 'not-found');
});

test('a name before a colon resolves through the location map', () => {
  const result = resolveAt(at('app/spec/schema.graphql'), 'plans:solution-spec.components.api');
  assertTarget(result, 'plans/spec/solution-spec.yaml', 4, 'solution-spec.components.api');
  assert.equal(result.name, 'plans');
  assert.equal(path.relative(edge, result.root), 'plans');
});

test('a name the map lacks resolves as an installed Node package', () => {
  const result = resolveAt(at('app/spec/entities/invoice.yaml'),
    'shared-formats:scalars.isbn', 'shared-formats:scalars.isbn.rules.thirteen-digits');
  assertTarget(result, 'app/node_modules/shared-formats/spec/scalars/isbn.yaml', 4);
});

test('a package can name itself', () => {
  const result = resolver.resolve('edge-app:entities.order.rules.paid-once',
    { file: at('app/spec/plan.yaml') });
  assertTarget(result, 'app/spec/entities/order.draft.yaml', 8);
});

test('a reference with a colon never resolves locally', () => {
  const result = resolveAt(at('plans/spec/solution-spec.yaml'), 'components.api',
    'plans:components.api');
  assert.equal(result.code, 'not-found');
});

test('a map entry must match the name its target declares', () => {
  const from = { file: at('app/spec/plan.yaml') };
  const wrong = resolver.resolve('wrong-name:solution-spec', from);
  assert.equal(wrong.code, 'name-mismatch');
  assert.match(wrong.message, /calls itself "plans"/);
  assert.equal(path.basename(wrong.at.file), 'spec-locations.yaml');
  assert.equal(wrong.at.line, 2);
  const nameless = resolver.resolve('nameless:anything', from);
  assert.equal(nameless.code, 'name-mismatch');
  assert.match(nameless.message, /declares no name/);
});

test('a missing location and an unknown name are errors', () => {
  const from = { file: at('app/spec/plan.yaml') };
  assert.equal(resolver.resolve('missing:anything', from).code, 'location-missing');
  assert.equal(resolver.resolve('nobody:anything', from).code, 'unknown-name');
  const noMap = resolver.resolve('edge-app:entities.order',
    { file: at('plans/spec/solution-spec.yaml') });
  assert.equal(noMap.code, 'unknown-name');
  assert.match(noMap.message, /no spec-locations\.yaml/);
});

test('a folder and a file with one name are ambiguous', () => {
  const result = resolver.resolve('things.inner', { file: at('app/src/handler.js') });
  assert.equal(result.code, 'ambiguous');
});

test('malformed references are refused', () => {
  const from = { file: at('app/spec/plan.yaml') };
  for (const text of ['', 'a..b', '.a', 'a b', 'Bad Name:a', 'plans:', 'a/b']) {
    assert.equal(resolver.resolve(text, from).code, 'malformed', text);
  }
});

test('a file outside any package with spec/ has nothing to resolve in', () => {
  const result = resolver.resolve('entities.order', { file: path.join(edge, 'loose.js') });
  assert.equal(result.code, 'no-spec-folder');
});

test('readText supplies unsaved text', () => {
  const draft = at('app/spec/entities/order.draft.yaml');
  const unsaved = createResolver({
    readText: (file) => {
      const text = fs.readFileSync(file, 'utf8');
      return file === draft ? `${text}  just-typed:\n    rule: Not saved yet.\n` : text;
    },
  });
  const from = { file: at('app/src/handler.js') };
  assertTarget(unsaved.resolve('entities.order.rules.just-typed', from),
    'app/spec/entities/order.draft.yaml', 12);
  assert.equal(resolver.resolve('entities.order.rules.just-typed', from).code, 'no-such-key');
});

test('other package locators can replace Node', () => {
  const custom = createResolver({
    packageLocators: [(name) => (name === 'elsewhere' ? at('plans') : null)],
    nameDeclarations: [],
  });
  const from = { file: at('app/spec/plan.yaml') };
  assertTarget(custom.resolve('elsewhere:solution-spec.components.api', from),
    'plans/spec/solution-spec.yaml', 4);
  assert.equal(custom.resolve('shared-formats:scalars.isbn', from).code, 'unknown-name');
});

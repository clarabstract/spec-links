import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createResolver,
  findDefinitionAt,
  findReferencesTo,
  listFilesToScan,
} from '../src/index.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const edge = (...parts) => path.join(fixtures, 'edge', ...parts);
const read = (file) => fs.readFileSync(file, 'utf8');
const relative = (file) => path.relative(fixtures, file).replaceAll('\\', '/');
const resolver = createResolver();

/** The definition a few characters into the first place `text` appears. */
function definitionAt(file, text, into) {
  const source = read(file);
  const offset = source.indexOf(text);
  assert.notEqual(offset, -1, `"${text}" isn't in the file`);
  return findDefinitionAt(resolver, file, source, offset + into);
}

const pathOf = (definition) => definition.path?.join('.') ?? null;

test('a YAML key is a definition, named by its full path', () => {
  const file = edge('app/spec/entities/order.draft.yaml');
  const definition = definitionAt(file, 'paid-once:', 3);
  assert.equal(pathOf(definition), 'entities.order.rules.paid-once');
  assert.equal(definition.kind, 'key');
  assert.equal(definition.line, 8);
  assert.equal(definition.draft, true);
  assert.equal(read(file).slice(definition.start, definition.end), 'paid-once');
  assert.equal(pathOf(definitionAt(file, 'rules:', 0)), 'entities.order.rules');
  assert.equal(pathOf(definitionAt(file, 'rules:', 5)), 'entities.order.rules');
});

test('a value is not a definition', () => {
  const file = edge('app/spec/entities/order.draft.yaml');
  assert.equal(definitionAt(file, 'decimal', 2), null);
  assert.equal(definitionAt(file, 'An order is paid', 4), null);
});

test('a key in a mapping inside a list is a definition with no path', () => {
  const definition = definitionAt(edge('app/spec/entities/invoice.yaml'), 'label: first', 2);
  assert.equal(definition.path, null);
  assert.equal(definition.line, 15);
});

test('GraphQL types, fields, enum values and arguments are definitions', () => {
  const file = edge('app/spec/schema.graphql');
  assert.equal(pathOf(definitionAt(file, 'Query {', 2)), 'schema.Query');
  assert.equal(pathOf(definitionAt(file, 'orders(', 2)), 'schema.Query.orders');
  assert.equal(pathOf(definitionAt(file, 'after:', 2)), 'schema.Query.orders.after');
  assert.equal(pathOf(definitionAt(file, 'PAID', 2)), 'schema.Status.PAID');
  const field = definitionAt(file, 'status:', 2);
  assert.equal(pathOf(field), 'schema.Order.status');
  assert.equal(field.line, 12);
});

test('a type name in an extend block names the same type', () => {
  const file = edge('app/spec/schema.graphql');
  const definition = definitionAt(file, 'extend type Query', 14);
  assert.equal(pathOf(definition), 'schema.Query');
  assert.equal(definition.line, 1);
  assert.equal(pathOf(definitionAt(file, 'invoices(', 2)), 'schema.Query.invoices');
});

test('GraphQL keywords and type uses are not definitions', () => {
  const file = edge('app/spec/schema.graphql');
  assert.equal(definitionAt(file, 'type Query', 1), null);
  assert.equal(definitionAt(file, 'Int,', 1), null);
  assert.equal(definitionAt(file, 'Status!', 2), null);
});

test('a Gherkin file is defined by its Feature line', () => {
  const file = edge('app/spec/checks/speed/steady.feature');
  const definition = definitionAt(file, 'Feature: speed.steady', 4);
  assert.equal(pathOf(definition), 'checks.speed.steady');
  assert.equal(definition.kind, 'file');
  assert.equal(definition.line, 3);
  assert.equal(definitionAt(file, 'A heading comment', 2), null);
});

test('nothing outside a spec folder is a definition', () => {
  const file = edge('app/spec-locations.yaml');
  assert.equal(definitionAt(file, 'plans:', 2), null);
});

test('a definition can be searched for like a resolved reference', () => {
  const files = [...listFilesToScan(edge('app')), ...listFilesToScan(edge('plans'))];
  const found = (definition) => findReferencesTo(resolver, definition, files)
    .map((each) => `${relative(each.file)}:${each.line}`);

  const rule = definitionAt(edge('app/spec/entities/order.draft.yaml'), 'paid-once:', 3);
  assert.deepEqual(found(rule), [
    'edge/app/spec/schema.graphql:12',
    'edge/app/src/handler.js:1',
  ]);

  const feature = definitionAt(edge('app/spec/checks/speed/fast.feature'), 'Feature:', 2);
  assert.deepEqual(found(feature), ['edge/app/spec/plan.yaml:4']);

  const component = definitionAt(edge('plans/spec/solution-spec.yaml'), 'api:', 1);
  assert.deepEqual(found(component), [
    'edge/app/spec/schema.graphql:17',
    'edge/app/src/handler.js:4',
    'edge/plans/spec/solution-spec.yaml:8',
  ]);
});

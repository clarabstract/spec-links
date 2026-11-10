import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createResolver,
  findReferencesTo,
  findSpecMarkers,
  listFilesToScan,
  listReferenceSites,
  referenceSiteAt,
} from '../src/index.mjs';

const edge = fileURLToPath(new URL('./fixtures/edge/', import.meta.url));
const at = (...parts) => path.join(edge, ...parts);
const read = (...parts) => fs.readFileSync(at(...parts), 'utf8');
const resolver = createResolver();
const files = [...listFilesToScan(at('app')), ...listFilesToScan(at('plans'))];

/** `file:line text` for each reference found, to compare as a list. */
function found(reference, options) {
  const target = resolver.resolve(reference, { file: at('app/src/handler.js') });
  assert.equal(target.ok, true, target.message);
  return findReferencesTo(resolver, target, files, options).map((site) => {
    const file = path.relative(edge, site.file).replaceAll('\\', '/');
    return `${file}:${site.line} ${site.text}`;
  });
}

test('markers are found in any file, one reference or several', () => {
  const sites = listReferenceSites('handler.js', read('app/src/handler.js'));
  assert.deepEqual(sites.map((site) => [site.kind, site.text]), [
    ['marker', 'entities.order.rules.paid-once'],
    ['marker', 'entities.order.rules.has-lines'],
    ['marker', 'plans:solution-spec.components.api'],
    ['marker', 'rules.paid-once'],
  ]);
  const text = read('app/src/handler.js');
  for (const site of sites) assert.equal(text.slice(site.start, site.end), site.text);
});

test('a marker is reported whatever is inside it', () => {
  // Malformed text in a marker is still returned, so that resolving it
  // reports the mistake.
  const text = 'See @spec(entities.order) and @spec(not a reference).';
  const sites = findSpecMarkers(text);
  assert.deepEqual(sites.map((site) => site.text), ['entities.order', 'not a reference']);
  const from = { file: at('app/src/handler.js') };
  assert.equal(resolver.resolve(sites[1].text, from).code, 'malformed');
});

test('GraphQL sites are the string arguments of directives', () => {
  const text = read('app/spec/schema.graphql');
  const sites = listReferenceSites('schema.graphql', text);
  assert.deepEqual(sites.map((site) => [site.kind, site.text]), [
    ['marker', 'entities.order'],
    ['marker', 'entities.order.rules.paid-once'],
    ['marker', 'entities.order.rules.has-lines'],
    ['marker', 'plans:solution-spec.components.api'],
  ]);
  for (const site of sites) assert.equal(text.slice(site.start, site.end), site.text);
});

test('YAML sites are whole values and braces inside text', () => {
  const text = read('app/spec/entities/invoice.yaml');
  const sites = listReferenceSites('invoice.yaml', text);
  const kindOf = (reference) => sites.find((site) => site.text === reference)?.kind;
  assert.equal(kindOf('entities.order'), 'value');
  assert.equal(kindOf('shared-formats:scalars.isbn'), 'value');
  assert.equal(kindOf('properties.order'), 'brace');
  assert.equal(kindOf('rules.paid-once'), 'brace');
  assert.equal(kindOf('properties'), undefined, 'keys are not sites');
  for (const site of sites) assert.equal(text.slice(site.start, site.end), site.text);
});

test('the site under a position is found, and nothing between sites', () => {
  const file = at('app/spec/entities/invoice.yaml');
  const text = read('app/spec/entities/invoice.yaml');
  const inside = text.indexOf('{properties.order}') + 5;
  assert.equal(referenceSiteAt(file, text, inside).text, 'properties.order');
  assert.equal(referenceSiteAt(file, text, text.indexOf('An invoice bills')), null);
});

test('references to a target include references to what is inside it', () => {
  assert.deepEqual(found('entities.order'), [
    'app/spec/entities/invoice.yaml:6 entities.order',
    'app/spec/entities/order.draft.yaml:9 properties.total',
    'app/spec/schema.graphql:10 entities.order',
    'app/spec/schema.graphql:12 entities.order.rules.paid-once',
    'app/spec/schema.graphql:17 entities.order.rules.has-lines',
    'app/src/handler.js:1 entities.order.rules.paid-once',
    'app/src/handler.js:4 entities.order.rules.has-lines',
  ]);
});

test('references to exactly the target can be asked for', () => {
  assert.deepEqual(found('entities.order', { includeInside: false }), [
    'app/spec/entities/invoice.yaml:6 entities.order',
    'app/spec/schema.graphql:10 entities.order',
  ]);
});

test('a file saying its own name is not a reference to itself', () => {
  const all = found('entities.order');
  assert.equal(all.some((line) => line.endsWith(' order')), false);
});

test('references are found across packages, however they are written', () => {
  assert.deepEqual(found('plans:solution-spec.components.api'), [
    'app/spec/schema.graphql:17 plans:solution-spec.components.api',
    'app/src/handler.js:4 plans:solution-spec.components.api',
    'plans/spec/solution-spec.yaml:8 components.api',
  ]);
});

test('unsaved text can be searched in place of what is on disk', () => {
  const handler = at('app/src/handler.js');
  const target = resolver.resolve('checks.speed.fast', { file: handler });
  const references = findReferencesTo(resolver, target, [handler], {
    readText: () => '// @spec(checks.speed.fast)\n',
  });
  assert.equal(references.length, 1);
  assert.equal(references[0].line, 1);
  assert.equal(references[0].column, 10);
});

test('the scan skips hidden entries and node_modules', () => {
  const scanned = listFilesToScan(at('app')).map((file) => path.relative(edge, file));
  assert.equal(scanned.some((file) => file.includes('node_modules')), false);
  assert.equal(scanned.includes(path.normalize('app/src/handler.js')), true);
});

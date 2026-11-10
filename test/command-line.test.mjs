import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/spec-links.mjs', import.meta.url));
const app = fileURLToPath(new URL('./fixtures/edge/app/', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], {
  cwd: app,
  encoding: 'utf8',
});

test('resolve prints the file and line', () => {
  const result = run('resolve', 'entities.order.rules.paid-once');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(),
    `${path.join(app, 'spec', 'entities', 'order.draft.yaml')}:8`);
});

test('resolve takes the place the reference is written in', () => {
  const from = `${path.join('spec', 'entities', 'invoice.yaml')}:12:30`;
  const result = run('resolve', 'properties.order', '--from', from);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `${path.join(app, 'spec', 'entities', 'invoice.yaml')}:3`);
});

test('a reference that does not resolve exits 1 and says why', () => {
  const result = run('resolve', 'entities.order.rules.gone');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr,
    /^entities\.order\.rules\.gone: entities\.order\.rules has no key "gone" \(.*order\.draft\.yaml:\d+\)/);
});

test('references lists each place with its line and column', () => {
  const result = run('references', 'entities.order.rules.paid-once', '--in', '.');
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.deepEqual(lines, [
    `${path.join(app, 'spec', 'schema.graphql')}:12:32  entities.order.rules.paid-once`,
    `${path.join(app, 'src', 'handler.js')}:1:10  entities.order.rules.paid-once`,
  ]);
});

test('a wrong command line exits 2', () => {
  assert.equal(run('resolve').status, 2);
  assert.equal(run('lookup', 'entities.order').status, 2);
  assert.equal(run('resolve', 'entities.order', '--nope', 'x').status, 2);
});

// The room-booking example: a solution, a shared package and a service
// that references both. Every reference written in it has to resolve,
// and a sample of them has to land on the right line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createResolver,
  listFilesToScan,
  resolveReferenceSites,
} from '../src/index.mjs';

const example = fileURLToPath(new URL('./fixtures/example/', import.meta.url));
const at = (...parts) => path.join(example, ...parts);
const resolver = createResolver();
const service = 'room-booking-service/spec';

function resolveAt(file, text, reference = text) {
  const source = fs.readFileSync(at(file), 'utf8');
  const offset = source.indexOf(text);
  assert.notEqual(offset, -1, `${text} is in ${file}`);
  return resolver.resolve(reference, { file: at(file), offset });
}

function place(result) {
  assert.equal(result.ok, true, result.message);
  const file = path.relative(example, result.file).replaceAll('\\', '/');
  return `${file}:${result.line}`;
}

test('every reference in the example resolves', () => {
  const failed = [];
  let resolved = 0;
  for (const file of listFilesToScan(example)) {
    if (file.endsWith('.feature')) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const site of resolveReferenceSites(resolver, file, text)) {
      if (site.result.ok) resolved += 1;
      // A plain value may only look like a reference; one written
      // with a dot or a colon in this example is always meant as one,
      // apart from the two listed.
      else if (site.kind !== 'value' || /[.:]/.test(site.text)) {
        failed.push(`${path.relative(example, file)}:${site.line} ${site.text}`);
      }
    }
  }
  assert.deepEqual(failed.map((line) => line.split(' ')[1]).sort(),
    ['3.14', 'facilities.example.com']);
  assert.ok(resolved >= 90, `${resolved} references resolved`);
});

test('references inside an entity resolve to its own keys', () => {
  const booking = `${service}/entities/booking.yaml`;
  assert.equal(place(resolveAt(booking, '{properties.room}', 'properties.room')),
    `${booking}:16`);
  assert.equal(place(resolveAt(booking, 'type: lifecycles.status', 'lifecycles.status')),
    `${booking}:35`);
  assert.equal(place(resolveAt(booking, 'starts: states.held', 'states.held')),
    `${booking}:38`);
  assert.equal(place(resolveAt(booking, 'to: states.cancelled', 'states.cancelled')),
    `${booking}:40`);
  assert.equal(place(resolveAt(booking, 'final: [states.cancelled]', 'states.cancelled')),
    `${booking}:40`);
});

test('references to another file in the package start with its folder', () => {
  const room = `${service}/entities/room.yaml`;
  assert.equal(place(resolveAt(room, 'scalars.room-code')),
    `${service}/scalars/room-code.yaml:1`);
  assert.equal(place(resolveAt(room, 'entities.booking.properties.start')),
    `${service}/entities/booking.yaml:20`);
  assert.equal(place(resolveAt(`${service}/entities/booking.yaml`, 'belongs-to: entities.room',
    'entities.room')), `${room}:1`);
});

test('references to the solution and the shared package use their names', () => {
  const room = `${service}/entities/room.yaml`;
  const requirement = resolveAt(room, 'room-booking:requirements.rooms.unique-code');
  assert.equal(place(requirement),
    'room-booking/spec/requirements/rooms/unique-code.feature:1');
  assert.equal(requirement.name, 'room-booking');
  assert.equal(place(resolveAt(room, 'contact-formats:scalars.email')),
    'contact-formats/spec/scalars/email.yaml:1');
  const component = resolver.resolve(
    'room-booking:solution-spec.components.room-booking-service',
    { file: at(room) },
  );
  assert.equal(component.ok, true, component.message);
  assert.deepEqual(component.path, ['solution-spec', 'components', 'room-booking-service']);
});

test('markers in the schema resolve like any other reference', () => {
  const schema = `${service}/schema.graphql`;
  const transition = 'entities.booking.lifecycles.status.transitions.confirm';
  assert.equal(place(resolveAt(schema, transition)), `${service}/entities/booking.yaml:42`);
  assert.equal(place(resolveAt(schema, 'room-booking:requirements.book.confirm')),
    'room-booking/spec/requirements/book/confirm.feature:1');
});

test('the solution spec references its own requirements and components', () => {
  const solution = 'room-booking/spec/solution-spec.yaml';
  assert.equal(place(resolveAt(solution, 'requirements.book.no-overlap')),
    'room-booking/spec/requirements/book/no-overlap.feature:1');
  const component = resolveAt(solution, 'components.booking-skill');
  assert.equal(component.ok, true, component.message);
  assert.deepEqual(component.path, ['solution-spec', 'components', 'booking-skill']);
});

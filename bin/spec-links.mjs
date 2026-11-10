#!/usr/bin/env node
// spec-links resolve <reference> [--from <file>[:line[:column]]]
// spec-links references <reference> [--from <file>[:line[:column]]]
//                                   [--in <folder>]...
//
// `resolve` prints the file and line a reference names. `references`
// prints every place that references it, looking in each --in folder
// (default: the current folder). Without --from the reference is
// resolved as if written in a file in the current folder.

import path from 'node:path';
import {
  createResolver,
  findReferencesTo,
  listFilesToScan,
} from '../src/index.mjs';

function fail(message) {
  console.error(`spec-links: ${message}`);
  process.exit(2);
}

const [command, reference, ...rest] = process.argv.slice(2);
if (!['resolve', 'references'].includes(command) || !reference) {
  fail('usage: spec-links resolve|references <reference> '
    + '[--from <file>[:line[:column]]] [--in <folder>]...');
}

let from = { file: path.join(process.cwd(), 'unnamed') };
const folders = [];
for (let index = 0; index < rest.length; index += 2) {
  const value = rest[index + 1];
  if (value === undefined) fail(`${rest[index]} needs a value`);
  if (rest[index] === '--from') {
    const [, file, line, column] = value.match(/^(.+?)(?::(\d+)(?::(\d+))?)?$/);
    from = { file: path.resolve(file) };
    if (line) from.line = Number(line);
    if (column) from.column = Number(column);
  } else if (rest[index] === '--in') {
    folders.push(path.resolve(value));
  } else {
    fail(`unknown option ${rest[index]}`);
  }
}

const place = (found) => (found.line ? `${found.file}:${found.line}` : found.file);

const resolver = createResolver();
const target = resolver.resolve(reference, from);
if (!target.ok) {
  const where = target.at ? ` (${place(target.at)})` : '';
  console.error(`${reference}: ${target.message}${where}`);
  process.exit(1);
}

if (command === 'resolve') {
  console.log(place(target));
} else {
  const files = (folders.length ? folders : [process.cwd()]).flatMap(listFilesToScan);
  for (const found of findReferencesTo(resolver, target, files)) {
    console.log(`${place(found)}:${found.column}  ${found.text}`);
  }
}

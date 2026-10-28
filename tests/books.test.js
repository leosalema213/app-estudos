import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { seed, validateData, firstPlan, dailySummary, dayKey } from '../src/model.js';
import { bookPosition, bookPercent } from '../src/books.js';
const require = createRequire(import.meta.url);
const { BookFiles, LIMIT } = require('../electron/books.cjs');
const { packDocument } = require('../electron/cloud-document.cjs');
const fixture = path.resolve('tests/fixtures/reading.pdf');
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'organon-books-'));

test('old profiles migrate with no books; metadata and plan-independent positions roundtrip', () => {
  const before = seed(); delete before.books;
  assert.deepEqual(validateData(before).books, []);
  const store = new BookFiles(temporary()), book = store.import(fixture), plan = firstPlan();
  const moved = bookPosition(book, 5, 6), returned = bookPosition(moved, 2, 6);
  assert.equal(returned.page, 2); assert.equal(returned.furthestPage, 5); assert.equal(bookPercent(returned), 83);
  assert.equal(returned.completedAt, null);
  const data = { ...seed(), plans: [plan], books: [{ ...returned, completedAt: dayKey(), planIds: [plan.id, 'second-plan'] }] };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))).books, data.books);
  assert.deepEqual(dailySummary(data, dayKey()), dailySummary({ ...data, books: [] }, dayKey()));
  assert.throws(() => validateData({ ...data, books: [{ ...book, page: -1 }] }), /Livros/);
  assert.throws(() => validateData({ ...data, books: [book, { ...book, id: 'duplicate-file' }] }), /Livros/);
  assert.throws(() => validateData({ ...data, books: [{ ...book, view: { ...book.view, zoom: 10000 } }] }), /Livros/);
});

test('immutable PDFs survive moved originals, deduplicate bytes and reject arbitrary paths / oversized files', () => {
  const directory = temporary(), store = new BookFiles(directory), original = path.join(directory, 'original.pdf');
  fs.copyFileSync(fixture, original);
  const book = store.import(original), duplicate = store.import(original);
  assert.equal(book.hash, duplicate.hash); assert.equal(fs.readdirSync(store.directory).length, 1);
  fs.renameSync(original, original + '.moved');
  assert.deepEqual(store.read(book.hash), fs.readFileSync(fixture));
  assert.throws(() => store.read('../../compasso.json'), /Identificador/);
  const invalid = path.join(directory, 'invalid.pdf'); fs.writeFileSync(invalid, 'not a pdf');
  assert.throws(() => store.import(invalid), /corrompido/);
  const large = path.join(directory, 'large.pdf'), fd = fs.openSync(large, 'w'); fs.ftruncateSync(fd, LIMIT + 1); fs.closeSync(fd);
  assert.throws(() => store.import(large), /200 MiB/);
});

test('portable backup includes all bytes once, validates before restore, and restores into a clean profile', () => {
  const directory = temporary(), source = new BookFiles(directory), target = new BookFiles(temporary());
  const book = bookPosition(source.import(fixture), 4, 6), data = { ...seed(), books: [book] }, backup = path.join(directory, 'backup.json');
  source.export(backup, data);
  const portable = JSON.parse(fs.readFileSync(backup, 'utf8'));
  assert.deepEqual(Object.keys(portable.bookFiles), [book.hash]);
  const verified = target.verifyBackup(portable);
  assert.equal(fs.existsSync(target.directory), false, 'preview/cancel cannot install files');
  const restored = target.restore(verified);
  assert.deepEqual(restored, data); assert.deepEqual(target.read(book.hash), fs.readFileSync(fixture));
  assert.equal('bookFiles' in restored, false);
  assert.throws(() => target.verifyBackup(data), /não contém/);
  assert.throws(() => target.verifyBackup({ ...portable, bookFiles: { [book.hash]: Buffer.from('%PDF-wrong').toString('base64') } }), /corrompido/);
  fs.writeFileSync(source.file(book.hash), '%PDF-corrupted');
  const previous = fs.readFileSync(backup);
  assert.throws(() => source.export(backup, data), /corrompido/);
  assert.deepEqual(fs.readFileSync(backup), previous, 'failed export preserves an existing complete backup');
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith('.tmp')), false);
});

test('remote transport refuses metadata-only book snapshots instead of publishing an incomplete backup', () => {
  const book = new BookFiles(temporary()).import(fixture);
  assert.throws(() => packDocument({ ...seed(), books: [book] }), /sincronização de livros/);
  assert.deepEqual(packDocument(seed()).payload.books, []);
});

test('portable base64 remains complete across export chunk boundaries', () => {
  const directory = temporary(), source = new BookFiles(directory), target = new BookFiles(temporary());
  const file = path.join(directory, 'chunked.pdf');
  fs.writeFileSync(file, Buffer.concat([fs.readFileSync(fixture), Buffer.alloc(3 * 1024 * 1024 + 7)]));
  const book = source.import(file), backup = path.join(directory, 'chunked.json');
  source.export(backup, { ...seed(), books: [book] });
  const verified = target.verifyBackup(JSON.parse(fs.readFileSync(backup, 'utf8')));
  target.restore(verified); assert.deepEqual(target.read(book.hash), fs.readFileSync(file));
});

test('EPUB and Kindle binaries, robust locations and font preferences survive portable backups', () => {
  const directory = temporary(), store = new BookFiles(directory), target = new BookFiles(temporary());
  const books = ['epub', 'mobi'].map(format => ({ ...store.import(path.resolve(`tests/fixtures/reading.${format}`)),
    location: 'epubcfi(/6/2!/4/2/1:20)', fraction: 0.2, furthestFraction: 0.6, view: { spread: 2, zoom: 1, contrast: 'night', fontSize: 28 } }));
  const data = { ...seed(), books }, file = path.join(directory, 'portable.json');
  assert.deepEqual(validateData(data).books, books);
  store.export(file, data); assert.deepEqual(target.restore(target.verifyBackup(JSON.parse(fs.readFileSync(file, 'utf8')))), data);
  for (const book of books) assert.deepEqual(target.read(book.hash, book.format), store.read(book.hash, book.format));
  assert.equal(bookPercent(books[0]), 60);
  assert.throws(() => validateData({ ...data, books: [{ ...books[0], fraction: 2 }] }), /Livros/);
  const protectedFile = path.join(directory, 'protected.mobi'), bytes = fs.readFileSync('tests/fixtures/reading.mobi');
  bytes.writeUInt16BE(1, bytes.readUInt32BE(78) + 12); fs.writeFileSync(protectedFile, bytes);
  assert.throws(() => store.import(protectedFile), /DRM/);
});

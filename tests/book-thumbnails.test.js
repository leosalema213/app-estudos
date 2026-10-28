import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BookFiles } = require('../electron/books.cjs');
const fixture = fileURLToPath(new URL('./fixtures/reading.pdf', import.meta.url));
// An opaque RIFF/WebP envelope exercises storage validation; real image decoding
// and PDF rendering are covered by the focused Electron check.
const envelope = Buffer.concat([Buffer.from('RIFF'), Buffer.from([8, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const src = `data:image/webp;base64,${envelope.toString('base64')}`;

test('thumbnail cache survives restart without changing the PDF or book metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-thumbnail-')), store = new BookFiles(directory);
  const book = store.import(fixture), before = fs.readFileSync(store.file(book.hash));
  assert.equal(store.thumbnail(book.hash), null);
  store.cacheThumbnail(book.hash, src);
  assert.equal(new BookFiles(directory).thumbnail(book.hash), src);
  assert.deepEqual(fs.readFileSync(store.file(book.hash)), before);
  assert.equal(book.page, 1); assert.equal(book.furthestPage, 0); assert.equal(book.completedAt, null);
  assert.equal('thumbnail' in book, false);
});

test('thumbnail cache rejects arbitrary paths, active formats, oversized bytes and missing books', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-thumbnail-')), store = new BookFiles(directory), book = store.import(fixture);
  assert.throws(() => store.thumbnail('../other'), /Identificador/);
  assert.throws(() => store.cacheThumbnail('../other', src), /Identificador/);
  assert.throws(() => store.cacheThumbnail(book.hash, 'data:image/svg+xml;base64,PHN2Zy8+'), /inválida/);
  assert.throws(() => store.cacheThumbnail(book.hash, 'data:image/webp;base64,' + Buffer.alloc(65537).toString('base64')), /inválida/);
  assert.throws(() => store.cacheThumbnail('a'.repeat(64), src), /ausente/);
  store.cacheThumbnail(book.hash, src); fs.writeFileSync(store.thumbnailFile(book.hash), 'broken cache');
  assert.equal(store.thumbnail(book.hash), null);
});

test('backups retain original PDF bytes; clean profiles regenerate optional covers', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-thumbnail-')), store = new BookFiles(directory);
  const book = { ...store.import(fixture), page: 4, pageCount: 6, furthestPage: 5 }, snapshot = { version: 1, plans: [], records: {}, books: [book] };
  store.cacheThumbnail(book.hash, src);
  const file = path.join(directory, 'backup.json'); store.export(file, snapshot);
  const portable = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(portable.books, snapshot.books); assert.deepEqual(Object.keys(portable.bookFiles), [book.hash]);
  const clean = new BookFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'organon-thumbnail-clean-')));
  const restored = clean.restore(clean.verifyBackup(portable));
  assert.deepEqual(restored, snapshot); assert.equal(clean.thumbnail(book.hash), null);
  assert.deepEqual(clean.read(book.hash), fs.readFileSync(fixture));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { newNotebook, newPage, seed, validateData } from '../src/model.js';
import { documentHeadings, documentImages, documentText, validNoteDocument } from '../src/note-document.js';
import { customCoverStyle, isNotebookColor, notebookIcons } from '../src/book-appearance.js';

const png = 'data:image/png;base64,aGVsbG8=';
test('custom cover colors and optional icons roundtrip without losing pages', () => {
  assert(notebookIcons.length >= 25);
  const book = { ...newNotebook(), name: 'Só cor', icon: 'none', color: '#203628' };
  assert.deepEqual(validateData({ ...seed(), notebooks: [book] }).notebooks[0], book);
  assert.equal(customCoverStyle('#ffffff')['--cover-ink'], '#000000');
  assert.equal(customCoverStyle('#000000')['--cover-ink'], '#ffffff');
  assert.equal(isNotebookColor('url(x)'), false);
});
test('older backups gain an empty notebook library and preserve their original data', () => {
  const original = { ...seed(), records: { '2026-10-27|plan|block': { elapsedMs: 1234, done: false } } };
  delete original.notebooks;
  const result = validateData(original);
  assert.deepEqual(result.notebooks, []);
  assert.deepEqual(result.records, original.records);
  assert.equal(original.notebooks, undefined);
});
test('notebooks and pages have independent stable ids', () => {
  const first = newNotebook(), second = newNotebook();
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.pages[0].id, second.pages[0].id);
  assert.notEqual(newPage().id, first.pages[0].id);
});
test('covers, headings, formatted text, lists, images and multiple pages roundtrip through backups', () => {
  const document = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meu índice' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Uma ideia', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'fontSize', attrs: { size: '20' } }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uma lista' }] }, { type: 'image', attrs: { src: png } }] }] },
  ] };
  assert(validNoteDocument(document));
  assert.equal(documentText(document), 'Meu índice\nUma ideia\nUma lista');
  assert.deepEqual(documentHeadings(document), [{ level: 2, text: 'Meu índice' }]);
  const page = { ...newPage(), title: 'Hoje', text: documentText(document), document };
  assert.deepEqual(documentImages(page), [png]);
  const book = { ...newNotebook(), name: 'Diário', icon: 'diary', cover: png, pages: [page, newPage()] };
  const state = { ...seed(), notebooks: [book] };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(state))).notebooks, state.notebooks);
});
test('invalid notebook ids, covers and formatting are rejected without mutating data', () => {
  const state = { ...seed(), notebooks: [{ ...newNotebook(), name: 'Casa' }] };
  for (const mutate of [s => { s.notebooks.push(structuredClone(s.notebooks[0])); }, s => { s.notebooks[0].cover = 'https://example.com/img.png'; }, s => { s.notebooks[0].pages.push(structuredClone(s.notebooks[0].pages[0])); }, s => { s.notebooks[0].pages[0].document = { type: 'doc', content: [{ type: 'heading', attrs: { level: 99 } }] }; }]) {
    const invalid = structuredClone(state); mutate(invalid);
    assert.throws(() => validateData(invalid));
  }
  assert.equal(state.notebooks[0].cover, null);
  assert.equal(validNoteDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test', marks: [{ type: 'fontSize', attrs: { size: '999; background:url(x)' } }] }] }] }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { documentImages, documentText, isNoteImage, noteDocument, validNoteDocument } from '../src/note-document.js';
import { newPlan, seed, validateData } from '../src/model.js';

const image = 'data:image/png;base64,aGVsbG8=';
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
test('legacy notes convert losslessly without modifying the original', () => {
  const note = { id: 'note', text: 'Antes\n\nDepois', images: [image, image], date: '2026-10-27', pinned: true };
  const original = structuredClone(note);
  const doc = noteDocument(note);
  assert.deepEqual(doc.content.map(n => n.type), ['paragraph', 'paragraph', 'paragraph', 'image', 'image', 'paragraph']);
  assert.equal(documentText(doc), note.text);
  assert.deepEqual(documentImages({ ...note, document: doc, images: [] }), note.images);
  assert.deepEqual(note, original);
  assert(validNoteDocument(doc));
});
test('document order, hard breaks and images survive backup validation', () => {
  const document = { type: 'doc', content: [paragraph('Olha este print'), { type: 'image', attrs: { src: image } }, { type: 'paragraph', content: [{ type: 'text', text: 'Print 2' }, { type: 'hardBreak' }, { type: 'text', text: 'Outro detalhe' }] }, { type: 'image', attrs: { src: image } }, paragraph('Conclusão')] };
  const note = { id: 'note', date: '2026-10-27', text: documentText(document), images: [], document, pinned: true };
  const data = { ...seed(), plans: [{ ...newPlan(), name: 'Teste', notes: [note] }] };
  const roundtrip = validateData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(roundtrip.plans[0].notes[0], note);
  assert.equal(note.text, 'Olha este print\nPrint 2\nOutro detalhe\nConclusão');
  assert.equal(noteDocument(note), document);
});
test('rejects unsafe or unsupported document content', () => {
  for (const src of ['https://example.com/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,']) assert.equal(isNoteImage(src), false);
  for (const content of [[{ type: 'script' }], [{ type: 'image', attrs: { src: 'https://example.com' } }], [{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }], [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]]) {
    const note = { id: 'note', date: '2026-10-27', text: '', images: [], document: { type: 'doc', content } };
    assert.equal(validNoteDocument(note.document), false);
    assert.throws(() => validateData({ ...seed(), plans: [{ ...newPlan(), notes: [note] }] }), /Anotação inválida/);
  }
});

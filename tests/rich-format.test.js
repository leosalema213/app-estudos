import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { documentText, noteDocument, validNoteDocument } from '../src/note-document.js';
import { textColor } from '../src/text-format.js';
import { newReminder, validReminders } from '../src/reminders.js';
import { seed, firstPlan, newNotebook, validateData } from '../src/model.js';
import { basicModel, newCard } from '../src/anki.js';
const require = createRequire(import.meta.url), { BookFiles } = require('../electron/books.cjs'), { packDocument } = require('../electron/cloud-document.cjs');
const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revisar vocabulário', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'textColor', attrs: { color: '#9ac7aa' } }, { type: 'fontSize', attrs: { size: '18' } }] }] }] };

test('color normalization only accepts literal safe colors and rich documents validate marks', () => {
  assert.equal(textColor('#9AC7AA'), '#9ac7aa'); assert.equal(textColor('#abc'), '#aabbcc'); assert.equal(textColor('rgb(154, 199, 170)'), '#9ac7aa');
  for (const color of ['red; background:url(https://x)', 'var(--color)', '#12', 'rgb(999,0,0)', 'expression(alert(1))']) assert.equal(textColor(color), '');
  assert(validNoteDocument(document)); assert.equal(documentText(document), 'Revisar vocabulário');
  const bad = structuredClone(document); bad.content[0].content[0].marks.push({ type: 'textColor', attrs: { color: 'url(https://x)' } }); assert.equal(validNoteDocument(bad), false);
  assert(validNoteDocument(noteDocument({ text: 'Nota antiga\nCom outra linha', images: [] })));
});

test('reminders retain plain text for notifications and reject inconsistent/unsafe formatted descriptions', () => {
  const reminder = { ...newReminder('2026-10-29'), title: 'Inglês', description: documentText(document), descriptionDocument: document };
  assert(validReminders([reminder])); const old = { ...reminder }; delete old.descriptionDocument; assert(validReminders([old]));
  assert.equal(validReminders([{ ...reminder, description: 'Diferente' }]), false);
  assert.equal(validReminders([{ ...reminder, descriptionDocument: { type: 'doc', content: [{ type: 'script', content: [] }] } }]), false);
});

test('formatted notebooks, plan notes, reminders and HTML card fields survive backup and sync payload', () => {
  const state = seed(), notebook = newNotebook(), plan = firstPlan();
  const note = { id: 'formatted', title: 'Rotina', date: '2026-10-29', text: documentText(document), images: [], document };
  notebook.name = 'Inglês'; notebook.pages = [note]; plan.notes = [{ ...note, id: 'plan-note' }]; state.notebooks = [notebook]; state.plans = [plan];
  state.reminders = [{ ...newReminder('2026-10-29'), title: 'Revisar', description: note.text, descriptionDocument: document }];
  state.anki.models = [structuredClone(basicModel)]; state.anki.decks = [{ id: 'deck', name: 'Inglês', presetId: 'default' }];
  state.anki.notes = [{ id: 'card-note', modelId: basicModel.id, tags: [], fields: ['<p><u><span data-organon-color="#9ac7aa" style="color:#9ac7aa">Rotina</span></u></p>', 'Daily routine'] }];
  state.anki.cards = [newCard('card-note', 'deck')];
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-rich-format-'));
  try {
    const store = new BookFiles(path.join(folder, 'profile')), file = path.join(folder, 'backup.json');
    store.export(file, state); const restored = validateData(store.restore(store.verifyBackup(JSON.parse(fs.readFileSync(file, 'utf8')))));
    assert.deepEqual(restored.notebooks[0].pages[0].document, document); assert.deepEqual(restored.plans[0].notes[0].document, document); assert.deepEqual(restored.reminders[0].descriptionDocument, document);
    assert.deepEqual(packDocument(state).payload.reminders[0].descriptionDocument, document);
    assert.deepEqual(restored.anki.notes, state.anki.notes); assert.deepEqual(restored.anki.cards, state.anki.cards); assert.deepEqual(packDocument(state).payload.anki.notes, state.anki.notes);
  } finally { const resolved = path.resolve(folder); if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('organon-rich-format-')) fs.rmSync(resolved, { recursive: true, force: true }); }
});

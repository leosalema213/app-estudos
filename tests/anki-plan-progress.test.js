import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emptyAnki, normalizePresets, validAnki } from '../src/anki.js';
import { ankiProgress, linkPlanDecks } from '../src/anki-progress.js';
import { fieldLabel, modelLabel, presetLabels } from '../src/anki-labels.js';
import { seed, validateData } from '../src/model.js';
const require = createRequire(import.meta.url), { packDocument } = require('../electron/cloud-document.cjs');
const { BookFiles } = require('../electron/books.cjs');
test('old decks acquire optional empty links and invalid links are rejected', () => {
  const a = emptyAnki(); a.decks = [{ id: 'd', name: 'Deck', presetId: 'default' }];
  assert.deepEqual(normalizePresets(a).decks[0].planIds, []);
  assert.equal(validAnki({ ...a, decks: [{ ...a.decks[0], planIds: ['p','p'] }] }), false);
  assert.equal(validAnki({ ...a, decks: [{ ...a.decks[0], planIds: 'p' }] }), false);
});
test('linking and unlinking preserves other plans and transports all links in backup and JSON payload', () => {
  let a = emptyAnki(); a.decks = [{ id: 'd1', name: 'Deck', presetId: 'default', planIds: ['older-plan'] }, { id: 'd2', name: 'Other', presetId: 'default' }];
  a = linkPlanDecks(a, 'p', ['d1','d2']); assert.deepEqual(a.decks[0].planIds, ['older-plan','p']); assert.deepEqual(a.decks[1].planIds, ['p']);
  a = linkPlanDecks(a, 'p', ['d2']); assert.deepEqual(a.decks[0].planIds, ['older-plan']);
  const state = { ...seed(), anki: a }, restored = validateData(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.anki.decks, a.decks); assert.deepEqual(packDocument(state).payload.anki.decks, a.decks); assert.deepEqual(restored.records, {});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-plan-links-'));
  try {
    const file = path.join(directory, 'backup.json'), source = new BookFiles(path.join(directory, 'source')), target = new BookFiles(path.join(directory, 'restored'));
    source.export(file, state); const verified = target.verifyBackup(JSON.parse(fs.readFileSync(file, 'utf8')));
    assert.deepEqual(validateData(target.restore(verified)).anki.decks, a.decks);
  } finally { const resolved = path.resolve(directory); if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('organon-plan-links-')) fs.rmSync(resolved, { recursive: true, force: true }); }
});
test('review progress uses local calendar range, excludes reschedules and counts each answer once', () => {
  const a = emptyAnki(); a.decks = [{ id: 'd', name: 'Deck', presetId: 'default', planIds: ['p1','p2'] }];
  a.reviews = Array.from({ length: 8 }, (_, i) => ({ id: String(i), cardId: 'deleted-card', rating: i % 2 ? 1 : 3, elapsedMs: 54000, at: new Date(2026, 9, i < 4 ? 28 : 29, 12).getTime() }));
  a.reviews.push({ id: 'manual', rating: 0, elapsedMs: 60000, at: new Date(2026, 9, 29, 12).getTime() });
  assert.deepEqual(ankiProgress(a, '2026-10-28', '2026-10-29'), { reviews: 8, elapsedMs: 432000, days: 2, accuracy: 50 });
  assert.equal(ankiProgress(a, '2026-10-29', '2026-10-29').reviews, 4); assert.equal(ankiProgress(a, '2026-09-01', '2026-09-30').reviews, 0);
});
test('labels translate known types/fields without rewriting keys or colliding configuration labels', () => {
  assert.equal(fieldLabel('Front'), 'Frente'); assert.equal(fieldLabel('constructor'), 'constructor'); assert.equal(modelLabel('Basic'), 'Básico');
  const labels = presetLabels([{ id: 'a', name: 'Default' }, { id: 'b', name: 'Padrão' }]); assert.deepEqual([...labels.values()], ['Padrão','Padrão (2)']);
});

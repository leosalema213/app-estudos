import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterDays, answer, basicModel, counts, emptyAnki, newCard, normalizePresets, queue, validAnki } from '../src/anki.js';
import { seed, validateData } from '../src/model.js';
const require = createRequire(import.meta.url), { packDocument } = require('../electron/cloud-document.cjs'), { BookFiles } = require('../electron/books.cjs');
const now = new Date(2026, 9, 29, 12).getTime(), minute = 60000;
function fixture() {
  const a = emptyAnki(); a.models = [basicModel]; a.decks = [{ id: 'd', name: 'Vocabulário', presetId: 'default' }, { id: 'other', name: 'Outro', presetId: 'default' }];
  a.notes = [{ id: 'n', modelId: basicModel.id, fields: ['Good morning', 'Bom dia'], tags: [] }];
  return a;
}
const card = (id, state, due, extra = {}) => ({ ...newCard('n', 'd'), id, state, due, ...extra });

test('20-minute default migrates old snapshots without changing cards; explicit zero and invalid settings are handled', () => {
  const a = fixture(); a.cards = [card('learning', 1, now + 10 * minute)]; delete a.settings.learnAhead;
  const before = structuredClone(a), migrated = normalizePresets(a);
  assert(validAnki(a)); assert.equal(migrated.settings.learnAhead, 20); assert.deepEqual(migrated.cards, before.cards); assert.deepEqual(a, before);
  assert.equal(validateData({ ...seed(), anki: a }).anki.settings.learnAhead, 20);
  a.settings.learnAhead = 0; assert.equal(normalizePresets(a).settings.learnAhead, 0);
  for (const value of [-1, 0.5, 1441, '20', null, NaN, Infinity]) { a.settings.learnAhead = value; assert.equal(validAnki(a), false, String(value)); }
});

test('ready cards precede future learners, whose window and due ordering drive the same counters', () => {
  const a = fixture();
  a.cards = [card('later', 1, now + 20 * minute), card('review', 2, now), card('new', 0, 0), card('earlier', 3, now + 10 * minute), card('ready', 1, now - minute), card('outside', 1, now + 20 * minute + 1), card('future-review', 2, now + minute)];
  const before = structuredClone(a), ids = queue(a, 'd', now).map(c => c.id);
  assert.deepEqual(new Set(ids.slice(0, 3)), new Set(['ready', 'new', 'review'])); assert.deepEqual(ids.slice(3), ['earlier', 'later']);
  assert.deepEqual(counts(a, 'd', now), { new: 1, learn: 3, due: 1 }); assert.deepEqual(a, before);
  a.settings.learnAhead = 0; assert.deepEqual(counts(a, 'd', now), { new: 1, learn: 1, due: 1 });
  assert(queue(a, 'd', now + 10 * minute).some(c => c.id === 'earlier'));
});

test('anticipation respects visibility, selected deck, daily limits and the study-day boundary', () => {
  const a = fixture();
  a.cards = [card('available', 1, now + minute), card('suspended', 1, now + minute, { suspended: true }), card('buried', 1, now + minute, { buriedUntil: now + minute }), card('unsupported', 1, now + minute, { unsupported: true }), card('other', 1, now + minute, { deckId: 'other' }), card('new', 0, 0), card('review', 2, now)];
  a.decks[0].options = { newPerDay: 0, reviewsPerDay: 0 };
  assert.deepEqual(queue(a, 'd', now).map(c => c.id), ['available']);
  const late = afterDays(now, 1, 4) - 5 * minute;
  a.cards = [card('before-boundary', 1, late + minute), card('next-day', 1, afterDays(now, 1, 4))];
  assert.deepEqual(queue(a, 'd', late).map(c => c.id), ['before-boundary']);
  a.settings.learnAhead = 0; assert.equal(queue(a, 'd', late).length, 0);
});

test('new Good stays in learning and a second Good graduates even when anticipated; zero waits ten minutes', () => {
  let a = fixture(); a.cards = [card('new', 0, 0)];
  a = answer(a, 'new', 3, 1500, now);
  assert.equal(a.cards[0].state, 1); assert.equal(a.cards[0].due, now + 10 * minute); assert.equal(a.cards[0].reps, 1);
  assert.equal(queue(a, 'd', now)[0].id, 'new');
  const done = answer(a, 'new', 3, 2000, now + minute);
  assert.equal(done.cards[0].state, 2); assert.equal(done.cards[0].due, afterDays(now + minute, 1, 4)); assert.equal(done.reviews.length, 2);
  a.settings.learnAhead = 0; assert.equal(queue(a, 'd', now + 10 * minute - 1).length, 0); assert.equal(queue(a, 'd', now + 10 * minute).length, 1);
});

test('zero and custom anticipation survive portable backups and prepared JSONB without altering review history', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-learn-ahead-'));
  try {
    for (const value of [0, 7, 20]) {
      const a = fixture(); a.settings.learnAhead = value; a.cards = [card('learning', 1, now + 10 * minute)];
      a.reviews = [{ id: 'history', cardId: 'learning', at: now, rating: 3, previousState: 0, interval: 0, elapsedMs: 1500 }];
      const data = { ...seed(), anki: a }, file = path.join(directory, 'backup.json');
      const source = new BookFiles(path.join(directory, 'source')), target = new BookFiles(path.join(directory, 'restored'));
      source.export(file, data); const restored = validateData(target.restore(target.verifyBackup(JSON.parse(fs.readFileSync(file, 'utf8')))));
      assert.equal(restored.anki.settings.learnAhead, value); assert.deepEqual(restored.anki.cards, a.cards); assert.deepEqual(restored.anki.reviews, a.reviews);
      assert.equal(packDocument(data).payload.anki.settings.learnAhead, value);
    }
  } finally {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('organon-learn-ahead-')) fs.rmSync(resolved, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { answer, afterDays, basicModel, counts, defaultOptions, emptyAnki, mergeAnki, newCard, optionsFor, queue, schedule, studyDay, validAnki } from '../src/anki.js';
import { renderTemplate } from '../src/anki-render.js';
import { seed, validateData } from '../src/model.js';
const require = createRequire(import.meta.url), { AnkiMedia } = require('../electron/anki-media.cjs'), { BookFiles } = require('../electron/books.cjs'), { importPackage, archive } = require('../electron/anki-package.cjs'), { packDocument } = require('../electron/cloud-document.cjs');
const { zip, packageFixture } = require('./anki-fixtures.cjs');
const now = new Date(2026, 9, 29, 12).getTime();
function fixture() { const a = emptyAnki(); a.models = [structuredClone(basicModel)]; a.decks = [{ id: 'deck', name: 'Test', presetId: 'default' }]; a.notes = [{ id: 'note', modelId: basicModel.id, fields: ['Front', 'Back'], tags: [] }]; a.cards = [newCard('note', 'deck', 0, 1)]; return a; }
function temporary(work) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-anki-test-')); try { return work(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
const wav = () => { const b = Buffer.alloc(48); b.write('RIFF'); b.writeUInt32LE(40, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(4, 40); return b; };

test('old snapshots migrate without replacing personal data; malformed references are rejected', () => {
  const old = seed(); delete old.anki; const restored = validateData(old); assert.deepEqual(restored.anki, emptyAnki()); assert.deepEqual(restored.plans, old.plans);
  const a = fixture(); assert(validAnki(a)); a.cards[0].noteId = 'missing'; assert.equal(validAnki(a), false);
  assert.throws(() => validateData({ ...old, anki: a }), /Anki/);
});
test('learning, hard, easy, graduation and lapse preserve distinct transitions and capped time', () => {
  const a = fixture(), c = a.cards[0];
  assert.equal(schedule(a, c, 1, now).due, now + 60000);
  assert.equal(schedule(a, c, 2, now).due, now + 330000);
  const learning = schedule(a, c, 3, now); assert.equal(learning.state, 1); assert.equal(learning.due, now + 600000);
  assert.equal(schedule(a, learning, 3, now + 600000).interval, 1);
  assert.equal(schedule(a, c, 4, now).due, afterDays(now, 4));
  const review = { ...c, state: 2, interval: 10, due: now - 86400000, reps: 2 };
  const lapse = schedule(a, review, 1, now); assert.equal(lapse.state, 3); assert.equal(lapse.lapses, 1); assert.equal(lapse.due, now + 600000);
  a.cards = [review]; assert.equal(answer(a, review.id, 1, 120000, now).reviews[0].elapsedMs, 60000);
  assert.deepEqual(a.cards[0], review);
});
test('FSRS uses imported memory and serializes finite state for every rating', () => {
  const a = fixture(); a.settings.fsrs = true;
  a.cards[0] = { ...a.cards[0], state: 2, interval: 3, lastReview: now - 3 * 86400000, fsrs: { stability: 3, difficulty: 5 }, due: now };
  for (let rating = 1; rating <= 4; rating++) { const next = schedule(a, a.cards[0], rating, now); assert(Number.isFinite(next.due)); assert(next.fsrs.stability > 0); assert(next.fsrs.difficulty > 0); assert(validAnki({ ...a, cards: [next] })); }
});
test('limits, parent scope, today overrides, siblings, suspension and rollover affect the queue', () => {
  const a = fixture(); a.cards.push({ ...newCard('note', 'deck', 1, 2), state: 2, due: now, interval: 3 });
  a.presets[0].options = { ...defaultOptions, newPerDay: 1, reviewsPerDay: 1, buryNew: true };
  assert.equal(queue(a, 'deck', now).length, 1);
  a.settings.newIgnoreReview = true; assert.equal(queue(a, 'deck', now).length, 2);
  const answered = answer(a, a.cards[1].id, 3, 1000, now); assert.equal(queue(answered, 'deck', now).length, 0);
  a.decks[0].today = { day: studyDay(now), options: { newPerDay: 0 } }; assert.equal(counts(a, 'deck', now).new, 0); assert.equal(optionsFor(a, a.decks[0], afterDays(now, 1)).newPerDay, 1);
  a.cards[1].suspended = true; assert.equal(counts(a, 'deck', now).due, 0);
  assert.notEqual(studyDay(new Date(2026, 9, 29, 3).getTime()), studyDay(new Date(2026, 9, 29, 5).getTime()));
});
test('leech tag/suspend and Easy Days have actual effects', () => {
  const a = fixture(); a.presets[0].options = { ...defaultOptions, leechThreshold: 1, leechAction: 'suspend', easyDays: [0, 0, 0, 0, 0, 1, 1] };
  a.cards[0] = { ...a.cards[0], state: 2, interval: 10, due: now };
  const next = answer(a, a.cards[0].id, 1, 0, now); assert(next.cards[0].suspended); assert(next.notes[0].tags.includes('leech'));
  const standard = schedule({ ...a, presets: [{ ...a.presets[0], options: { ...a.presets[0].options, easyDays: [1, 1, 1, 1, 1, 1, 1] } }] }, a.cards[0], 3, now);
  const easy = schedule(a, a.cards[0], 3, now); assert(Math.abs(standard.interval - easy.interval) <= Math.max(1, Math.floor(standard.interval * 0.05)));
});
test('parent limit scope caps child study only when selected or explicitly enabled', () => {
  const a = fixture(); a.decks[0].name = 'Parent::Child'; a.decks.push({ id: 'parent', name: 'Parent', presetId: 'default', options: { newPerDay: 0 } });
  assert.equal(counts(a, 'deck', now).new, 1); assert.equal(counts(a, 'parent', now).new, 0);
  a.settings.limitsFromTop = true; assert.equal(counts(a, 'deck', now).new, 0);
});
test('templates substitute fields, conditional reverse, cloze, typed answer safely', () => {
  const m = { ...basicModel, kind: 1, fields: ['Text'], templates: [{ q: '{{cloze:Text}}', a: '{{cloze:Text}}' }] }, n = { fields: ['A {{c1::test::hint}} and {{c2::word}}'], tags: [] }, c = { ord: 0 };
  assert.match(renderTemplate(m, n, c), /\[hint\]/); assert.match(renderTemplate(m, n, c, true), /<strong class="cloze">test/);
  assert.doesNotMatch(renderTemplate(m, n, c), /\{\{c2/);
  assert.equal(renderTemplate({ ...basicModel, templates: [{ q: '{{#Back}}{{Front}}{{/Back}}', a: '' }] }, { fields: ['Front', ''], tags: [] }, c), '');
});
test('media backup survives original removal, detects corruption, and blocks incomplete cloud transport', () => temporary(dir => {
  const store = new BookFiles(path.join(dir, 'source')), a = fixture(), meta = store.ankiMedia.put(wav(), 'sound.wav'); a.media = { 'sound.wav': meta };
  const state = { ...seed(), anki: a }, backup = path.join(dir, 'backup.json'); store.export(backup, state);
  const parsed = JSON.parse(fs.readFileSync(backup)), clean = new BookFiles(path.join(dir, 'restored'));
  assert(!JSON.stringify(state).includes('ankiFiles')); assert.throws(() => packDocument(state), /Anki/);
  const verified = clean.verifyBackup(parsed); assert(!('ankiFiles' in verified.metadata)); assert.deepEqual(clean.restore(verified), state); assert.deepEqual(clean.ankiMedia.read(meta), wav());
  assert.throws(() => clean.verifyBackup({ ...parsed, ankiFiles: {} }), /mídia/);
  assert.throws(() => clean.ankiMedia.file('../outside'), /Hash/);
  assert.throws(() => clean.ankiMedia.put(Buffer.from('<script>bad</script>'), 'bad.png'), /formato/);
}));

for (const modern of [false, true]) test(`real ${modern ? 'modern Zstd/Protobuf' : 'legacy JSON'} package import preserves content, media and study state`, () => temporary(dir => {
  const file = packageFixture(dir, modern), store = new AnkiMedia(path.join(dir, 'profile')), result = importPackage(file, store);
  assert(validAnki(result.collection)); assert.equal(result.collection.cards.length, 1); assert.equal(result.collection.cards[0].reps, 4); assert.equal(result.collection.cards[0].interval, 3); assert.equal(result.collection.notes[0].guid, 'fixture-guid'); assert.equal(result.collection.reviews.length, 1);
  assert.deepEqual(store.read(Object.values(result.collection.media)[0]), wav());
  const imported = mergeAnki(emptyAnki(), result.collection), reviewed = answer(imported, imported.cards[0].id, 3, 1000, now), repeated = mergeAnki(reviewed, result.collection);
  assert.equal(repeated.cards.length, 1); assert.deepEqual(repeated.cards[0], reviewed.cards[0]); assert.equal(repeated.reviews.length, reviewed.reviews.length);
}));
test('ZIP CRC and limits prevent silently importing damaged content', () => { const bytes = zip([['a', Buffer.from('content')]]); bytes[31] ^= 1; assert.throws(() => archive(bytes).read('a'), /incompleta/); });

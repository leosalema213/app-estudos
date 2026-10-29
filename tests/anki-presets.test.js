import test from 'node:test';
import assert from 'node:assert/strict';
import { afterDays, defaultOptions, emptyAnki, newCard, normalizePresets, optionsFor, schedule, validAnki } from '../src/anki.js';
import { seed, validateData } from '../src/model.js';
test('redundant local Default migrates to imported Default without losing deck bindings', () => {
  const a = emptyAnki(); a.decks = [{ id: 'deck', name: 'Deck', presetId: 'default' }]; a.presets.push({ id: 'imported', name: 'Default', options: { ...defaultOptions, easyBonus: 1.299999952 } });
  const migrated = normalizePresets(a); assert.equal(migrated.presets.length, 1); assert.equal(migrated.decks[0].presetId, 'imported'); assert(migrated.presets[0].aliases.includes('default'));
  assert(validAnki(migrated)); assert.deepEqual(normalizePresets(migrated), migrated);
  assert.equal(validateData({ ...seed(), anki: a }).anki.presets.length, 1);
});
test('different or customized presets survive migration with unique names', () => {
  const a = emptyAnki(); a.presets[0].options.newPerDay = 47; a.presets.push({ id: 'imported', name: 'Default', options: { ...defaultOptions } });
  const migrated = normalizePresets(a); assert.equal(migrated.presets.length, 2); assert.equal(new Set(migrated.presets.map(p => p.name)).size, 2); assert.equal(migrated.presets[0].options.newPerDay, 47);
});
test('preset changes retain per-deck and today limits without leaking into shared options', () => {
  const a = emptyAnki(); a.presets.push({ id: 'new', name: 'Meu preset', options: { ...defaultOptions, newPerDay: 7 } });
  const d = { id: 'deck', name: 'Deck', presetId: 'new', options: { newPerDay: 3 } }; a.decks = [d];
  assert.equal(optionsFor(a, d).newPerDay, 3); assert.equal(a.presets[1].options.newPerDay, 7);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify({ ...seed(), anki: a }))).anki, normalizePresets(a));
});
test('traditional Anki baseline maps Again to 10m relearning and Good to 3d for a due 1d review', () => {
  const a = emptyAnki(), now = new Date(2026, 9, 29, 12).getTime(); a.decks = [{ id: 'deck', name: 'Deck', presetId: 'default' }];
  const card = { ...newCard('note', 'deck'), state: 2, interval: 1, due: afterDays(now, 0), reps: 1, ease: 2.5 };
  assert.equal(schedule(a, card, 1, now).due, now + 10 * 60000);
  assert.equal(schedule(a, card, 3, now).due, afterDays(now, 3));
});

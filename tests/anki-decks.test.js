import test from 'node:test';
import assert from 'node:assert/strict';
import { basicModel, counts, emptyAnki, newCard, removeDeck, validAnki } from '../src/anki.js';
const now = new Date(2026, 9, 29, 12).getTime();
function fixture() {
  const a = emptyAnki(); a.models = [basicModel];
  a.decks = ['Curso', 'Curso::Lição', 'Curso livre', 'Outro'].map((name, i) => ({ id: `deck${i}`, name, presetId: 'default' }));
  a.notes = ['shared','removed','orphan'].map(id => ({ id, modelId: basicModel.id, fields: [id,'Back'], tags: [] }));
  a.cards = [newCard('shared','deck0'),newCard('removed','deck1'),newCard('shared','deck3')];
  a.reviews = [{ id: 'review', cardId: a.cards[0].id, at: now, rating: 3, previousState: 2, interval: 3, elapsedMs: 1000 }];
  return a;
}
test('delete deck includes descendants and preserves shared notes, unrelated decks and review history', () => {
  const a = fixture(), result = removeDeck(a, 'deck0');
  assert.deepEqual(result.decks.map(d => d.name), ['Curso livre','Outro']); assert.equal(result.cards.length, 1);
  assert.deepEqual(result.notes.map(n => n.id), ['shared','orphan']); assert.deepEqual(result.reviews, a.reviews); assert.deepEqual(result.media, a.media); assert.deepEqual(result.presets, a.presets);
  assert.equal(a.cards.length, 3); assert(validAnki(result));
});
test('deleting empty or unknown decks does not remove unrelated notes', () => {
  const a = fixture(); assert.equal(removeDeck(a, 'missing'), a); assert.deepEqual(removeDeck(a, 'deck2').notes, a.notes);
});
test('review counters distinguish new, learning/relearning and due reviews, excluding hidden cards', () => {
  const a = fixture(); a.cards = [0,1,2,3].map((state, i) => ({ ...newCard('shared','deck0'), state, due: state ? now : 0 }));
  a.cards.push({ ...newCard('shared','deck0'), suspended: true }, { ...newCard('shared','deck0'), buriedUntil: now + 86400000 });
  assert.deepEqual(counts(a, 'deck0', now), { new: 1, learn: 2, due: 1 });
});

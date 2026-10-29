import { studyDay } from './anki.js';

export function ankiProgress(anki, from, to) {
  const reviews = (anki?.reviews || []).filter(r => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 4 && studyDay(r.at, 0) >= from && studyDay(r.at, 0) <= to);
  const elapsedMs = reviews.reduce((sum, r) => sum + Math.max(0, r.elapsedMs || 0), 0);
  return { reviews: reviews.length, elapsedMs, days: new Set(reviews.map(r => studyDay(r.at, 0))).size, accuracy: reviews.length ? Math.round(reviews.filter(r => r.rating > 1).length / reviews.length * 100) : 0 };
}

export function linkPlanDecks(anki, planId, deckIds) {
  const chosen = new Set(deckIds);
  return { ...anki, decks: anki.decks.map(deck => ({ ...deck, planIds: [...new Set([...(deck.planIds || []).filter(id => id !== planId), ...(chosen.has(deck.id) ? [planId] : [])])] })) };
}

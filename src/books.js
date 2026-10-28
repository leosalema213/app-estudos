import { calendarDate } from './reminders.js';

export function validBooks(books) {
  if (!Array.isArray(books)) return false;
  const ids = new Set(), hashes = new Set();
  return books.every(book => {
    if (!book || typeof book.id !== 'string' || !book.id || ids.has(book.id) || hashes.has(book.hash)) return false;
    ids.add(book.id); hashes.add(book.hash);
    return typeof book.title === 'string' && !!book.title.trim() && book.title.length <= 300 && ['pdf', 'epub', 'mobi', 'azw', 'azw3'].includes(book.format)
      && /^[a-f0-9]{64}$/.test(book.hash) && Number.isInteger(book.size) && book.size >= 5 && book.size <= 200 * 1024 * 1024
      && Array.isArray(book.planIds) && book.planIds.every(id => typeof id === 'string')
      && Number.isInteger(book.page) && book.page >= 1 && Number.isInteger(book.furthestPage) && book.furthestPage >= 0
      && (book.pageCount === null || (Number.isInteger(book.pageCount) && book.pageCount >= book.page && book.pageCount >= book.furthestPage))
      && (book.completedAt === null || calendarDate(book.completedAt))
      && typeof book.importedAt === 'string' && Number.isFinite(Date.parse(book.importedAt))
      && (book.location === undefined || (typeof book.location === 'string' && book.location.length <= 10000 && book.location.startsWith('epubcfi(')))
      && (book.fraction === undefined || (Number.isFinite(book.fraction) && book.fraction >= 0 && book.fraction <= 1))
      && (book.furthestFraction === undefined || (Number.isFinite(book.furthestFraction) && book.furthestFraction >= 0 && book.furthestFraction <= 1))
      && (book.view?.fontSize === undefined || (Number.isInteger(book.view.fontSize) && book.view.fontSize >= 12 && book.view.fontSize <= 36))
      && book.view && [1, 2].includes(book.view.spread) && Number.isFinite(book.view.zoom) && book.view.zoom >= 0.5 && book.view.zoom <= 3
      && ['paper', 'night', 'sepia'].includes(book.view.contrast);
  });
}

export function bookPosition(book, page, count) {
  const current = Math.max(1, Math.min(count, Math.trunc(page) || 1));
  return { ...book, page: current, pageCount: count, furthestPage: Math.min(count, Math.max(book.furthestPage, current)) };
}
export const bookPercent = book => book.format === 'pdf' ? book.pageCount ? Math.floor(book.furthestPage / book.pageCount * 100) : 0 : Math.floor((book.furthestFraction || 0) * 100);

export function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function newReminder(date) { return { id: crypto.randomUUID(), title: '', description: '', schedule: 'date', date, seenDates: [] }; }
export function validReminders(notes) {
  if (!Array.isArray(notes)) return false;
  const ids = new Set();
  return notes.every(note => {
    if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || typeof note.title !== 'string' || !note.title.trim() || note.title.length > 120 || typeof note.description !== 'string' || note.description.length > 4000 || !['daily', 'date'].includes(note.schedule) || (note.schedule === 'date' && !calendarDate(note.date)) || !Array.isArray(note.seenDates) || note.seenDates.some(date => !calendarDate(date))) return false;
    ids.add(note.id); return true;
  });
}
export const reminderDay = (note, date) => note.schedule === 'daily' ? date : note.date;
export const reminderSeen = (note, date) => note.seenDates.includes(reminderDay(note, date));
export function pendingReminders(notes, date) { return notes.filter(note => (note.schedule === 'daily' || note.date === date) && !reminderSeen(note, date)); }
export function markReminder(notes, id, date, seen) {
  return notes.map(note => {
    if (note.id !== id) return note;
    const day = reminderDay(note, date);
    return { ...note, seenDates: seen ? [...new Set([...note.seenDates, day])] : note.seenDates.filter(value => value !== day) };
  });
}

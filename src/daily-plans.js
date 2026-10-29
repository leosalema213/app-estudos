import { calendarDate } from './reminders.js';
import { validKind } from './block-kinds.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const snapshot = plan => ({ name: plan.name, days: [...plan.days], blocks: structuredClone(plan.blocks) });

export function planForDate(plan, date) {
  if (!plan) return null;
  const previous = plan.templateHistory?.find(entry => date < entry.before);
  return { ...plan, ...(previous ? { name: previous.name, days: previous.days, blocks: previous.blocks } : {}), ...(plan.dayOverrides?.[date] || {}) };
}

// Each cutoff retains the template used before that local calendar date.
export function preserveTemplate(previous, next, date) {
  const changed = JSON.stringify(snapshot(previous)) !== JSON.stringify(snapshot(next));
  if (!changed) return { ...next, ...(previous.templateHistory ? { templateHistory: previous.templateHistory } : {}), ...(previous.dayOverrides ? { dayOverrides: previous.dayOverrides } : {}) };
  const history = [...(previous.templateHistory || [])];
  if (!history.some(entry => entry.before === date)) history.push({ before: date, ...snapshot(previous) });
  history.sort((a, b) => a.before.localeCompare(b.before));
  return { ...next, templateHistory: history, ...(previous.dayOverrides ? { dayOverrides: previous.dayOverrides } : {}) };
}

export function validDailyPlans(plan) {
  if (!object(plan)) return false;
  const blocks = list => Array.isArray(list) && new Set(list.map(b => b?.id)).size === list.length && list.every(b => b && typeof b.id === 'string' && b.id && ['lesson', 'break'].includes(b.type) && typeof b.name === 'string' && Number.isFinite(b.minutes) && b.minutes >= 1 && b.minutes <= 360 && (b.kind === undefined || b.type === 'lesson' && validKind(b.kind)));
  const named = entry => object(entry) && typeof entry.name === 'string' && blocks(entry.blocks);
  if (plan.dayOverrides !== undefined && (!object(plan.dayOverrides) || Object.entries(plan.dayOverrides).some(([date, entry]) => !calendarDate(date) || !named(entry) || Object.keys(entry).some(key => !['name', 'blocks'].includes(key))))) return false;
  if (plan.templateHistory !== undefined && (!Array.isArray(plan.templateHistory) || plan.templateHistory.some((entry, i, all) => !named(entry) || !calendarDate(entry.before) || i > 0 && all[i - 1].before >= entry.before || !Array.isArray(entry.days) || entry.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)))) return false;
  return true;
}

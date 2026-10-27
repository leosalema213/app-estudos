export const uid = () => crypto.randomUUID();
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const colors = ['violet', 'blue', 'orange', 'green', 'pink'];
export const densities = ['minimal', 'compact', 'comfortable'];
export const themePresets = [
  { id: 'pink', name: 'Rosa', background: '#1d131a', surface: '#271b23', accent: '#f2a7c8', text: '#ffeaf4', muted: '#c8a9bb' },
  { id: 'blue', name: 'Azul', background: '#121a27', surface: '#1b2738', accent: '#9ec5ff', text: '#edf4ff', muted: '#a8bad2' },
  { id: 'green', name: 'Verde', background: '#111e19', surface: '#1b2b24', accent: '#a0d8bb', text: '#edf9f2', muted: '#a6bfb0' },
  { id: 'purple', name: 'Roxo', background: '#191524', surface: '#261f35', accent: '#c9b5ff', text: '#f4edff', muted: '#baadce' },
];
export function orderedNotes(notes) { return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)); }
export function preferences(settings = {}) {
  return { sound: settings.sound !== false, theme: ['light', 'dark', 'custom'].includes(settings.theme) ? settings.theme : 'system', palette: themePresets.some(p => p.id === settings.palette) ? settings.palette : 'pink', density: densities.includes(settings.density) ? settings.density : 'compact', plansView: settings.plansView === 'list' ? 'list' : 'cards' };
}
export const recordKey = (date, planId, blockId) => `${date}|${planId}|${blockId}`;
export function newBlock(type = 'lesson') { return { id: uid(), type, name: type === 'break' ? 'Pausa para respirar' : 'Nova aula', minutes: type === 'break' ? 5 : 25 }; }
export function newPlan() { return { id: uid(), name: '', description: '', color: 'violet', days: [1, 2, 3, 4, 5], blocks: [newBlock(), newBlock('break'), newBlock()], notes: [] }; }
export function seed() {
  return { version: 1, plans: [], records: {}, active: null, settings: preferences(), onboardingCompleted: false, createdAt: dayKey() };
}
export function firstPlan() {
  const plan = newPlan();
  return { ...plan, name: 'Meu primeiro plano', blocks: plan.blocks.map((block, i) => ({ ...block, name: block.type === 'lesson' ? `Aula ${i === 0 ? 1 : 2}` : 'Descanso' })) };
}
export function getRecord(state, date, planId, blockId) { return state.records[recordKey(date, planId, blockId)] || { elapsedMs: 0, done: false }; }
export function dailySummary(state, date) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const plans = state.plans.filter(plan => plan.days.includes(weekday));
  const blocks = plans.flatMap(plan => plan.blocks.map(block => ({ plan, block })));
  const completed = blocks.filter(({ plan, block }) => getRecord(state, date, plan.id, block.id).done).length;
  const studyMinutes = blocks.reduce((total, { block }) => total + (block.type === 'lesson' ? block.minutes : 0), 0);
  return { plans, total: blocks.length, completed, studyMinutes, percent: blocks.length ? Math.round(completed / blocks.length * 100) : 0 };
}
export function setDone(state, date, planId, blockId, done) {
  const key = recordKey(date, planId, blockId);
  const plan = state.plans.find(p => p.id === planId);
  const block = plan?.blocks.find(b => b.id === blockId);
  return { ...state, records: { ...state.records, [key]: { ...getRecord(state, date, planId, blockId), done, type: block?.type || 'lesson', planName: plan?.name, blockName: block?.name } } };
}
// Accrue wall-clock time rather than counting interval ticks. Split sessions at local midnight.
export function tick(state, now = Date.now()) {
  const active = state.active;
  if (!active?.running) return { state, finished: false };
  const delta = Math.min(Math.max(0, now - active.startedAt), active.remainingMs);
  const records = { ...state.records };
  let cursor = active.startedAt;
  const end = cursor + delta;
  while (cursor < end) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const until = Math.min(end, midnight);
    const key = recordKey(dayKey(date), active.planId, active.blockId);
    const rec = records[key] || { elapsedMs: 0, done: false };
    records[key] = { ...rec, elapsedMs: rec.elapsedMs + until - cursor, type: active.type, planName: active.planName, blockName: active.blockName };
    cursor = until;
  }
  const remainingMs = Math.max(0, active.remainingMs - delta);
  const finished = remainingMs === 0;
  if (finished) {
    const key = recordKey(active.date, active.planId, active.blockId);
    records[key] = { ...(records[key] || { elapsedMs: 0 }), done: true, type: active.type, planName: active.planName, blockName: active.blockName };
  }
  return { state: { ...state, records, active: { ...active, remainingMs, startedAt: Math.max(now, active.startedAt), running: !finished } }, finished };
}
export function play(state, plan, block, date = dayKey(), now = Date.now()) {
  const settled = tick(state, now).state;
  if (settled.active?.planId === plan.id && settled.active.blockId === block.id && settled.active.date === date && settled.active.remainingMs > 0) {
    return { ...settled, active: { ...settled.active, running: !settled.active.running, startedAt: now } };
  }
  return { ...settled, active: { planId: plan.id, blockId: block.id, date, type: block.type, planName: plan.name, blockName: block.name, totalMs: block.minutes * 60000, remainingMs: block.minutes * 60000, startedAt: now, running: true } };
}
export function pause(state, now = Date.now()) { const next = tick(state, now).state; return { ...next, active: next.active ? { ...next.active, running: false } : null }; }
export function resetTimer(state, now = Date.now()) { const next = pause(state, now); return { ...next, active: next.active ? { ...next.active, remainingMs: next.active.totalMs } : null }; }
export function editBlock(state, planId, blockId, fields, now = Date.now()) {
  const name = fields.name.trim(); const minutes = Number(fields.minutes);
  if (!name || name.length > 120 || !Number.isInteger(minutes) || minutes < 1 || minutes > 360) throw new Error('Preencha o nome e uma duração de 1 a 360 minutos.');
  let next = tick(state, now).state;
  const plan = next.plans.find(p => p.id === planId);
  if (!plan?.blocks.some(b => b.id === blockId)) throw new Error('Esta aula não existe mais.');
  next = { ...next, plans: next.plans.map(p => p.id === planId ? { ...p, blocks: p.blocks.map(b => b.id === blockId ? { ...b, name, minutes } : b) } : p) };
  if (next.active?.planId === planId && next.active.blockId === blockId) {
    const elapsed = next.active.totalMs - next.active.remainingMs;
    next.active = { ...next.active, blockName: name, totalMs: minutes * 60000, remainingMs: Math.max(0, minutes * 60000 - elapsed), running: false };
    if (next.active.remainingMs === 0) next = setDone(next, next.active.date, planId, blockId, true);
  }
  return next;
}
export function clock(ms) { const sec = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
export function duration(ms) { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min` : `${m} min`; }
export function focusMs(state, from, to) { return Object.entries(state.records).reduce((sum, [key, rec]) => { const date = key.split('|')[0]; return sum + (date >= from && date <= to && rec.type !== 'break' ? rec.elapsedMs || 0 : 0); }, 0); }
export function validateData(data) {
  if (data?.version !== 1 || !Array.isArray(data.plans) || !data.records || typeof data.records !== 'object' || Array.isArray(data.records)) throw new Error('O arquivo não é um backup válido do Compasso.');
  const ids = new Set();
  for (const p of data.plans) {
    if (!p.id || ids.has(p.id) || typeof p.name !== 'string' || !colors.includes(p.color) || !Array.isArray(p.days) || p.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) || !Array.isArray(p.blocks) || !Array.isArray(p.notes)) throw new Error('Plano inválido no backup.');
    ids.add(p.id);
    for (const b of p.blocks) {
      if (!b.id || ids.has(b.id) || !['lesson', 'break'].includes(b.type) || typeof b.name !== 'string' || !Number.isFinite(b.minutes) || b.minutes < 1 || b.minutes > 360) throw new Error('Bloco inválido no backup.');
      ids.add(b.id);
    }
    for (const n of p.notes) if (!n.id || typeof n.text !== 'string' || typeof n.date !== 'string' || (n.pinned !== undefined && typeof n.pinned !== 'boolean') || !Array.isArray(n.images) || n.images.some(i => typeof i !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(i))) throw new Error('Anotação inválida no backup.');
  }
  for (const [key, rec] of Object.entries(data.records)) if (!/^\d{4}-\d{2}-\d{2}\|/.test(key) || !rec || !Number.isFinite(rec.elapsedMs) || rec.elapsedMs < 0 || typeof rec.done !== 'boolean') throw new Error('Histórico inválido no backup.');
  return { ...data, active: null, settings: preferences(data.settings) };
}

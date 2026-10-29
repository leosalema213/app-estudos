import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { dailySummary, dayPlan, editDailyBlock, extendLesson, firstPlan, focusMs, getRecord, newBlock, play, saveDailyPlan, savePlanTemplate, seed, setDone, setManualDone, tick, validateData } from '../src/model.js';
const require = createRequire(import.meta.url), { BookFiles } = require('../electron/books.cjs'), { packDocument } = require('../electron/cloud-document.cjs');
const date = '2026-10-29', yesterday = '2026-10-28', tomorrow = '2026-10-30', now = new Date(`${date}T12:00:00`).getTime();
function fixture() { const plan = firstPlan(); plan.name = 'Design de interfaces'; plan.days = [0,1,2,3,4,5,6]; plan.blocks.push(newBlock('break')); return { ...seed(), plans: [plan] }; }

test('legacy plans keep ids and resolve without adding daily data; invalid dates and duplicate blocks are rejected', () => {
  const s = fixture(), p = s.plans[0], loaded = validateData(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(loaded.plans[0], p); assert.deepEqual(dayPlan(s, p.id, yesterday).blocks, p.blocks); assert.equal(loaded.plans[0].dayOverrides, undefined);
  for (const dayOverrides of [{ nope: { name: 'Dia', blocks: [] } }, [], { [date]: { name: 'Dia', blocks: [p.blocks[0],p.blocks[0]] } }, { [date]: { name: 'Dia', blocks: [], completedAt: date } }]) assert.throws(() => validateData({ ...s, plans: [{ ...p, dayOverrides }] }));
});

test('an extra lesson after completion belongs only to today and is prepared paused', () => {
  let s = fixture(); const p = s.plans[0];
  for (const b of p.blocks) { s = setDone(s, yesterday, p.id, b.id, true); s = setDone(s, date, p.id, b.id, true); }
  const records = structuredClone(s.records), extra = { ...newBlock(), name: 'Prática de hierarquia visual' };
  s = saveDailyPlan(s, p.id, date, { name: 'Design · prática extra', blocks: [...p.blocks,extra] }, now);
  assert.deepEqual(s.records, records); assert.equal(dailySummary(s, date).total, 5); assert.equal(dailySummary(s, date).completed, 4);
  assert.equal(dailySummary(s, yesterday).total, 4); assert.equal(dailySummary(s, yesterday).completed, 4); assert.equal(dailySummary(s, tomorrow).total, 4);
  assert.equal(s.plans[0].name, p.name); assert.equal(dayPlan(s, p.id, date).name, 'Design · prática extra'); assert.equal(s.plans[0].blocks, p.blocks);
  assert.equal(s.active.blockId, extra.id); assert.equal(s.active.running, false); assert.equal(getRecord(s, date, p.id, extra.id).done, false);
});

test('renaming, reordering and removing blocks keeps other dates and recorded time intact', () => {
  let s = fixture(); const p = s.plans[0], first = p.blocks[0]; s = play(s, p, first, date, now);
  s = tick(s, now + 120000).state; const elapsed = focusMs(s, date, date);
  s = saveDailyPlan(s, p.id, date, { name: p.name, blocks: [p.blocks[1],p.blocks[2]] }, now + 120000);
  assert.equal(s.active.blockId, p.blocks[1].id); assert.equal(s.active.running, false); assert.equal(focusMs(s, date, date), elapsed);
  s = editDailyBlock(s, p.id, p.blocks[2].id, { name: 'Contraste e legibilidade', minutes: 15 }, date, now + 120000);
  assert.equal(dayPlan(s, p.id, date).blocks[1].name, 'Contraste e legibilidade'); assert.equal(dayPlan(s, p.id, yesterday).blocks[2].name, p.blocks[2].name);
  assert.equal(dayPlan(s, p.id, tomorrow).blocks.length, 4); assert.equal(dailySummary(s, date).studyMinutes, 15);
});

test('template edits apply from today forward, preserve earlier templates and leave overrides independent', () => {
  let s = fixture(); const p = s.plans[0], next = { ...p, name: 'Design de produtos', blocks: [...p.blocks,newBlock()] };
  s = savePlanTemplate(s, next, now);
  assert.equal(dayPlan(s, p.id, yesterday).blocks.length, 4); assert.equal(dayPlan(s, p.id, date).blocks.length, 5); assert.equal(dayPlan(s, p.id, tomorrow).name, next.name);
  s = savePlanTemplate(s, { ...s.plans[0], name: 'Design e prática' }, now + 60000); assert.equal(s.plans[0].templateHistory.length, 1); assert.equal(dayPlan(s, p.id, yesterday).name, p.name);
  s = saveDailyPlan(s, p.id, date, { name: 'Roteiro especial', blocks: [p.blocks[0]] }, now + 60000);
  s = savePlanTemplate(s, { ...s.plans[0], blocks: [p.blocks[0],p.blocks[1]] }, new Date(`${tomorrow}T12:00:00`).getTime());
  assert.equal(dayPlan(s, p.id, date).blocks.length, 1); assert.equal(dayPlan(s, p.id, date).name, 'Roteiro especial'); assert.equal(dayPlan(s, p.id, yesterday).blocks.length, 4); assert.equal(dayPlan(s, p.id, tomorrow).blocks.length, 2);
  const bad = structuredClone(s); bad.plans[0].templateHistory.reverse(); assert.throws(() => validateData(bad));
});

test('daily-only blocks work with timer completion, manual credit, next block and additional session time', () => {
  let s = fixture(); const p = s.plans[0], lesson = { ...newBlock(), name: 'Revisão de contraste', minutes: 2 }, pause = newBlock('break');
  s = saveDailyPlan(s, p.id, date, { name: 'Dia de revisão', blocks: [lesson,pause] }, now);
  s = tick(play(s, p, lesson, date, now), now + 120000).state; assert.equal(getRecord(s, date, p.id, lesson.id).done, true); assert.equal(s.active.blockId, pause.id); assert.equal(s.active.running, false);
  let manual = fixture(); manual.settings.creditManualTime = true; manual = saveDailyPlan(manual, manual.plans[0].id, date, { name: 'Dia de revisão', blocks: [lesson,pause] }, now);
  manual = setManualDone(manual, date, manual.plans[0].id, lesson.id, true, now); assert.equal(focusMs(manual, date, date), 120000); assert.equal(manual.active.blockId, pause.id);
  let extra = fixture(); const id = extra.plans[0].id; extra = saveDailyPlan(extra, id, date, { name: 'Revisão', blocks: [lesson,pause] }, now); extra = extendLesson(play(extra, extra.plans[0], lesson, date, now), 3, now);
  extra = editDailyBlock(extra, id, lesson.id, { name: 'Revisão ampliada', minutes: 2 }, date, now + 60000); assert.equal(extra.active.totalMs, 300000); assert.equal(extra.active.remainingMs, 240000); assert.equal(extra.active.running, false);
  assert.equal(validateData(JSON.parse(JSON.stringify(extra))).active.blockId, lesson.id);
});

test('editing a different day does not stop the current timer; an empty day preserves its history', () => {
  let s = fixture(); const p = s.plans[0]; s = play(s, p, p.blocks[0], date, now); const active = s.active;
  s = saveDailyPlan(s, p.id, yesterday, { name: p.name, blocks: [] }, now + 60000); assert.equal(s.active, active); assert.equal(dailySummary(s, yesterday).total, 0);
  s = saveDailyPlan(s, p.id, date, { name: p.name, blocks: [] }, now + 60000); assert.equal(s.active, null); assert.equal(focusMs(s, date, date), 60000); assert.equal(s.plans[0].blocks.length, 4);
});

test('daily schedules and historical templates survive portable backup and the prepared JSONB payload', () => {
  let s = fixture(); const p = s.plans[0]; s = savePlanTemplate(s, { ...p, blocks: [...p.blocks,newBlock()] }, now);
  s = saveDailyPlan(s, p.id, date, { name: 'Revisão', blocks: [newBlock()] }, now);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-daily-backup-'));
  try {
    const store = new BookFiles(path.join(folder, 'profile')), file = path.join(folder, 'backup.json'); store.export(file, s);
    const restored = validateData(store.restore(store.verifyBackup(JSON.parse(fs.readFileSync(file, 'utf8')))));
    assert.deepEqual(restored.plans, s.plans); assert.equal(restored.active.blockId, s.active.blockId); assert.deepEqual(packDocument(s).payload.plans, s.plans);
    assert.equal(dayPlan(restored, p.id, yesterday).blocks.length, 4); assert.equal(dayPlan(restored, p.id, date).blocks.length, 1);
  } finally { const resolved = path.resolve(folder); if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('organon-daily-backup-')) fs.rmSync(resolved, { recursive: true, force: true }); }
});

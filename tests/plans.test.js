import test from 'node:test';
import assert from 'node:assert/strict';
import { completedPlanSummary, dailySummary, dayKey, firstPlan, getRecord, play, seed, setDone, setPlanCompleted, validateData } from '../src/model.js';
import { notebookIcons, planIconKey } from '../src/book-appearance.js';
const now = new Date(2026, 9, 27, 12).getTime(), date = dayKey(new Date(now));
function setup() { const plan = { ...firstPlan(), days: [0, 1, 2, 3, 4, 5, 6], notes: [{ id: 'note', date, text: 'Preservar esta anotação', images: [] }] }; return { plan, state: { ...seed(), plans: [plan] } }; }
test('finishing a plan stops its timer and preserves actual time, notes and all blocks', () => {
  const { state, plan } = setup();
  const running = play(state, plan, plan.blocks[0], date, now);
  const completed = setPlanCompleted(running, plan.id, true, now + 60000);
  assert.equal(completed.active, null);
  assert.equal(completed.plans[0].completedAt, date);
  assert.deepEqual(completed.plans[0].notes, plan.notes);
  assert.deepEqual(completed.plans[0].blocks, plan.blocks);
  assert.equal(getRecord(completed, date, plan.id, plan.blocks[0].id).elapsedMs, 60000);
  assert.equal(getRecord(completed, date, plan.id, plan.blocks[0].id).done, false);
  assert.equal(dailySummary(completed, date).total, 0);
  assert.equal(play(completed, plan, plan.blocks[0], date, now + 70000), completed);
  assert.equal(state.plans[0].completedAt, null);
});
test('daily completion does not finish a course and reopening preserves progress', () => {
  const { state, plan } = setup();
  let next = state;
  for (const block of plan.blocks) next = setDone(next, date, plan.id, block.id, true);
  assert.equal(next.plans[0].completedAt, null);
  assert.equal(dailySummary(next, date).percent, 100);
  next = setPlanCompleted(next, plan.id, true, now);
  const recordSnapshot = structuredClone(next.records);
  next = setPlanCompleted(next, plan.id, false, now);
  assert.equal(dailySummary(next, date).total, 3);
  assert.deepEqual(next.records, recordSnapshot);
  assert.equal(next.plans[0].completedAt, null);
});
test('completion counts use the selected period and do not multiply on repeated actions', () => {
  const { state, plan } = setup();
  let next = setPlanCompleted(state, plan.id, true, now);
  next = setPlanCompleted(next, plan.id, true, now + 86400000);
  assert.equal(next.plans[0].completedAt, date);
  assert.equal(completedPlanSummary(next.plans, '2026-10-01', '2026-10-31').inPeriod.length, 1);
  assert.equal(completedPlanSummary(next.plans, '2026-09-01', '2026-09-30').inPeriod.length, 0);
  assert.equal(completedPlanSummary(next.plans, '2026-09-01', '2026-09-30').total, 1);
});
test('legacy plans keep their original automatic icon; custom icon, color and completion survive backups', () => {
  const { state, plan } = setup();
  const legacy = { ...plan, color: 'blue' }; delete legacy.icon; delete legacy.completedAt;
  assert.equal(planIconKey(legacy), 'target');
  assert.equal(validateData({ ...state, plans: [legacy] }).plans[0].color, 'blue');
  const custom = { ...plan, color: '#204230', icon: 'network', completedAt: date };
  assert.deepEqual(validateData(JSON.parse(JSON.stringify({ ...state, plans: [custom] }))).plans[0], custom);
  assert(notebookIcons.length >= 70); assert.equal(new Set(notebookIcons).size, notebookIcons.length);
  for (const fields of [{ color: 'url(x)' }, { icon: 'missing' }, { completedAt: '2026-02-30' }]) assert.throws(() => validateData({ ...state, plans: [{ ...plan, ...fields }] }));
});

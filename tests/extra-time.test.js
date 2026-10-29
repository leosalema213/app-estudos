import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, extendLesson, firstPlan, focusMs, getRecord, pause, play, seed, tick, validateData } from '../src/model.js';

const now = new Date(2026, 9, 27, 12).getTime();
const date = dayKey(new Date(now));
function fixture() {
  const state = seed(); const plan = firstPlan(); state.plans = [plan];
  return { state, plan, block: plan.blocks[0] };
}

test('extra time settles once, preserves playback and affects only this session', () => {
  const { state, plan, block } = fixture();
  let next = extendLesson(play(state, plan, block, date, now), 2, now + 60000);
  assert.equal(next.active.running, true);
  assert.equal(next.active.totalMs, 27 * 60000);
  assert.equal(next.active.remainingMs, 26 * 60000);
  assert.equal(focusMs(next, date, date), 60000);
  next = extendLesson(next, 3, now + 60000);
  assert.equal(next.active.totalMs, 30 * 60000);
  assert.equal(focusMs(next, date, date), 60000);
  assert.equal(next.plans, state.plans);
  const tomorrow = play(next, plan, block, '2026-10-28', now + 60000);
  assert.equal(tomorrow.active.totalMs, block.minutes * 60000);
});

test('paused extra time survives serialization and earns metrics only when studied', () => {
  const { state, plan, block } = fixture();
  let next = pause(play(state, plan, block, date, now), now + 60000);
  next = extendLesson(next, 5, now + 10 * 60000);
  const restored = validateData(JSON.parse(JSON.stringify(next)));
  assert.equal(restored.active.running, false);
  assert.equal(restored.active.remainingMs, 29 * 60000);
  assert.equal(focusMs(restored, date, date), 60000);
  next = play(restored, plan, block, date, now + 10 * 60000);
  next = tick(next, now + 50 * 60000).state;
  assert.equal(focusMs(next, date, date), 30 * 60000);
  assert.equal(getRecord(next, date, plan.id, block.id).done, true);
});

test('backup validates timer bounds and pauses a running extended session', () => {
  const { state, plan, block } = fixture();
  const next = extendLesson(play(state, plan, block, date, now), 5, now + 60000);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(next))).active, { ...next.active, running: false });
  for (const fields of [{ remainingMs: -1 }, { remainingMs: next.active.totalMs + 1 }, { totalMs: 0 }, { startedAt: null }, { blockId: 'missing' }, { date: '2026-02-30' }, { type: 'break' }]) {
    assert.throws(() => validateData({ ...next, active: { ...next.active, ...fields } }), /Cronômetro inválido/);
  }
  assert.equal(validateData({ ...next, plans: [{ ...plan, completedAt: date }] }).active, null);
});

test('completed lessons reopen paused without losing their recorded time', () => {
  const { state, plan, block } = fixture();
  plan.blocks = [block]; // Terminal lesson: no subsequent block is available to prepare.
  let next = tick(play(state, plan, block, date, now), now + 25 * 60000).state;
  next = extendLesson(next, 2, now + 30 * 60000);
  assert.equal(next.active.running, false);
  assert.equal(next.active.remainingMs, 2 * 60000);
  assert.equal(getRecord(next, date, plan.id, block.id).done, false);
  assert.equal(focusMs(next, date, date), 25 * 60000);
  next = play(next, plan, block, date, now + 30 * 60000);
  next = tick(next, now + 32 * 60000).state;
  assert.equal(focusMs(next, date, date), 27 * 60000);
  assert.equal(getRecord(next, date, plan.id, block.id).done, true);
});

test('no extra time for breaks, missing sessions, deleted lessons or invalid choices', () => {
  const { state, plan, block } = fixture();
  assert.equal(extendLesson(state, 2, now), state);
  const resting = play(state, plan, plan.blocks[1], date, now);
  assert.equal(extendLesson(resting, 2, now), resting);
  const active = play(state, plan, block, date, now);
  assert.equal(extendLesson(active, 1, now), active);
  const deleted = { ...active, plans: [] };
  assert.equal(extendLesson(deleted, 2, now), deleted);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, firstPlan, getRecord, play, prepareNextBlock, seed, setDone, setManualDone, tick } from '../src/model.js';
const now = new Date(2026, 9, 29, 12).getTime(), date = dayKey(new Date(now));
function fixture() { const plans = [firstPlan(), firstPlan(), firstPlan()].map((p, i) => ({ ...p, name: `Plano ${i}`, days: [0,1,2,3,4,5,6] })); return { ...seed(), plans }; }
test('player prepares the break after natural completion and never charges paused time', () => {
  const s = fixture(), p = s.plans[0], b = p.blocks[0];
  const completed = tick(play(s, p, b, date, now), now + b.minutes * 60000);
  assert.equal(completed.completed.blockId, b.id); assert.equal(completed.state.active.blockId, p.blocks[1].id); assert.equal(completed.state.active.running, false);
  assert.equal(completed.state.active.remainingMs, p.blocks[1].minutes * 60000);
  assert.equal(getRecord(tick(completed.state, now + 60 * 60000).state, date, p.id, p.blocks[1].id).elapsedMs, 0);
});
test('player follows manual checks with credit off or on, skipping completed blocks', () => {
  for (const credit of [false, true]) {
    let s = fixture(); s.settings.creditManualTime = credit; const p = s.plans[0];
    s = setDone(s, date, p.id, p.blocks[1].id, true);
    s = setManualDone(play(s, p, p.blocks[0], date, now), date, p.id, p.blocks[0].id, true, now + 60000);
    assert.equal(s.active.blockId, p.blocks[2].id); assert.equal(s.active.running, false);
    assert.equal(getRecord(s, date, p.id, p.blocks[0].id).elapsedMs, (credit ? 25 : 1) * 60000);
    assert.equal(getRecord(s, date, p.id, p.blocks[2].id).elapsedMs, 0);
  }
});
test('player continues to the next eligible plan and preserves previous partial study', () => {
  let s = fixture(); s.plans[1].days = []; const first = s.plans[0], target = s.plans[2];
  s.records[`${date}|${target.id}|${target.blocks[0].id}`] = { done: false, elapsedMs: 120000 };
  s = prepareNextBlock(s, date, first.id, first.blocks.at(-1).id, now);
  assert.equal(s.active.planId, target.id); assert.equal(s.active.remainingMs, 23 * 60000); assert.equal(s.active.running, false);
});
test('checking another plan does not interrupt a running session; end of itinerary has no loop', () => {
  let s = fixture(); const p = s.plans[0], other = s.plans[1]; s = play(s, p, p.blocks[0], date, now);
  s = setManualDone(s, date, other.id, other.blocks[0].id, true, now + 60000);
  assert.equal(s.active.planId, p.id); assert(s.active.running);
  const last = s.plans.at(-1); const end = prepareNextBlock({ ...s, active: null }, date, last.id, last.blocks.at(-1).id, now); assert.equal(end.active, null);
});
test('terminal manual completion clears the timer without inventing credited time', () => {
  const s = fixture(), p = s.plans.at(-1), block = p.blocks.at(-1);
  const done = setManualDone(play(s, p, block, date, now), date, p.id, block.id, true, now + 60000);
  assert.equal(done.active.remainingMs, 0); assert.equal(done.active.running, false); assert.equal(getRecord(done, date, p.id, block.id).elapsedMs, 60000);
});

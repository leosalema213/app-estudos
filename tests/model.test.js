import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, editBlock, focusMs, getRecord, pause, play, preferences, resetTimer, seed, setDone, tick, validateData } from '../src/model.js';
const baseTime = new Date(2026, 9, 27, 12).getTime();
function fixture() { const state = seed(); const plan = state.plans[0]; const block = plan.blocks[0]; return { state, plan, block, date: dayKey(new Date(baseTime)) }; }

test('timer completes at configured duration and never starts the next block', () => {
  const { state, plan, block, date } = fixture();
  const next = tick(play(state, plan, block, date, baseTime), baseTime + 30 * 60000);
  assert.equal(next.finished, true);
  assert.equal(next.state.active.running, false);
  assert.equal(next.state.active.blockId, block.id);
  assert.equal(getRecord(next.state, date, plan.id, block.id).done, true);
  assert.equal(focusMs(next.state, date, date), block.minutes * 60000);
  assert.equal(getRecord(next.state, date, plan.id, plan.blocks[1].id).done, false);
  assert.equal(tick(next.state, baseTime + 31 * 60000).finished, false);
});
test('pausing and resuming excludes all time spent paused', () => {
  const { state, plan, block, date } = fixture();
  let s = pause(play(state, plan, block, date, baseTime), baseTime + 60000);
  s = tick(s, baseTime + 10 * 60000).state;
  assert.equal(focusMs(s, date, date), 60000);
  s = play(s, plan, block, date, baseTime + 10 * 60000);
  s = pause(s, baseTime + 12 * 60000);
  assert.equal(focusMs(s, date, date), 3 * 60000);
  assert.equal(s.active.remainingMs, 22 * 60000);
});
test('switching blocks settles the previous session and only one timer runs', () => {
  const { state, plan, block, date } = fixture();
  const s = play(play(state, plan, block, date, baseTime), plan, plan.blocks[2], date, baseTime + 30000);
  assert.equal(s.active.blockId, plan.blocks[2].id);
  assert.equal(getRecord(s, date, plan.id, block.id).elapsedMs, 30000);
});
test('break time is tracked but excluded from focus metrics', () => {
  const { state, plan, date } = fixture(); const block = plan.blocks[1];
  const s = tick(play(state, plan, block, date, baseTime), baseTime + 5 * 60000).state;
  assert.equal(getRecord(s, date, plan.id, block.id).elapsedMs, 300000);
  assert.equal(focusMs(s, date, date), 0);
});
test('manual completion and unchecking do not invent study time', () => {
  const { state, plan, block, date } = fixture();
  let s = setDone(state, date, plan.id, block.id, true);
  s = setDone(s, date, plan.id, plan.blocks[1].id, true);
  assert.equal(focusMs(s, date, date), 0);
  assert.equal(getRecord(s, date, plan.id, plan.blocks[1].id).type, 'break');
  assert.equal(getRecord(s, '2026-10-28', plan.id, block.id).done, false);
  s = setDone(s, date, plan.id, block.id, false);
  assert.equal(getRecord(s, date, plan.id, block.id).done, false);
});
test('time crossing midnight is allocated to the correct local dates', () => {
  const { state, plan, block } = fixture();
  const start = new Date(2026, 9, 27, 23, 59).getTime();
  const s = pause(play(state, plan, block, '2026-10-27', start), start + 3 * 60000);
  assert.equal(focusMs(s, '2026-10-27', '2026-10-27'), 60000);
  assert.equal(focusMs(s, '2026-10-28', '2026-10-28'), 120000);
});
test('restarting preserves logged time and resets only the timer', () => {
  const { state, plan, block, date } = fixture();
  const s = resetTimer(play(state, plan, block, date, baseTime), baseTime + 60000);
  assert.equal(s.active.remainingMs, block.minutes * 60000);
  assert.equal(s.active.running, false);
  assert.equal(focusMs(s, date, date), 60000);
});
test('backups preserve notes and history and restore with no running session', () => {
  const { state, plan, block, date } = fixture();
  const s = play(state, plan, block, date, baseTime);
  plan.notes.push({ id: 'test-note', date, text: 'Hoje aprendi sobre DNS.', images: [] });
  const restored = validateData(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.plans[0].notes[0].text, 'Hoje aprendi sobre DNS.');
  assert.equal(restored.active, null);
});
test('malformed backups and duplicate ids are rejected', () => {
  assert.throws(() => validateData({ version: 2 }));
  const s = seed(); s.plans[0].blocks[0].minutes = -1;
  assert.throws(() => validateData(s));
  const duplicate = seed(); duplicate.plans[1].id = duplicate.plans[0].id;
  assert.throws(() => validateData(duplicate));
});
test('older backups migrate to dark mode and the light preference survives import', () => {
  const old = seed(); delete old.settings.theme;
  assert.equal(validateData(old).settings.theme, 'dark');
  old.settings.theme = 'light';
  assert.equal(validateData(old).settings.theme, 'light');
});
test('clock moving backwards cannot credit negative time', () => {
  const { state, plan, block, date } = fixture();
  const s = tick(play(state, plan, block, date, baseTime), baseTime - 10000).state;
  assert.equal(s.active.remainingMs, block.minutes * 60000);
  assert.equal(focusMs(s, date, date), 0);
});
test('density preferences migrate without losing theme or sound', () => {
  assert.deepEqual(preferences({ theme: 'light', sound: false }), { theme: 'light', sound: false, density: 'compact' });
  assert.equal(preferences({ density: 'minimal' }).density, 'minimal');
  assert.equal(preferences({ density: 'comfortable' }).density, 'comfortable');
  assert.equal(preferences({ density: 'invalid' }).density, 'compact');
});
test('editing one block preserves ids, other blocks and logged study time', () => {
  const { state, plan, block, date } = fixture();
  const running = play(state, plan, block, date, baseTime);
  const edited = editBlock(running, plan.id, block.id, { name: 'Novo nome', minutes: 30 }, baseTime + 5 * 60000);
  assert.equal(edited.active.blockName, 'Novo nome');
  assert.equal(edited.active.running, false);
  assert.equal(edited.active.remainingMs, 25 * 60000);
  assert.equal(focusMs(edited, date, date), 5 * 60000);
  assert.equal(edited.plans[0].blocks[0].id, block.id);
  assert.equal(edited.plans[0].blocks[1], plan.blocks[1]);
  assert.equal(edited.plans[1], state.plans[1]);
});
test('reducing a running block below elapsed time completes only that block', () => {
  const { state, plan, block, date } = fixture();
  const edited = editBlock(play(state, plan, block, date, baseTime), plan.id, block.id, { name: block.name, minutes: 2 }, baseTime + 5 * 60000);
  assert.equal(edited.active.remainingMs, 0);
  assert.equal(edited.active.running, false);
  assert.equal(getRecord(edited, date, plan.id, block.id).done, true);
  assert.equal(focusMs(edited, date, date), 5 * 60000);
  assert.equal(getRecord(edited, date, plan.id, plan.blocks[1].id).done, false);
});
test('invalid individual edits leave existing state intact', () => {
  const { state, plan, block } = fixture();
  assert.throws(() => editBlock(state, plan.id, block.id, { name: '', minutes: 25 }));
  assert.throws(() => editBlock(state, plan.id, block.id, { name: 'Aula', minutes: 361 }));
  assert.throws(() => editBlock(state, plan.id, block.id, { name: 'Aula', minutes: 0.5 }));
  assert.equal(state.plans[0].blocks[0], block);
});

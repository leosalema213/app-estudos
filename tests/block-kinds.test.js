import test from 'node:test';
import assert from 'node:assert/strict';
import { blockKind, createKind, customBlock, validKinds } from '../src/block-kinds.js';
import { dailySummary, dayKey, extendLesson, firstPlan, focusMs, getRecord, pause, play, seed, setManualDone, validateData } from '../src/model.js';

test('custom types have stable identity and reject duplicate names including accents and built-ins', () => {
  const kind = createKind(' Revisão ', 'brain');
  assert.equal(kind.name, 'Revisão');
  for (const name of ['revisao', 'REVISÃO', 'Aula', 'Descanso', ' ', 'x'.repeat(41)]) assert.throws(() => createKind(name, 'brain', [kind]));
  assert.throws(() => createKind('Atividade', 'none'));
  assert.equal(validKinds([{ ...kind, id: 'lesson' }]), false);
  assert.equal(validKinds([kind, kind]), false);
});

test('custom activity earns focus/manual time and keeps its type through timer, extra time and backup', () => {
  const kind = createKind('Revisão', 'study'), block = customBlock(kind);
  const plan = { ...firstPlan(), blocks: [block], days: [0, 1, 2, 3, 4, 5, 6] };
  const state = { ...seed(), blockKinds: [kind], plans: [plan] };
  const now = new Date(2026, 9, 28, 12).getTime(), date = dayKey(new Date(now));
  const running = play(state, plan, block, date, now);
  const extended = pause(extendLesson(running, 5, now + 60000), now + 60000);
  assert.deepEqual(extended.active.kind, kind);
  assert.equal(extended.active.totalMs, 30 * 60000);
  assert.equal(focusMs(extended, date, date), 60000);
  assert.deepEqual(getRecord(extended, date, plan.id, block.id).kind, kind);
  const credited = setManualDone({ ...extended, settings: { ...extended.settings, creditManualTime: true } }, date, plan.id, block.id, true, now + 60000);
  assert.equal(getRecord(credited, date, plan.id, block.id).elapsedMs, 25 * 60000);
  assert.equal(dailySummary(state, date).studyMinutes, 25);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(extended))), extended);
});

test('legacy backups acquire an empty catalog; block snapshots work independently of the catalog', () => {
  const state = seed(); delete state.blockKinds;
  assert.deepEqual(validateData(state).blockKinds, []);
  const kind = createKind('Prática', 'code'), block = customBlock(kind);
  const plan = { ...firstPlan(), blocks: [block] };
  const restored = validateData({ ...state, plans: [plan] });
  assert.deepEqual(blockKind(restored.plans[0].blocks[0]), kind);
  assert.deepEqual(blockKind({ type: 'break' }).name, 'Descanso');
  assert.throws(() => validateData({ ...state, blockKinds: [kind, kind] }), /Tipos de atividade/);
  assert.throws(() => validateData({ ...state, plans: [{ ...plan, blocks: [{ ...block, kind: { ...kind, icon: 'bad' } }] }] }), /Bloco inválido/);
});

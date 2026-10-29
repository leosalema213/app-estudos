const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'); let app, directory;
(async () => {
  if (!process.argv.includes('--ui-only')) cp.execFileSync(process.execPath, ['--test', ...['daily-plans.test.js','player-next.test.js','extra-time.test.js'].map(file => path.join(__dirname, file))], { cwd: root, stdio: 'inherit' });
  if (!process.argv.includes('--skip-build')) cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  const { seed, firstPlan, newBlock, dayKey, recordKey } = await import('../src/model.js');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-daily-ui-')); const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
  const state = seed(), plan = firstPlan(), date = dayKey(), before = new Date(); before.setDate(before.getDate() - 1); const yesterday = dayKey(before);
  state.onboardingCompleted = true; plan.name = 'Design de interfaces'; plan.days = [0,1,2,3,4,5,6]; plan.blocks.push(newBlock('break')); state.plans = [plan];
  for (const day of [date,yesterday]) for (const b of plan.blocks) state.records[recordKey(day,plan.id,b.id)] = { elapsedMs: b.minutes * 60000, done: true, type: b.type, planName: plan.name, blockName: b.name };
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(state)); const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = async () => { app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env }); const page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.getByRole('heading', { name: 'Meu dia', exact: true }).waitFor(); return page; };
  let page = await launch();
  await page.getByRole('button', { name: `Opções de ${plan.name}`, exact: true }).click(); await page.getByRole('menuitem', { name: 'Editar roteiro do dia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar roteiro do dia', exact: true });
  assert.equal(await dialog.locator('.day-picker').count(), 0); assert.equal(await dialog.getByRole('button', { name: 'Escolher ícone do plano' }).count(), 0);
  await dialog.getByRole('textbox', { name: 'Nome neste dia', exact: true }).fill('Design · prática extra'); await dialog.getByRole('button', { name: 'Adicionar aula', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Nome do bloco 5', exact: true }).fill('Prática de hierarquia visual'); await dialog.locator('.editor-block').last().locator('input[type=number]').fill('2');
  await dialog.getByRole('button', { name: 'Salvar roteiro do dia', exact: true }).click(); await page.getByRole('button', { name: 'Iniciar Prática de hierarquia visual', exact: true }).waitFor();
  assert.equal(await page.locator('.study-block').count(), 5); assert.equal(await page.locator('.bottom-player .player-info strong').innerText(), 'Prática de hierarquia visual'); assert.equal(await page.locator('.bottom-player').getByRole('button', { name: 'Continuar aula', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Dia anterior', exact: true }).click(); assert.equal(await page.locator('.study-block').count(), 4); assert.equal(await page.getByRole('heading', { name: plan.name, exact: true }).count(), 1);
  await page.getByTitle('Voltar para hoje', { exact: true }).click(); await page.getByRole('button', { name: 'Próximo dia', exact: true }).click(); assert.equal(await page.locator('.study-block').count(), 4);
  await page.getByTitle('Voltar para hoje', { exact: true }).click(); await page.getByRole('button', { name: 'Editar Prática de hierarquia visual', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Nome', { exact: true }).fill('Prática de contraste'); await page.getByRole('dialog').getByRole('button', { name: 'Salvar alteração', exact: true }).click();
  await page.getByRole('button', { name: 'Opções de Design · prática extra', exact: true }).click(); await page.getByRole('menuitem', { name: 'Editar roteiro do dia', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remover bloco 5', exact: true }).click(); await dialog.getByRole('button', { name: 'Remover bloco 4', exact: true }).click(); await dialog.getByRole('button', { name: 'Remover bloco 3', exact: true }).click(); await dialog.getByRole('button', { name: 'Salvar roteiro do dia', exact: true }).click(); assert.equal(await page.locator('.study-block').count(), 2);
  await page.getByRole('button', { name: 'Opções de Design · prática extra', exact: true }).click(); await page.getByRole('menuitem', { name: 'Editar modelo do plano', exact: true }).click(); const model = page.getByRole('dialog', { name: 'Editar plano de estudo', exact: true });
  assert.equal(await model.locator('.editor-block').count(), 4); await model.getByRole('button', { name: 'Adicionar aula', exact: true }).click(); await model.getByRole('textbox', { name: 'Nome do bloco 5', exact: true }).fill('Componentes de interface'); await model.getByRole('button', { name: 'Salvar plano', exact: true }).click();
  assert.equal(await page.locator('.study-block').count(), 2); await page.getByRole('button', { name: 'Dia anterior', exact: true }).click(); assert.equal(await page.locator('.study-block').count(), 4); await page.getByTitle('Voltar para hoje', { exact: true }).click(); await page.getByRole('button', { name: 'Próximo dia', exact: true }).click(); assert.equal(await page.locator('.study-block').count(), 5);
  await page.waitForFunction(async () => (await window.desktop.load()).plans[0].templateHistory?.length === 1); const saved = await page.evaluate(() => window.desktop.load());
  assert.deepEqual(saved.records, state.records); assert.equal(saved.plans[0].blocks.length, 5); assert.equal(saved.plans[0].dayOverrides[date].blocks.length, 2);
  await app.close(); app = null; page = await launch(); await page.getByRole('heading', { name: 'Design · prática extra', exact: true }).waitFor(); assert.equal(await page.locator('.study-block').count(), 2); await page.getByRole('button', { name: 'Dia anterior', exact: true }).click(); assert.equal(await page.locator('.study-block').count(), 4);
  console.log('Roteiro diário: inclusão, exclusão, renomeação, ontem/amanhã isolados, modelo com histórico, player pausado e reabertura verificados em perfil temporário.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-daily-ui-')) fs.rmSync(target, { recursive: true, force: true }); }
});

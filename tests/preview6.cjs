const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'), shotsOnly = process.argv.includes('--screenshots-only');
let app, directory;
(async () => {
  if (!shotsOnly) {
    cp.execFileSync(process.execPath, ['--test', path.join(__dirname, 'anki-plan-progress.test.js')], { cwd: root, stdio: 'inherit' });
    cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  }
  const { seed, firstPlan } = await import('../src/model.js');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-preview6-')); const profile = path.join(directory, 'profile'), output = path.join(root, 'test-output'); fs.mkdirSync(profile); fs.mkdirSync(output, { recursive: true });
  const data = seed(); data.onboardingCompleted = true; data.settings.theme = 'dark'; data.plans = [firstPlan(), firstPlan()].map((p, i) => ({ ...p, name: i ? 'Plano de conversação' : 'Plano de inglês', days: [0,1,2,3,4,5,6] }));
  data.anki.reviews = Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, cardId: 'historical-card', at: Date.now() - i * 60000, rating: i % 2 ? 1 : 3, previousState: 2, interval: 3, elapsedMs: 54000 }));
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(data));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env }); const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Anki', exact: true }).click(); const add = page.getByRole('button', { name: 'Adicionar', exact: true });
  await add.click(); await page.getByRole('menu', { name: 'Adicionar', exact: true }).waitFor();
  if (!shotsOnly) { assert.equal(await page.getByRole('dialog').count(), 0); assert(await page.getByRole('menuitem', { name: /Criar carta/ }).isDisabled()); await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'detached' }); await add.click(); }
  await page.getByRole('menuitem', { name: 'Criar baralho', exact: true }).click(); const deckDialog = page.getByRole('dialog', { name: 'Criar baralho', exact: true }); await deckDialog.getByLabel('Nome', { exact: true }).fill('Inglês'); await deckDialog.getByRole('checkbox', { name: 'Plano de inglês', exact: true }).check(); await deckDialog.getByRole('button', { name: 'Criar baralho', exact: true }).click();
  await page.getByRole('button', { name: 'Inglês', exact: true }).waitFor(); await add.click();
  await page.locator('.content').screenshot({ animations: 'disabled', path: path.join(output, 'anki-popup-preview6.png') });
  if (!shotsOnly) { await page.getByRole('heading', { name: 'Anki', exact: true }).click(); await page.getByRole('menu').waitFor({ state: 'detached' }); await add.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); }
  else await page.getByRole('menuitem', { name: 'Criar carta', exact: true }).click();
  const noteDialog = page.getByRole('dialog', { name: 'Criar carta', exact: true }); await noteDialog.getByRole('textbox', { name: /Frente/ }).fill('Bom dia'); await noteDialog.getByRole('textbox', { name: /Verso/ }).fill('Good morning'); await noteDialog.getByRole('button', { name: 'Criar carta', exact: true }).click(); await noteDialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar baralho Inglês', exact: true }).click(); const options = page.getByRole('dialog', { name: 'Editar baralho', exact: true });
  if (!shotsOnly) assert(await options.getByRole('checkbox', { name: 'Plano de inglês', exact: true }).isChecked());
  await options.getByRole('checkbox', { name: 'Plano de conversação', exact: true }).check(); await options.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Planos de estudo', exact: true }).click();
  const overview = page.locator('.overview-card').filter({ hasText: 'Plano de inglês' });
  await overview.getByRole('button', { name: 'Opções de Plano de inglês', exact: true }).click();
  if (!shotsOnly) { assert.equal(await page.getByRole('menuitem', { name: 'Editar plano', exact: true }).count(), 1); assert.equal(await page.getByRole('menuitem', { name: 'Duplicar plano', exact: true }).count(), 1); assert.equal(await page.getByRole('menuitem', { name: 'Excluir plano', exact: true }).count(), 1); }
  await page.getByRole('menuitem', { name: 'Vincular baralhos Anki', exact: true }).click();
  const planLinks = page.getByRole('dialog');
  if (!shotsOnly) assert(await planLinks.getByRole('checkbox', { name: 'Inglês', exact: true }).isChecked());
  await planLinks.getByRole('checkbox', { name: 'Inglês', exact: true }).uncheck(); await planLinks.getByRole('button', { name: 'Salvar vínculos', exact: true }).click();
  await overview.getByRole('button', { name: 'Opções de Plano de inglês', exact: true }).click(); await page.getByRole('menuitem', { name: 'Vincular baralhos Anki', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Inglês', exact: true }).check(); await page.getByRole('dialog').getByRole('button', { name: 'Salvar vínculos', exact: true }).click();
  await page.locator('.sidebar nav').getByRole('button', { name: /^Meu dia/ }).click();
  const plan = page.locator('.study-card').filter({ hasText: 'Plano de inglês' }); await plan.getByRole('button', { name: 'Anki do plano (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Inglês', exact: true }).waitFor();
  if (!shotsOnly) assert.equal(await page.getByLabel('Baralhos por plano', { exact: true }).inputValue(), data.plans[0].id);
  await page.getByRole('button', { name: 'Vincular baralhos', exact: true }).click(); const links = page.getByRole('dialog'); await links.getByRole('checkbox', { name: 'Inglês', exact: true }).uncheck(); await links.getByRole('button', { name: 'Salvar vínculos', exact: true }).click();
  await page.getByText('Nenhum baralho vinculado a este plano. Use Vincular baralhos para escolher.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Vincular baralhos', exact: true }).click(); await page.getByRole('dialog').getByRole('checkbox', { name: 'Inglês', exact: true }).check(); await page.getByRole('dialog').getByRole('button', { name: 'Salvar vínculos', exact: true }).click();
  await page.getByRole('button', { name: 'Meu progresso', exact: true }).click(); const progress = page.locator('.anki-progress-section'); await progress.getByRole('heading', { name: 'Revisões Anki', exact: true }).waitFor();
  await progress.screenshot({ animations: 'disabled', path: path.join(output, 'anki-progress-preview6.png') });
  if (!shotsOnly) {
    await progress.getByText('7,2 min', { exact: true }).waitFor(); await progress.getByText('50%', { exact: true }).waitFor();
    await page.waitForFunction(async () => { const a = (await window.desktop.load()).anki; return a.cards.length === 1 && a.decks[0].planIds.length === 2; });
    const saved = await page.evaluate(() => window.desktop.load()); assert.deepEqual(saved.records, {}); assert.equal(saved.anki.reviews.length, 8); assert.equal(saved.anki.models[0].fields[0], 'Front');
  }
  console.log(shotsOnly ? 'Prints focados criados em test-output.' : 'Pop-up/teclado, criação de carta, tradução sem alteração de chaves, vínculos ao criar/editar e pelo menu do plano, navegação pelo plano e métricas sem tempo duplicado verificados.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-preview6-')) fs.rmSync(target, { recursive: true, force: true }); }
});

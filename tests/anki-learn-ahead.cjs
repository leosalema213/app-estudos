const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'); let app, folder;
(async () => {
  cp.execFileSync(process.execPath, ['--test', path.join(__dirname, 'anki-learn-ahead.test.js')], { cwd: root, stdio: 'inherit' });
  cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  const { seed } = await import('../src/model.js'), { basicModel, newCard } = await import('../src/anki.js');
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-learn-ahead-ui-'));
  const data = seed(); data.onboardingCompleted = true; data.anki.models = [basicModel];
  data.anki.decks = [{ id: 'd', name: 'Vocabulário', presetId: 'default' }];
  data.anki.notes = [{ id: 'new-note', modelId: basicModel.id, fields: ['Nova pergunta', 'Nova resposta'], tags: [] }, { id: 'learning-note', modelId: basicModel.id, fields: ['Pergunta em aprendizagem', 'Resposta em aprendizagem'], tags: [] }];
  data.anki.cards = [{ ...newCard('new-note', 'd'), id: 'new' }, { ...newCard('learning-note', 'd'), id: 'learning', state: 1, step: 1, reps: 1, due: Date.now() + 10 * 60000 }];
  const originalDue = data.anki.cards[1].due;
  fs.writeFileSync(path.join(folder, 'compasso.json'), JSON.stringify(data));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  async function launch() {
    app = await electron.launch({ args: [root, `--user-data-dir=${folder}`, '--skip-account-prompt'], env });
    const page = await app.firstWindow(); page.setDefaultTimeout(15000);
    await page.getByRole('button', { name: 'Anki', exact: true }).click(); return page;
  }
  let page = await launch();
  async function configure(value) {
    await page.getByRole('button', { name: 'Opções de Vocabulário', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Opções · Vocabulário', exact: true });
    await dialog.getByRole('tab', { name: 'Aprendizagem', exact: true }).click();
    const field = dialog.getByLabel('Antecipação da aprendizagem (minutos)', { exact: true });
    if (value !== null) await field.fill(String(value));
    else assert.equal(await field.inputValue(), '0');
    await dialog.getByRole('button', { name: 'Salvar opções', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
  }
  assert.equal(await page.locator('.anki-decks tbody .anki-learn').innerText(), '1');
  await configure(0);
  await page.waitForFunction(async () => (await window.desktop.load()).anki.settings.learnAhead === 0);
  assert.equal(await page.locator('.anki-decks tbody .anki-learn').innerText(), '0');
  await app.close(); app = null; page = await launch(); await configure(null); await configure(20);
  await page.waitForFunction(async () => (await window.desktop.load()).anki.settings.learnAhead === 20);
  assert.equal(await page.locator('.anki-decks tbody .anki-learn').innerText(), '1');
  await page.getByRole('button', { name: 'Vocabulário', exact: true }).click(); await page.getByRole('button', { name: 'Estudar agora', exact: true }).click();
  await page.frameLocator('iframe[title="Frente da carta"]').getByText('Nova pergunta', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Mostrar resposta/ }).click(); await page.getByRole('button', { name: /Acertei/ }).click();
  await page.frameLocator('iframe[title="Frente da carta"]').getByText('Pergunta em aprendizagem', { exact: true }).waitFor();
  const saved = (await page.evaluate(() => window.desktop.load())).anki;
  assert.equal(saved.cards.find(c => c.id === 'learning').due, originalDue); assert.equal(saved.cards.find(c => c.id === 'new').state, 1);
  console.log('Antecipação: padrão 20, zero persistido após reabertura, contadores, cartas novas antes das antecipadas e vencimentos preservados verificados em perfil temporário.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (folder) { const resolved = path.resolve(folder); if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('organon-learn-ahead-ui-')) fs.rmSync(resolved, { recursive: true, force: true }); }
});

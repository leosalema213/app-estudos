const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'), shotsOnly = process.argv.includes('--screenshots-only');
let app, directory;
(async () => {
  if (!shotsOnly) {
    cp.execFileSync(process.execPath, ['--test', path.join(__dirname, 'anki-decks.test.js')], { cwd: root, stdio: 'inherit' });
    cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  }
  const { seed } = await import('../src/model.js'), { basicModel, dayStart, newCard } = await import('../src/anki.js');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-preview5-')); const profile = path.join(directory, 'profile'), output = path.join(root, 'test-output'); fs.mkdirSync(profile); fs.mkdirSync(output, { recursive: true });
  const data = seed(); data.onboardingCompleted = true; data.settings.theme = 'dark';
  data.anki.decks = [{ id: 'english', name: 'Curso de inglês', presetId: 'default' }, { id: 'empty', name: 'Sistemas', presetId: 'default' }]; data.anki.models = [basicModel];
  data.anki.notes = [1,2,3].map(n => ({ id: `n${n}`, modelId: basicModel.id, fields: [`Pergunta de exemplo ${n}`, `Resposta ${n}`], tags: [] }));
  data.anki.cards = data.anki.notes.map(n => ({ ...newCard(n.id, 'english'), state: 2, interval: 1, due: dayStart(), reps: 1 }));
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(data));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env }); const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Anki', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir baralho Sistemas', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Sistemas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Excluir baralho Sistemas', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir baralho', exact: true }).click();
  await page.getByRole('button', { name: 'Curso de inglês', exact: true }).click(); await page.getByRole('button', { name: 'Estudar agora', exact: true }).click();
  const front = page.frameLocator('iframe[title="Frente da carta"]'); await front.getByText(/Pergunta de exemplo/).waitFor();
  if (!shotsOnly) {
    const counter = page.getByRole('group', { name: '0 novas, 0 aprendendo, 3 para revisar', exact: true }); await counter.waitFor();
    await page.locator('.anki-card-front').getByRole('button', { name: 'Editar nota', exact: true }).click(); await page.getByRole('dialog', { name: 'Editar nota', exact: true }).waitFor(); await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await page.locator('.anki-section').screenshot({ animations: 'disabled', path: path.join(output, 'anki-question-preview5.png') });
  const initial = await front.locator('body').textContent();
  await page.getByRole('button', { name: /Mostrar resposta/ }).click(); await page.getByRole('button', { name: /Acertei/ }).click();
  await page.waitForFunction(previous => { const body = document.querySelector('iframe[title="Frente da carta"]')?.contentDocument?.body; return body?.textContent?.includes('Pergunta de exemplo') && body.textContent !== previous; }, initial);
  await page.getByRole('button', { name: 'Desfazer última resposta', exact: true }).waitFor();
  await page.locator('.anki-section').screenshot({ animations: 'disabled', path: path.join(output, 'anki-undo-preview5.png') });
  if (!shotsOnly) {
    await page.getByRole('group', { name: '0 novas, 0 aprendendo, 2 para revisar', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Desfazer última resposta', exact: true }).click(); await page.getByRole('button', { name: 'Estudar agora', exact: true }).waitFor();
    await page.waitForFunction(async () => { const a = (await window.desktop.load()).anki; return a.decks.length === 1 && a.reviews.length === 0; });
    const saved = await page.evaluate(() => window.desktop.load()); assert.equal(saved.anki.cards.length, 3); assert.equal(saved.anki.notes.length, 3);
  }
  await page.getByRole('button', { name: 'Livros', exact: true }).click(); await page.getByRole('heading', { name: 'Livros', exact: true }).waitFor();
  await page.locator('.page-heading').screenshot({ animations: 'disabled', path: path.join(output, 'books-heading-preview5.png') });
  console.log(shotsOnly ? 'Prints focados gerados em test-output.' : 'Exclusão/cancelamento, preservação de dados compartilhados, contadores, edição dentro do card e desfazer verificados em perfil temporário.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-preview5-')) fs.rmSync(target, { recursive: true, force: true }); }
});

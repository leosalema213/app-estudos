// Focused command, deliberately launched by the user. Never uses their real profiles.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
let app, directory;
(async () => {
  cp.execFileSync(process.execPath, ['--test', path.join(__dirname, 'anki.test.js')], { cwd: root, stdio: 'inherit' });
  cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  const { seed } = await import('../src/model.js'), { basicModel, newCard } = await import('../src/anki.js'), { AnkiMedia } = require('../electron/anki-media.cjs');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-anki-ui-')); const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
  const data = seed(); data.onboardingCompleted = true;
  const store = new AnkiMedia(profile), bytes = Buffer.alloc(48); bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40);
  const meta = store.put(bytes, 'test.wav');
  data.anki.decks = [{ id: 'deck', name: 'Fixture', presetId: 'default' }]; data.anki.models = [basicModel];
  data.anki.notes = [{ id: 'note', modelId: basicModel.id, fields: ['Front <script>parent.hacked=true</script><img src="x" onerror="parent.hacked=true"><iframe src="https://example.com"></iframe>', 'Back [sound:test.wav]'], tags: [] }];
  data.anki.cards = [newCard('note', 'deck')]; data.anki.media = { 'test.wav': meta };
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(data));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env }); const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'Anki', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Criar baralho', exact: true }).click();
  const deckDialog = page.getByRole('dialog', { name: 'Criar baralho', exact: true });
  assert.equal(await deckDialog.getByText(/Use Pai/).count(), 0);
  await deckDialog.getByLabel('Nome', { exact: true }).fill('Manual deck');
  await deckDialog.getByRole('button', { name: 'Criar baralho', exact: true }).click();
  await page.getByRole('button', { name: 'Manual deck', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  await page.getByRole('button', { name: 'Estudar agora' }).click();
  const front = page.frameLocator('iframe[title="Frente da carta"]'); await front.getByText('Front', { exact: false }).first().waitFor();
  assert.equal(await front.locator('script,iframe,img[onerror]').count(), 0); assert.equal(await page.evaluate(() => !!window.hacked), false);
  await page.keyboard.press('Space'); const back = page.frameLocator('iframe[title="Verso da carta"]'); await back.getByRole('button', { name: 'Reproduzir áudio', exact: true }).waitFor();
  assert.equal(await back.locator('audio[controls]').count(), 0);
  await page.keyboard.press('r'); await page.getByRole('button', { name: /Acertei/ }).click();
  await page.getByRole('heading', { name: 'Revisões em dia por enquanto.' }).waitFor();
  await page.getByRole('button', { name: 'Desfazer última resposta' }).click();
  await page.getByRole('button', { name: 'Adicionar carta', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('textbox', { name: 'Frente', exact: true }).fill('New question'); await dialog.getByRole('textbox', { name: 'Verso', exact: true }).fill('New answer'); await dialog.getByRole('button', { name: 'Criar carta', exact: true }).click(); await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Explorar', exact: true }).click(); await page.getByLabel('Buscar cartas').fill('New question'); await page.getByRole('button', { name: /New question/ }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Verso', exact: true }).fill('Edited answer'); await page.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await page.getByRole('button', { name: 'Baralhos', exact: true }).click(); await page.getByRole('button', { name: 'Opções', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Novas por dia', { exact: true }).fill('7'); await page.getByRole('button', { name: 'Salvar opções', exact: true }).click();
  // Read after the renderer's existing save debounce, not from a modified real profile.
  await page.waitForFunction(async () => { const d = await window.desktop.load(); return d.anki.notes.some(n => n.fields[1] === 'Edited answer') && d.anki.presets[0].options.newPerDay === 7; });
  const saved = await page.evaluate(() => window.desktop.load()); assert.equal(saved.anki.cards.length, 2); assert.equal(saved.anki.reviews.length, 0); assert.deepEqual(saved.anki.media['test.wav'], meta); assert.deepEqual(errors, []);
  const { packageFixture } = require('./anki-fixtures.cjs');
  const packageDirectory = path.join(directory, 'import-fixture'); fs.mkdirSync(packageDirectory);
  const packageFile = packageFixture(packageDirectory, true);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async (_window, options) => { if (options.title !== 'Organon') throw new Error('Missing Organon dialog title'); return { response: 0 }; };
  }, packageFile);
  const imported = await page.evaluate(() => window.desktop.anki.import());
  assert.equal(imported.collection.cards.length, 1); assert.equal(Object.keys(imported.collection.media).length, 1);
  assert.equal(imported.collection.models[0].fields.length, 2); assert.deepEqual(imported.warnings, []);
  assert.equal(await app.evaluate(({ app }) => app.getName()), 'Organon');
  await app.close(); app = null;
  console.log('Anki: agendamento, importação, mídia, backup, segurança dos cards e edição no Electron verificados em perfil temporário.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-anki-ui-')) fs.rmSync(target, { recursive: true, force: true }); }
});

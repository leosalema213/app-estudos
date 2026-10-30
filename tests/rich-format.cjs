const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'); let app, directory;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
async function launch(profile) { app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env }); return app.firstWindow(); }
async function format(scope, box, text) {
  await box.fill(text); await box.press('Control+a');
  await scope.getByRole('button', { name: 'Negrito', exact: true }).click();
  await scope.getByRole('button', { name: 'Sublinhado', exact: true }).click();
  await scope.getByLabel('Cor do texto', { exact: true }).fill('#9ac7aa');
}
(async () => {
  cp.execFileSync(process.execPath, ['--test', path.join(__dirname, 'rich-format.test.js')], { cwd: root, stdio: 'inherit' });
  cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  const { seed, firstPlan, newNotebook, dayKey } = await import('../src/model.js'), { basicModel, newCard } = await import('../src/anki.js');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-rich-ui-')); const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
  const state = seed(); state.onboardingCompleted = true; state.settings.theme = 'dark'; state.settings.sound = false;
  const plan = firstPlan(); plan.name = 'Inglês'; plan.days = [0,1,2,3,4,5,6]; plan.notes = [{ id: 'plan-note', title: 'Hábitos', text: 'Revisar palavras da rotina.', date: dayKey(), images: [] }]; state.plans = [plan];
  const notebook = newNotebook(); notebook.name = 'Vocabulário'; notebook.pages[0].title = 'Rotina'; notebook.pages[0].text = 'Daily routine'; state.notebooks = [notebook];
  state.anki.models = [structuredClone(basicModel)]; state.anki.decks = [{ id: 'deck', name: 'Vocabulário', presetId: 'default', planIds: [plan.id] }]; state.anki.presets[0].options.autoplay = false;
  const original = '<table><tr><td class="custom">Endereçamento IP</td></tr></table><script>window.injected = true</script>';
  state.anki.notes = [{ id: 'imported', modelId: basicModel.id, fields: [original, 'Resposta original'], tags: [] }]; state.anki.cards = [newCard('imported', 'deck')];
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(state));
  let page = await launch(profile); await page.getByRole('button', { name: 'Anki', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click(); await page.getByRole('menuitem', { name: 'Criar carta', exact: true }).click();
  const dialog = page.getByRole('dialog'), front = dialog.locator('.anki-field').first(), box = front.getByRole('textbox', { name: 'Frente', exact: true });
  await format(front, box, 'Rotina de estudos'); await front.getByLabel('Tamanho da fonte', { exact: true }).selectOption('18'); await front.getByRole('button', { name: 'Lista com marcadores', exact: true }).click();
  const back = dialog.locator('.anki-field').nth(1); await back.getByRole('textbox', { name: 'Verso', exact: true }).fill('Daily study routine'); await back.getByRole('textbox', { name: 'Verso', exact: true }).press('Control+a'); await back.getByRole('button', { name: 'Itálico', exact: true }).click(); await back.getByRole('button', { name: 'Lista numerada', exact: true }).click();
  const { wav } = require('./anki-fixtures.cjs'), audio = path.join(directory, 'routine.wav'); fs.writeFileSync(audio, wav());
  await box.click(); await box.press('Control+End'); await front.getByLabel('Adicionar mídia a Frente').setInputFiles(audio);
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Adicionar mídia a Frente"]').disabled);
  await front.getByLabel('Adicionar mídia a Frente').setInputFiles(path.join(root, 'assets/icon.png'));
  await front.locator('.rich-field-image img').waitFor();
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Adicionar mídia a Frente"]').disabled);
  await dialog.getByRole('button', { name: 'Prévia', exact: true }).click();
  await dialog.frameLocator('iframe[title="Verso da carta"]').locator('[data-organon-color]').waitFor();
  assert.equal(await dialog.frameLocator('iframe[title="Verso da carta"]').locator('[data-organon-color]').first().evaluate(el => getComputedStyle(el).color), 'rgb(154, 199, 170)');
  assert.equal(await dialog.frameLocator('iframe[title="Verso da carta"]').locator('audio').count(), 1);
  assert.equal(await dialog.frameLocator('iframe[title="Verso da carta"]').locator('img').count(), 1);
  await dialog.getByRole('button', { name: 'Criar carta', exact: true }).click(); await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Explorar', exact: true }).click(); await page.locator('.anki-browse-text').filter({ hasText: 'Endereçamento IP' }).click();
  assert.equal(await dialog.getByRole('textbox', { name: 'Frente', exact: true }).inputValue(), original); await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await page.getByRole('button', { name: 'Cadernos', exact: true }).click(); await page.getByRole('button', { name: 'Abrir caderno Vocabulário', exact: true }).click();
  await format(page.locator('.journal-paper'), page.getByRole('textbox', { name: 'Texto da anotação', exact: true }), 'Estudar um pouco todos os dias.');
  await page.locator('.sidebar nav').getByRole('button', { name: /^Meu dia/ }).click(); await page.getByRole('button', { name: 'Anotações (1)', exact: true }).click(); await page.getByRole('button', { name: 'Abrir caderno', exact: true }).click();
  await format(dialog, dialog.getByRole('textbox', { name: 'Texto da anotação', exact: true }), 'Praticar perguntas com do e does.'); await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Notas', exact: true }).click(); await page.getByRole('button', { name: 'Nova nota', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Título da nota', exact: true }).fill('Revisão de inglês'); await format(dialog, dialog.getByRole('textbox', { name: 'Descrição da nota', exact: true }), 'Revisar as palavras da semana.'); await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await page.waitForFunction(async () => (await window.desktop.load()).reminders.some(note => note.descriptionDocument));
  let saved = await page.evaluate(() => window.desktop.load());
  assert.equal(saved.anki.notes.find(n => n.id === 'imported').fields[0], original); assert.deepEqual(saved.anki.cards.find(c => c.noteId === 'imported'), state.anki.cards[0]);
  const fields = saved.anki.notes.find(n => n.id !== 'imported').fields; assert.match(fields[0], /<strong>/); assert.match(fields[0], /<u>/); assert.match(fields[0], /<ul>/); assert.match(fields[0], /data-organon-color="#9ac7aa"/); assert.match(fields[0], /\[sound:/); assert.match(fields[1], /<em>/); assert.match(fields[1], /<ol>/);
  assert.match(fields[0], /<img src=/); assert.doesNotMatch(fields[0], /blob:/);
  assert(saved.notebooks[0].pages[0].document); assert(saved.plans[0].notes[0].document); assert.equal(saved.reminders[0].description, 'Revisar as palavras da semana.');
  await app.close(); app = null; page = await launch(profile); await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await page.getByRole('button', { name: 'Editar nota Revisão de inglês', exact: true }).click(); await page.getByRole('dialog').getByRole('textbox', { name: 'Descrição da nota', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').locator('u').count(), 1); saved = await page.evaluate(() => window.desktop.load()); assert(saved.reminders[0].descriptionDocument);
  console.log('Editor compartilhado: formatação, cores no dark, listas, áudio, HTML importado intacto, cadernos, notas, backup e reabertura verificados em perfil temporário.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-rich-ui-')) fs.rmSync(target, { recursive: true, force: true }); }
});

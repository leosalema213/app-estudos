const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..'), shotsOnly = process.argv.includes('--screenshots-only');
let app, directory;
(async () => {
  if (!shotsOnly) {
    cp.execFileSync(process.execPath, ['--test', path.join(__dirname, 'player-next.test.js'), path.join(__dirname, 'anki-presets.test.js')], { cwd: root, stdio: 'inherit' });
    cp.execFileSync(process.execPath, ['--test', '--test-name-pattern=timer|paus|switching|break|running block|reducing|extra time|completed lessons|manual completion|repeated checks|completed timer', path.join(__dirname, 'model.test.js'), path.join(__dirname, 'extra-time.test.js'), path.join(__dirname, 'reminders.test.js')], { cwd: root, stdio: 'inherit' });
    cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  }
  const { seed, firstPlan, dayKey } = await import('../src/model.js'), { basicModel, newCard, defaultOptions } = await import('../src/anki.js'), { AnkiMedia } = require('../electron/anki-media.cjs'), { wav } = require('./anki-fixtures.cjs');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-preview4-')); const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
  const output = path.join(root, 'test-output'); fs.mkdirSync(output, { recursive: true });
  const data = seed(); data.onboardingCompleted = true; data.settings.theme = 'dark';
  data.plans = [firstPlan(), firstPlan()].map((p, i) => ({ ...p, name: i ? 'Redes · continuação' : 'Linux · fundamentos', days: [0,1,2,3,4,5,6], blocks: p.blocks.map((b, n) => ({ ...b, name: i ? `Próximo ${n + 1}` : ['Aula de Linux', 'Pausa', 'Revisão de Linux'][n] })) }));
  const a = data.anki;
  a.presets.push({ id: 'source-default', name: 'Default', options: { ...defaultOptions } }, { id: 'english', name: 'Config inglês', options: { ...defaultOptions } });
  a.decks = [{ id: 'deck', name: 'Curso de inglês', presetId: 'english' }]; a.models = [{ ...basicModel, css: '.card { background:white; color:black; }' }];
  a.notes = [{ id: 'note', modelId: basicModel.id, fields: ['<div style="background:white!important;color:black!important">Como se diz “aprender” em inglês? [sound:sample.wav]</div>', 'To learn'], tags: [] }];
  a.cards = [newCard('note', 'deck')]; a.media = { 'sample.wav': new AnkiMedia(profile).put(wav(), 'sample.wav') };
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify(data));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env }); const page = await app.firstWindow();
  await page.getByRole('checkbox', { name: 'Concluir Aula de Linux', exact: true }).click();
  await page.locator('.bottom-player .player-info strong').getByText('Pausa', { exact: true }).waitFor();
  if (!shotsOnly) {
    let saved;
    await page.waitForFunction(async () => (await window.desktop.load()).active?.blockName === 'Pausa'); saved = await page.evaluate(() => window.desktop.load()); assert.equal(saved.active.running, false);
    await page.getByRole('checkbox', { name: 'Concluir Pausa', exact: true }).click();
    await page.locator('.bottom-player .player-info strong').getByText('Revisão de Linux', { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Concluir Revisão de Linux', exact: true }).click();
    await page.locator('.bottom-player .player-info strong').getByText('Próximo 1', { exact: true }).waitFor();
    await page.waitForFunction(async () => (await window.desktop.load()).active?.blockName === 'Próximo 1'); saved = await page.evaluate(() => window.desktop.load()); assert.equal(saved.active.running, false); assert.equal(saved.records[`${dayKey()}|${data.plans[1].id}|${data.plans[1].blocks[0].id}`], undefined);
  }
  await page.locator('.content').screenshot({ path: path.join(output, 'itinerary-preview4.png') });
  await page.getByRole('button', { name: 'Anki', exact: true }).click(); await page.getByRole('button', { name: 'Opções de Curso de inglês', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Opções · Curso de inglês', exact: true }); await modal.waitFor();
  if (!shotsOnly) assert.equal(await modal.getByLabel('Preset', { exact: true }).locator('option', { hasText: /^Padrão$/ }).count(), 1);
  await modal.getByRole('button', { name: 'Nova configuração', exact: true }).click(); await modal.getByLabel('Nome da nova configuração', { exact: true }).fill('Revisão leve'); await modal.getByRole('button', { name: 'Criar configuração', exact: true }).click();
  await modal.getByLabel('Novas por dia', { exact: true }).fill('7');
  await modal.getByRole('tab', { name: 'Aprendizagem', exact: true }).click(); await modal.getByRole('textbox', { name: 'Aprendizagem', exact: true }).fill('2m 10m');
  await modal.screenshot({ path: path.join(output, 'anki-options-preview4.png') });
  await modal.getByRole('button', { name: 'Salvar opções', exact: true }).click();
  if (!shotsOnly) {
    await page.waitForFunction(async () => (await window.desktop.load()).anki.presets.some(p => p.name === 'Revisão leve'));
    const saved = await page.evaluate(() => window.desktop.load()), preset = saved.anki.presets.find(p => p.name === 'Revisão leve');
    assert.equal(preset.options.newPerDay, 7); assert.deepEqual(preset.options.learnSteps, [2,10]); assert.equal(saved.anki.presets.find(p => p.id === 'english').options.newPerDay, 20); assert.equal(saved.anki.decks[0].presetId, preset.id);
  }
  await page.getByRole('button', { name: 'Curso de inglês', exact: true }).click(); await page.getByRole('button', { name: 'Estudar agora', exact: true }).click();
  await page.frameLocator('iframe[title="Frente da carta"]').getByRole('button', { name: 'Reproduzir áudio', exact: true }).waitFor();
  await page.getByRole('button', { name: /Mostrar resposta/ }).click(); await page.frameLocator('iframe[title="Verso da carta"]').getByText('To learn', { exact: false }).waitFor(); await page.waitForTimeout(550);
  if (!shotsOnly) {
    const colors = await page.frameLocator('iframe[title="Verso da carta"]').locator('body').evaluate(body => ({ color: getComputedStyle(body).color, background: getComputedStyle(body).backgroundColor })); assert.equal(colors.color, 'rgb(237, 237, 237)'); assert.equal(colors.background, 'rgba(0, 0, 0, 0)');
    await page.getByRole('button', { name: 'Editar nota', exact: true }).click(); assert.equal(await page.getByRole('dialog').getByRole('button', { name: 'Templates e estilo', exact: true }).count(), 0); await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await page.locator('.anki-section').screenshot({ path: path.join(output, 'anki-card-dark-preview4.png') });
  await page.getByRole('button', { name: 'Ativar modo claro', exact: true }).click();
  await page.frameLocator('iframe[title="Verso da carta"]').getByText('To learn', { exact: false }).waitFor(); await page.waitForTimeout(100);
  await page.locator('.anki-section').screenshot({ path: path.join(output, 'anki-card-light-preview4.png') });
  console.log(shotsOnly ? 'Prints focados criados em test-output.' : 'Player pausado entre blocos/planos, presets, abas, preservação de opções e conteúdo dark verificados em perfil temporário.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-preview4-')) fs.rmSync(target, { recursive: true, force: true }); }
});

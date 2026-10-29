// Targeted regression for the manual preview report; no personal profile or fixture.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const { packageFixture, wav } = require('./anki-fixtures.cjs');
const root = path.resolve(__dirname, '..');
let app, directory;
(async () => {
  cp.execFileSync(process.execPath, ['--test', '--test-name-pattern=real .*package import', path.join(__dirname, 'anki.test.js')], { cwd: root, stdio: 'inherit' });
  cp.execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-anki-import-fix-'));
  const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
  const { seed } = await import('../src/model.js');
  fs.writeFileSync(path.join(profile, 'compasso.json'), JSON.stringify({ ...seed(), onboardingCompleted: true }));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, '--skip-account-prompt'], env });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Anki', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Adicionar', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Criar baralho', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Criar baralho', exact: true });
  assert.equal(await modal.getByText(/Use Pai/).count(), 0);
  await modal.getByLabel('Nome', { exact: true }).fill('Meu baralho');
  await modal.getByRole('button', { name: 'Criar baralho', exact: true }).click();
  await page.getByRole('button', { name: 'Meu baralho', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar carta', exact: true }).click();
  await page.getByRole('dialog', { name: 'Criar carta', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  for (const includeMedia of [false, true]) {
    const fixture = path.join(directory, includeMedia ? 'with-media' : 'backup'); fs.mkdirSync(fixture);
    const file = packageFixture(fixture, true, includeMedia);
    const mediaFolder = path.join(fixture, 'collection.media'); fs.mkdirSync(mediaFolder); fs.writeFileSync(path.join(mediaFolder, 'sound.wav'), wav());
    for (const external of includeMedia ? [false] : [false, true]) {
      const original = fs.readFileSync(file);
      await app.evaluate(({ dialog }, input) => {
        dialog.showOpenDialog = async (_win, options) => ({ canceled: false, filePaths: [options.properties.includes('openDirectory') ? input.folder : input.file] });
        dialog.showMessageBox = async (_win, options) => { if (options.title !== 'Organon') throw new Error('Incorrect dialog title'); return { response: input.external ? 1 : 0 }; };
      }, { file, folder: mediaFolder, external });
      const result = await page.evaluate(() => window.desktop.anki.import());
      assert.equal(result.collection.cards.length, 1); assert.equal(result.collection.models[0].fields.length, 2);
      assert.equal(Object.keys(result.collection.media).length, includeMedia || external ? 1 : 0);
      if (includeMedia || external) assert.deepEqual(result.warnings, []); else assert(result.warnings.some(w => w.includes('mídia ausente')));
      assert.deepEqual(fs.readFileSync(file), original);
    }
  }
  assert.equal(await app.evaluate(({ app }) => app.getName()), 'Organon');
  console.log('Correções Anki: criação de baralho, Adicionar carta, título Organon e importação Electron com unicase/WITHOUT ROWID, com/sem mídia, passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (directory) { const target = path.resolve(directory); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('organon-anki-import-fix-')) fs.rmSync(target, { recursive: true, force: true }); }
});

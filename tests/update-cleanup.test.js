import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AppUpdates } = require('../electron/updates.cjs');
const { APP_ID, DEVELOPMENT_APP_ID, repairDevelopmentShortcut } = require('../electron/branding.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'organon-cleanup-'));
  const cacheDir = path.join(root, 'updates');
  const put = (name, text = 'fixture') => { const file = path.join(cacheDir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; };
  return { root, cacheDir, put, updater: new AppUpdates({ version: '0.4.8', cacheDir }) };
}

test('cleanup removes current and older owned installers, preserving future downloads and unknown files', async () => {
  const f = fixture();
  const old = f.put('0.4.5/Compasso-Instalar.exe');
  const current = f.put('0.4.8/Organon-Instalar.exe');
  const partial = f.put('0.4.7/Compasso-Instalar.exe.partial');
  const checksum = f.put('0.4.8/Organon-Instalar.exe.sha256');
  const future = f.put('0.4.9/Organon-Instalar.exe');
  const futurePartial = f.put('0.4.9/Organon-Instalar.exe.partial');
  const numericFuture = f.put('0.4.10/Organon-Instalar.exe');
  const unknown = f.put('0.4.8/personal-note.txt');
  const invalid = f.put('other/Organon-Instalar.exe');
  const data = path.join(f.root, 'compasso.json'); fs.writeFileSync(data, 'personal data');
  await f.updater.cleanupInstalled();
  for (const file of [old, current, partial, checksum]) assert.equal(fs.existsSync(file), false);
  for (const file of [future, futurePartial, numericFuture, unknown, invalid]) assert.equal(fs.readFileSync(file, 'utf8'), 'fixture');
  assert.equal(fs.readFileSync(data, 'utf8'), 'personal data');
  assert.equal(fs.existsSync(path.join(f.cacheDir, '0.4.5')), false);
  await f.updater.cleanupInstalled(); // Repeated startup remains safe.
});

test('cleanup skips linked directories and linked cache roots', async () => {
  const f = fixture();
  const external = path.join(f.root, 'outside'); fs.mkdirSync(external);
  const file = path.join(external, 'Organon-Instalar.exe'); fs.writeFileSync(file, 'keep');
  fs.mkdirSync(f.cacheDir);
  fs.symlinkSync(external, path.join(f.cacheDir, '0.4.7'), 'junction');
  await f.updater.cleanupInstalled();
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
  fs.symlinkSync(external, path.join(f.root, 'linked-cache'), 'junction');
  f.updater.cacheDir = path.join(f.root, 'linked-cache');
  await f.updater.cleanupInstalled();
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
});

test('locked installers are retained without startup errors and removed on a later retry', async t => {
  const f = fixture(), file = f.put('0.4.7/Organon-Instalar.exe');
  const mocked = t.mock.method(fs.promises, 'unlink', async () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); });
  await f.updater.cleanupInstalled();
  assert.equal(fs.existsSync(file), true);
  mocked.mock.restore();
  await f.updater.cleanupInstalled();
  assert.equal(fs.existsSync(file), false);
});

test('cleanup preserves pending installers and tolerates an absent cache', async () => {
  const f = fixture(); await f.updater.cleanupInstalled();
  const file = f.put('0.4.8/Organon-Instalar.exe');
  for (const status of ['downloading', 'ready', 'installing']) {
    f.updater.state.status = status; await f.updater.cleanupInstalled();
    assert.equal(fs.existsSync(file), true);
  }
});

test('only the conflicting Electron shortcut is reassigned to the development identity', () => {
  const calls = [];
  let details = { target: path.join(os.tmpdir(), 'electron.exe'), appUserModelId: APP_ID };
  const shell = { readShortcutLink: file => { assert.equal(path.basename(file), 'Electron.lnk'); return details; }, writeShortcutLink: (...args) => { calls.push(args); return true; } };
  assert.equal(repairDevelopmentShortcut(shell, os.tmpdir()), true);
  assert.deepEqual(calls[0].slice(1), ['update', { appUserModelId: DEVELOPMENT_APP_ID }]);
  for (const value of [{ ...details, appUserModelId: 'other.app' }, { ...details, target: path.join(os.tmpdir(), 'Organon.exe') }]) {
    details = value; assert.equal(repairDevelopmentShortcut(shell, os.tmpdir()), false);
  }
  shell.readShortcutLink = () => { throw new Error('missing'); };
  assert.equal(repairDevelopmentShortcut(shell, os.tmpdir()), false);
  assert.equal(calls.length, 1);
});

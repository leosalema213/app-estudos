import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AppUpdates, isNewer } = require('../electron/updates.cjs');
const { legacyUserData } = require('../electron/branding.cjs');
const payload = Buffer.from('fake installer bytes for a network-isolated test');
const digest = crypto.createHash('sha256').update(payload).digest('hex');
function release(version = '0.4.0') {
  return { tag_name: `v${version}`, assets: [{ name: 'Compasso-Instalar.exe', browser_download_url: `https://github.com/leosalema213/app-estudos/releases/download/v${version}/Compasso-Instalar.exe`, size: payload.length, digest: `sha256:${digest}` }] };
}
function fixture({ metadata = release(), body = payload, fetchError = false } = {}) {
  const calls = []; const events = []; let installs = 0; let quits = 0;
  const updater = new AppUpdates({ version: '0.3.0', cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'compasso-updater-')),
    fetchImpl: async url => { calls.push(url); if (fetchError) throw new Error('Sem conexão'); return url.endsWith('/latest') ? Response.json(metadata) : new Response(body); },
    emit: state => events.push(state), launchInstaller: async () => { installs++; }, onQuit: () => { quits++; },
  });
  return { updater, calls, events, get installs() { return installs; }, get quits() { return quits; } };
}
test('version comparison is numeric and rejects invalid or prerelease values', () => {
  assert.equal(isNewer('v0.10.0', '0.9.0'), true);
  assert.equal(isNewer('v0.3.0', '0.3.0'), false);
  assert.equal(isNewer('v0.2.0', '0.3.0'), false);
  assert.equal(isNewer('v0.4.0-beta', '0.3.0'), false);
  assert.equal(isNewer('../0.4.0', '0.3.0'), false);
});
test('startup check only announces availability: it never downloads or installs', async () => {
  const f = fixture();
  assert.equal((await f.updater.check()).status, 'available');
  assert.equal(f.calls.length, 1);
  assert.equal(f.installs, 0); assert.equal(f.quits, 0);
});

test('Organon keeps the existing profile and defaults to the original directory', () => {
  const base = path.join(os.tmpdir(), 'branding-fixture');
  assert.equal(legacyUserData(base, () => false), path.join(base, 'compasso-estudos'));
  assert.equal(legacyUserData(base, file => file === path.join(base, 'Compasso', 'compasso.json')), path.join(base, 'Compasso'));
  assert.equal(legacyUserData(base, () => true), path.join(base, 'compasso-estudos'));
});

test('Organon installer takes priority and old Compasso releases remain compatible', async () => {
  const metadata = release();
  metadata.assets.push({ ...metadata.assets[0], name: 'Organon-Instalar.exe', browser_download_url: metadata.assets[0].browser_download_url.replace('Compasso-', 'Organon-') });
  const f = fixture({ metadata });
  assert.equal((await f.updater.check()).status, 'available');
  assert.ok(f.updater.candidate.url.endsWith('/Organon-Instalar.exe'));
  assert.equal((await f.updater.download()).status, 'ready');
  assert.ok(f.updater.installer.endsWith('Organon-Instalar.exe'));
});
test('current versions and older releases do not prompt an update', async () => {
  for (const version of ['0.2.0', '0.3.0']) assert.equal((await fixture({ metadata: release(version) }).updater.check()).status, 'current');
});
test('download is verified and installation needs a second explicit call', async () => {
  const f = fixture(); await f.updater.check();
  assert.equal((await f.updater.download()).status, 'ready');
  assert.equal(f.installs, 0); assert.equal(f.quits, 0);
  assert.deepEqual(fs.readFileSync(f.updater.installer), payload);
  assert.equal((await f.updater.install()).status, 'installing');
  assert.equal(f.installs, 1); assert.equal(f.quits, 1);
});
test('an interrupted or corrupted download cannot be installed', async () => {
  const f = fixture({ body: Buffer.from('corrupted payload') }); await f.updater.check();
  assert.equal((await f.updater.download()).status, 'error');
  await f.updater.install(); assert.equal(f.installs, 0);
});
test('a modified cached installer is rejected immediately before execution', async () => {
  const f = fixture(); await f.updater.check(); await f.updater.download();
  fs.writeFileSync(f.updater.installer, 'modified after downloading');
  assert.equal((await f.updater.install()).status, 'error'); assert.equal(f.installs, 0); assert.equal(f.quits, 0);
});
test('an asset from another repository cannot be downloaded', async () => {
  const metadata = release(); metadata.assets[0].browser_download_url = 'https://example.com/installer.exe';
  const f = fixture({ metadata }); assert.equal((await f.updater.check()).status, 'error');
  assert.equal(f.calls.length, 1);
});
test('offline checks return an error state without breaking the app', async () => {
  const f = fixture({ fetchError: true });
  assert.equal((await f.updater.check()).status, 'error'); assert.equal(f.installs, 0);
});
test('SHA-256 sidecar is used when the GitHub digest is unavailable', async () => {
  const metadata = release(); delete metadata.assets[0].digest;
  metadata.assets.push({ name: 'Compasso-Instalar.exe.sha256', browser_download_url: 'https://github.com/leosalema213/app-estudos/releases/download/v0.4.0/Compasso-Instalar.exe.sha256' });
  const f = fixture({ metadata }); const fetch = f.updater.fetch;
  f.updater.fetch = url => url.endsWith('.sha256') ? Promise.resolve(new Response(`${digest}  Compasso-Instalar.exe\n`)) : fetch(url);
  assert.equal((await f.updater.check()).status, 'available');
  assert.equal((await f.updater.download()).status, 'ready');
});

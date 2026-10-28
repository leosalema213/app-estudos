const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { version } = require('../package.json');
const { INSTALLER_NAMES } = require('../electron/branding.cjs');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'release', version, INSTALLER_NAMES[0]);
const hash = crypto.createHash('sha256');
fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('error', err => { console.error(err.message); process.exitCode = 1; }).on('end', () => {
  const digest = hash.digest('hex');
  for (const name of INSTALLER_NAMES) {
    const target = path.join(root, 'release', version, name);
    if (target !== file) fs.copyFileSync(file, target);
    fs.writeFileSync(target + '.sha256', `${digest}  ${name}\n`);
  }
  console.log(`Checksum SHA-256 criado para a versão ${version}.`);
});

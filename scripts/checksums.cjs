const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'release', version, 'Compasso-Instalar.exe');
const hash = crypto.createHash('sha256');
fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('error', err => { console.error(err.message); process.exitCode = 1; }).on('end', () => {
  fs.writeFileSync(file + '.sha256', `${hash.digest('hex')}  Compasso-Instalar.exe\n`);
  console.log(`Checksum SHA-256 criado para a versão ${version}.`);
});

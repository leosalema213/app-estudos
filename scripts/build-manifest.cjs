const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const name = 'build-manifest.json';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function writeBuildManifest(directory, version) {
  const files = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file !== path.join(directory, name)) { const bytes = fs.readFileSync(file); files.push({ path: path.relative(directory, file).split(path.sep).join('/'), size: bytes.length, sha256: digest(bytes) }); }
    }
  }
  visit(directory); files.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(path.join(directory, name), JSON.stringify({ schema: 1, version, files }, null, 2) + '\n');
}
module.exports = { writeBuildManifest, digest, name };

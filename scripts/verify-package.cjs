const fs = require('node:fs'), path = require('node:path');
const { extractFile } = require('@electron/asar');
const { digest, name } = require('./build-manifest.cjs');
function verifyPackage(archive, root = path.resolve(__dirname, '..')) {
  const read = file => { try { return extractFile(archive, file); } catch { throw new Error(`Pacote incompleto: ${file} ausente. Gere novamente sem compilar em paralelo.`); } };
  const pkg = JSON.parse(read('package.json')), expected = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const bytes = read(path.join('dist', name)), manifest = JSON.parse(bytes);
  if (manifest.schema !== 1 || !Array.isArray(manifest.files) || manifest.version !== pkg.version || pkg.version !== expected.version) throw new Error('Versão/manifesto do pacote inválidos.');
  if (!fs.readFileSync(path.join(root, 'dist', name)).equals(bytes)) throw new Error('O build mudou durante o empacotamento. Gere novamente sem compilar em paralelo.');
  const paths = new Set();
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(entry.path) || paths.has(entry.path)) throw new Error('Caminho inválido no manifesto.');
    paths.add(entry.path);
    const file = path.join('dist', ...entry.path.split('/')), packed = read(file);
    if (packed.length !== entry.size || digest(packed) !== entry.sha256) throw new Error(`Pacote corrompido: ${entry.path}.`);
    if (digest(fs.readFileSync(path.join(root, file))) !== entry.sha256) throw new Error(`O build mudou durante o empacotamento: ${entry.path}.`);
  }
  if (!paths.has('index.html') || ![...paths].some(p => /^assets\/.*\.js$/.test(p)) || ![...paths].some(p => /^assets\/.*\.css$/.test(p))) throw new Error('Build sem página, JavaScript ou CSS principal.');
  console.log(`Pacote verificado: ${pkg.version}, ${paths.size} arquivos com tamanho e SHA-256 conferidos.`);
}
// electron-builder runs this before creating the installer; throw to reject incomplete builds.
module.exports = async context => verifyPackage(path.join(context.appOutDir, 'resources', 'app.asar'), context.packager.projectDir);
module.exports.verifyPackage = verifyPackage;
if (require.main === module) {
  try { const root = path.resolve(__dirname, '..'), version = require('../package.json').version; verifyPackage(process.argv[2] || path.join(root, 'release', version, 'win-unpacked', 'resources', 'app.asar'), root); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

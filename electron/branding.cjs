const path = require('node:path');
const fs = require('node:fs');
const BRAND = 'Organon';
const INSTALLER_NAMES = ['Organon-Instalar.exe', 'Compasso-Instalar.exe'];
function legacyUserData(appData, exists = fs.existsSync) {
  // Keep the original profile instead of creating an empty Organon profile.
  const candidates = ['compasso-estudos', 'Compasso'];
  const directory = candidates.find(name => exists(path.join(appData, name, 'compasso.json'))) || candidates[0];
  return path.join(appData, directory);
}
module.exports = { BRAND, INSTALLER_NAMES, legacyUserData };

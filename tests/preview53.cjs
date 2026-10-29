const cp = require('node:child_process'), path = require('node:path');
try {
  cp.execFileSync(process.execPath, [path.join(__dirname, 'rich-format.cjs')], { stdio: 'inherit' });
  cp.execFileSync(process.execPath, [path.join(__dirname, 'daily-plans.cjs'), '--skip-build'], { stdio: 'inherit' });
} catch { process.exitCode = 1; }

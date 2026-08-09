const axios = require('axios');
const fs = require('fs');
const path = require('path');

function getCurrentVersion() {
  try {
    const ownPkg = path.join(__dirname, 'package.json');
    if (fs.existsSync(ownPkg)) {
      const pkg = JSON.parse(fs.readFileSync(ownPkg, 'utf-8'));
      if (pkg.name === '@bruxa/stfca' && pkg.version) return pkg.version;
    }
  } catch (_) {}

  try {
    const nodeModulesPkg = path.join(process.cwd(), 'node_modules', '@bruxa', 'stfca', 'package.json');
    if (fs.existsSync(nodeModulesPkg)) {
      const pkg = JSON.parse(fs.readFileSync(nodeModulesPkg, 'utf-8'));
      if (pkg.version) return pkg.version;
    }
  } catch (_) {}
  return '1.0.0';
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Checks npm for a newer published version and logs a notice if one exists.
 * Intentionally read-only: this function never installs, executes, or
 * restarts anything. Updating the package is the operator's decision,
 * made explicitly via their own `npm install` — not something this
 * library does to itself on load.
 */
async function checkForFCAUpdate() {
  try {
    const { data: npmData } = await axios.get('https://registry.npmjs.org/@bruxa%2fstfca');
    const latestVersion = npmData['dist-tags'].latest;
    const currentVersion = getCurrentVersion();

    if (compareVersions(latestVersion, currentVersion) > 0) {
      console.log('\x1b[32m%s\x1b[0m', `[ST-FCA] Update available: v${currentVersion} -> v${latestVersion}`);
      console.log('\x1b[33m%s\x1b[0m', `[ST-FCA] Run: npm install @bruxa/stfca@${latestVersion}`);
      return true;
    }
    return false;
  } catch (error) {
    // Silent by design: a failed version check must never block or crash
    // a running bot. This function only ever informs; it never acts.
    return false;
  }
}

module.exports = { checkForFCAUpdate };
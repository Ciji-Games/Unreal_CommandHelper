const fs = require('fs');
const { execSync } = require('child_process');
const confPath = 'src-tauri/tauri.conf.json';
const cargoPath = 'src-tauri/Cargo.toml';

const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

let baseVersion;
if (process.env.BUMP_FROM_TAG === '1') {
  try {
    const tags = execSync('git tag -l "app-v*" --sort=-v:refname', { encoding: 'utf8' }).trim();
    const latestTag = tags.split('\n')[0];
    if (latestTag) {
      const match = latestTag.match(/^app-v(\d+\.\d+\.\d+)$/);
      if (match) baseVersion = match[1];
    }
  } catch (_) {
    /* ignore */
  }
}
if (!baseVersion) baseVersion = conf.version;

const [major, minor, patch] = baseVersion.split('.').map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

conf.version = newVersion;
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2));

const cargo = fs.readFileSync(cargoPath, 'utf8');
fs.writeFileSync(cargoPath, cargo.replace(/^version = ".*"$/m, `version = "${newVersion}"`));

console.log('Bumped version to', newVersion);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `\nAPP_VERSION=${newVersion}\n`);
}

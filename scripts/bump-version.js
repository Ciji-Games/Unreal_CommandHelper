const fs = require('fs');
const confPath = 'src-tauri/tauri.conf.json';
const cargoPath = 'src-tauri/Cargo.toml';

const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
const [major, minor, patch] = conf.version.split('.').map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

conf.version = newVersion;
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2));

const cargo = fs.readFileSync(cargoPath, 'utf8');
fs.writeFileSync(cargoPath, cargo.replace(/^version = ".*"$/m, `version = "${newVersion}"`));

console.log('Bumped version to', newVersion);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `\nAPP_VERSION=${newVersion}\n`);
}

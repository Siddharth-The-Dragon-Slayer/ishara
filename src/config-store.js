'use strict';
const fs = require('node:fs');

function saveConfig(file, name, value) {
  const normalized = String(value || '').trim();
  if (/[\r\n]/.test(normalized)) throw new Error('Settings must contain a single line.');
  let source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const line = `${name}=${JSON.stringify(normalized)}`;
  source = pattern.test(source)
    ? source.replace(pattern, () => line)
    : `${source}${source.endsWith('\n') || !source ? '' : '\n'}${line}\n`;
  fs.writeFileSync(file, source, { mode: 0o600 });
  process.env[name] = normalized;
  return normalized;
}

module.exports = { saveConfig };

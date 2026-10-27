'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let checked = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'models') walk(file); continue; }
    if (/\.js$/.test(file)) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); checked++; }
    if (/\.html$/.test(file)) {
      const html = fs.readFileSync(file, 'utf8');
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/type=["']importmap/.test(match[1])) { JSON.parse(match[2]); continue; }
        if (/\bsrc=/.test(match[1])) {
          const src = match[1].match(/\bsrc=["']([^"']+)/)?.[1];
          if (src && !/^https?:/.test(src) && !fs.existsSync(path.join(dir, src))) throw Error(`Missing script: ${file}: ${src}`);
        } else { new vm.Script(match[2], { filename: file }); checked++; }
      }
    }
  }
}
walk('renderer'); walk('src');
for (const file of ['main.js', 'preload.js']) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); checked++; }
console.log(`PASS: ${checked} JavaScript sources and inline scripts parse; script assets exist.`);

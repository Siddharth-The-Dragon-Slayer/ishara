'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ishaara-smoke-'));
app.setPath('userData', testDir);
process.env.ISHAARA_CONFIG_PATH = path.join(testDir, '.env');
fs.writeFileSync(process.env.ISHAARA_CONFIG_PATH, 'MISTRAL_API_KEY=test-key\nMISTRAL_MODEL=mistral-small-latest\n');
process.env.GROQ_API_KEY = 'test-groq-key';
const errors = [];
let commands = 0;
const Service = require('../src/mistral-service');
Service.prototype.processCommand = async function(command) {
  commands++;
  if (command === 'test rejection') throw Error('Test backend failure');
  return { speech: 'Test response', explanation: 'Command processed', actions: [], taskComplete: true };
};
// Deterministic API fixtures: integration tests never call paid external services.
global.fetch = async (url, options) => {
  if (String(url).includes('audio/transcriptions')) {
    if (!(options.body instanceof FormData)) throw Error('Expected native multipart FormData');
    return { ok: true, json: async () => ({ text: 'Test transcript' }) };
  }
  return { ok: false, status: 503, json: async () => ({ message: 'Test API unavailable' }) };
};
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => {
    if (level === 3 && !/WebGL|GPU|ContextResult|Test backend failure|Sarvam/.test(message)) errors.push(message);
  });
  contents.on('preload-error', (_e, _file, error) => errors.push(error.message));
});
require('../main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, description) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await delay(100); }
  throw Error(`Timeout: ${description}`);
}
app.whenReady().then(async () => {
  await waitFor(() => BrowserWindow.getAllWindows().length, 'app window');
  const win = BrowserWindow.getAllWindows()[0];
  const run = code => win.webContents.executeJavaScript(code);
  await waitFor(() => run(`typeof activeTabId !== 'undefined' && activeTabId !== null`).catch(() => false), 'frontend initialization');
  await waitFor(() => run(`!$('main-webview').isLoading() && !!$('main-webview').getURL()`), 'home load');
  const results = [];
  async function check(name, code) {
    if (!await run(`(async()=>{${code}})()`)) throw Error(`FAIL: ${name}`);
    results.push(name);
  }
  await run('state.muted = true');
  await check('settings open/close', `$('btn-settings').click(); const open=!$('settings-modal').hidden; $('close-settings').click(); return open && $('settings-modal').hidden;`);
  await check('panel hide/show', `$('btn-close-panel').click(); const closed=$('ai-panel').classList.contains('hidden'); $('btn-toggle-panel').click(); return closed&&!$('ai-panel').classList.contains('hidden');`);
  await check('drawer open/close', `$('btn-a11y').click(); const open=!$('a11y-drawer').hidden; $('close-a11y').click(); return open&&$('a11y-drawer').hidden;`);
  for (const [id, key] of [['qp-contrast','highContrast'],['qp-links','highlightLinks'],['qp-dyslexia','dyslexia'],['dr-spacing','spacing'],['dr-cursor','largeCursor'],['dr-focus','focusMode'],['dr-noani','reduceMotion'],['dr-guide','readingGuide'],['dr-captions','captions'],['dr-autoread','autoRead'],['dr-sticky','stickyKeys']]) {
    await check(id, `const initial=state.a11y.${key}; $('${id}').click(); await sleep(60); const enabled=state.a11y.${key}!==initial; $('${id}').click(); await sleep(60); return enabled&&state.a11y.${key}===initial;`);
  }
  await check('zoom controls', `$('qp-zoom').click(); const zoom=state.a11y.zoom; $('dr-zoom').value='1'; $('dr-zoom').dispatchEvent(new Event('input')); return zoom>1&&state.a11y.zoom===1;`);
  await check('typed send and backend IPC', `$('cmd-input').value='test command'; $('send-btn').click(); await sleep(250); return $('chat-log').textContent.includes('Command processed')&&$('stop-action-btn').style.display==='none';`);
  await check('new chat', `$('btn-new-chat').click(); return state.chatHist.length===0&&!$('chat-log').textContent.includes('Command processed');`);
  await check('backend failure shown', `await processCmd('test rejection'); return $('chat-log').textContent.includes('Test backend failure');`);
  await check('new tab and close', `const count=tabs.size; $('btn-new-tab').click(); await sleep(150); const created=tabs.size===count+1; closeTab(activeTabId); await sleep(150); return created&&tabs.size===count;`);
  await check('Groq audio multipart backend', `const result=await window.electronAPI.groqWhisper({audioBase64:'dGVzdA==',mimeType:'audio/webm'}); return result.success&&result.transcript==='Test transcript';`);
  console.log(JSON.stringify({ passed: results, commands, frontendErrors: errors }, null, 2));
  if (errors.length) throw Error('Frontend errors detected');
  app.exit(0);
}).catch(error => { console.error(error.message); console.error(JSON.stringify(errors)); app.exit(1); });
setTimeout(() => { console.error('Smoke test exceeded 45 seconds'); app.exit(1); }, 45000).unref();

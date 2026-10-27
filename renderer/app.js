'use strict';
/* ============================================================================
   ZenAI Browser — Renderer (app.js)
   Tabs · DOM extraction · Actions · Voice (WebkitSpeech) · Edge-TTS · A11y
   ============================================================================ */

// ── DOM extraction script ─────────────────────────────────────────────────────
const DOM_SCRIPT = `(function(){
try{
  function sel(el){
    if(el.id)return'#'+el.id;
    var p=[],c=el;
    while(c&&c!==document.body&&p.length<6){
      var t=c.nodeName.toLowerCase();
      var sibs=c.parentElement?[].filter.call(c.parentElement.children,x=>x.nodeName===c.nodeName):[];
      var n=sibs.indexOf(c)+1;
      p.unshift(t+(sibs.length>1?':nth-of-type('+n+')':''));
      c=c.parentElement;
      if(c&&c.id){p.unshift('#'+c.id);break;}
    }
    return p.join('>');
  }
  function info(el){
    var base = {
      tag:el.tagName.toLowerCase(),id:el.id||undefined,
      text:(el.textContent||el.value||el.placeholder||'').trim().replace(/\\s+/g,' ').slice(0,120),
      href:el.href||undefined,placeholder:el.placeholder||undefined,
      type:el.type||undefined,ariaLabel:el.getAttribute('aria-label')||undefined,
      role:el.getAttribute('role')||undefined,disabled:el.disabled||undefined,selector:sel(el)
    };
    if (base.tag === 'select') {
      base.options = [].map.call(el.options, function(o) { return o.text.trim(); }).filter(Boolean);
    }
    return base;
  }
  var interactive=[].filter.call(
    document.querySelectorAll('a[href],button:not([disabled]),input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="tab"],[onclick]'),
    function(el){
      if(el.closest('ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, #secondary, ytd-compact-video-renderer, [is-shorts=""], ytd-reel-item-renderer')) return false;
      var href = el.getAttribute('href');
      if(href && href.includes('UCO4u7NTFS8')) return false;
      var isYtSearch = window.location.hostname.includes('youtube.com') && window.location.pathname.startsWith('/results');
      if(isYtSearch && el.tagName.toLowerCase() === 'a' && href && !href.startsWith('/watch?v=')) return false;
      var r=el.getBoundingClientRect();return r.width>0&&r.height>0;
    }
  ).slice(0,70).map(info);
  var headings=[].map.call(
    document.querySelectorAll('h1,h2,h3,h4,h5,h6'),
    function(h){return{level:h.tagName[1],text:h.textContent.trim().slice(0,250)};}
  ).slice(0,25);
  var mainEl=document.querySelector('main,[role="main"],article,#main,#content,.main-content,.article-body,.post-body');
  var allText=((mainEl||document.body).innerText||'').replace(/\\s+/g,' ').trim().slice(0,5000);
  var forms=[].map.call(document.querySelectorAll('form'),function(f){
    return{id:f.id,action:f.action,fields:[].map.call(f.querySelectorAll('input:not([type="hidden"]),select,textarea'),info)};
  }).slice(0,5);
  var imgs=[].map.call(
    document.querySelectorAll('img[alt]:not([alt=""])'),
    function(i){return{alt:i.alt.slice(0,120)};}
  ).slice(0,12);
  var meta={
    lang:document.documentElement.lang||'',
    description:(document.querySelector('meta[name="description"]')||{}).content||'',
    scrollY:window.scrollY,scrollMax:document.documentElement.scrollHeight-window.innerHeight
  };
  return JSON.stringify({title:document.title,url:window.location.href,headings,interactive,bodyText:allText,forms,images:imgs,meta});
}catch(e){return JSON.stringify({error:e.message,title:document.title,url:window.location.href});}
})()`;

// ── Accessibility CSS ──────────────────────────────────────────────────────────
const A11Y = {
  high_contrast: `*{background:#000!important;color:#fff!important;border-color:#fff!important;}
    a{color:#ff0!important;text-decoration:underline!important;}
    button,input[type=submit]{background:#fff!important;color:#000!important;border:2px solid #fff!important;}
    input,textarea,select{background:#111!important;color:#fff!important;border:2px solid #aaa!important;}
    img,video{filter:invert(1)!important;}`,
  highlight_links: `a[href]{background:rgba(255,255,0,.25)!important;padding:1px 3px!important;border-radius:2px!important;text-decoration:underline!important;}
    a[href]:focus,a[href]:hover{outline:3px solid #0af!important;}`,
  simplify: `nav,.nav,#nav,.navigation,.menu,.sidebar,aside,.ads,.ad,[class*="ad-"],[id*="ad-"],
    .popup,.newsletter,.cookie-notice,.cookie-banner,.banner,footer,.footer{display:none!important;}
    body{max-width:860px!important;margin:0 auto!important;padding:24px!important;}
    p,li{font-size:17px!important;line-height:1.85!important;}`,
  dyslexia_font: `*{font-family:'Arial','Verdana',sans-serif!important;letter-spacing:.05em!important;}
    p,li,label,td{font-size:16px!important;line-height:1.9!important;word-spacing:.14em!important;}`,
  text_spacing: `p,li,div,span,label,td{letter-spacing:.07em!important;word-spacing:.2em!important;line-height:1.95!important;}`,
  large_cursor: `*{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cpath d='M8 4l16 14-7 1-4 10-5-11-4 4z' fill='%23fff' stroke='%23000' stroke-width='1.5'/%3E%3C/svg%3E"),auto!important;}`,
  focus_ring: `*:focus{outline:3px solid #1a73e8!important;outline-offset:3px!important;border-radius:3px!important;}`,
  reduce_motion: `*,*::before,*::after{transition:none!important;animation:none!important;}`,
  reading_guide: `__READING_GUIDE__`,
  focus_mode: `body > *:not(:hover){opacity:.2!important;transition:opacity .3s!important;}body > *:hover{opacity:1!important;}`,
};

const COLOR_FILTERS = {
  none: '',
  protanopia: `body{filter:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeColorMatrix type='matrix' values='0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0'/%3E%3C/filter%3E%3C/svg%3E%23p")!important;}`,
  deuteranopia: `body{filter:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='d'%3E%3CfeColorMatrix type='matrix' values='0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0'/%3E%3C/filter%3E%3C/svg%3E%23d")!important;}`,
  tritanopia: `body{filter:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='t'%3E%3CfeColorMatrix type='matrix' values='0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0'/%3E%3C/filter%3E%3C/svg%3E%23t")!important;}`,
  grayscale: `body{filter:grayscale(1)!important;}`,
};

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  url: '',
  pageCtx: null,
  chatHist: [],
  listening: false,
  speaking: false,
  panelOpen: true,
  islOpen: false,
  ttsVoice: 'en-IN-NeerjaNeural',
  ttsRate: 1.0,
  muted: false,
  abortProcessing: false,
  processing: false,
  commandId: 0,
  a11y: {
    highContrast: false, zoom: 1.0, highlightLinks: false, simplify: false,
    dyslexia: false, spacing: false, largeCursor: false, focusRing: true,
    colorFilter: 'none', rate: 1.0, autoRead: false,
    captions: false, reduceMotion: false, readingGuide: false,
    focusMode: false, stickyKeys: false,
    activeCSS: new Set(),
  },
};

// ── Tab system ────────────────────────────────────────────────────────────────
let tabIdCounter = 0;
const tabs = new Map(); // id → { url, title, loading }
let activeTabId = null;
let tabSwitchPending = false;

function createTab(url = null) {
  const id = ++tabIdCounter;
  tabs.set(id, { url: url || location.href.replace('index.html', 'home.html'), title: 'New Tab', loading: false, chatHist: [], chatHTML: null });
  renderTabs();
  switchTab(id);
  return id;
}

function closeTab(id) {
  if (tabs.size <= 1) {
    // Replace with fresh home tab instead of closing the only one
    const tab = tabs.get(id);
    if (tab) { tab.url = ''; tab.title = 'New Tab'; tab.loading = false; tab.chatHist = []; tab.chatHTML = null; }
    cancelCommand();
    state.chatHist = [];
    resetChatDOM();
    renderTabs();
    navTo(null, 'home');
    return;
  }
  const keys = [...tabs.keys()];
  const idx = keys.indexOf(id);
  tabs.delete(id);
  if (activeTabId === id) {
    const newActive = keys[idx + 1] || keys[idx - 1];
    switchTab(newActive);
  }
  renderTabs();
}

function switchTab(id) {
  if (id === activeTabId) return;
  cancelCommand();
  stopSpeak();
  state.pageCtx = null;

  // Save current chat state to the outgoing tab
  if (activeTabId !== null) {
    const oldTab = tabs.get(activeTabId);
    if (oldTab) {
      oldTab.chatHist = [...state.chatHist];
      // Save the innerHTML except for the dynamic reading/assistant active states if any exist
      oldTab.chatHTML = $('chat-log').innerHTML;
    }
  }

  activeTabId = id;
  const tab = tabs.get(id);
  if (tab) {
    // Restore chat state
    state.chatHist = [...(tab.chatHist || [])];
    if (tab.chatHTML != null) {
      $('chat-log').innerHTML = tab.chatHTML;
    } else {
      resetChatDOM();
    }
    $('chat-log').scrollTop = $('chat-log').scrollHeight;

    if (tab.url) {
      tabSwitchPending = true;
      wv.src = tab.url;
      updateAddressBar(tab.url);
    }
  }
  renderTabs();
}

function updateTabInfo(id, info) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (info.url !== undefined) tab.url = info.url;
  if (info.title !== undefined) tab.title = info.title;
  if (info.loading !== undefined) tab.loading = info.loading;
  if (id === activeTabId) renderTabs();
}

function renderTabs() {
  const container = document.getElementById('tabs-scroll');
  if (!container) return;
  container.innerHTML = '';
  for (const [id, tab] of tabs) {
    const el = document.createElement('div');
    el.className = 'browser-tab' + (id === activeTabId ? ' active' : '');
    el.dataset.tabId = id;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', id === activeTabId ? 'true' : 'false');

    const titleText = (tab.title || 'New Tab').slice(0, 20);
    el.innerHTML = `
      <span class="tab-favicon-wrap" aria-hidden="true">
        ${tab.loading
        ? '<svg viewBox="0 0 16 16" fill="none" width="12" height="12"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20" stroke-dashoffset="0" style="animation:spin .8s linear infinite;transform-origin:center"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite"/></circle></svg>'
        : '<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 3a5 5 0 0 1 0 10A5 5 0 0 1 8 3zm0 1.5A3.5 3.5 0 0 0 4.5 8H8V4.5z" fill="currentColor" opacity="0.3"/></svg>'
      }
      </span>
      <span class="tab-title">${escHtml(titleText)}</span>
      <button class="tab-close" data-tab-id="${id}" aria-label="Close tab" tabindex="-1">
        <svg viewBox="0 0 12 12" fill="currentColor">
          <path d="M1.5 1.5l9 9m-9 0l9-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>`;

    el.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) switchTab(id);
    });
    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(id);
    });
    container.appendChild(el);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const wv = $('main-webview');
const addressBar = $('address-bar');

/** Display URL like Chrome: strip https://, home shows /home */
function displayUrl(url) {
  if (!url || url === 'about:blank') return '';
  if (url.startsWith('file://') && url.includes('home.html')) return '/home';
  // Keep the full raw URL for navigating, display without scheme
  return url.replace(/^https?:\/\//, '');
}

function updateAddressBar(url) {
  if (document.activeElement !== addressBar) {
    if (url && url.includes('chat.html')) {
      addressBar.value = '/chat';
    } else {
      addressBar.value = displayUrl(url);
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const model = await window.electronAPI.getModel();
  const sm = $('sel-model');
  if (sm && model) sm.value = model;

  const apiKey = await window.electronAPI.getApiKey();
  if (apiKey) { const ki = $('input-api-key'); if (ki) ki.value = '••••••••••••'; }

  initVoice();
  initReadingGuide();
  initWebview();
  // Apply on did-stop-loading, once the guest webContents is ready.
  state.a11y.activeCSS.add('__aai_focus_ring__');

  if (window.ZenModeController) {
    window.ZenModeController.init();
  }

  // Create first tab and navigate home
  createTab();
}

// ═════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

function navTo(raw, preset) {
  if (preset === 'home') {
    const homePath = location.href.replace('index.html', 'home.html');
    wv.src = homePath;
    addressBar.value = '/home';
    state.url = homePath;
    state.pageCtx = null;
    updateTabInfo(activeTabId, { url: homePath, title: 'ZenAI' });
    return;
  }
  if (preset === 'chat') {
    const chatPath = location.href.replace('index.html', 'chat.html');
    wv.src = chatPath;
    addressBar.value = '/chat';
    state.url = chatPath;
    state.pageCtx = null;
    updateTabInfo(activeTabId, { url: chatPath, title: 'ZenAI Chat' });
    return;
  }
  let url = (raw || '').trim();
  if (!url) return;
  if (url.toLowerCase() === 'home') { navTo(null, 'home'); return; }
  if (url.toLowerCase() === '/chat' || url.toLowerCase() === 'chat') { navTo(null, 'chat'); return; }
  // If address bar shows a display URL (no scheme), reconstruct it
  if (!url.startsWith('http') && !url.startsWith('about:') && !url.startsWith('file:') && !url.startsWith('/home')) {
    if (/^[\w-]+\.\w{2,}/.test(url) && !url.includes(' ')) url = 'https://' + url;
    else url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
  }
  wv.src = url;
  updateAddressBar(url);
  updateTabInfo(activeTabId, { url });
  state.url = url;
  state.pageCtx = null;
}

// ── Webview events ─────────────────────────────────────────────────────────
function resetChatDOM() {
  const log = $('chat-log');
  if (log) {
    log.innerHTML = `
      <div class="msg msg-assistant welcome-card">
        <div class="bot-av" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="16" height="16">
            <g fill="#2fbe8f">
              <rect x="20" y="34" width="24" height="16" rx="5"/>
              <rect x="22" y="18" width="7"  height="18" rx="3.5"/>
              <rect x="31" y="14" width="7"  height="22" rx="3.5"/>
              <rect x="40" y="20" width="5"  height="16" rx="2.5"/>
            </g>
            <circle cx="22" cy="14" r="3.5" fill="#5fffc8"/>
          </svg>
        </div>
        <div class="msg-body" style="max-width:100%">
          <div class="wc-wrap">
            <strong>Hi, I'm ZenAI.</strong>
            <p>I understand every page you visit and can take action — browse, search, fill forms, read aloud, or adapt it for your needs. I follow through until the task is done.</p>
            <div class="wc-hint">
              Try: <em>"Search for news on YouTube"</em> · <em>"Read the article"</em> ·
              <em>"Fill the form and submit"</em> · <em>"Turn on high contrast"</em>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

function initWebview() {
  const prog = $('progress-bar');
  const overlay = $('loading-overlay');
  const riIcon = $('reload-icon');
  const stopPath = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
  const reloadPath = '<path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>';

  wv.addEventListener('did-start-loading', () => {
    prog.classList.add('loading');
    overlay.classList.add('visible');
    if (riIcon) riIcon.innerHTML = stopPath;
    updateTabInfo(activeTabId, { loading: true });
  });

  wv.addEventListener('did-stop-loading', async () => {
    prog.classList.remove('loading');
    overlay.classList.remove('visible');
    if (riIcon) riIcon.innerHTML = reloadPath;
    const url = wv.getURL();
    state.url = url;
    state.pageCtx = null;
    updateTabInfo(activeTabId, { url, loading: false });
    updateAddressBar(url);
    tabSwitchPending = false;
    await reapplyA11yCSS();

    if (window.ZenModeController) {
      window.ZenModeController.reapply();
    }

    if (state.a11y.autoRead) setTimeout(() => readSection('main,[role="main"],article,body'), 1200);
  });

  wv.addEventListener('did-navigate', e => {
    updateAddressBar(e.url);
    state.url = e.url;
    updateTabInfo(activeTabId, { url: e.url });
    $('btn-back').disabled = !wv.canGoBack();
    $('btn-forward').disabled = !wv.canGoForward();
  });
  wv.addEventListener('did-navigate-in-page', e => {
    updateAddressBar(e.url);
    state.url = e.url;
    updateTabInfo(activeTabId, { url: e.url });
  });
  wv.addEventListener('page-title-updated', e => {
    document.title = `${e.title} — ZenAI`;
    updateTabInfo(activeTabId, { title: e.title });
  });
  wv.addEventListener('page-favicon-updated', e => {
    // update favicon in tab (optional enhancement)
  });
  wv.addEventListener('did-fail-load', e => {
    if (e.errorCode === -3) return;
    prog.classList.remove('loading');
    overlay.classList.remove('visible');
    updateTabInfo(activeTabId, { loading: false });
    addMsg('system', `Page failed to load: ${e.errorDescription}`);
  });
  wv.addEventListener('did-finish-load', () => {
    $('btn-back').disabled = !wv.canGoBack();
    $('btn-forward').disabled = !wv.canGoForward();
  });

  wv.addEventListener('new-window', e => {
    e.preventDefault();
    createTab(e.url);
  });

  // ── IPC Relay for chat.html (webview guest pages) ───────────────────
  // chat.html uses console.log('__ZENAI_IPC__' + JSON.stringify(...)) to relay API calls
  wv.addEventListener('console-message', async (e) => {
    const msg = e.message || '';
    if (!msg.startsWith('__ZENAI_IPC__')) return;
    try {
      const { id, method, args } = JSON.parse(msg.slice('__ZENAI_IPC__'.length));
      let result = null;
      if (method === 'queryMistral') {
        result = await window.electronAPI.queryMistral(args);
      } else if (method === 'searchWeb') {
        result = await window.electronAPI.searchWeb(args);
      } else if (method === 'speakSarvam' || method === 'speakEdge') {
        result = await window.electronAPI.speakSarvam(args);
      }
      // Send result back to the guest page via postMessage
      const response = JSON.stringify({ __ZENAI_RESPONSE__: true, id, result });
      wv.executeJavaScript(`window.postMessage(${JSON.stringify(response)}, '*')`);
    } catch (err) {
      try {
        const { id } = JSON.parse(msg.slice('__ZENAI_IPC__'.length));
        const response = JSON.stringify({ __ZENAI_RESPONSE__: true, id, error: err.message });
        wv.executeJavaScript(`window.postMessage(${JSON.stringify(response)}, '*')`);
      } catch (_) { }
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// DOM EXTRACTION
// ═════════════════════════════════════════════════════════════════════════════

async function getPageContext(force = false) {
  if (state.pageCtx && !force) return state.pageCtx;
  try {
    const json = await wv.executeJavaScript(DOM_SCRIPT);
    state.pageCtx = JSON.parse(json);
  } catch (e) {
    state.pageCtx = { title: 'Unknown', url: wv.getURL(), error: e.message };
  }
  return state.pageCtx;
}

// ═════════════════════════════════════════════════════════════════════════════
// AGENT STATUS BAR
// ═════════════════════════════════════════════════════════════════════════════

function setAgentStatus(text, isError = false, isSuccess = false, hide = false) {
  const bar = $('agent-status-bar');
  const textEl = $('agent-status-text');
  if (!bar) return;
  if (hide || !text) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden', 'success', 'error');
  if (isError) bar.classList.add('error');
  if (isSuccess) bar.classList.add('success');
  if (textEl) textEl.textContent = text;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMAND PROCESSING  —  Agentic loop with live DOM verification
// ═════════════════════════════════════════════════════════════════════════════

async function processCmd(cmd) {
  cmd = String(cmd || '').trim();
  if (!cmd || state.processing) return;
  const commandId = ++state.commandId;
  state.processing = true;
  $('send-btn').disabled = true;
  try {
    await executeCmd(cmd, commandId);
  } catch (error) {
    if (commandId === state.commandId) {
      setAgentStatus('Error', true);
      addMsg('system', `⚠ ${error.message || 'Command failed. Please try again.'}`);
    }
  } finally {
    if (commandId === state.commandId) {
      state.processing = false;
      $('send-btn').disabled = false;
      $('stop-action-btn').style.display = 'none';
      showThinking(false);
    }
  }
}

function cancelCommand() {
  state.commandId++;
  state.abortProcessing = true;
  state.processing = false;
  $('send-btn').disabled = false;
  $('stop-action-btn').style.display = 'none';
  showThinking(false);
}

async function executeCmd(cmd, commandId) {
  cmd = cmd.trim();
  if (!cmd) return;

  addMsg('user', cmd);
  $('cmd-input').value = '';
  autoResize();

  state.chatHist.push({ role: 'user', content: cmd });

  const MAX_ITER = 6;
  let iter = 0;
  let taskComplete = false;
  let lastInteractiveActions = [];

  state.abortProcessing = false;
  const stopBtn = $('stop-action-btn');
  if (stopBtn) {
    stopBtn.style.display = 'flex';
  }

  while (!taskComplete && iter < MAX_ITER) {
    if (state.abortProcessing || commandId !== state.commandId) {
      showThinking(false);
      setAgentStatus('Stopped', false, false);
      addMsg('system', 'Processing stopped.');
      setTimeout(() => setAgentStatus('', false, false, true), 2000);
      break;
    }
    iter++;

    showThinking(true);
    setAgentStatus(iter === 1 ? 'Working…' : `Verifying step ${iter - 1}…`);

    // Always read fresh DOM on each iteration
    const pageCtx = await getPageContext(true);
    if (commandId !== state.commandId) return;

    // On follow-up iterations, describe the DOM change to the AI
    let query = cmd;
    if (iter > 1 && lastInteractiveActions.length > 0) {
      const actSummary = lastInteractiveActions
        .map(a => `${a.type}${a.url ? ' → ' + a.url : ''}${a.selector ? ' on ' + a.selector : ''}${a.value ? ' "' + a.value + '"' : ''}`)
        .join(', ');
      query = `[DOM UPDATE after previous actions (${actSummary})]: Page is now "${pageCtx.title}" at ${pageCtx.url}. ` +
        `Continue completing the original task: "${cmd}". If fully done, set taskComplete true.`;
    }

    const res = await window.electronAPI.queryMistral({
      command: query,
      pageContext: pageCtx,
      history: state.chatHist.slice(-20),
    });
    if (commandId !== state.commandId) return;

    showThinking(false);

    if (!res.success) {
      setAgentStatus('Error', true, false, false);
      addMsg('system', `⚠ ${res.error}`);
      speak(res.error);
      setTimeout(() => setAgentStatus('', false, false, true), 3000);
      break;
    }

    const { speech, actions = [], explanation, taskComplete: done } = res.data;
    taskComplete = !!done;

    // Add first turn to history
    if (iter === 1) {
      state.chatHist.push({ role: 'assistant', content: JSON.stringify(res.data) });
    }

    // Display response
    const displayed = explanation || speech || '';
    if (displayed) addMsg('assistant', displayed, actions);
    showCaptions(displayed);
    if (speech) speak(speech);

    // Separate search actions from interactive ones
    const regularActions = [];
    let didSearch = false;

    for (const action of actions) {
      if (commandId !== state.commandId) return;
      if (action.type === 'search_web') {
        try {
          setAgentStatus(`Searching: "${action.query}"…`);
          const sr = await window.electronAPI.searchWeb({ query: action.query, maxResults: 5 });
          if (commandId !== state.commandId) return;
          if (sr.success && sr.results && sr.results.length > 0) {
            didSearch = true;
            // Render source cards in chat
            const pills = sr.results.slice(0, 4).map(r =>
              `<a class="source-pill" href="#" data-url="${escHtml(r.url)}" title="${escHtml(r.url)}">` +
              `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>` +
              `${escHtml(r.title.slice(0, 55))}</a>`
            ).join('');
            const answerLine = (sr.answer || '').trim().slice(0, 200);
            addRawMsg(`<div class="search-sources">${answerLine ? `<div style="font-size:12px;color:var(--text);margin-bottom:6px">${escHtml(answerLine)}</div>` : ''}${pills}</div>`);
            // Feed into history
            state.chatHist.push({
              role: 'user',
              content: `[Web search results for "${action.query}"]: ${JSON.stringify(
                sr.results.slice(0, 4).map(r => ({ title: r.title, snippet: (r.snippet || '').slice(0, 200), url: r.url }))
              )}`,
            });
          } else {
            addMsg('system', `Search failed: ${sr.error || 'No results found.'}`);
          }
        } catch (e) { console.warn('[search_web]', e); }
      } else {
        regularActions.push(action);
      }
    }

    lastInteractiveActions = regularActions.filter(a =>
      ['click', 'type', 'clear_type', 'submit', 'navigate', 'key'].includes(a.type)
    );

    // Execute DOM-touching actions with status updates
    for (const action of regularActions) {
      if (commandId !== state.commandId) return;
      try {
        setAgentStatus(`${actionLabel(action)}…`);
        await runAction(action);
        await sleep(400);
      } catch (e) { throw new Error(`${actionLabel(action)} failed: ${e.message}`); }
    }

    // Decide if we need another iteration
    if (taskComplete) {
      setAgentStatus('Done', false, true);
      setTimeout(() => setAgentStatus('', false, false, true), 2500);
      // Invalidate page cache so next command sees fresh state
      state.pageCtx = null;
      break;
    }

    if (lastInteractiveActions.length > 0) {
      // Wait for page to settle then loop to verify
      setAgentStatus(`Waiting for page to update…`);
      await sleep(1400);
      state.pageCtx = null;
    } else if (didSearch) {
      // Got search results — loop so AI can act on them
      await sleep(150);
    } else {
      // No further action needed
      setAgentStatus('Done', false, true);
      setTimeout(() => setAgentStatus('', false, false, true), 2500);
      break;
    }
  }

  if (commandId !== state.commandId) return;
  if (stopBtn) stopBtn.style.display = 'none';

  if (!taskComplete && iter >= MAX_ITER) {
    setAgentStatus('Max steps reached', false, false);
    setTimeout(() => setAgentStatus('', false, false, true), 3000);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTION EXECUTOR
// ═════════════════════════════════════════════════════════════════════════════

async function runAction(a) {
  switch (a.type) {
    case 'navigate':
      if (a.action === 'back') wv.goBack();
      else if (a.action === 'forward') wv.goForward();
      else if (a.action === 'reload')  wv.reload();
      else if (a.url) {
        if (a.newTab) createTab(a.url);
        else navTo(a.url);
      }
      break;

    case 'click': {
      const fb = JSON.stringify(a.fallbackText || '');
      await wv.executeJavaScript(`(function(){
        var s=${JSON.stringify(a.selector || '')},fb=${fb};
        var el=s?document.querySelector(s):null;
        if(!el&&fb){
          var all=Array.from(document.querySelectorAll('button,a,[role="button"],[role="link"],input[type="submit"]'));
          el=all.find(e=>(e.textContent||'').trim().toLowerCase().includes(fb.toLowerCase())
            ||(e.getAttribute('aria-label')||'').toLowerCase().includes(fb.toLowerCase()));
        }
        if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.focus();el.click();return true;}
        return false;
      })()`);
      break;
    }

    case 'type':
      await wv.executeJavaScript(`(function(){
        var el=document.querySelector(${JSON.stringify(a.selector || '')});
        if(!el) return false;
        el.scrollIntoView({behavior:'smooth',block:'center'});
        el.focus();
        if(el.tagName.toLowerCase() === 'select') {
          var val = ${JSON.stringify(a.value||'')}.toLowerCase();
          var opts = Array.from(el.options);
          var match = opts.find(o => o.text.toLowerCase().includes(val) || o.value.toLowerCase().includes(val));
          if(match) el.value = match.value;
        } else {
          var proto=el.tagName.toLowerCase()==='textarea'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
          var nSet=Object.getOwnPropertyDescriptor(proto,'value');
          if(nSet&&nSet.set) nSet.set.call(el,${JSON.stringify(a.value||'')});
          else el.value=${JSON.stringify(a.value||'')};
        }
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      })()`);
      break;

    case 'clear_type':
      await wv.executeJavaScript(`(function(){
        var el=document.querySelector(${JSON.stringify(a.selector || '')});
        if(!el) return false;
        el.scrollIntoView({behavior:'smooth',block:'center'});
        el.focus();
        try { el.select(); } catch(e) { el.value=''; } // Native select overwrites on type
        if(el.tagName.toLowerCase() === 'select') {
          var val = ${JSON.stringify(a.value||'')}.toLowerCase();
          var opts = Array.from(el.options);
          var match = opts.find(o => o.text.toLowerCase().includes(val) || o.value.toLowerCase().includes(val));
          if(match) el.value = match.value;
        } else {
          var proto=el.tagName.toLowerCase()==='textarea'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
          var nSet=Object.getOwnPropertyDescriptor(proto,'value');
          if(nSet&&nSet.set) nSet.set.call(el,${JSON.stringify(a.value||'')});
          else el.value=${JSON.stringify(a.value||'')};
        }
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      })()`);
      break;

    case 'key': {
      // Focus the element first
      if (a.selector) {
        await wv.executeJavaScript(`(function(){
          var el=document.querySelector(${JSON.stringify(a.selector || '')});
          if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.focus();}
        })()`);
        await sleep(100);
      }
      // Use sendInputEvent for real keyboard simulation (works with React etc.)
      const keyName = a.key || 'Enter';
      const keyMap = { 'Enter': 'Return', 'Tab': 'Tab', 'Escape': 'Escape', 'Backspace': 'Backspace', 'Delete': 'Delete', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right' };
      const electronKey = keyMap[keyName] || keyName;
      wv.sendInputEvent({ type: 'keyDown', keyCode: electronKey });
      if (keyName.length === 1) {
        wv.sendInputEvent({ type: 'char', keyCode: keyName });
      }
      wv.sendInputEvent({ type: 'keyUp', keyCode: electronKey });
      break;
    }

    case 'submit':
      await wv.executeJavaScript(`(function(){
        var f=document.querySelector(${JSON.stringify(a.selector)});
        if(f&&f.tagName==='FORM'){f.requestSubmit();return true;}
        var b=document.querySelector('button[type="submit"],input[type="submit"]');
        if(b){b.click();return true;}return false;
      })()`);
      break;

    case 'scroll':
      await wv.executeJavaScript(`window.scrollBy(0,${(a.direction === 'up' ? -1 : 1) * (a.pixels || 400)})`);
      break;

    case 'scroll_to':
      await wv.executeJavaScript(`(function(){
        var el=document.querySelector(${JSON.stringify(a.selector)});
        if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
      })()`);
      break;

    case 'scroll_to_text':
      await wv.executeJavaScript(`(function(){
        var t=${JSON.stringify((a.text || '').toLowerCase())};
        var found=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li'))
          .find(el=>el.textContent.toLowerCase().includes(t));
        if(found)found.scrollIntoView({behavior:'smooth',block:'start'});
      })()`);
      break;

    case 'focus':
      await wv.executeJavaScript(`(function(){
        var el=document.querySelector(${JSON.stringify(a.selector)});
        if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.focus();}
      })()`);
      break;

    case 'read':
      await readSection(a.selector || 'main,[role="main"],article,body');
      break;

    case 'zoom': {
      const f = Math.min(Math.max(a.factor || 1, 0.3), 4);
      wv.setZoomFactor(f);
      state.a11y.zoom = f;
      const zs = $('dr-zoom'), zv = $('dr-zoom-val');
      if (zs) zs.value = f;
      if (zv) zv.textContent = Math.round(f * 100) + '%';
      break;
    }

    case 'a11y':
      await applyA11y(a.setting, a.value);
      break;

    default:
      console.warn('[unknown action]', a.type);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY ENGINE
// ═════════════════════════════════════════════════════════════════════════════

async function injectCSS(id, css) {
  await wv.executeJavaScript(`(function(){
    var s=document.getElementById(${JSON.stringify(id)});
    if(!s){s=document.createElement('style');s.id=${JSON.stringify(id)};document.head.appendChild(s);}
    s.textContent=${JSON.stringify(css)};
  })()`);
}
async function removeCSS(id) {
  await wv.executeJavaScript(`(function(){var s=document.getElementById(${JSON.stringify(id)});if(s)s.remove();})()`);
}

async function applyA11y(setting, value) {
  const id = `__aai_${setting}__`;
  const css = A11Y[setting];

  const toggleCSS = async (on) => {
    if (on) { await injectCSS(id, css); state.a11y.activeCSS.add(id); }
    else { await removeCSS(id); state.a11y.activeCSS.delete(id); }
  };

  switch (setting) {
    case 'high_contrast': state.a11y.highContrast = !!value; syncToggle('dr-hc', value); syncQP('qp-contrast', value); await toggleCSS(value); break;
    case 'highlight_links': state.a11y.highlightLinks = !!value; syncToggle('dr-links', value); syncQP('qp-links', value); await toggleCSS(value); break;
    case 'simplify': state.a11y.simplify = !!value; syncToggle('dr-simple', value); syncQP('qp-simplify', value); await toggleCSS(value); break;
    case 'dyslexia_font': state.a11y.dyslexia = !!value; syncToggle('dr-dyslexia', value); syncQP('qp-dyslexia', value); await toggleCSS(value); break;
    case 'text_spacing': state.a11y.spacing = !!value; syncToggle('dr-spacing', value); await toggleCSS(value); break;
    case 'large_cursor': state.a11y.largeCursor = !!value; syncToggle('dr-cursor', value); await toggleCSS(value); break;
    case 'focus_ring': state.a11y.focusRing = !!value; await toggleCSS(value); break;
    case 'reduce_motion': state.a11y.reduceMotion = !!value; syncToggle('dr-noani', value); await toggleCSS(value); break;
    case 'focus_mode': state.a11y.focusMode = !!value; syncToggle('dr-focus', value); await toggleCSS(value); break;
    case 'font_size': wv.setZoomFactor(value || 1.0); state.a11y.zoom = value; break;
    case 'color_filter': {
      state.a11y.colorFilter = value;
      const cid = '__aai_color__';
      const f = COLOR_FILTERS[value] || '';
      if (f) { await injectCSS(cid, f); state.a11y.activeCSS.add(cid); }
      else { await removeCSS(cid); state.a11y.activeCSS.delete(cid); }
      break;
    }
    case 'reading_guide':
      state.a11y.readingGuide = !!value; syncToggle('dr-guide', value);
      $('reading-guide').style.display = value ? 'block' : 'none';
      break;
    case 'captions':
      state.a11y.captions = !!value; syncToggle('dr-captions', value);
      break;
    case 'auto_read':
      state.a11y.autoRead = !!value; syncToggle('dr-autoread', value);
      break;
    case 'sticky_keys':
      state.a11y.stickyKeys = !!value; syncToggle('dr-sticky', value);
      break;
    case 'zen_mode':
      state.a11y.zen_mode = !!value;
      syncToggle('dr-zen', value);
      if (window.ZenModeController) {
        window.ZenModeController.toggle(!!value);
      }
      break;
  }
}

async function reapplyA11yCSS() {
  if (state.a11y.zoom !== 1.0) wv.setZoomFactor(state.a11y.zoom);
  const jobs = [];
  for (const id of state.a11y.activeCSS) {
    const key = id.replace('__aai_', '').replace('__', '');
    const css = A11Y[key];
    if (css) jobs.push(injectCSS(id, css));
    else if (key === 'color') {
      const f = COLOR_FILTERS[state.a11y.colorFilter] || '';
      if (f) jobs.push(injectCSS(id, f));
    }
  }
  await Promise.all(jobs);
}

function syncToggle(id, on) { const el = $(id); if (el) el.setAttribute('aria-checked', String(!!on)); }
function syncQP(id, on) {
  const el = $(id);
  if (el) { el.classList.toggle('on', !!on); el.setAttribute('aria-pressed', String(!!on)); }
}

async function readSection(sel) {
  try {
    const txt = await wv.executeJavaScript(`
      (function(){
        var el=document.querySelector(${JSON.stringify(sel)});
        return((el||document.body).innerText||'').replace(/\\s+/g,' ').trim().slice(0,4000);
      })()`);
    if (txt) speak(txt);
  } catch (_) { speak('Could not read that section.'); }
}

function showCaptions(text) {
  if (!state.a11y.captions || !text) return;
  const bar = $('captions-bar');
  if (!bar) return;
  bar.textContent = text;
  bar.style.display = 'block';
  clearTimeout(bar._timer);
  bar._timer = setTimeout(() => { bar.style.display = 'none'; }, Math.max(4000, text.length * 65));
}

// ═════════════════════════════════════════════════════════════════════════════
// VOICE INPUT  —  Web Speech API (Built-in) with Groq Whisper Fallback
//   Primary: Browser's native SpeechRecognition (free, fast, offline-capable)
//   Fallback: Groq Whisper API (if browser API fails or unavailable)
// ═════════════════════════════════════════════════════════════════════════════

let recogActive = false;
let _voiceStopTimer = null;
let _recognition = null;
let _mediaRecorder = null;
let _audioChunks = [];
let _fallbackMime = 'audio/webm';
let _finalTranscript = '';
let _interimTranscript = '';

function initVoice() {
  // Check if Web Speech API is available
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (SpeechRecognition) {
    console.log('[Voice] Using Web Speech API (built-in, free)');
    _recognition = new SpeechRecognition();
    _recognition.continuous = true;
    _recognition.interimResults = true;
    _recognition.lang = 'en-IN'; // Default to Indian English
    _recognition.maxAlternatives = 1;

    _recognition.onstart = () => {
      console.log('[Voice] Speech recognition started');
      setVoiceStatus('🎤 Listening...');
    };

    _recognition.onresult = (event) => {
      _interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          _finalTranscript += transcript + ' ';
        } else {
          _interimTranscript += transcript;
        }
      }

      // Update input field with current transcript
      const inp = $('cmd-input');
      if (inp) {
        inp.value = (_finalTranscript + _interimTranscript).trim();
        autoResize();
      }

      // Auto-send after 2 seconds of silence (detected by no new results)
      clearTimeout(_voiceStopTimer);
      if (_finalTranscript.trim()) {
        _voiceStopTimer = setTimeout(() => {
          if (recogActive && _finalTranscript.trim()) {
            stopListen();
          }
        }, 2000);
      }
    };

    _recognition.onerror = (event) => {
      console.warn('[Voice] Speech recognition error:', event.error);
      clearTimeout(_voiceStopTimer);
      setVoiceUI(false);
      // Electron may expose SpeechRecognition without a working speech service.
      // Stop its restart loop and use the recorder on the next attempt.
      if (['network', 'service-not-allowed', 'language-not-supported'].includes(event.error)) {
        _recognition.onend = null;
        try { _recognition.abort(); } catch (_) { }
        _recognition = null;
        startGroqFallback().catch(error => {
          setVoiceUI(false);
          setVoiceStatus(error.message, true);
        });
        return;
      }
      
      if (event.error === 'no-speech') {
        setVoiceStatus('⚠️ No speech detected', true);
      } else if (event.error === 'not-allowed') {
        setVoiceStatus('⚠️ Microphone access denied', true);
      } else {
        setVoiceStatus(`⚠️ Error: ${event.error}`, true);
      }
      
      setTimeout(() => setVoiceStatus(''), 3000);
    };

    _recognition.onend = () => {
      console.log('[Voice] Speech recognition ended');
      if (recogActive) {
        // Restart if still supposed to be listening
        try {
          _recognition.start();
        } catch (e) {
          console.warn('[Voice] Could not restart:', e);
        }
      }
    };
  } else {
    console.log('[Voice] Web Speech API not available, will use Groq Whisper fallback only');
  }
}

function setVoiceUI(on) {
  recogActive = on;
  const vb = $('voice-btn');
  const vn = $('btn-voice-nav');
  [vb, vn].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle('listening', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  if (!on) setVoiceStatus('');
}

function setVoiceStatus(txt, isError = false) {
  const el = $('voice-status');
  if (!el) return;
  el.textContent = txt;
  el.classList.toggle('error', isError);
}

async function startListen() {
  if (recogActive) { 
    await stopListen(); 
    return; 
  }

  _finalTranscript = '';
  _interimTranscript = '';
  _audioChunks = [];

  try {
    // Start Web Speech API if available
    if (_recognition) {
      _recognition.start();
      setVoiceUI(true);
    } else {
      // Fallback to recording for Groq Whisper
      await startGroqFallback();
    }
  } catch (err) {
    setVoiceUI(false);
    console.error('[Voice] Start error:', err);
    const msg = err.name === 'NotAllowedError'
      ? 'Microphone access denied. Allow mic permission.'
      : err.message;
    setVoiceStatus(msg, true);
    setTimeout(() => setVoiceStatus(''), 5000);
  }
}

async function startGroqFallback() {
  console.log('[Voice] Starting Groq Whisper fallback');
  setVoiceStatus('🎤 Recording (Groq Whisper)...');
  
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  // Determine best audio format
  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  
  _fallbackMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
  
  _mediaRecorder = new MediaRecorder(stream, { mimeType: _fallbackMime });
  _audioChunks = [];
  
  _mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) _audioChunks.push(e.data);
  };
  
  _mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(track => track.stop());
    await processGroqTranscription();
  };
  
  _mediaRecorder.start(200);
  setVoiceUI(true);
}

async function processGroqTranscription() {
  if (_audioChunks.length === 0) {
    setVoiceStatus('⚠️ No audio recorded', true);
    setTimeout(() => setVoiceStatus(''), 3000);
    return;
  }

  setVoiceStatus('⚡ Transcribing with Groq Whisper...');
  
  try {
    const blob = new Blob(_audioChunks, { type: _fallbackMime });
    const base64 = await _blobToBase64(blob);
    
    // Use Groq Whisper API
    const res = await window.electronAPI.groqWhisper({ 
      audioBase64: base64, 
      mimeType: _fallbackMime.split(';')[0] 
    });
    
    if (res && res.success && res.transcript) {
      const transcript = res.transcript.trim();
      const inp = $('cmd-input');
      if (inp) { 
        inp.value = transcript; 
        autoResize(); 
      }
      
      if (transcript) {
        processCmd(transcript);
      } else {
        setVoiceStatus('⚠️ No speech detected', true);
        setTimeout(() => setVoiceStatus(''), 3000);
      }
    } else {
      throw new Error(res?.error || 'Transcription failed');
    }
  } catch (err) {
    console.error('[Voice] Groq transcription error:', err);
    setVoiceStatus('⚠️ Transcription failed: ' + err.message, true);
    setTimeout(() => setVoiceStatus(''), 5000);
  }
  
}

async function stopListen() {
  clearTimeout(_voiceStopTimer);
  setVoiceUI(false);

  if (_recognition) {
    // Stop Web Speech API
    try {
      _recognition.stop();
    } catch (e) {
      console.warn('[Voice] Stop error:', e);
    }

    const finalText = _finalTranscript.trim();
    _finalTranscript = '';
    _interimTranscript = '';

    if (finalText) {
      setVoiceStatus('');
      processCmd(finalText);
    } else {
      setVoiceStatus('⚠️ No speech detected', true);
      setTimeout(() => setVoiceStatus(''), 3000);
    }
  } else if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    // Stop Groq fallback recording
    _mediaRecorder.stop();
  }
}

/** Convert a Blob to base64 data string (for Gemini fallback) */
function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // result is "data:<mime>;base64,<data>" — strip prefix
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


// ═════════════════════════════════════════════════════════════════════════════
// TTS  —  Sarvam AI (via IPC) with speechSynthesis fallback
// ═════════════════════════════════════════════════════════════════════════════

let currentAudio = null;

async function speak(text) {
  if (!text) return;
  if (state.muted) return;
  stopSpeak();

  state.speaking = true;

  // Detect language for voice selection
  const voice = detectVoice(text);
  const lang = voice.startsWith('hi-') ? 'hi-IN' : 'en-IN';

  try {
    const res = await window.electronAPI.speakSarvam({ text, lang, rate: state.ttsRate });
    if (res && res.success && res.data) {
      // Play via Audio element from base64 WAV
      const blob = b64ToBlob(res.data, 'audio/wav');
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);
      currentAudio.playbackRate = state.ttsRate;
      currentAudio.onended = () => {
        state.speaking = false;
        URL.revokeObjectURL(url);
        currentAudio = null;
      };
      currentAudio.onerror = () => {
        state.speaking = false;
        URL.revokeObjectURL(url);
        currentAudio = null;
        speakFallback(text);
      };
      try {
        await currentAudio.play();
        showCaptions(text);
        return;
      } catch (playErr) {
        // Autoplay blocked or audio error — fall through to Web Speech
        URL.revokeObjectURL(url);
        currentAudio = null;
        console.warn('[Audio play failed]', playErr.message);
      }
    }
    // If Edge TTS returned an error, log it but fall through to Web Speech
    if (res && !res.success) {
      console.warn('[Edge TTS returned error, using Web Speech fallback]', res.error);
    }
  } catch (err) {
    console.warn('[Edge TTS failed, fallback]', err?.message || String(err));
  }

  // Fallback to Web Speech API
  speakFallback(text);
}

function detectVoice(text) {
  // Devanagari script detection
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN-SwaraNeural';
  // Hinglish detection — common Hindi words in Latin script
  const hinglishWords = /\b(kya|hai|hain|nahi|kaise|kaha|kab|kaun|kuch|bahut|accha|achha|theek|thik|aur|lekin|kyunki|phir|abhi|yeh|woh|mujhe|tumhe|humne|aapka|tera|mera|bhai|didi|yaar|ji|haan|nahin|matlab|samajh|dekho|suno|chalo|bolo|karo|jao|aao|ruk|chal|bol|kar|ja|aa|hum|tum|main|mein|wo|ye|ek|do|teen|char|panch|bohot|sab|log|liye|wala|wali|vale|dost|pyar|zindagi|duniya|paisa|kaam|ghar)\b/i;
  if (hinglishWords.test(text)) return 'hi-IN-SwaraNeural';
  return state.ttsVoice || 'en-IN-NeerjaNeural';
}

function speakFallback(text) {
  if (!window.speechSynthesis) { state.speaking = false; return; }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = state.ttsRate;
  u.pitch = 1.0; u.volume = 1.0;
  // Set language based on content for proper pronunciation
  const voice = detectVoice(text);
  u.lang = voice.startsWith('hi-') ? 'hi-IN' : 'en-IN';
  u.onstart = () => { state.speaking = true; };
  u.onend = () => { state.speaking = false; };
  speechSynthesis.speak(u);
  showCaptions(text);
}

function stopSpeak() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  state.speaking = false;
}

function b64ToBlob(b64, mime) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAT UI  —  Proper markdown + conversational bubbles
// ═════════════════════════════════════════════════════════════════════════════

/** Insert a raw-HTML system message (search results, source cards, etc.) */
function addRawMsg(html) {
  const log = $('chat-log');
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.style.width = '100%';
  wrap.innerHTML = `<div style="width:100%">${html}</div>`;
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

function addMsg(role, text, actions) {
  const log = $('chat-log');
  const wrap = document.createElement('div');
  wrap.className = `msg msg-${role}`;

  const BOT_SVG = `<svg viewBox="0 0 64 64" width="16" height="16" aria-hidden="true">
    <g fill="#2fbe8f">
      <rect x="20" y="34" width="24" height="16" rx="5"/>
      <rect x="22" y="18" width="7"  height="18" rx="3.5"/>
      <rect x="31" y="14" width="7"  height="22" rx="3.5"/>
      <rect x="40" y="20" width="5"  height="16" rx="2.5"/>
    </g>
    <circle cx="22" cy="14" r="3.5" fill="#5fffc8"/>
  </svg>`;

  if (role === 'user') {
    wrap.innerHTML = `<div class="msg-body"><div class="bubble bubble-user">${escHtml(text)}</div></div>`;
  } else if (role === 'assistant') {
    const chips = (actions || [])
      .filter(a => a.type !== 'search_web')
      .map(a => `<span class="act-pill">${escHtml(actionLabel(a))}</span>`)
      .join('');
    wrap.innerHTML = `
      <div class="bot-av" aria-hidden="true">${BOT_SVG}</div>
      <div class="msg-body" style="max-width:100%;flex:1">
        <div class="bubble bubble-assistant">${renderMarkdown(text)}</div>
        ${chips ? `<div class="action-pills">${chips}</div>` : ''}
      </div>`;
  } else {
    wrap.innerHTML = `<div style="width:100%;text-align:center"><div class="bubble bubble-system">${escHtml(text)}</div></div>`;
  }

  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

function showThinking(on) {
  $('thinking').hidden = !on;
  if (on) $('chat-log').scrollTop = $('chat-log').scrollHeight;
}

function actionLabel(a) {
  if (a.type === 'navigate') {
    if (a.action) return `↩ ${a.action}`;
    if (a.newTab) return `New Tab: → ${(a.url||'').slice(0,30)}`;
    return `→ ${(a.url||'').slice(0,30)}`;
  }
  if (a.type === 'click')    return `Click: ${a.fallbackText || a.selector || ''}`;
  if (a.type === 'type')     return `Type: "${(a.value||'').slice(0,25)}"`;
  if (a.type === 'scroll')   return `Scroll ${a.direction||''}`;
  if (a.type === 'read')     return `Read ${a.selector || 'page'}`;
  if (a.type === 'zoom')     return `Zoom ${Math.round((a.factor||1)*100)}%`;
  if (a.type === 'a11y')     return `A11y: ${a.setting}`;
  return a.type;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Full markdown renderer */
function renderMarkdown(raw) {
  if (!raw) return '';

  let s = String(raw);

  // Escape HTML first (but preserve for later transformations)
  const htmlEsc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks first (protect them from further processing)
  const codeBlocks = [];
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${htmlEsc(code.trim())}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // Escape HTML for the rest
  s = htmlEsc(s);

  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold + italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');

  // Blockquotes
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // HR
  s = s.replace(/^---+$/gm, '<hr>');

  // Unordered lists — collect consecutive items
  s = s.replace(/((?:^[*\-+] .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[*\-+] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs — double newlines
  s = s.split(/\n\n+/).map(para => {
    para = para.trim();
    if (!para) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|hr|pre)/.test(para)) return para;
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  // Restore code blocks
  s = s.replace(/\x00CODE(\d+)\x00/g, (_, idx) => codeBlocks[idx]);

  return `<div class="md-content">${s}</div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// READING GUIDE
// ═════════════════════════════════════════════════════════════════════════════

function initReadingGuide() {
  const guide = $('reading-guide');
  if (!guide) return;
  document.addEventListener('mousemove', e => {
    if (!state.a11y.readingGuide) return;
    guide.style.top = (e.clientY - 1) + 'px';
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═════════════════════════════════════════════════════════════════════════════

// Navigation
$('btn-back').addEventListener('click', () => wv.goBack());
$('btn-forward').addEventListener('click', () => wv.goForward());
$('btn-reload').addEventListener('click', () => { if (wv.isLoading()) wv.stop(); else wv.reload(); });
$('btn-home').addEventListener('click', () => navTo(null, 'home'));
$('btn-new-tab').addEventListener('click', () => createTab());

$('address-bar').addEventListener('focus', () => {
  // Show full URL when focused
  if (state.url) addressBar.value = state.url;
});
$('address-bar').addEventListener('blur', () => {
  // Show display URL when unfocused
  updateAddressBar(state.url);
});
$('address-bar').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = addressBar.value.trim();
    if (val === '/home') navTo(null, 'home');
    else if (val === '/chat') navTo(null, 'chat');
    else navTo(val);
    wv.focus();
  }
  if (e.key === 'Escape') { addressBar.blur(); }
});

// Ctrl+T new tab, Ctrl+W close tab
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 't') { e.preventDefault(); createTab(); }
  if (e.ctrlKey && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
  if (e.ctrlKey && e.shiftKey && e.key === 'V') { e.preventDefault(); if (recogActive) stopListen(); else startListen(); }
  if (e.key === 'F5') { e.preventDefault(); wv.reload(); }
  if (e.key === 'Escape') {
    if (!$('a11y-drawer').hidden) { $('a11y-drawer').hidden = true; return; }
    if (!$('settings-modal').hidden) { closeSettings(); return; }
    if (state.speaking) { stopSpeak(); return; }
  }
  if (e.altKey && e.key === 'ArrowLeft') wv.goBack();
  if (e.altKey && e.key === 'ArrowRight') wv.goForward();
  if (e.ctrlKey && e.key === 'l') { e.preventDefault(); addressBar.focus(); addressBar.select(); }
});

// AI Panel
$('btn-toggle-panel').addEventListener('click', () => {
  state.panelOpen = !state.panelOpen;
  $('ai-panel').classList.toggle('hidden', !state.panelOpen);
  $('btn-toggle-panel').setAttribute('aria-expanded', String(state.panelOpen));
});
$('btn-close-panel').addEventListener('click', () => {
  state.panelOpen = false;
  $('ai-panel').classList.add('hidden');
  $('btn-toggle-panel').setAttribute('aria-expanded', 'false');
});
$('btn-new-chat').addEventListener('click', () => {
  stopSpeak();
  cancelCommand();
  state.chatHist = [];
  resetChatDOM();
  if (activeTabId !== null) {
    const tab = tabs.get(activeTabId);
    if (tab) {
      tab.chatHist = [];
      tab.chatHTML = $('chat-log').innerHTML;
    }
  }
});

// Panel Resizer logic
(function initPanelResizer() {
  const panel = $('ai-panel');
  const resizer = $('panel-resizer');
  if (!panel || !resizer) return;
  
  let isResizing = false;
  let startX = 0;
  let startW = 0;
  
  resizer.addEventListener('mousedown', e => {
    isResizing = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
  });
  
  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const dx = startX - e.clientX;
    const newW = startW + dx;
    panel.style.width = Math.max(280, Math.min(newW, 800)) + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
    }
  });
})();

// Quick pills
function bindQP(id, setting, stateKey) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', async () => { await applyA11y(setting, !state.a11y[stateKey]); });
}
bindQP('qp-contrast',  'high_contrast',   'highContrast');
bindQP('qp-links',     'highlight_links', 'highlightLinks');
bindQP('qp-dyslexia',  'dyslexia_font',   'dyslexia');
bindQP('qp-zen',       'zen_mode',        'zen_mode');

$('qp-zoom').addEventListener('click', () => {
  const next = state.a11y.zoom < 1.8 ? parseFloat((state.a11y.zoom + 0.2).toFixed(1)) : 1.0;
  state.a11y.zoom = next;
  wv.setZoomFactor(next);
  syncQP('qp-zoom', next !== 1.0);
  speak(`Zoom ${Math.round(next * 100)} percent.`);
});

$('qp-read').addEventListener('click', async () => {
  if (state.speaking) { stopSpeak(); syncQP('qp-read', false); return; }
  syncQP('qp-read', true);
  await readSection('main,[role="main"],article,#content,body');
  syncQP('qp-read', false);
});

// Drawer toggles
function bindTog(id, setting, stateKey) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', async () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    await applyA11y(setting, next);
    if (stateKey) state.a11y[stateKey] = next;
  });
}
bindTog('dr-hc',       'high_contrast',   'highContrast');
bindTog('dr-links',    'highlight_links', 'highlightLinks');
bindTog('dr-simple',   'simplify',        'simplify');
bindTog('dr-dyslexia', 'dyslexia_font',   'dyslexia');
bindTog('dr-spacing',  'text_spacing',    'spacing');
bindTog('dr-guide',    'reading_guide',   'readingGuide');
bindTog('dr-focus',    'focus_mode',      'focusMode');
bindTog('dr-cursor',   'large_cursor',    'largeCursor');
bindTog('dr-autoread', 'auto_read',       'autoRead');
bindTog('dr-captions', 'captions',        'captions');
bindTog('dr-noani',    'reduce_motion',   'reduceMotion');
bindTog('dr-sticky',   'sticky_keys',     'stickyKeys');
bindTog('dr-zen',      'zen_mode',        'zen_mode');

$('dr-zoom').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  wv.setZoomFactor(v); state.a11y.zoom = v;
  $('dr-zoom-val').textContent = Math.round(v * 100) + '%';
});
$('dr-rate').addEventListener('input', e => {
  state.ttsRate = parseFloat(e.target.value);
  $('dr-rate-val').textContent = state.ttsRate.toFixed(1) + '×';
});
$('dr-voice').addEventListener('change', e => {
  state.ttsVoice = e.target.value;
});
$('dr-color').addEventListener('change', async e => { await applyA11y('color_filter', e.target.value); });

// A11y drawer
$('btn-a11y').addEventListener('click', () => $('a11y-drawer').hidden = false);
$('close-a11y').addEventListener('click', () => $('a11y-drawer').hidden = true);

// Settings modal
$('btn-settings').addEventListener('click', () => {
  $('settings-backdrop').hidden = false;
  $('settings-modal').hidden = false;
  $('input-api-key').focus();
});
function closeSettings() {
  $('settings-backdrop').hidden = true;
  $('settings-modal').hidden = true;
}
$('close-settings').addEventListener('click', closeSettings);
$('settings-backdrop').addEventListener('click', closeSettings);

$('btn-save-key').addEventListener('click', async () => {
  const key = $('input-api-key').value.trim();
  if (!key || key.startsWith('•')) return;
  await window.electronAPI.setApiKey(key);
  const st = $('api-status');
  st.className = 'api-status ok'; st.textContent = '✓ Key saved!';
  setTimeout(() => { st.textContent = ''; closeSettings(); }, 1400);
});

$('sel-model').addEventListener('change', async e => { await window.electronAPI.setModel(e.target.value); });
$('link-mistral').addEventListener('click', e => { e.preventDefault(); window.electronAPI.openExternal('https://console.mistral.ai'); });

// Tavily key
const btnSaveTavily = $('btn-save-tavily-key');
const inputTavilyKey = $('input-tavily-key');
if (btnSaveTavily && inputTavilyKey) {
  btnSaveTavily.addEventListener('click', async () => {
    const key = inputTavilyKey.value.trim();
    if (!key || key.startsWith('•')) return;
    await window.electronAPI.setTavilyKey(key);
    const st = $('api-status');
    if (st) { st.className = 'api-status ok'; st.textContent = '✓ Tavily key saved!'; setTimeout(() => { st.textContent = ''; }, 1800); }
  });
  (async () => {
    const key = await window.electronAPI.getTavilyKey();
    if (key) inputTavilyKey.value = '••••••••••••';
  })();
}
const linkTavily = $('link-tavily');
if (linkTavily) linkTavily.addEventListener('click', e => { e.preventDefault(); window.electronAPI.openExternal('https://app.tavily.com'); });

// Sarvam AI key
const btnSaveSarvam = $('btn-save-sarvam-key');
const inputSarvamKey = $('input-sarvam-key');
if (btnSaveSarvam && inputSarvamKey) {
  btnSaveSarvam.addEventListener('click', async () => {
    const key = inputSarvamKey.value.trim();
    if (!key || key.startsWith('•')) return;
    await window.electronAPI.setSarvamKey(key);
    const st = $('api-status');
    if (st) { st.className = 'api-status ok'; st.textContent = '✓ Sarvam key saved!'; setTimeout(() => { st.textContent = ''; }, 1800); }
  });
  (async () => {
    const key = await window.electronAPI.getSarvamKey();
    if (key) inputSarvamKey.value = '••••••••••••';
  })();
}
const linkSarvam = $('link-sarvam');
if (linkSarvam) linkSarvam.addEventListener('click', e => { e.preventDefault(); window.electronAPI.openExternal('https://sarvam.ai'); });

// Command input
$('send-btn').addEventListener('click', () => processCmd($('cmd-input').value));
$('cmd-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); processCmd($('cmd-input').value); }
});
$('cmd-input').addEventListener('input', autoResize);

// Stop button — abort current processing
$('stop-action-btn').addEventListener('click', () => {
  cancelCommand();
  setAgentStatus('Stopped');
  stopSpeak();
  showThinking(false);
  $('stop-action-btn').style.display = 'none';
});

// Pause / Resume Media buttons
$('pause-media-btn').addEventListener('click', () => {
  wv.executeJavaScript(`(function(){
    document.querySelectorAll('video, audio').forEach(m => m.pause());
  })()`);
  $('pause-media-btn').style.display = 'none';
  $('resume-media-btn').style.display = 'flex';
});
$('resume-media-btn').addEventListener('click', () => {
  wv.executeJavaScript(`(function(){
    document.querySelectorAll('video, audio').forEach(m => m.play());
  })()`);
  $('resume-media-btn').style.display = 'none';
  $('pause-media-btn').style.display = 'flex';
});


// Mute button — toggle TTS
$('mute-btn').addEventListener('click', () => {
  state.muted = !state.muted;
  const btn = $('mute-btn');
  btn.setAttribute('aria-pressed', String(state.muted));
  btn.title = state.muted ? 'Unmute TTS' : 'Mute TTS';
  const icon = $('mute-icon');
  if (icon) {
    icon.innerHTML = state.muted
      ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
      : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
  if (state.muted) stopSpeak();
});

// Voice
$('voice-btn').addEventListener('click', () => { if (recogActive) stopListen(); else startListen(); });
$('btn-voice-nav').addEventListener('click', () => { if (recogActive) stopListen(); else startListen(); });

// Source pill clicks (delegated — pills are added dynamically)
$('chat-log').addEventListener('click', e => {
  const pill = e.target.closest('.source-pill');
  if (pill) {
    e.preventDefault();
    const url = pill.dataset.url;
    if (url) navTo(url);
  }
});

// ── Utilities ──────────────────────────────────────────────────────────────────
function autoResize() {
  const t = $('cmd-input');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 110) + 'px';
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Start ───────────────────────────────────────────────────────────────────
init().catch(error => {
  setAgentStatus('Initialization failed', true);
  addMsg('system', `Unable to initialize the app: ${error.message}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// ISL CO-PILOT WIDGET
// ═════════════════════════════════════════════════════════════════════════════

(function () {
  var tabAgent = document.getElementById('tab-agent');
  var tabIsl = document.getElementById('tab-isl');
  var tabPanelAgent = document.getElementById('tab-panel-agent');
  var tabPanelIsl = document.getElementById('tab-panel-isl');
  var btnIsl = document.getElementById('btn-isl');
  var btnExplain = document.getElementById('isl-btn-explain');
  var btnStop = document.getElementById('isl-btn-stop');
  var islSummary = document.getElementById('isl-summary');
  var islSummaryP = document.getElementById('isl-summary-text');
  var islError = document.getElementById('isl-error');
  var islSpeedSlider = document.getElementById('isl-speed');
  var islBotXbot = document.getElementById('isl-bot-xbot');
  var islBotYbot = document.getElementById('isl-bot-ybot');

  var animator = null;
  var islStatus = 'idle';
  var islInitialised = false;

  function switchTab(tabId) {
    var isAgent = tabId === 'agent';
    if (tabAgent) tabAgent.classList.toggle('active', isAgent);
    if (tabIsl) tabIsl.classList.toggle('active', !isAgent);
    if (tabAgent) tabAgent.setAttribute('aria-selected', isAgent ? 'true' : 'false');
    if (tabIsl) tabIsl.setAttribute('aria-selected', !isAgent ? 'true' : 'false');
    if (tabPanelAgent) tabPanelAgent.hidden = !isAgent;
    if (tabPanelIsl) tabPanelIsl.hidden = isAgent;
    if (!isAgent) {
      if (!islInitialised) { islInitialised = true; setTimeout(initAvatarAnimator, 50); }
      else setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }
  }

  if (tabAgent) tabAgent.addEventListener('click', () => switchTab('agent'));
  if (tabIsl) tabIsl.addEventListener('click', () => switchTab('isl'));

  if (btnIsl) {
    btnIsl.addEventListener('click', () => {
      var panel = document.getElementById('ai-panel');
      if (panel && panel.classList.contains('hidden')) {
        state.panelOpen = true;
        panel.classList.remove('hidden');
        var tp = document.getElementById('btn-toggle-panel');
        if (tp) tp.setAttribute('aria-expanded', 'true');
      }
      switchTab('isl');
    });
  }

  function initAvatarAnimator() {
    if (!window.AvatarAnimator || !window.THREE) {
      console.error('[ISL] Three.js or AvatarAnimator not loaded');
      return;
    }
    animator = new window.AvatarAnimator({
      canvasId: 'islAvatarCanvas',
      onHighlight: updateHighlight,
      onComplete: () => setISLStatus('idle'),
    });
    animator.init();
  }

  function setISLStatus(s) {
    islStatus = s;
    if (btnExplain) btnExplain.hidden = (s === 'signing');
    if (btnStop) btnStop.hidden = (s !== 'signing');
    if (btnExplain) btnExplain.disabled = (s === 'loading');
    if (s === 'loading') {
      if (btnExplain) btnExplain.textContent = 'Analyzing…';
    } else if (s === 'idle' || s === 'error') {
      if (btnExplain) btnExplain.textContent = 'Explain this Page';
    }
  }

  function updateHighlight(count) {
    if (!islSummaryP) return;
    var words = islSummaryP.querySelectorAll('.isl-word');
    for (var i = 0; i < words.length; i++) words[i].classList.toggle('hl', i < count);
    if (count > 0 && words[count - 1]) {
      words[count - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  if (btnExplain) {
    btnExplain.addEventListener('click', async () => {
      if (islStatus === 'loading') return;
      var domText = '';
      try { domText = JSON.stringify(await getPageContext(true)); } catch (_) { }
      if (!domText) {
        if (islError) { islError.textContent = 'No content found.'; islError.hidden = false; setTimeout(() => { islError.hidden = true; }, 3000); }
        return;
      }
      setISLStatus('loading');
      if (islSummary) islSummary.hidden = true;
      if (islSummaryP) islSummaryP.innerHTML = '';
      if (islError) islError.hidden = true;
      try {
        var summary = await window.ISL_LLM.analyzeForm(domText, state.url);
        var gloss = await window.ISL_LLM.convertToGloss(summary);
        var words = summary.trim().split(/\s+/).filter(Boolean);
        if (islSummaryP) islSummaryP.innerHTML = words.map((w, i) =>
          `<span class="isl-word" data-word-idx="${i}">${escHtml(w)} </span>`
        ).join('');
        if (islSummary) islSummary.hidden = false;
        setISLStatus('signing');
        if (animator) animator.signWithCaptions(gloss, summary);
      } catch (err) {
        if (islError) { islError.textContent = err.message || 'Failed to analyze page'; islError.hidden = false; }
        setISLStatus('error');
        setTimeout(() => { setISLStatus('idle'); if (islError) islError.hidden = true; }, 4000);
      }
    });
  }

  if (btnStop) btnStop.addEventListener('click', () => { if (animator) animator.stop(); setISLStatus('idle'); });
  if (islBotXbot) islBotXbot.addEventListener('click', () => { islBotXbot.classList.add('active'); if (islBotYbot) islBotYbot.classList.remove('active'); if (animator) animator.setBot('xbot'); });
  if (islBotYbot) islBotYbot.addEventListener('click', () => { islBotYbot.classList.add('active'); if (islBotXbot) islBotXbot.classList.remove('active'); if (animator) animator.setBot('ybot'); });
  if (islSpeedSlider) islSpeedSlider.addEventListener('input', e => { if (animator) animator.setSpeed(parseFloat(e.target.value)); });

  // Groq key settings
  var btnSaveGroq = document.getElementById('btn-save-groq-key');
  var inputGroqKey = document.getElementById('input-groq-key');
  var linkGroq = document.getElementById('link-groq');

  if (btnSaveGroq && inputGroqKey) {
    btnSaveGroq.addEventListener('click', async () => {
      var key = inputGroqKey.value.trim();
      if (!key || key.startsWith('•')) return;
      if (window.electronAPI && window.electronAPI.setGroqKey) await window.electronAPI.setGroqKey(key);
      var st = document.getElementById('api-status');
      if (st) { st.textContent = '✓ Groq key saved.'; st.className = 'api-status ok'; setTimeout(() => { st.textContent = ''; }, 2000); }
    });
  }
  if (linkGroq) linkGroq.addEventListener('click', e => { e.preventDefault(); if (window.electronAPI) window.electronAPI.openExternal('https://console.groq.com'); });

  (async () => {
    if (!window.electronAPI || !window.electronAPI.getGroqKey) return;
    var key = await window.electronAPI.getGroqKey();
    if (inputGroqKey && key) inputGroqKey.value = '••••••••••••';
  })();
})();

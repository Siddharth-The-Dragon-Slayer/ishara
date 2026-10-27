'use strict';

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

// Load environment variables
const configPath = process.env.ISHAARA_CONFIG_PATH || path.join(__dirname, '.env');
try { require('dotenv').config({ path: configPath }); } catch (e) { }
const { saveConfig } = require('./src/config-store');
const setConfig = (name, value) => saveConfig(configPath, name, value);

let mainWindow = null;
let mistralService = null;

// ─── Window Creation ────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,    // <webview> tag
      sandbox: false,   // Needed for webview IPC
      webSecurity: false,   // Allow local file:// asset loading (Three.js models)
    },
    title: 'ZenAI',
    backgroundColor: '#f1f3f4',
    show: false,
    frame: true,
    icon: path.join(__dirname, 'favicon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setMenuBarVisibility(false);
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const MistralService = require('./src/mistral-service');
  mistralService = new MistralService(
    process.env.MISTRAL_API_KEY || '',
    process.env.MISTRAL_MODEL || 'mistral-small-latest'
  );

  // ── Microphone permission — allow for renderer + webview ──────────────
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'videoCapture', 'notifications', 'microphone'];
    callback(allowed.includes(permission));
  });

  // Synchronous permission check (needed for SpeechRecognition in renderer)
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const allowed = ['media', 'audioCapture', 'videoCapture', 'microphone'];
    return allowed.includes(permission);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// Query Mistral AI
ipcMain.handle('mistral:query', async (_event, { command, pageContext, history }) => {
  try {
    if (!mistralService || !mistralService.hasApiKey()) {
      return { success: false, error: 'No Mistral API key configured. Open Settings to add your key.' };
    }
    const data = await mistralService.processCommand(command, pageContext, history || []);
    return { success: true, data };
  } catch (err) {
    console.error('[Mistral Error]', err.message);
    return { success: false, error: err.message };
  }
});

// Config
ipcMain.handle('config:getApiKey', () => process.env.MISTRAL_API_KEY || '');
ipcMain.handle('config:setApiKey', (_event, key) => {
  key = setConfig('MISTRAL_API_KEY', key);
  if (mistralService) mistralService.updateApiKey(key);
  return true;
});
ipcMain.handle('config:getModel', () => process.env.MISTRAL_MODEL || 'mistral-small-latest');
ipcMain.handle('config:setModel', (_event, model) => {
  model = setConfig('MISTRAL_MODEL', model);
  if (mistralService) mistralService.setModel(model);
  return true;
});

// Groq API (ISL Co-Pilot)
ipcMain.handle('isl:groqQuery', async (_event, prompt) => {
  try {
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) return { success: false, error: 'No Groq API key configured.' };
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 512,
      }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); return { success: false, error: err?.error?.message || `Groq API error ${res.status}` }; }
    const data = await res.json();
    return { success: true, data: (data.choices?.[0]?.message?.content ?? '').trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('config:getGroqKey', () => process.env.GROQ_API_KEY || '');
ipcMain.handle('config:setGroqKey', (_event, key) => { setConfig('GROQ_API_KEY', key); return true; });

// ─── Groq Whisper STT ───────────────────────────────────────────────────────
// Fallback speech-to-text using Groq's Whisper API
ipcMain.handle('groq:whisper', async (_event, { audioBase64, mimeType }) => {
  try {
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) return { success: false, error: 'No Groq API key configured.' };

    // Groq Whisper API expects multipart/form-data with audio file
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    // Create form data
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), 'audio.webm');
    form.append('model', 'whisper-large-v3');
    form.append('language', 'en'); // or 'hi' for Hindi
    form.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.error?.message || `Groq Whisper error ${res.status}` };
    }

    const data = await res.json();
    const transcript = data.text || '';
    
    return { success: true, transcript: transcript.trim() };
  } catch (err) {
    console.error('[Groq Whisper Error]', err.message);
    return { success: false, error: err.message };
  }
});

// ─── Sarvam AI TTS ──────────────────────────────────────────────────────────
// Uses Sarvam AI Bulbul model (free credits on signup at sarvam.ai)
ipcMain.handle('tts:speak', async (_event, { text, lang, rate }) => {
  try {
    const apiKey = process.env.SARVAM_API_KEY || '';
    if (!apiKey) {
      return { success: false, error: 'No Sarvam API key. Get free credits at sarvam.ai' };
    }

    const cleanText = String(text || '')
      .replace(/[<>&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    if (!cleanText) return { success: false, error: 'Empty text' };

    const targetLang = lang || 'hi-IN';

    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        inputs: [cleanText],
        target_language_code: targetLang,
        speaker: 'ritu',
        model: 'bulbul:v3',
        pace: rate || 1.0,
        enable_preprocessing: true,
        sample_rate: 32000,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.message || err?.error?.message || `Sarvam API error ${res.status}` };
    }

    const data = await res.json();
    const audioBase64 = data?.audios?.[0];

    if (!audioBase64) {
      return { success: false, error: 'Sarvam TTS returned no audio data' };
    }

    return { success: true, data: audioBase64 };
  } catch (err) {
    const errMsg = err?.message || String(err) || 'Unknown TTS error';
    console.error('[Sarvam TTS Error]', errMsg);
    return { success: false, error: errMsg };
  }
});

// Sarvam config
ipcMain.handle('config:getSarvamKey', () => process.env.SARVAM_API_KEY || '');
ipcMain.handle('config:setSarvamKey', (_event, key) => { setConfig('SARVAM_API_KEY', key); return true; });

// ─── AssemblyAI Streaming STT ───────────────────────────────────────────────
// Real-time streaming via WebSocket
const WebSocket = require('ws');

let assemblyWs = null;  // active WebSocket connection
let assemblyBusy = false; // prevents double-open

ipcMain.handle('stt:startStream', async (_event, { sampleRate } = {}) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY || '';
  if (!apiKey) {
    return { success: false, error: 'No AssemblyAI API key. Add ASSEMBLYAI_API_KEY to your .env file.' };
  }

  if (assemblyWs && assemblyWs.readyState === WebSocket.OPEN) {
    return { success: true }; // already connected
  }

  const rate = sampleRate || 16000;

  try {
    console.log('[AssemblyAI] Requesting temporary token...');
    
    // Step 1: Get temporary token from AssemblyAI
    const tokenResponse = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ expires_in: 3600 })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[AssemblyAI] Token request failed:', tokenResponse.status, errorText);
      return { 
        success: false, 
        error: `Failed to get AssemblyAI token: ${tokenResponse.status} - ${errorText}` 
      };
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;
    
    if (!token) {
      console.error('[AssemblyAI] No token in response:', tokenData);
      return { success: false, error: 'No token received from AssemblyAI' };
    }

    console.log('[AssemblyAI] Token received, connecting to WebSocket...');

    // Step 2: Connect to WebSocket with token
    const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${rate}&token=${token}`;

    assemblyWs = new WebSocket(wsUrl);
    assemblyBusy = true;

    assemblyWs.on('open', () => {
      console.log('[AssemblyAI] WebSocket connected successfully');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stt:status', { type: 'connected' });
      }
    });

    assemblyWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log('[AssemblyAI] Message received:', msg.message_type || msg.type);
        // msg.message_type: 'FinalTranscript' | 'PartialTranscript' | 'SessionBegins' | 'SessionTerminated'
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('stt:transcript', msg);
        }
      } catch (e) { 
        console.warn('[AssemblyAI] parse error', e.message);
      }
    });

    assemblyWs.on('error', (err) => {
      console.error('[AssemblyAI WS Error]', err.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stt:status', { type: 'error', message: err.message });
      }
    });

    assemblyWs.on('close', (code, reason) => {
      console.log('[AssemblyAI] WebSocket closed', code, reason?.toString());
      assemblyWs = null;
      assemblyBusy = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stt:status', { type: 'closed' });
      }
    });

    return { success: true };
  } catch (err) {
    console.error('[AssemblyAI] Connection error:', err);
    assemblyBusy = false;
    return { success: false, error: err.message };
  }
});

// Audio chunks from renderer — fire-and-forget (ipcMain.on, not handle)
ipcMain.on('stt:audioChunk', (_event, pcmBase64) => {
  if (!assemblyWs || assemblyWs.readyState !== WebSocket.OPEN) return;
  try {
    const buf = Buffer.from(pcmBase64, 'base64');
    // AssemblyAI v2 expects base64-encoded JSON messages
    const audioMessage = JSON.stringify({ audio_data: pcmBase64 });
    assemblyWs.send(audioMessage);
  } catch (e) {
    console.warn('[AssemblyAI] send error', e.message);
  }
});

ipcMain.handle('stt:stopStream', async () => {
  if (assemblyWs) {
    try {
      // AssemblyAI v2 termination - just close the connection
      if (assemblyWs.readyState === WebSocket.OPEN) {
        assemblyWs.send(JSON.stringify({ terminate_session: true }));
      }
      assemblyWs.close();
    } catch (e) { /* ignore */ }
    assemblyWs = null;
    assemblyBusy = false;
  }
  return { success: true };
});

ipcMain.handle('stt:forceEndpoint', async () => {
  if (assemblyWs && assemblyWs.readyState === WebSocket.OPEN) {
    try {
      // Force end of utterance for v2 API
      assemblyWs.send(JSON.stringify({ force_end_utterance: true }));
    } catch (e) { /* ignore */ }
  }
  return { success: true };
});


// AssemblyAI config
ipcMain.handle('config:getAssemblyKey', () => process.env.ASSEMBLYAI_API_KEY || '');
ipcMain.handle('config:setAssemblyKey', (_event, key) => { setConfig('ASSEMBLYAI_API_KEY', key); return true; });

// ─── Gemini STT Fallback ─────────────────────────────────────────────────────
// Used when AssemblyAI returns nothing — uploads full audio blob for transcription
ipcMain.handle('stt:transcribe', async (_event, { audioBase64, mimeType }) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return { success: false, error: 'No Gemini API key configured (GEMINI_API_KEY in .env).' };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType || 'audio/webm', data: audioBase64 } },
          { text: 'Transcribe exactly what was spoken in this audio. Return only the transcript, nothing else.' },
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.error?.message || `Gemini error ${res.status}` };
    }

    const data = await res.json();
    const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!transcript) return { success: false, error: 'Gemini returned no transcript.' };
    return { success: true, transcript };
  } catch (err) {
    return { success: false, error: err.message };
  }
});



// ─── Web Search — Tavily (primary) with DuckDuckGo fallback ─────────────────
ipcMain.handle('search:web', async (_event, { query, maxResults }) => {
  const max = maxResults || 5;

  // 1. Try Tavily if key is set
  const tavilyKey = process.env.TAVILY_API_KEY || '';
  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tavilyKey}` },
        body: JSON.stringify({ query, max_results: max, include_answer: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []).map(r => ({
          title: r.title, snippet: r.content, url: r.url,
        }));
        return { success: true, results, answer: data.answer || '' };
      }
    } catch (e) {
      console.warn('[Tavily Search failed, falling back to DDG]', e.message);
    }
  }

  // 2. DuckDuckGo fallback (no key needed)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IshaaraBrowser/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { success: false, error: `Search API error ${res.status}` };
    const data = await res.json();

    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL });
    }
    (data.RelatedTopics || []).slice(0, max - results.length).forEach(t => {
      if (t.Text && t.FirstURL) results.push({ title: t.Text.slice(0, 80), snippet: t.Text, url: t.FirstURL });
    });

    return { success: true, results, answer: data.AbstractText || '' };
  } catch (err) {
    console.error('[Search Error]', err.message);
    return { success: false, error: err.message };
  }
});

// Tavily config
ipcMain.handle('config:getTavilyKey', () => process.env.TAVILY_API_KEY || '');
ipcMain.handle('config:setTavilyKey', (_event, key) => { setConfig('TAVILY_API_KEY', key); return true; });

// Shell
ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url));

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

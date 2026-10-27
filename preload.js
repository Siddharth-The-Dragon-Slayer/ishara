'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Mistral AI ──────────────────────────────────────────────────────────
  queryMistral: (data) => ipcRenderer.invoke('mistral:query', data),

  // ── Configuration ───────────────────────────────────────────────────────
  getApiKey: () => ipcRenderer.invoke('config:getApiKey'),
  setApiKey: (key) => ipcRenderer.invoke('config:setApiKey', key),
  getModel: () => ipcRenderer.invoke('config:getModel'),
  setModel: (model) => ipcRenderer.invoke('config:setModel', model),

  // ── Groq (ISL Co-Pilot) ─────────────────────────────────────────────────
  groqQuery: (prompt) => ipcRenderer.invoke('isl:groqQuery', prompt),
  groqWhisper: (opts) => ipcRenderer.invoke('groq:whisper', opts),
  getGroqKey: () => ipcRenderer.invoke('config:getGroqKey'),
  setGroqKey: (key) => ipcRenderer.invoke('config:setGroqKey', key),

  // ── Sarvam AI TTS (Indian language voices, free credits) ──────────────────
  speakSarvam: (opts) => ipcRenderer.invoke('tts:speak', opts),

  // ── Web Search (Tavily primary, DuckDuckGo fallback) ────────────────────
  searchWeb: (opts) => ipcRenderer.invoke('search:web', opts),
  getTavilyKey: () => ipcRenderer.invoke('config:getTavilyKey'),
  setTavilyKey: (key) => ipcRenderer.invoke('config:setTavilyKey', key),
  getSarvamKey: () => ipcRenderer.invoke('config:getSarvamKey'),
  setSarvamKey: (key) => ipcRenderer.invoke('config:setSarvamKey', key),

  // ── AssemblyAI Universal Streaming STT ──────────────────────────────────
  startSttStream: () => ipcRenderer.invoke('stt:startStream'),
  stopSttStream: () => ipcRenderer.invoke('stt:stopStream'),
  forceEndpoint: () => ipcRenderer.invoke('stt:forceEndpoint'),
  sendAudioChunk: (pcmBase64) => ipcRenderer.send('stt:audioChunk', pcmBase64),
  onSttTranscript: (cb) => ipcRenderer.on('stt:transcript', (_e, msg) => cb(msg)),
  onSttStatus: (cb) => ipcRenderer.on('stt:status', (_e, msg) => cb(msg)),
  offSttTranscript: () => ipcRenderer.removeAllListeners('stt:transcript'),
  offSttStatus: () => ipcRenderer.removeAllListeners('stt:status'),
  getAssemblyKey: () => ipcRenderer.invoke('config:getAssemblyKey'),
  setAssemblyKey: (key) => ipcRenderer.invoke('config:setAssemblyKey', key),


  // ── Gemini STT Fallback ─────────────────────────────────────────────────
  transcribeSpeech: (opts) => ipcRenderer.invoke('stt:transcribe', opts),


  // ── Shell ───────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ── Window Controls ─────────────────────────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // ── Platform Info ───────────────────────────────────────────────────────
  platform: process.platform,
});

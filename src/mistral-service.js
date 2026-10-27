'use strict';
/**
 * MistralService — wraps the Mistral AI API.
 * Called from the main process only (Node environment).
 */

class MistralService {
  constructor(apiKeyConfig, model = 'mistral-medium-latest') {
    this.apiKeys = (apiKeyConfig || '').split(',').map(k => k.trim()).filter(Boolean);
    this.keyIndex = 0;
    this.model  = model;
    this._client = null;
    this._initClient();
  }

  // ── Client lifecycle ─────────────────────────────────────────────────────

  _initClient() {
    if (this.apiKeys.length === 0) { this._client = null; return; }
    try {
      const { Mistral } = require('@mistralai/mistralai');
      this._client = new Mistral({ apiKey: this.apiKeys[this.keyIndex] });
      console.log(`[MistralService] Started with API Key index ${this.keyIndex} (out of ${this.apiKeys.length})`);
    } catch (e) {
      console.error('[MistralService] Failed to init client:', e.message);
      this._client = null;
    }
  }

  hasApiKey()       { return this.apiKeys.length > 0; }
  
  updateApiKey(keyConfig) { 
    this.apiKeys = (keyConfig || '').split(',').map(k => k.trim()).filter(Boolean);
    this.keyIndex = 0; 
    this._initClient(); 
  }
  
  rotateKey() {
    if (this.apiKeys.length <= 1) return false;
    this.keyIndex = (this.keyIndex + 1) % this.apiKeys.length;
    this._initClient();
    return true;
  }
  setModel(model)   { this.model = model; }

  // ── System Prompt ────────────────────────────────────────────────────────

  _buildSystemPrompt(pageContext) {
    const ctx = pageContext
      ? `## CURRENT PAGE STATE
- **Title**: ${pageContext.title || 'Unknown'}
- **URL**: ${pageContext.url || 'Unknown'}
- **Headings**: ${JSON.stringify((pageContext.headings || []).slice(0, 15))}
- **Interactive elements** (buttons, links, inputs — selectors included): ${JSON.stringify((pageContext.interactive || []).slice(0, 50))}
- **Forms**: ${JSON.stringify((pageContext.forms || []).slice(0, 4))}
- **Images (alt text)**: ${JSON.stringify((pageContext.images || []).slice(0, 8))}
- **Main page text** (first 2500 chars): ${(pageContext.bodyText || '').slice(0, 2500)}`
      : '## CURRENT PAGE STATE\nNo page loaded yet.';

    return `You are **ZenAI**, a warm, proactive browser AI built for people with disabilities. You are an autonomous agent — you can take multi-step actions, search the web, and you FOLLOW THROUGH until tasks are complete.

${ctx}

---

## YOUR RESPONSE FORMAT
Always reply with **valid JSON only** — no extra text, no markdown code blocks:
{
  "speech":       "Short spoken confirmation (1–2 sentences). Tell the user exactly what you are doing right now.",
  "actions":      [],
  "explanation":  "Optional detail shown in chat. Describe what happened, what you found, or what you will do next.",
  "taskComplete": false
}

Set "taskComplete": true ONLY when the task is fully done (page loaded, search complete, form submitted, etc.)

---

## AVAILABLE ACTIONS

### Web Search (use when user asks about something not in page context, or to find a URL)
{"type":"search_web","query":"search query here"}

### Navigation
{"type":"navigate","url":"https://example.com","newTab":true} (Only set "newTab": true if user explicitly asks for "a new tab" or "another tab")
{"type":"navigate","action":"back"}
{"type":"navigate","action":"forward"}
{"type":"navigate","action":"reload"}

### Interaction
{"type":"click","selector":"#css-selector","fallbackText":"visible button text"}
{"type":"type","selector":"#input-id","value":"text to type"}
{"type":"clear_type","selector":"#input-id","value":"text (clears field first)"}
{"type":"submit","selector":"#form-id"}
{"type":"key","selector":"#input-id","key":"Enter"}
{"type":"focus","selector":"#element-id"}

### Scrolling
{"type":"scroll","direction":"down","pixels":400}
{"type":"scroll","direction":"up","pixels":400}
{"type":"scroll_to","selector":"#section-id"}
{"type":"scroll_to_text","text":"Introduction"}

### Page Reading
{"type":"read","selector":"main"}
{"type":"read","selector":"h1"}

### Zoom & Display
{"type":"zoom","factor":1.5}
{"type":"zoom","factor":1.0}

### Accessibility Modifications
{"type":"a11y","setting":"high_contrast","value":true}
{"type":"a11y","setting":"highlight_links","value":true}
{"type":"a11y","setting":"simplify","value":true}
{"type":"a11y","setting":"large_cursor","value":true}
{"type":"a11y","setting":"dyslexia_font","value":true}
{"type":"a11y","setting":"text_spacing","value":true}
{"type":"a11y","setting":"focus_ring","value":true}

---

## AGENT GUIDELINES
1. **Strict DOM Adherence (CRITICAL)**: ONLY interact with elements exactly as their selectors appear in the "**Interactive elements**" list in the page state. DO NOT guess, invent, or hallucinate selectors! If an element isn't in the context list, you cannot click it. Wait for the page state to update.
2. **Interactive & Friendly**: You MUST NOT guess or assume user information that they haven't provided (e.g., calculating age from DOB without being asked, or assuming a caste/category). If required form fields are missing information, proactively ask the user in your \`speech\` and \`explanation\` fields in a friendly and conversational tone.
3. **Dropdown Handling**: When selecting an option from a dropdown (\`<select>\`), look at the \`options\` array in the interactive element context, and use the \`type\` action with \`value\` set to the EXACT text of the option you want to select.
4. **Search & Submit (CRITICAL)**: Whenever you use the "type" action for a search bar, you MUST immediately use a "key" action for "Enter" or a "click" action on the search button to submit it. Never just type and stop.
5. **Video/Link Selection (CRITICAL)**: When playing a video or clicking a link on YouTube:
   - YOU MUST ONLY click on main video results.
   - DO NOT click on "YouTube Shorts" or any element containing "Shorts".
   - DO NOT click on recommended videos, ads, mix playlists or news clips.
   - You MUST NOT click on any video with the ID "UCO4u7NTFS8" (a specific bad despacito mix). NEVER click this link.
   - Carefully read the \`text\` property of the interactive elements and choose the one that EXACTLY matches the user's requested song/video.
6. **Multi-step Proactivity**: If the user asks to "play X" or "search Y", perform all steps (navigate -> type -> enter -> click result). Do not stop halfway.
7. **Use search_web** when: you need a URL you don't know, or user asks about current info not on the screen.
8. **Completion signal**: Once the user's ultimate goal is satisfied (and the final page/video is playing), set "taskComplete": true.
9. **Form filling**: Fill ALL required fields before submitting, but DO NOT guess values if the user hasn't explicitly supplied them. Ask for them!`;
  }

  // ── Main Entry Point ─────────────────────────────────────────────────────

  async processCommand(command, pageContext, history = []) {
    if (!this._client) throw new Error('Mistral client not initialised — check your API key.');

    const systemPrompt = this._buildSystemPrompt(pageContext);

    // Keep the last 12 turns of history to stay within token budget
    const recentHistory = (history || []).slice(-12);

    const messages = [
      { role: 'system',    content: systemPrompt },
      ...recentHistory,
      { role: 'user',      content: command },
    ];

    let retries = this.apiKeys.length;
    while (retries > 0) {
      try {
        const response = await this._client.chat.complete({
          model:          this.model,
          messages,
          responseFormat: { type: 'json_object' },
          temperature:    0.25,
          maxTokens:      1200,
        });

        const raw = response.choices[0].message.content;
        return this._parseJSON(raw);
      } catch (err) {
        if (err.message && String(err.message).includes('429')) {
          console.warn(`[MistralService] 429 Rate Limit hit on key index ${this.keyIndex}.`);
          if (this.rotateKey()) {
            console.log(`[MistralService] Rotated to key index ${this.keyIndex}. Retrying...`);
            retries--;
            continue;
          } else {
            throw new Error('Mistral rate limit exceeded (429). Wait before retrying and check your workspace usage limits in the Mistral console. New keys in the same workspace share its limits.');
          }
        }
        throw err;
      }
    }
    throw new Error('All configured Mistral keys are rate limited (429). Wait before retrying and check their workspace usage limits in the Mistral console.');
  }

  // ── JSON Parsing (with fallback) ─────────────────────────────────────────

  _parseJSON(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      // Try extracting the first JSON object from the string
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (_2) {}
      }
      // Last resort: return a plain speech-only response
      return {
        speech: raw.slice(0, 300),
        actions: [],
        explanation: '',
      };
    }
  }
}

module.exports = MistralService;

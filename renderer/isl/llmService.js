'use strict';
/* ============================================================================
   LLM Service — Groq API integration for ISL analysis.
   Uses Electron IPC to keep API key secure in the main process.
   ============================================================================ */

window.ISL_LLM = {

  // ── Context injection based on URL ─────────────────────────────────────
  getContextForUrl: function(url) {
    if (!url) return '';

    // Pension Forms
    if (url === 'https://nsap.nic.in/apply' || url === 'https://zenai.browser/nsap-pension') {
      return 'FORM CONTEXT — NSAP Old Age Pension Application (ZenAI Browser Demo)\n\n' +
        'This is a demo of the National Social Assistance Programme (NSAP) Old Age Pension application form.\n\n' +
        'SECTIONS:\n' +
        '1. Personal Details: Resident type (Urban/Rural), Pension Type (IGNOAPS/IGNWPS/IGNDPS), Name, Gender, DOB, Father/Husband Name, Mobile.\n' +
        '2. Bank Details: Bank Name, Branch, Account Number, IFSC Code.\n' +
        '3. Documents: Passport Size Photo upload.\n' +
        '4. Declaration: Agree and submit.\n\n' +
        'RULES: Collect one piece of information at a time. Explain IFSC gently.';
    }

    // Caste Certificate
    if (url === 'zenai://wb-caste-certificate' || url === 'https://zenai.browser/caste-certificate') {
      return 'FORM CONTEXT — Maharashtra SC/ST/OBC Caste Certificate Application\n\n' +
        'Official Government of Maharashtra form for caste certificates.\n\n' +
        'SECTIONS: Application to, Application For, Personal details, Documents, Birth details, Address, Nationality, Religion, Gender, Blood relation, Local referees, Migration.\n\n' +
        'RULES: Fields marked * mandatory. State always MAHARASHTRA. Collect one piece at a time.';
    }

    // News Page
    if (url.indexOf('news') !== -1 || url === 'https://zenai.browser/news') {
      return 'CONTEXT: News Portal. Summarize top news stories concisely for a deaf user.';
    }

    // YouTube / Video
    if (url.indexOf('youtube.com') !== -1 || url.indexOf('video') !== -1) {
      return 'CONTEXT: Video Platform. Identify the video title, uploader, and describe player controls.';
    }

    return '';
  },

  // ── Analyze page content via LLM ───────────────────────────────────────
  analyzeForm: async function(formText, url) {
    var context = this.getContextForUrl(url);

    var prompt = 'You are a definitive high-authority accessibility and content interpretation expert. ' +
      'Your mission is to provide an absolute, firm, and precise breakdown of the provided web page data for deaf and hard-of-hearing users.\n\n' +
      (context ? 'ADDITIONAL CONTEXT FOR THIS PAGE:\n"""\n' + context + '\n"""\n\n' : '') +
      'Analyze the provided DOM data below with extreme care. Your summary must be:\n' +
      '1. VERY CONCISE: Provide exactly 2 or 3 short, simple sentences summarizing what the user can do on this page.\n' +
      '2. DOM-BASED: Focus strictly on the extracted DOM elements provided. Explain the interactive elements (buttons, inputs) available.\n' +
      '3. ISL-READY: Use clear, structured, high-density language easy to translate into Gloss.\n\n' +
      'Strict rules:\n- Base analysis ONLY on provided text/context.\n- Output ONLY the final concise summary paragraph.\n\n' +
      'Web page data (DOM Extraction):\n"""\n' + formText + '\n"""\n\nFinal Authoritative Concise Summary:';

    var result = await window.electronAPI.groqQuery(prompt);
    if (!result.success) throw new Error(result.error || 'Groq API error');
    console.log('[ISL-LLM] Summary:', result.data);
    return result.data;
  },

  // ── Convert summary to ISL Gloss ───────────────────────────────────────
  convertToGloss: async function(summary) {
    var prompt = 'Convert the following English sentence into formal ISL (Indian Sign Language) Gloss notation.\n\n' +
      'Formal ISL Grammar Rules to follow:\n' +
      '1. SOV Structure: Reorder sentences to Subject-Object-Verb.\n' +
      '2. Remove Unnecessary Words: Delete articles, linking verbs, prepositions unless critical.\n' +
      '3. WH-Questions: Place WH-words at the VERY END.\n' +
      '4. Pronouns: Use ME instead of I, and YOU / HE / SHE / THEY.\n' +
      '5. Verbs: Use the root form (LEMMA). No gerunds or suffixes.\n' +
      '6. Time: Place time words at the beginning.\n\n' +
      'Vocabulary Guidance:\n' +
      '- Dedicated animations exist for: TIME, HOME, PERSON, YOU, ME.\n' +
      '- Common ISL terms: GO, WANT, NAME, SCHOOL, BANK, HOSPITAL, MONEY, FEEL, GOOD, BAD, WHAT, WHERE.\n' +
      '- Simplify complex words to common roots.\n\n' +
      'Constraints:\n- Maximum 12 words total.\n- Output ONLY Gloss words in UPPERCASE separated by spaces.\n- No punctuation.\n\n' +
      'English: "' + summary + '"\n\nISL Gloss:';

    var result = await window.electronAPI.groqQuery(prompt);
    if (!result.success) throw new Error(result.error || 'Groq API error');
    var gloss = (result.data || '').toUpperCase().trim();
    console.log('[ISL-LLM] Gloss:', gloss);
    return gloss;
  }
};

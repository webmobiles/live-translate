'use strict';

// Google Cloud Translation — stub for future implementation
async function translate(text, sourceLang, targetLang) {
  throw new Error('Google provider not yet configured. Set TRANSLATION_PROVIDER=openai');
}

async function transcribe(audioBase64, mimeType, language) {
  throw new Error('Google provider not yet configured.');
}

module.exports = { translate, transcribe };

export {};

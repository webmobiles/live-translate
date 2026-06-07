'use strict';

const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', zh: 'Chinese (Simplified)',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ru: 'Russian',
  hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
};

async function translate(text, sourceLang, targetLang) {
  const targetName = LANG_NAMES[targetLang] || targetLang;
  return `[${targetName}] ${text}`;
}

async function transcribe() {
  return 'Mock transcription';
}

module.exports = { translate, transcribe };

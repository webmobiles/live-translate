'use strict';

require('dotenv').config();

const PROVIDERS = {
  openai: require('./providers/openai'),
  azure: require('./providers/azure'),
  google: require('./providers/google'),
};

function getProvider() {
  const name = process.env.TRANSLATION_PROVIDER || 'openai';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown translation provider: "${name}". Valid: openai, azure, google`);
  return provider;
}

async function translate(text, sourceLang, targetLang) {
  if (!text?.trim()) return text;
  if (sourceLang === targetLang) return text;
  return getProvider().translate(text, sourceLang, targetLang);
}

async function transcribe(audioBase64, mimeType, language) {
  return getProvider().transcribe(audioBase64, mimeType, language);
}

module.exports = { translate, transcribe };

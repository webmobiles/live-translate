'use strict';

require('dotenv').config();

const PROVIDERS = {
  none: require('./providers/none'),
  mock: require('./providers/mock'),
  'openai-realtime': require('./providers/openaiRealtime'),
};

function getProviderName() {
  return (process.env.VOICE_TRANSLATION_PROVIDER || 'none').trim().toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown VOICE_TRANSLATION_PROVIDER: "${name}". Valid: none, mock, openai-realtime`);
  return provider;
}

async function translateVoice(audioBase64, mimeType, sourceLang, targetLangs, options = {}) {
  return getProvider().translateVoice(audioBase64, mimeType, sourceLang, targetLangs, options);
}

module.exports = { translateVoice };

'use strict';

require('dotenv').config();

const PROVIDERS = {
  openai: require('./providers/openai'),
  mock: require('./providers/mock'),
  'faster-whisper': require('./providers/fasterWhisper'),
  vosk: require('./providers/vosk'),
};

function getProviderName() {
  return (process.env.STT_PROVIDER || 'openai').trim().toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown STT_PROVIDER: "${name}". Valid: openai, mock, faster-whisper, vosk`);
  }
  return provider;
}

async function transcribe(audioBase64, mimeType, language) {
  return getProvider().transcribe(audioBase64, mimeType, language);
}

module.exports = { transcribe };

export {};

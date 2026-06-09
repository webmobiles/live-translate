'use strict';

require('dotenv').config();

const PROVIDERS = {
  none: require('./providers/none'),
  mock: require('./providers/mock'),
  openai: require('./providers/openai'),
  local: require('./providers/local'),
};

function getProviderName() {
  return (process.env.TTS_PROVIDER || 'none').trim().toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown TTS_PROVIDER: "${name}". Valid: none, mock, openai, local`);
  return provider;
}

async function synthesize(text, language, options = {}) {
  return getProvider().synthesize(text, language, options);
}

module.exports = { synthesize };

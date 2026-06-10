'use strict';

require('dotenv').config();

const PROVIDERS = {
  openai: require('../providers/openai'),
  azure: require('../providers/azure'),
  google: require('../providers/google'),
  mock: require('../providers/mock'),
};

function envFlag(name) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
}

function getProviderName() {
  const name = process.env.TRANSLATION_PROVIDER || 'openai';
  if (name === 'mock' && envFlag('FORCE_AI_TRANSLATION')) return 'openai';
  return name;
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown translation provider: "${name}". Valid: openai, azure, google, mock`);
  return provider;
}

async function translate(text, sourceLang, targetLang) {
  if (!text?.trim()) return text;
  if (sourceLang === targetLang) return text;
  return getProvider().translate(text, sourceLang, targetLang);
}

module.exports = { translate };

export {};

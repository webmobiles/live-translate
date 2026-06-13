import * as openaiProvider from '../providers/openai';
import * as azureProvider from '../providers/azure';
import * as googleProvider from '../providers/google';
import * as mockProvider from '../providers/mock';

const PROVIDERS: Record<string, { translate: (...args: any[]) => Promise<string> }> = {
  openai: openaiProvider,
  azure: azureProvider,
  google: googleProvider,
  mock: mockProvider,
};

function envFlag(name: string) {
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

export async function translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!text?.trim()) return text;
  if (sourceLang === targetLang) return text;
  return getProvider().translate(text, sourceLang, targetLang);
}

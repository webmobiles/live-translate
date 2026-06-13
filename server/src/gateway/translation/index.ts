import * as ollamaProvider from '../providers/ollama';
import * as openaiProvider from '../providers/openai';
import * as azureProvider from '../providers/azure';
import * as googleProvider from '../providers/google';
import * as mockProvider from '../providers/mock';

const PROVIDERS: Record<string, { translate: (...args: any[]) => Promise<string> }> = {
  ollama: ollamaProvider,
  openai: openaiProvider,
  azure: azureProvider,
  google: googleProvider,
  mock: mockProvider,
};

function envFlag(name: string) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
}

function getProviderName() {
  const name = process.env.TRANSLATION_PROVIDER || 'ollama';
  if (name === 'mock' && envFlag('FORCE_AI_TRANSLATION')) return 'ollama';
  return name;
}

// provider arg overrides the env var — used when room config specifies a user-facing choice.
function getProvider(provider?: string) {
  const name = provider || getProviderName();
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown translation provider: "${name}". Valid: openai, ollama`);
  return p;
}

export async function translate(text: string, sourceLang: string, targetLang: string, provider?: string): Promise<string> {
  if (!text?.trim()) return text;
  if (sourceLang === targetLang) return text;
  return getProvider(provider).translate(text, sourceLang, targetLang);
}

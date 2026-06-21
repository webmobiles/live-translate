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

function getProviderName() {
  // First entry of TRANSLATION_PROVIDERS is the default/active provider.
  return (process.env.TRANSLATION_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)[0] || '';
}

// provider arg overrides the env var — used when room config specifies a user-facing choice.
function getProvider(provider?: string) {
  const name = provider || getProviderName();
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown translation provider: "${name}". Configured TRANSLATION_PROVIDERS="${process.env.TRANSLATION_PROVIDERS || ''}".`);
  return p;
}

export async function translate(text: string, sourceLang: string, targetLang: string, provider?: string): Promise<string> {
  if (!text?.trim()) return text;
  if (sourceLang === targetLang) return text;
  return getProvider(provider).translate(text, sourceLang, targetLang);
}

import * as noneVT from './providers/none';
import * as mockVT from './providers/mock';
import * as openaiRealtime from './providers/openaiRealtime';

const PROVIDERS: Record<string, { translateVoice: (...args: any[]) => Promise<any> }> = {
  none: noneVT,
  mock: mockVT,
  'openai-realtime': openaiRealtime,
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

export async function translateVoice(audioBase64: string, mimeType: string, sourceLang: string, targetLangs: string[], options = {}): Promise<any> {
  return getProvider().translateVoice(audioBase64, mimeType, sourceLang, targetLangs, options);
}

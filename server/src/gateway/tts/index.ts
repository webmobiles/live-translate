import * as noneTts from './providers/none';
import * as mockTts from './providers/mock';
import * as openaiTts from './providers/openai';
import * as localTts from './providers/local';
import * as kokoroHttpTts from './providers/kokoroHttp';
import * as piperHttpTts from './providers/piperHttp';
import * as hybridTts from './providers/hybrid';

const PROVIDERS: Record<string, { synthesize: (...args: any[]) => Promise<any> }> = {
  none: noneTts,
  mock: mockTts,
  openai: openaiTts,
  local: localTts,
  kokoro: kokoroHttpTts,
  piper: piperHttpTts,
  hybrid: hybridTts,
};

function getProviderName() {
  return (process.env.TTS_PROVIDER || 'none').trim().toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown TTS_PROVIDER: "${name}". Valid: none, mock, openai, local, kokoro, piper, hybrid`);
  return provider;
}

export async function synthesize(text: string, language: string, options = {}): Promise<any> {
  return getProvider().synthesize(text, language, options);
}

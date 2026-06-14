import * as openaiStt from './providers/openai';
import * as mockStt from './providers/mock';
import * as fasterWhisper from './providers/fasterWhisper';
import * as fasterWhisperHttp from './providers/fasterWhisperHttp';
import * as vosk from './providers/vosk';

const PROVIDERS: Record<string, { transcribe: (...args: any[]) => Promise<string> }> = {
  openai: openaiStt,
  mock: mockStt,
  'faster-whisper': fasterWhisper,
  'faster-whisper-http': fasterWhisperHttp,
  vosk,
};

function getProviderName() {
  return (process.env.STT_PROVIDER || 'openai').trim().toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown STT_PROVIDER: "${name}". Valid: openai, mock, faster-whisper, faster-whisper-http, vosk`);
  }
  return provider;
}

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  return getProvider().transcribe(audioBase64, mimeType, language);
}

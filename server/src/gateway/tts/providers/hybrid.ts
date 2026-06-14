// Hybrid TTS: routes to Kokoro for its supported languages (en/es/fr/hi/it/ja/pt/zh),
// falls back to Piper for everything else (de/ru/nl/pl/tr/cs/uk/ar/…).
// Both services must be running; set TTS_PROVIDER=hybrid in .env.

import * as kokoro from './kokoroHttp';
import * as piper from './piperHttp';

export async function synthesize(text: string, language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string } | null> {
  const kokoroResult = await kokoro.synthesize(text, language, options).catch(() => null);
  if (kokoroResult) return kokoroResult;
  return piper.synthesize(text, language, options).catch(() => null);
}

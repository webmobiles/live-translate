// Hybrid TTS: Kokoro → Piper → OpenAI, in that order.
// Kokoro handles en/es/fr/hi/it/ja/pt/zh (returns null for others).
// Piper handles de/ru/nl/pl/tr/cs/uk/ar/… (returns null for unknown voices).
// OpenAI catches anything neither local provider covers (e.g. Korean).

import * as kokoro from './kokoroHttp';
import * as piper from './piperHttp';
import * as openai from './openai';

export async function synthesize(text: string, language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string } | null> {
  const kokoroResult = await kokoro.synthesize(text, language, options).catch(() => null);
  if (kokoroResult) return kokoroResult;

  const piperResult = await piper.synthesize(text, language, options).catch(() => null);
  if (piperResult) return piperResult;

  return openai.synthesize(text, language, options);
}

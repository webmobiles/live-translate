/**
 * AI Façade
 *
 * Single point of access for all AI provider calls.
 * Business code never imports openai, azure, or google SDKs directly.
 * Switching providers or adding a new one only touches src/gateway/.
 */

import * as translation from './translation';
import * as sttFacade from './stt';
import * as tts from './tts';
import * as voiceTranslation from './voiceTranslation';

/**
 * Translate text from one language to another.
 * Returns the translated string.
 */
export async function translate(text: string, fromLang: string, toLang: string): Promise<string> {
  return translation.translate(text, fromLang, toLang);
}

/**
 * Transcribe base64-encoded audio to text.
 * Returns the transcribed string.
 */
export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  return sttFacade.transcribe(audioBase64, mimeType, language);
}

export const synthesize = tts.synthesize;
export const translateVoice = voiceTranslation.translateVoice;

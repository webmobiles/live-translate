export async function translateVoice(): Promise<never> {
  throw new Error('Direct voice translation is disabled. Set VOICE_TRANSLATION_PROVIDER or use stt-text-translate.');
}

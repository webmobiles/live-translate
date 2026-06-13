import * as openaiProvider from '../../providers/openai';

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  return openaiProvider.transcribe(audioBase64, mimeType, language);
}

import * as gateway from '../gateway/stt';

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  return gateway.transcribe(audioBase64, mimeType, language);
}

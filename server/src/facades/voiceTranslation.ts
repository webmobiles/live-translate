import * as gateway from '../gateway/voiceTranslation';

export async function translateVoice(audioBase64: string, mimeType: string, sourceLang: string, targetLangs: string[], options = {}): Promise<any> {
  return gateway.translateVoice(audioBase64, mimeType, sourceLang, targetLangs, options);
}

import * as gateway from '../gateway/tts';

export async function synthesize(text: string, language: string, options = {}): Promise<any> {
  return gateway.synthesize(text, language, options);
}

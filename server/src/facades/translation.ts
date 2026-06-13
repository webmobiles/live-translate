import * as gateway from '../gateway/translation';

export async function translate(text: string, fromLang: string, toLang: string, provider?: string): Promise<string> {
  return gateway.translate(text, fromLang, toLang, provider);
}

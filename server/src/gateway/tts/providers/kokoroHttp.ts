import OpenAI from 'openai';

const DEFAULT_KOKORO_VOICE_BY_LANGUAGE: Record<string, string> = {
  en: 'af_heart',
  es: 'ef_dora',
  fr: 'ff_siwis',
  hi: 'hf_alpha',
  it: 'if_sara',
  ja: 'jf_alpha',
  pt: 'pf_dora',
  zh: 'zf_xiaobei',
};

function getClient() {
  const baseURL = (process.env.KOKORO_BASE_URL || 'http://localhost:8880').replace(/\/+$/, '') + '/v1';
  return new OpenAI({ apiKey: 'kokoro', baseURL });
}

function normalizeLanguage(language: string) {
  return String(language || 'en').toLowerCase().split(/[-_]/)[0] || 'en';
}

function getVoiceForLanguage(language: string, options: any = {}) {
  if (options.voice) return options.voice;

  const lang = normalizeLanguage(language);
  return DEFAULT_KOKORO_VOICE_BY_LANGUAGE[lang]
    || process.env.KOKORO_VOICE
    || DEFAULT_KOKORO_VOICE_BY_LANGUAGE.en;
}

export async function synthesize(text: string, language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string } | null> {
  if (!text?.trim()) return null;

  const responseFormat = options.responseFormat || process.env.TTS_RESPONSE_FORMAT || 'mp3';
  const voice = getVoiceForLanguage(language, options);

  const audio = await getClient().audio.speech.create({
    model: 'kokoro',
    voice: voice as any,
    input: text,
    response_format: responseFormat as any,
  });

  return {
    audioBase64: Buffer.from(await audio.arrayBuffer()).toString('base64'),
    mimeType: responseFormat === 'wav' ? 'audio/wav' : `audio/${responseFormat}`,
  };
}

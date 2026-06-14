import OpenAI from 'openai';

function getClient() {
  const baseURL = (process.env.KOKORO_BASE_URL || 'http://localhost:8880').replace(/\/+$/, '') + '/v1';
  return new OpenAI({ apiKey: 'kokoro', baseURL });
}

export async function synthesize(text: string, _language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string } | null> {
  if (!text?.trim()) return null;

  const responseFormat = options.responseFormat || process.env.TTS_RESPONSE_FORMAT || 'mp3';
  const voice = options.voice || process.env.KOKORO_VOICE || 'af_heart';

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

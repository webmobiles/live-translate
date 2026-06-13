import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', zh: 'Chinese (Simplified)',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ru: 'Russian',
  hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
};

export async function translate(text: string, _sourceLang: string, targetLang: string): Promise<string> {
  const targetName = LANG_NAMES[targetLang] || targetLang;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a professional interpreter. Translate the text to ${targetName}. Return ONLY the translation, no explanations or extra text.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
    max_tokens: 1000,
  });
  return completion.choices[0]?.message?.content?.trim() || text;
}

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  const ext = mimeType?.includes('mp4') || mimeType?.includes('m4a') ? 'm4a'
    : mimeType?.includes('webm') ? 'webm'
    : 'wav';
  const tmpFile = path.join(os.tmpdir(), `lt_audio_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpFile, Buffer.from(audioBase64, 'base64'));

  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: 'whisper-1',
      ...(language ? { language: language.split('-')[0] } : {}),
    });
    return response.text;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

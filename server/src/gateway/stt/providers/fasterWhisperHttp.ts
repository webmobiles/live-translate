import OpenAI, { toFile } from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';

function mimeExt(mimeType: string | undefined) {
  if (mimeType?.includes('mp4') || mimeType?.includes('m4a')) return 'm4a';
  if (mimeType?.includes('webm')) return 'webm';
  if (mimeType?.includes('ogg')) return 'ogg';
  return 'wav';
}

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  const baseURL = (process.env.FASTER_WHISPER_BASE_URL || 'http://localhost:8100').replace(/\/+$/, '');
  const model   = process.env.FASTER_WHISPER_MODEL || 'Systran/faster-whisper-small';

  const client = new OpenAI({ apiKey: 'faster-whisper', baseURL: `${baseURL}/v1` });

  const ext = mimeExt(mimeType);
  const tmp = path.join(os.tmpdir(), `lt_stt_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(tmp, Buffer.from(audioBase64, 'base64'));

  try {
    const file = await toFile(fs.createReadStream(tmp), `audio.${ext}`, { type: mimeType || 'audio/wav' });
    const result = await client.audio.transcriptions.create({
      file,
      model,
      language: language?.split('-')[0] || undefined,
    });
    return result.text?.trim() || '';
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

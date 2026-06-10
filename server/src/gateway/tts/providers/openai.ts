'use strict';

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function synthesize(text, _language, options: any = {}) {
  if (!text?.trim()) return null;

  const responseFormat = options.responseFormat || process.env.TTS_RESPONSE_FORMAT || 'mp3';
  const audio = await openai.audio.speech.create({
    model: process.env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts',
    voice: options.voice || process.env.TTS_OPENAI_VOICE || 'coral',
    input: text,
    response_format: responseFormat,
    ...(process.env.TTS_OPENAI_INSTRUCTIONS ? { instructions: process.env.TTS_OPENAI_INSTRUCTIONS } : {}),
  });

  return {
    audioBase64: Buffer.from(await audio.arrayBuffer()).toString('base64'),
    mimeType: responseFormat === 'wav' ? 'audio/wav' : `audio/${responseFormat}`,
  };
}

module.exports = { synthesize };

export {};

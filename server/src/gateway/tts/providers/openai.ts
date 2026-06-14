import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  hi: 'Hindi',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pl: 'Polish',
  pt: 'Portuguese',
  ru: 'Russian',
  sv: 'Swedish',
  tr: 'Turkish',
  zh: 'Chinese',
};

function normalizeLanguage(language: string) {
  return String(language || 'en').toLowerCase().split(/[-_]/)[0] || 'en';
}

function buildInstructions(language: string) {
  const lang = normalizeLanguage(language);
  const languageName = LANGUAGE_NAMES[lang] || language;
  const languageInstruction = `Speak naturally in ${languageName} (${lang}). Use pronunciation and cadence appropriate for ${languageName}; do not use English pronunciation unless the text is English.`;
  const customInstructions = process.env.TTS_OPENAI_INSTRUCTIONS?.trim();

  return customInstructions
    ? `${customInstructions}\n${languageInstruction}`
    : languageInstruction;
}

export async function synthesize(text: string, language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string } | null> {
  if (!text?.trim()) return null;

  const responseFormat = options.responseFormat || process.env.TTS_RESPONSE_FORMAT || 'mp3';
  const audio = await openai.audio.speech.create({
    model: process.env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts',
    voice: options.voice || process.env.TTS_OPENAI_VOICE || 'coral',
    input: text,
    response_format: responseFormat,
    instructions: buildInstructions(language),
  });

  return {
    audioBase64: Buffer.from(await audio.arrayBuffer()).toString('base64'),
    mimeType: responseFormat === 'wav' ? 'audio/wav' : `audio/${responseFormat}`,
  };
}

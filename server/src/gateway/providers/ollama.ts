import OpenAI from 'openai';

const LANG_NAMES: Record<string, string> = {
  af: 'Afrikaans', ar: 'Arabic', bg: 'Bulgarian', bn: 'Bengali',
  ca: 'Catalan', cs: 'Czech', cy: 'Welsh', da: 'Danish',
  de: 'German', el: 'Greek', en: 'English', es: 'Spanish',
  et: 'Estonian', fa: 'Persian', fi: 'Finnish', fr: 'French',
  gu: 'Gujarati', he: 'Hebrew', hi: 'Hindi', hr: 'Croatian',
  hu: 'Hungarian', id: 'Indonesian', it: 'Italian', ja: 'Japanese',
  kn: 'Kannada', ko: 'Korean', lt: 'Lithuanian', lv: 'Latvian',
  mk: 'Macedonian', ml: 'Malayalam', mr: 'Marathi', ms: 'Malay',
  mt: 'Maltese', nl: 'Dutch', no: 'Norwegian', pa: 'Punjabi',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian',
  sk: 'Slovak', sl: 'Slovenian', sq: 'Albanian', sr: 'Serbian',
  sv: 'Swedish', sw: 'Swahili', ta: 'Tamil', te: 'Telugu',
  th: 'Thai', tl: 'Filipino', tr: 'Turkish', uk: 'Ukrainian',
  ur: 'Urdu', vi: 'Vietnamese', zh: 'Chinese',
};

// Ollama exposes an OpenAI-compatible API — no extra packages needed.
const client = new OpenAI({
  apiKey: 'ollama',
  baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
});

export async function translate(text: string, _sourceLang: string, targetLang: string): Promise<string> {
  const targetName = LANG_NAMES[targetLang] || targetLang;
  const model = process.env.OLLAMA_TRANSLATION_MODEL || 'qwen2.5:7b';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the user's message to ${targetName}. Return ONLY the translated text, with no explanation, prefix, or punctuation added.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.2,
  });

  return completion.choices[0]?.message?.content?.trim() || text;
}

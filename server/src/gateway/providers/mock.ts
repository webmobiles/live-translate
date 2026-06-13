const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', zh: 'Chinese (Simplified)',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', ru: 'Russian',
  hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
};

export async function translate(text: string, _sourceLang: string, targetLang: string): Promise<string> {
  const targetName = LANG_NAMES[targetLang] || targetLang;
  return `[${targetName}] ${text}`;
}

export async function transcribe(): Promise<string> {
  return 'Mock transcription';
}

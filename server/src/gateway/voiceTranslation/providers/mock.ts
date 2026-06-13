export async function translateVoice(
  _audioBase64: string,
  _mimeType: string,
  sourceLang: string,
  targetLangs: string[],
): Promise<{ text: string; translations: Record<string, string>; audioOutputs: Record<string, unknown> }> {
  const text = 'Mock voice translation';
  const translations = Object.fromEntries([
    [sourceLang, text],
    ...targetLangs
      .filter(lang => lang !== sourceLang)
      .map(lang => [lang, `[${lang}] ${text}`]),
  ]);

  return { text, translations, audioOutputs: {} };
}

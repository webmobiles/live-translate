export async function translate(_text: string, _sourceLang: string, _targetLang: string): Promise<string> {
  throw new Error('Google provider not yet configured. Set TRANSLATION_PROVIDER=openai');
}

export async function transcribe(_audioBase64: string, _mimeType: string, _language: string): Promise<string> {
  throw new Error('Google provider not yet configured.');
}

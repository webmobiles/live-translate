export async function synthesize(text: string): Promise<{ audioBase64: string; mimeType: string }> {
  return {
    audioBase64: Buffer.from(`Mock TTS: ${text}`).toString('base64'),
    mimeType: 'text/plain',
  };
}

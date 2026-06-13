import { runLocalCommand } from './localCommand';

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  return runLocalCommand({
    providerName: 'vosk',
    audioBase64,
    mimeType,
    language,
    command: process.env.VOSK_COMMAND || 'vosk-transcribe',
    model: process.env.VOSK_MODEL_PATH || '',
    args: (process.env.VOSK_ARGS
      ? process.env.VOSK_ARGS.split(' ')
      : ['{file}', '--model', '{model}', '--language', '{language}']),
  });
}

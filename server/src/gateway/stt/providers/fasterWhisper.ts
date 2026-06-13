import { runLocalCommand } from './localCommand';

export async function transcribe(audioBase64: string, mimeType: string, language: string): Promise<string> {
  return runLocalCommand({
    providerName: 'faster-whisper',
    audioBase64,
    mimeType,
    language,
    command: process.env.FASTER_WHISPER_COMMAND || 'faster-whisper',
    model: process.env.FASTER_WHISPER_MODEL || 'small',
    args: (process.env.FASTER_WHISPER_ARGS
      ? process.env.FASTER_WHISPER_ARGS.split(' ')
      : ['{file}', '--model', '{model}', '--language', '{language}']),
  });
}

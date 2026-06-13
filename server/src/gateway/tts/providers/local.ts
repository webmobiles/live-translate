import { spawn } from 'child_process';

function splitCommand(value: string) {
  return String(value || '')
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean);
}

function renderArgs(template: string[], values: { text: string; language: string; voice: string }) {
  return template.map(arg => String(arg)
    .replaceAll('{text}', values.text)
    .replaceAll('{language}', values.language || '')
    .replaceAll('{voice}', values.voice || ''));
}

export async function synthesize(text: string, language: string, options: any = {}): Promise<{ audioBase64: string; mimeType: string }> {
  const [bin, ...commandArgs] = splitCommand(process.env.LOCAL_TTS_COMMAND || '');
  if (!bin) throw new Error('LOCAL_TTS_COMMAND is not configured');

  const args = process.env.LOCAL_TTS_ARGS
    ? process.env.LOCAL_TTS_ARGS.split(' ')
    : ['--text', '{text}', '--language', '{language}', '--voice', '{voice}'];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, [
      ...commandArgs,
      ...renderArgs(args, { text, language, voice: options.voice || process.env.LOCAL_TTS_VOICE || '' }),
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`local TTS exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

  return {
    audioBase64: output,
    mimeType: process.env.LOCAL_TTS_MIME_TYPE || 'audio/wav',
  };
}

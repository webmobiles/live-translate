import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

function extensionFromMimeType(mimeType: string | undefined) {
  if (mimeType?.includes('mp4') || mimeType?.includes('m4a')) return 'm4a';
  if (mimeType?.includes('webm')) return 'webm';
  if (mimeType?.includes('ogg')) return 'ogg';
  return 'wav';
}

function renderArgs(template: string[], values: { file: string; language: string; model: string }) {
  return template.map(arg => String(arg)
    .replaceAll('{file}', values.file)
    .replaceAll('{language}', values.language || '')
    .replaceAll('{model}', values.model || ''));
}

function splitCommand(value: string) {
  return String(value || '')
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean);
}

export async function runLocalCommand({ providerName, audioBase64, mimeType, language, command, args, model }: {
  providerName: string;
  audioBase64: string;
  mimeType: string;
  language: string;
  command: string;
  args: string[];
  model: string;
}): Promise<string> {
  const [bin, ...commandArgs] = splitCommand(command);
  if (!bin) throw new Error(`${providerName} command is not configured`);

  const tmpFile = path.join(os.tmpdir(), `lt_stt_${Date.now()}_${Math.random().toString(36).slice(2)}.${extensionFromMimeType(mimeType)}`);
  fs.writeFileSync(tmpFile, Buffer.from(audioBase64, 'base64'));

  try {
    const renderedArgs = [
      ...commandArgs,
      ...renderArgs(args, { file: tmpFile, language: language?.split('-')[0], model }),
    ];

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(bin, renderedArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) {
          reject(new Error(`${providerName} exited with code ${code}: ${stderr.trim()}`));
          return;
        }
        resolve(stdout.trim());
      });
    });

    return output;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

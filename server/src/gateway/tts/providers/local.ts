'use strict';

const { spawn } = require('child_process');

function splitCommand(value) {
  return String(value || '')
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean);
}

function renderArgs(template, values) {
  return template.map(arg => String(arg)
    .replaceAll('{text}', values.text)
    .replaceAll('{language}', values.language || '')
    .replaceAll('{voice}', values.voice || ''));
}

async function synthesize(text, language, options: any = {}) {
  const [bin, ...commandArgs] = splitCommand(process.env.LOCAL_TTS_COMMAND);
  if (!bin) throw new Error('LOCAL_TTS_COMMAND is not configured');

  const args = process.env.LOCAL_TTS_ARGS
    ? process.env.LOCAL_TTS_ARGS.split(' ')
    : ['--text', '{text}', '--language', '{language}', '--voice', '{voice}'];

  const output = await new Promise((resolve, reject) => {
    const child = spawn(bin, [
      ...commandArgs,
      ...renderArgs(args, { text, language, voice: options.voice || process.env.LOCAL_TTS_VOICE }),
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

module.exports = { synthesize };

export {};

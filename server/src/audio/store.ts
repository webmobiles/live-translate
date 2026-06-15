/**
 * Audio file store.
 *
 * Voice messages are no longer round-tripped as base64 over the socket — the
 * original (and translated) audio is written to disk here and recovered on
 * demand via HTTP. Location is configurable with AUDIOS_PATH (default
 * <cwd>/audios, i.e. server/audios when the server is started from server/).
 */
import fs from 'fs';
import path from 'path';

type AudioPayload = { audioBase64?: string; mimeType?: string } | null | undefined;

export function audiosDir(): string {
  const dir = path.resolve(process.env.AUDIOS_PATH || path.join(process.cwd(), 'audios'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extFor(mimeType?: string): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'bin';
}

/** Writes a base64 audio payload to `<name>.<ext>` and returns the filename (no path). */
export function saveAudioFile(payload: AudioPayload, name: string): string | null {
  if (!payload?.audioBase64) return null;
  const file = `${name}.${extFor(payload.mimeType)}`;
  fs.writeFileSync(path.join(audiosDir(), file), Buffer.from(payload.audioBase64, 'base64'));
  return file;
}

/**
 * Persists a voice message's audio: the original under `<msgId>.orig.<ext>` and
 * each translated language under `<msgId>.<lang>.<ext>`. Never throws — a disk
 * failure must not break delivery; it just means there's nothing to recover later.
 */
export function persistMessageAudio(params: {
  msgId: string;
  originalAudio?: AudioPayload;
  audioOutputs?: Record<string, AudioPayload>;
}): { originalAudioFile: string | null; translatedAudioFiles: Record<string, string> } {
  const { msgId, originalAudio, audioOutputs } = params;
  const result = { originalAudioFile: null as string | null, translatedAudioFiles: {} as Record<string, string> };
  try {
    result.originalAudioFile = saveAudioFile(originalAudio, `${msgId}.orig`);
    for (const [lang, payload] of Object.entries(audioOutputs || {})) {
      const file = saveAudioFile(payload, `${msgId}.${lang}`);
      if (file) result.translatedAudioFiles[lang] = file;
    }
  } catch {
    // best-effort; filenames captured so far are still returned
  }
  return result;
}

const MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/m4a',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  bin: 'application/octet-stream',
};

/**
 * Resolves the stored original-audio file for a message id, by its `<msgId>.orig.*`
 * prefix. `msgId` must be a plain id (validate as UUID at the route) — we also
 * basename-guard against path traversal. Returns null if nothing is on disk.
 */
export function findOriginalAudio(msgId: string): { path: string; mimeType: string } | null {
  const prefix = `${path.basename(msgId)}.orig.`;
  const dir = audiosDir();
  let match: string | undefined;
  try {
    match = fs.readdirSync(dir).find((f) => f.startsWith(prefix));
  } catch {
    return null;
  }
  if (!match) return null;
  const ext = match.split('.').pop() || 'bin';
  return { path: path.join(dir, match), mimeType: MIME_BY_EXT[ext] || 'application/octet-stream' };
}

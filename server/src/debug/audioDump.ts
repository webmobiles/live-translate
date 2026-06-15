import fs from 'fs';
import path from 'path';
import { logger } from '../observability/logger';

// Debug-only: dump raw incoming audio to disk so it can be played back and
// inspected (e.g. to tell whether a client is sending real speech or silence).
// Enable with DUMP_AUDIO=1; output dir defaults to <cwd>/audios (i.e. server/audios).

function enabled(): boolean {
  const v = (process.env.DUMP_AUDIO || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function extFor(mimeType: string | undefined): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'bin';
}

function sanitize(s: string): string {
  return (s || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

/**
 * Writes the base64 audio to <DUMP_AUDIO_DIR or cwd/audios> when DUMP_AUDIO is set.
 * Never throws — failures are logged and swallowed so this can't break the pipeline.
 */
export function dumpIncomingAudio(
  audioBase64: string,
  mimeType: string | undefined,
  meta: { source: string; msgId?: string; senderLang?: string } = { source: 'unknown' },
): void {
  if (!enabled() || !audioBase64) return;
  try {
    const dir = process.env.DUMP_AUDIO_DIR || path.join(process.cwd(), 'audios');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = [ts, sanitize(meta.source), sanitize(meta.senderLang || ''), sanitize(meta.msgId || '')]
      .filter(Boolean)
      .join('_');
    const file = path.join(dir, `${name}.${extFor(mimeType)}`);
    const bytes = Buffer.from(audioBase64, 'base64');
    fs.writeFileSync(file, bytes);
    logger.info(
      { event: 'audio.dump.written', file, bytes: bytes.length, mimeType, ...meta },
      'Dumped incoming audio to disk',
    );
  } catch (err) {
    logger.warn({ event: 'audio.dump.failed', err, ...meta }, 'Failed to dump incoming audio');
  }
}

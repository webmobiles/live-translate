/**
 * PostgreSQL provider for the room/message store.
 *
 * A drop-in alternative to the TiKV/Scylla providers that reuses the Postgres
 * you already run for auth — no extra database process. Selected with
 * DB_PROVIDER_ROOM=postgres and configured independently with DB_ROOMS_URL.
 */

import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { normalizeRoomConfig } from '../rooms/config';
import { logger } from '../observability/logger';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function connectionString() {
  const url = process.env.DB_ROOMS_URL;
  if (!url) throw new Error('[postgres] DB_ROOMS_URL is not set');
  return url;
}

function getPool() {
  if (!pool) throw new Error('[postgres] not connected - call connect() first');
  return pool;
}

export async function connect() {
  pool = new Pool({ connectionString: connectionString() });
  await pool.query('SELECT 1');
  await ensureSchema();
  logger.info({ event: 'db.connected', provider: 'postgres' }, 'Postgres (rooms/messages) connected');
}

async function ensureSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id          VARCHAR(36)  PRIMARY KEY,
      code        VARCHAR(16)  NOT NULL UNIQUE,
      name        VARCHAR(255) NOT NULL,
      config      JSONB        NOT NULL DEFAULT '{}'::jsonb,
      created_at  BIGINT       NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      room_id                VARCHAR(36)  NOT NULL,
      "timestamp"            BIGINT       NOT NULL,
      id                     VARCHAR(36)  NOT NULL,
      sender                 VARCHAR(255) NOT NULL,
      sender_lang            VARCHAR(16)  NOT NULL,
      original               TEXT         NOT NULL,
      translations           JSONB        NOT NULL DEFAULT '{}'::jsonb,
      audio_outputs          JSONB        NOT NULL DEFAULT '{}'::jsonb,
      is_audio               BOOLEAN      NOT NULL DEFAULT FALSE,
      original_audio_file    VARCHAR(255),
      translated_audio_files JSONB        NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (room_id, "timestamp", id)
    );

    CREATE INDEX IF NOT EXISTS messages_recent_by_room ON messages (room_id, "timestamp");
  `);
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function createRoom({ code, name, config: roomCfg }: { code: string; name: string; config?: any }) {
  const id = uuidv4();
  const now = Date.now();
  const roomConfig = normalizeRoomConfig(roomCfg);

  await getPool().query(
    `INSERT INTO rooms (id, code, name, config, created_at) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, code, name, JSON.stringify(roomConfig), now],
  );

  return { id, code, name, config: roomConfig, createdAt: now };
}

export async function getRoomByCode(code: string) {
  const { rows } = await getPool().query(
    `SELECT id, code, name, config, created_at FROM rooms WHERE code = $1 LIMIT 1`,
    [code],
  );

  if (!rows.length) return null;
  const row = rows[0];

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    config: normalizeRoomConfig(typeof row.config === 'string' ? JSON.parse(row.config) : row.config),
    createdAt: Number(row.created_at),
  };
}

export async function updateRoomConfig(roomId: string, config: any) {
  await getPool().query(
    `UPDATE rooms SET config = $1::jsonb WHERE id = $2`,
    [JSON.stringify(config), roomId],
  );
  return config;
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, audioOutputs, isAudio, originalAudioFile, translatedAudioFiles }: any) {
  await getPool().query(
    `INSERT INTO messages
       (room_id, "timestamp", id, sender, sender_lang, original, translations, audio_outputs, is_audio, original_audio_file, translated_audio_files)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb)`,
    [
      roomId,
      Date.now(),
      msgId,
      sender,
      senderLang,
      original,
      JSON.stringify(translations || {}),
      JSON.stringify(audioOutputs || {}),
      Boolean(isAudio),
      originalAudioFile ?? null,
      JSON.stringify(translatedAudioFiles || {}),
    ],
  );
}

export async function getRecentMessages(roomId: string, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const { rows } = await getPool().query(
    `SELECT id, room_id, sender, sender_lang, original, translations, audio_outputs, is_audio, original_audio_file, translated_audio_files, "timestamp"
     FROM messages
     WHERE room_id = $1
     ORDER BY "timestamp" DESC, id ASC
     LIMIT $2`,
    [roomId, safeLimit],
  );

  return rows
    .map((row: any) => ({
      id: row.id,
      roomId: row.room_id,
      sender: row.sender,
      senderLang: row.sender_lang,
      original: row.original,
      translations: typeof row.translations === 'string' ? JSON.parse(row.translations) : row.translations || {},
      audioOutputs: typeof row.audio_outputs === 'string' ? JSON.parse(row.audio_outputs) : row.audio_outputs || {},
      isAudio: Boolean(row.is_audio),
      originalAudioFile: row.original_audio_file ?? null,
      translatedAudioFiles: typeof row.translated_audio_files === 'string' ? JSON.parse(row.translated_audio_files) : row.translated_audio_files || {},
      timestamp: Number(row.timestamp),
    }))
    .reverse();
}

export async function addMessageTranslations(roomId: string, msgId: string, timestamp: number, newTranslations: Record<string, string>) {
  // jsonb `||` shallow-merges, right side wins — same effect as MySQL's JSON_MERGE_PATCH here.
  await getPool().query(
    `UPDATE messages SET translations = translations || $1::jsonb WHERE room_id = $2 AND "timestamp" = $3 AND id = $4`,
    [JSON.stringify(newTranslations), roomId, timestamp, msgId],
  );
}

export async function ping() {
  await getPool().query('SELECT 1');
}

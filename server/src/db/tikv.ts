/**
 * TiKV provider through TiDB's MySQL-compatible SQL layer.
 *
 * TiKV is the distributed storage engine; TiDB gives this Node app a stable
 * SQL protocol via mysql2. Direct raw TiKV access from Node is not wired here
 * because TiKV's official stable clients are Go/Java.
 */

import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { normalizeRoomConfig } from '../rooms/config';
import { logger } from '../observability/logger';

let pool: mysql.Pool | null = null;

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function config() {
  return {
    host: process.env.TIKV_SQL_HOST || process.env.TIDB_HOST || 'localhost',
    port: envInt('TIKV_SQL_PORT', envInt('TIDB_PORT', 4000)),
    user: process.env.TIKV_SQL_USER || process.env.TIDB_USER || 'root',
    password: process.env.TIKV_SQL_PASSWORD || process.env.TIDB_PASSWORD || '',
    database: process.env.TIKV_SQL_DATABASE || process.env.TIDB_DATABASE || 'live_translate',
  };
}

function escapeIdentifier(identifier: string) {
  return String(identifier).replace(/`/g, '``');
}

export async function connect() {
  const dbConfig = config();
  const bootstrap = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });

  try {
    await bootstrap.execute(`CREATE DATABASE IF NOT EXISTS \`${escapeIdentifier(dbConfig.database)}\``);
  } finally {
    await bootstrap.end().catch(() => {});
  }

  pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: envInt('TIKV_SQL_CONNECTION_LIMIT', 10),
    namedPlaceholders: false,
  });

  await ensureSchema();
  logger.info({ event: 'db.connected', provider: 'tikv', host: dbConfig.host, port: dbConfig.port, database: dbConfig.database }, 'TiKV connected via TiDB SQL');
}

function getPool() {
  if (!pool) throw new Error('[tikv] not connected - call connect() first');
  return pool;
}

async function ensureSchema() {
  const db = getPool();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS rooms (
      id CHAR(36) PRIMARY KEY,
      code VARCHAR(16) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      config JSON NOT NULL,
      created_at BIGINT NOT NULL
    )
  `);

  try {
    await db.execute('ALTER TABLE rooms ADD COLUMN config JSON NULL');
  } catch (err: any) {
    if (!/Duplicate column/i.test(err.message)) throw err;
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      room_id CHAR(36) NOT NULL,
      timestamp BIGINT NOT NULL,
      id CHAR(36) NOT NULL,
      sender VARCHAR(255) NOT NULL,
      sender_lang VARCHAR(16) NOT NULL,
      original TEXT NOT NULL,
      translations JSON NOT NULL,
      is_audio BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (room_id, timestamp, id),
      INDEX messages_recent_by_room (room_id, timestamp)
    )
  `);
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function createRoom({ code, name, config: roomCfg }: { code: string; name: string; config?: any }) {
  const id = uuidv4();
  const now = Date.now();
  const roomConfig = normalizeRoomConfig(roomCfg);

  await getPool().execute(
    'INSERT INTO rooms (id, code, name, config, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, code, name, JSON.stringify(roomConfig), now],
  );

  return { id, code, name, config: roomConfig, createdAt: now };
}

export async function getRoomByCode(code: string) {
  const [rows]: any = await getPool().execute(
    'SELECT id, code, name, config, created_at FROM rooms WHERE code = ? LIMIT 1',
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
  await getPool().execute(
    'UPDATE rooms SET config = ? WHERE id = ?',
    [JSON.stringify(config), roomId],
  );
  return config;
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, isAudio }: any) {
  await getPool().execute(
    `INSERT INTO messages
       (room_id, timestamp, id, sender, sender_lang, original, translations, is_audio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      roomId,
      Date.now(),
      msgId,
      sender,
      senderLang,
      original,
      JSON.stringify(translations || {}),
      Boolean(isAudio),
    ],
  );
}

export async function getRecentMessages(roomId: string, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const [rows]: any = await getPool().query(
    `SELECT id, room_id, sender, sender_lang, original, translations, is_audio, timestamp
     FROM messages
     WHERE room_id = ?
     ORDER BY timestamp DESC, id ASC
     LIMIT ${safeLimit}`,
    [roomId],
  );

  return rows
    .map((row: any) => ({
      id: row.id,
      roomId: row.room_id,
      sender: row.sender,
      senderLang: row.sender_lang,
      original: row.original,
      translations: typeof row.translations === 'string'
        ? JSON.parse(row.translations)
        : row.translations || {},
      isAudio: Boolean(row.is_audio),
      timestamp: Number(row.timestamp),
    }))
    .reverse();
}

export async function addMessageTranslations(roomId: string, msgId: string, timestamp: number, newTranslations: Record<string, string>) {
  await getPool().execute(
    'UPDATE messages SET translations = JSON_MERGE_PATCH(translations, ?) WHERE room_id = ? AND timestamp = ? AND id = ?',
    [JSON.stringify(newTranslations), roomId, timestamp, msgId],
  );
}

export async function ping() {
  const conn = await getPool().getConnection();
  try { await conn.ping(); } finally { conn.release(); }
}

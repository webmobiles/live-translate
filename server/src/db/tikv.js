'use strict';

/**
 * TiKV provider through TiDB's MySQL-compatible SQL layer.
 *
 * TiKV is the distributed storage engine; TiDB gives this Node app a stable
 * SQL protocol via mysql2. Direct raw TiKV access from Node is not wired here
 * because TiKV's official stable clients are Go/Java.
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

let pool = null;

function envInt(name, fallback) {
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

function escapeIdentifier(identifier) {
  return String(identifier).replace(/`/g, '``');
}

async function connect() {
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
  console.log('[tikv] connected via TiDB SQL');
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
      created_at BIGINT NOT NULL
    )
  `);

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

async function createRoom({ code, name }) {
  const id = uuidv4();
  const now = Date.now();

  await getPool().execute(
    'INSERT INTO rooms (id, code, name, created_at) VALUES (?, ?, ?, ?)',
    [id, code, name, now],
  );

  return { id, code, name, createdAt: now };
}

async function getRoomByCode(code) {
  const [rows] = await getPool().execute(
    'SELECT id, code, name, created_at FROM rooms WHERE code = ? LIMIT 1',
    [code],
  );

  if (!rows.length) return null;
  const row = rows[0];

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    createdAt: Number(row.created_at),
  };
}

async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, isAudio }) {
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

async function getRecentMessages(roomId, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const [rows] = await getPool().query(
    `SELECT id, room_id, sender, sender_lang, original, translations, is_audio, timestamp
     FROM messages
     WHERE room_id = ?
     ORDER BY timestamp DESC, id ASC
     LIMIT ${safeLimit}`,
    [roomId],
  );

  return rows
    .map(row => ({
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

module.exports = { connect, createRoom, getRoomByCode, saveMessage, getRecentMessages };

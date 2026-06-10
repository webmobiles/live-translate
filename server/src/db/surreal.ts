'use strict';

const { Surreal } = require('surrealdb');
const { v4: uuidv4 } = require('uuid');
const { normalizeRoomConfig } = require('../rooms/config');
const { logger } = require('../observability/logger');

let client = null;

function config() {
  return {
    url: process.env.SURREALDB_URL || 'http://localhost:8000/rpc',
    namespace: process.env.SURREALDB_NAMESPACE || 'live_translate',
    database: process.env.SURREALDB_DATABASE || 'live_translate',
    username: process.env.SURREALDB_USERNAME || 'root',
    password: process.env.SURREALDB_PASSWORD || 'root',
  };
}

async function connect() {
  const dbConfig = config();
  client = new Surreal();

  const options: any = {
    namespace: dbConfig.namespace,
    database: dbConfig.database,
  };

  if (dbConfig.username || dbConfig.password) {
    options.authentication = {
      username: dbConfig.username,
      password: dbConfig.password,
    };
  }

  await client.connect(dbConfig.url, options);
  await ensureSchema();
  logger.info({ event: 'db.connected', provider: 'surrealdb', url: dbConfig.url, namespace: dbConfig.namespace, database: dbConfig.database }, 'SurrealDB connected');
}

function getClient() {
  if (!client) throw new Error('[surrealdb] not connected - call connect() first');
  return client;
}

function unwrapQueryResult(result) {
  if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0])) return result[0];
  return result;
}

function normalizeRow(row) {
  if (!row) return row;
  return {
    ...row,
    id: String(row.id).replace(/^.*?:/, ''),
  };
}

async function query(sql, vars = {}) {
  return unwrapQueryResult(await getClient().query(sql, vars).json().collect());
}

async function ensureSchema() {
  await query('DEFINE INDEX IF NOT EXISTS rooms_code ON TABLE rooms FIELDS code UNIQUE;');
  await query('DEFINE INDEX IF NOT EXISTS messages_room_time ON TABLE messages FIELDS room_id, timestamp;');
}

async function createRoom({ code, name, config }) {
  const id = uuidv4();
  const now = Date.now();
  const roomConfig = normalizeRoomConfig(config);
  const rows = await query(
    `CREATE type::thing("rooms", $id)
     SET code = $code,
         name = $name,
         config = $config,
         created_at = $createdAt;`,
    { id, code, name, config: roomConfig, createdAt: now },
  );

  const row = normalizeRow(rows[0]);
  return {
    id,
    code: row?.code || code,
    name: row?.name || name,
    config: normalizeRoomConfig(row?.config),
    createdAt: Number(row?.created_at || now),
  };
}

async function getRoomByCode(code) {
  const rows = await query(
    'SELECT * FROM rooms WHERE code = $code LIMIT 1;',
    { code },
  );
  if (!rows.length) return null;

  const row = normalizeRow(rows[0]);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    config: normalizeRoomConfig(row.config),
    createdAt: Number(row.created_at),
  };
}

async function updateRoomConfig(roomId, config) {
  const roomConfig = normalizeRoomConfig(config);
  await query(
    'UPDATE type::thing("rooms", $id) SET config = $config;',
    { id: roomId, config: roomConfig },
  );
  return roomConfig;
}

async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, isAudio }) {
  await query(
    `CREATE type::thing("messages", $id)
     SET room_id = $roomId,
         timestamp = $timestamp,
         sender = $sender,
         sender_lang = $senderLang,
         original = $original,
         translations = $translations,
         is_audio = $isAudio;`,
    {
      id: msgId,
      roomId,
      timestamp: Date.now(),
      sender,
      senderLang,
      original,
      translations: translations || {},
      isAudio: Boolean(isAudio),
    },
  );
}

async function getRecentMessages(roomId, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const rows = await query(
    `SELECT * FROM messages
     WHERE room_id = $roomId
     ORDER BY timestamp DESC
     LIMIT ${safeLimit};`,
    { roomId },
  );

  return rows
    .map(row => {
      const normalized = normalizeRow(row);
      return {
        id: normalized.id,
        roomId: normalized.room_id,
        sender: normalized.sender,
        senderLang: normalized.sender_lang,
        original: normalized.original,
        translations: normalized.translations || {},
        isAudio: Boolean(normalized.is_audio),
        timestamp: Number(normalized.timestamp),
      };
    })
    .reverse();
}

module.exports = { connect, createRoom, getRoomByCode, updateRoomConfig, saveMessage, getRecentMessages };

export {};

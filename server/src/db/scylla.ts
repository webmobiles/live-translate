'use strict';

const cassandra = require('cassandra-driver');
const { v4: uuidv4 } = require('uuid');
const { normalizeRoomConfig } = require('../rooms/config');

const HOSTS   = (process.env.SCYLLA_HOSTS  || 'localhost').split(',');
const KEYSPACE = process.env.SCYLLA_KEYSPACE || 'live_translate';

let client = null;

async function connect() {
  client = new cassandra.Client({
    contactPoints: HOSTS,
    localDataCenter: 'datacenter1',
    keyspace: KEYSPACE,
    pooling: { coreConnectionsPerHost: { local: 2, remote: 1 } },
  });
  await client.connect();
  await ensureSchema();
  console.log('[scylla] connected');
}

function getClient() {
  if (!client) throw new Error('[scylla] not connected — call connect() first');
  return client;
}

function toNumber(value) {
  return typeof value?.toNumber === 'function' ? value.toNumber() : value;
}

async function ensureSchema() {
  try {
    await client.execute('ALTER TABLE rooms ADD config text');
  } catch (err) {
    if (!/already exists|Invalid column name/i.test(err.message)) throw err;
  }
}

// ── Rooms ──────────────────────────────────────────────────────────────────

async function createRoom({ code, name, config }) {
  const id = uuidv4();
  const now = Date.now();
  const db = getClient();
  const roomConfig = normalizeRoomConfig(config);

  await Promise.all([
    db.execute(
      'INSERT INTO rooms (id, code, name, created_at, config) VALUES (?, ?, ?, ?, ?)',
      [id, code, name, now, JSON.stringify(roomConfig)],
      { prepare: true },
    ),
    db.execute(
      'INSERT INTO rooms_by_code (code, room_id) VALUES (?, ?)',
      [code, id],
      { prepare: true },
    ),
  ]);

  return { id, code, name, config: roomConfig, createdAt: now };
}

async function getRoomByCode(code) {
  const db = getClient();
  const lookup = await db.execute(
    'SELECT room_id FROM rooms_by_code WHERE code = ?',
    [code],
    { prepare: true },
  );
  if (!lookup.rows.length) return null;

  const roomId = lookup.rows[0].room_id;
  const result = await db.execute(
    'SELECT * FROM rooms WHERE id = ?',
    [roomId],
    { prepare: true },
  );
  if (!result.rows.length) return null;

  const row = result.rows[0];
  return {
    id:        row.id.toString(),
    code:      row.code,
    name:      row.name,
    config:    normalizeRoomConfig(row.config ? JSON.parse(row.config) : undefined),
    createdAt: toNumber(row.created_at),
  };
}

async function updateRoomConfig(roomId, config) {
  const roomConfig = normalizeRoomConfig(config);
  await getClient().execute(
    'UPDATE rooms SET config = ? WHERE id = ?',
    [JSON.stringify(roomConfig), roomId],
    { prepare: true },
  );
  return roomConfig;
}

// ── Messages ───────────────────────────────────────────────────────────────

async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, isAudio }) {
  await getClient().execute(
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
      translations,   // map<text,text> — cassandra-driver handles JS objects
      isAudio || false,
    ],
    { prepare: true },
  );
}

// Returns last `limit` messages ordered oldest → newest (good for rendering)
async function getRecentMessages(roomId, limit = 100) {
  const result = await getClient().execute(
    `SELECT * FROM messages
     WHERE room_id = ?
     LIMIT ?`,
    [roomId, limit],
    { prepare: true },
  );

  return result.rows
    .map(row => ({
      id:           row.id.toString(),
      roomId:       row.room_id.toString(),
      sender:       row.sender,
      senderLang:   row.sender_lang,
      original:     row.original,
      translations: row.translations || {},
      isAudio:      row.is_audio,
      timestamp:    toNumber(row.timestamp),
    }))
    .reverse(); // oldest first for chat rendering
}

module.exports = { connect, createRoom, getRoomByCode, updateRoomConfig, saveMessage, getRecentMessages };

export {};

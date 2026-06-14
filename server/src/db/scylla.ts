import cassandra from 'cassandra-driver';
import { v4 as uuidv4 } from 'uuid';
import { normalizeRoomConfig } from '../rooms/config';
import { logger } from '../observability/logger';

const HOSTS   = (process.env.SCYLLA_HOSTS  || 'localhost').split(',');
const KEYSPACE = process.env.SCYLLA_KEYSPACE || 'live_translate';

let client: cassandra.Client | null = null;

export async function connect() {
  client = new cassandra.Client({
    contactPoints: HOSTS,
    localDataCenter: 'datacenter1',
    keyspace: KEYSPACE,
    pooling: { coreConnectionsPerHost: { local: 2, remote: 1 } as any },
  });
  await client.connect();
  await ensureSchema();
  logger.info({ event: 'db.connected', provider: 'scylla', hosts: HOSTS, keyspace: KEYSPACE }, 'ScyllaDB connected');
}

function getClient() {
  if (!client) throw new Error('[scylla] not connected — call connect() first');
  return client;
}

function toNumber(value: any) {
  return typeof value?.toNumber === 'function' ? value.toNumber() : value;
}

async function ensureSchema() {
  try {
    await client!.execute('ALTER TABLE rooms ADD config text');
  } catch (err: any) {
    if (!/already exists|Invalid column name/i.test(err.message)) throw err;
  }
  try {
    await client!.execute('ALTER TABLE messages ADD audio_outputs text');
  } catch (err: any) {
    if (!/already exists|Invalid column name/i.test(err.message)) throw err;
  }
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function createRoom({ code, name, config }: { code: string; name: string; config?: any }) {
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

export async function getRoomByCode(code: string) {
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

export async function updateRoomConfig(roomId: string, config: any) {
  await getClient().execute(
    'UPDATE rooms SET config = ? WHERE id = ?',
    [JSON.stringify(config), roomId],
    { prepare: true },
  );
  return config;
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, audioOutputs, isAudio }: any) {
  await getClient().execute(
    `INSERT INTO messages
       (room_id, timestamp, id, sender, sender_lang, original, translations, audio_outputs, is_audio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      roomId,
      Date.now(),
      msgId,
      sender,
      senderLang,
      original,
      translations,   // map<text,text> — cassandra-driver handles JS objects
      JSON.stringify(audioOutputs || {}),
      isAudio || false,
    ],
    { prepare: true },
  );
}

// Returns last `limit` messages ordered oldest → newest (good for rendering)
export async function getRecentMessages(roomId: string, limit = 100) {
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
      audioOutputs: row.audio_outputs ? JSON.parse(row.audio_outputs) : {},
      isAudio:      row.is_audio,
      timestamp:    toNumber(row.timestamp),
    }))
    .reverse(); // oldest first for chat rendering
}

export async function addMessageTranslations(roomId: string, msgId: string, timestamp: number, newTranslations: Record<string, string>) {
  await getClient().execute(
    'UPDATE messages SET translations = translations + ? WHERE room_id = ? AND timestamp = ? AND id = ?',
    [newTranslations, roomId, timestamp, msgId],
    { prepare: true },
  );
}

export async function ping() {
  await getClient().execute('SELECT now() FROM system.local');
}

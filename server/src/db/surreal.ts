import { Surreal } from 'surrealdb';
import { v4 as uuidv4 } from 'uuid';
import { normalizeRoomConfig } from '../rooms/config';
import { logger } from '../observability/logger';

let client: Surreal | null = null;

function config() {
  return {
    url: process.env.SURREALDB_URL || 'http://localhost:8000/rpc',
    namespace: process.env.SURREALDB_NAMESPACE || 'live_translate',
    database: process.env.SURREALDB_DATABASE || 'live_translate',
    username: process.env.SURREALDB_USERNAME || 'root',
    password: process.env.SURREALDB_PASSWORD || 'root',
  };
}

export async function connect() {
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

function unwrapQueryResult(result: any) {
  if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0])) return result[0];
  return result;
}

function normalizeRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    id: String(row.id).replace(/^.*?:/, ''),
  };
}

async function query(sql: string, vars: Record<string, any> = {}) {
  return unwrapQueryResult(await getClient().query(sql, vars).json().collect());
}

async function ensureSchema() {
  await query('DEFINE INDEX IF NOT EXISTS rooms_code ON TABLE rooms FIELDS code UNIQUE;');
  await query('DEFINE INDEX IF NOT EXISTS messages_room_time ON TABLE messages FIELDS room_id, timestamp;');
}

export async function createRoom({ code, name, config: roomCfg }: { code: string; name: string; config?: any }) {
  const id = uuidv4();
  const now = Date.now();
  const roomConfig = normalizeRoomConfig(roomCfg);
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

export async function getRoomByCode(code: string) {
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

export async function updateRoomConfig(roomId: string, config: any) {
  const roomConfig = normalizeRoomConfig(config);
  await query(
    'UPDATE type::thing("rooms", $id) SET config = $config;',
    { id: roomId, config: roomConfig },
  );
  return roomConfig;
}

export async function saveMessage({ roomId, msgId, sender, senderLang, original, translations, isAudio }: any) {
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

export async function getRecentMessages(roomId: string, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const rows = await query(
    `SELECT * FROM messages
     WHERE room_id = $roomId
     ORDER BY timestamp DESC
     LIMIT ${safeLimit};`,
    { roomId },
  );

  return rows
    .map((row: any) => {
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

export async function addMessageTranslations(_roomId: string, msgId: string, _timestamp: number, newTranslations: Record<string, string>) { // roomId/timestamp not needed — SurrealDB uses record ID
  await query(
    'UPDATE type::thing("messages", $id) SET translations += $extra;',
    { id: msgId, extra: newTranslations },
  );
}

export async function ping() {
  await getClient().query('RETURN true;');
}

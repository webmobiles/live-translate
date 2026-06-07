'use strict';

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// We need two separate clients for the Socket.io adapter:
// one publishes, one subscribes — they can't share the same connection.
function createClient() {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    retryStrategy(times) {
      // Retry with exponential backoff, max 30s between retries
      const delay = Math.min(times * 500, 30_000);
      console.log(`[redis] reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
  });

  client.on('connect',  () => console.log('[redis] connected'));
  client.on('error',    (err) => console.error('[redis] error:', err.message));
  client.on('close',    () => console.warn('[redis] connection closed'));

  return client;
}

// pub  → used by Socket.io adapter to publish events + by app for cache/presence
// sub  → used by Socket.io adapter to subscribe (must be a dedicated connection)
const pub = createClient();
const sub = createClient();

async function connect() {
  await Promise.all([pub.connect(), sub.connect()]);
}

// ── Translation cache ──────────────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 24; // 24 hours

async function getCachedTranslation(text, fromLang, toLang) {
  const key = `tr:${fromLang}:${toLang}:${Buffer.from(text).toString('base64')}`;
  const cached = await pub.get(key);
  return { key, cached };
}

async function setCachedTranslation(key, translation) {
  await pub.set(key, translation, 'EX', CACHE_TTL);
}

// ── Room persistence ───────────────────────────────────────────────────────
// Stores room metadata in Redis so rooms survive a server restart.
// (Replace with ScyllaDB/Postgres later for long-term persistence)

async function saveRoom(room) {
  await pub.set(`room:${room.code}`, JSON.stringify(room), 'EX', 60 * 60 * 48); // 48h TTL
}

async function loadRoom(code) {
  const data = await pub.get(`room:${code}`);
  return data ? JSON.parse(data) : null;
}

async function deleteRoom(code) {
  await pub.del(`room:${code}`);
}

// ── Online presence ────────────────────────────────────────────────────────
// Tracks which participants are currently connected to a room.

async function addPresence(roomCode, socketId, participant) {
  await pub.hset(`presence:${roomCode}`, socketId, JSON.stringify(participant));
  await pub.expire(`presence:${roomCode}`, 60 * 60 * 24);
}

async function removePresence(roomCode, socketId) {
  await pub.hdel(`presence:${roomCode}`, socketId);
}

async function getPresence(roomCode) {
  const entries = await pub.hgetall(`presence:${roomCode}`);
  if (!entries) return [];
  return Object.values(entries).map(v => JSON.parse(v));
}

module.exports = {
  pub,
  sub,
  connect,
  getCachedTranslation,
  setCachedTranslation,
  saveRoom,
  loadRoom,
  deleteRoom,
  addPresence,
  removePresence,
  getPresence,
};

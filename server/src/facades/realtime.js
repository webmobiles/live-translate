'use strict';

/**
 * Realtime coordination facade.
 *
 * Socket.IO can run without a shared adapter on one server. For distributed
 * Socket.IO servers, use a Redis-compatible backend: Dragonfly or Valkey.
 */

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const REDIS_COMPATIBLE_PROVIDERS = new Set(['dragonfly', 'valkey']);

function getProviderName() {
  return (process.env.REALTIME_PROVIDER || 'none').trim().toLowerCase();
}

function getRedisUrl(provider) {
  if (provider === 'dragonfly') {
    return process.env.DRAGONFLY_URL || process.env.REALTIME_REDIS_URL || 'redis://localhost:6379';
  }

  if (provider === 'valkey') {
    return process.env.VALKEY_URL || process.env.REALTIME_REDIS_URL || 'redis://localhost:6380';
  }

  return process.env.REALTIME_REDIS_URL || 'redis://localhost:6379';
}

async function configureSocketAdapter(io) {
  const provider = getProviderName();

  if (provider === 'none') {
    console.log('[realtime] using local Socket.IO adapter');
    return;
  }

  if (!REDIS_COMPATIBLE_PROVIDERS.has(provider)) {
    throw new Error(`Unknown REALTIME_PROVIDER: "${provider}". Valid: none, dragonfly, valkey`);
  }

  const url = getRedisUrl(provider);
  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();

  pubClient.on('error', err => console.error(`[realtime:${provider}] pub client`, err.message));
  subClient.on('error', err => console.error(`[realtime:${provider}] sub client`, err.message));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.log(`[realtime] using ${provider} Socket.IO adapter (${url})`);
}

async function checkRealtimeProvider() {
  const provider = getProviderName();

  if (provider === 'none') return { ok: true };
  if (!REDIS_COMPATIBLE_PROVIDERS.has(provider)) {
    throw new Error(`Unknown REALTIME_PROVIDER: "${provider}". Valid: none, dragonfly, valkey`);
  }

  const client = createClient({ url: getRedisUrl(provider) });
  try {
    await client.connect();
    await client.ping();
    return { ok: true };
  } finally {
    await client.quit().catch(() => {});
  }
}

module.exports = { configureSocketAdapter, checkRealtimeProvider };

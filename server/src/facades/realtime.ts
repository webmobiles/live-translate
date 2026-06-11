'use strict';

/**
 * Realtime coordination facade.
 *
 * Socket.IO can run without a shared adapter on one server. For distributed
 * Socket.IO servers, use a Redis-compatible backend: Dragonfly or Valkey.
 */

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const { logger } = require('../observability/logger');
const { severity } = require('../observability/severity');

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
    logger.info({ event: 'realtime.adapter_configured', provider: 'none' }, 'Using local Socket.IO adapter');
    return;
  }

  if (!REDIS_COMPATIBLE_PROVIDERS.has(provider)) {
    throw new Error(`Unknown REALTIME_PROVIDER: "${provider}". Valid: none, dragonfly, valkey`);
  }

  const url = getRedisUrl(provider);
  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();

  pubClient.on('error', err => logger.error({ event: 'realtime.pub_client_error', severity: severity.P2, provider, err }, 'Realtime pub client error'));
  subClient.on('error', err => logger.error({ event: 'realtime.sub_client_error', severity: severity.P2, provider, err }, 'Realtime sub client error'));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info({ event: 'realtime.adapter_configured', provider, url }, 'Using shared Socket.IO adapter');
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

export {};

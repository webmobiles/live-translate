'use strict';

/**
 * Startup health checks
 *
 * Runs before the HTTP server starts listening.
 * Each check is independent — all run in parallel, results printed together.
 * If any REQUIRED service fails, the process exits so you know immediately
 * rather than getting cryptic errors later. OpenAI is warning-only by default
 * so local dev can still exercise runtime fallback behavior with a bad key.
 */

const TIMEOUT_MS = 8_000;

// ── Individual checks ──────────────────────────────────────────────────────

async function checkScylla() {
  const cassandra = require('cassandra-driver');
  const hosts     = (process.env.SCYLLA_HOSTS   || 'localhost').split(',');
  const keyspace  = process.env.SCYLLA_KEYSPACE || 'live_translate';

  const client = new cassandra.Client({
    contactPoints: hosts,
    localDataCenter: 'datacenter1',
    keyspace,
  });

  try {
    await withTimeout(client.connect(), 'ScyllaDB connect');
    await withTimeout(
      client.execute('SELECT now() FROM system.local'),
      'ScyllaDB query',
    );
    return { ok: true };
  } finally {
    await client.shutdown().catch(() => {});
  }
}

async function checkTikv() {
  const mysql = require('mysql2/promise');

  const connection = await withTimeout(
    mysql.createConnection({
      host: process.env.TIKV_SQL_HOST || process.env.TIDB_HOST || 'localhost',
      port: Number.parseInt(process.env.TIKV_SQL_PORT || process.env.TIDB_PORT || '4000', 10),
      user: process.env.TIKV_SQL_USER || process.env.TIDB_USER || 'root',
      password: process.env.TIKV_SQL_PASSWORD || process.env.TIDB_PASSWORD || '',
    }),
    'TiKV/TiDB connect',
  );

  try {
    await withTimeout(connection.ping(), 'TiKV/TiDB ping');
    return { ok: true };
  } finally {
    await connection.end().catch(() => {});
  }
}

async function checkSurreal() {
  const { Surreal } = require('surrealdb');
  const db = new Surreal();

  const url = process.env.SURREALDB_URL || 'http://localhost:8000/rpc';
  const username = process.env.SURREALDB_USERNAME || 'root';
  const password = process.env.SURREALDB_PASSWORD || 'root';

  const options = {
    namespace: process.env.SURREALDB_NAMESPACE || 'live_translate',
    database: process.env.SURREALDB_DATABASE || 'live_translate',
  };

  if (username || password) {
    options.authentication = { username, password };
  }

  try {
    await withTimeout(db.connect(url, options), 'SurrealDB connect');
    await withTimeout(db.query('RETURN true;').json().collect(), 'SurrealDB query');
    return { ok: true };
  } finally {
    await db.close().catch(() => {});
  }
}

async function checkRedpanda() {
  const { Kafka } = require('kafkajs');
  const brokers   = (process.env.REDPANDA_BROKERS || 'localhost:19092').split(',');

  const kafka = new Kafka({ clientId: 'health-check', brokers, logLevel: 0 });
  const admin = kafka.admin();

  try {
    await withTimeout(admin.connect(), 'Redpanda connect');
    await withTimeout(admin.listTopics(), 'Redpanda listTopics');
    return { ok: true };
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

async function checkNats() {
  const { connect } = require('nats');
  const servers = (process.env.NATS_SERVERS || 'nats://localhost:4222')
    .split(',')
    .map(server => server.trim())
    .filter(Boolean);

  const nc = await withTimeout(
    connect({ servers, name: 'live-translate-health-check' }),
    'NATS connect',
  );

  try {
    await withTimeout(nc.flush(), 'NATS flush');
    return { ok: true };
  } finally {
    await nc.close().catch(() => {});
  }
}

async function checkInngest() {
  const url = `${process.env.INNGEST_BASE_URL || 'http://localhost:8288'}/`;

  const res = await withTimeout(
    fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
    'Inngest HTTP',
  );

  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}`);
  }
  return { ok: true };
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set in .env');

  const res = await withTimeout(
    fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    'OpenAI API',
  );

  if (res.status === 401) throw new Error('Invalid API key — regenerate at platform.openai.com/api-keys');
  if (!res.ok)            throw new Error(`HTTP ${res.status}`);
  return { ok: true };
}

async function checkRealtime() {
  const realtime = require('../facades/realtime');
  return withTimeout(realtime.checkRealtimeProvider(), 'Realtime provider check');
}

// ── Runner ─────────────────────────────────────────────────────────────────

function envFlag(name) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
}

function checksForProvider() {
  const translationProvider = process.env.TRANSLATION_PROVIDER || 'openai';
  const sttProvider = process.env.STT_PROVIDER || 'openai';
  const ttsProvider = process.env.TTS_PROVIDER || 'none';
  const voiceTranslationProvider = process.env.VOICE_TRANSLATION_PROVIDER || 'none';
  const dbProvider = (process.env.DB_PROVIDER || 'scylla').trim().toLowerCase();
  const queueProvider = (process.env.QUEUE_PROVIDER || 'nats').trim().toLowerCase();
  const dbChecks = {
    scylla: { name: 'ScyllaDB', fn: checkScylla, required: true },
    tikv: { name: 'TiKV/TiDB', fn: checkTikv, required: true },
    surreal: { name: 'SurrealDB', fn: checkSurreal, required: true },
  };
  const queueChecks = {
    nats: { name: 'NATS', fn: checkNats, required: true },
    redpanda: { name: 'Redpanda', fn: checkRedpanda, required: true },
    kafka: { name: 'Redpanda', fn: checkRedpanda, required: true },
  };
  const dbCheck = dbChecks[dbProvider];
  if (!dbCheck) throw new Error(`Unknown DB_PROVIDER: "${dbProvider}". Valid: scylla, tikv, surreal`);
  const queueCheck = queueChecks[queueProvider];
  if (!queueCheck) throw new Error(`Unknown QUEUE_PROVIDER: "${queueProvider}". Valid: nats, redpanda`);
  const requiresOpenAI = translationProvider === 'openai'
    || (translationProvider === 'mock' && envFlag('FORCE_AI_TRANSLATION'))
    || sttProvider === 'openai'
    || ttsProvider === 'openai'
    || voiceTranslationProvider === 'openai-realtime';

  const openAiRequired = envFlag('STARTUP_OPENAI_REQUIRED');

  return [
    dbCheck,
    queueCheck,
    { name: 'Realtime', fn: checkRealtime, required: true },
    { name: 'Inngest', fn: checkInngest, required: true },
    ...(requiresOpenAI ? [{ name: 'OpenAI', fn: checkOpenAI, required: openAiRequired }] : []),
  ];
}

async function runHealthChecks() {
  console.log('\n🔍 Running startup health checks…\n');

  const CHECKS = checksForProvider();
  const results = await Promise.allSettled(CHECKS.map(c => c.fn()));

  let anyFailed = false;

  CHECKS.forEach((check, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      console.log(`  ✅ ${check.name.padEnd(12)} OK`);
    } else {
      const label = check.required ? '❌' : '⚠️ ';
      console.log(`  ${label} ${check.name.padEnd(12)} ${formatError(result.reason)}`);
      if (check.required) anyFailed = true;
    }
  });

  console.log('');

  if (anyFailed) {
    console.error('🚨 One or more required services are not available. Fix the issues above and restart.\n');
    process.exit(1);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ]);
}

function formatError(error) {
  if (!error) return 'Unknown error';
  if (error.message) return error.message;

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors
      .map(inner => inner?.message || inner?.code || String(inner))
      .join('; ');
  }

  if (error.code) return error.code;
  return String(error);
}

module.exports = { runHealthChecks };

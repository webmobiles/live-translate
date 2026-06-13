/**
 * Startup health checks
 *
 * Runs before the HTTP server starts listening.
 * Each check is independent — all run in parallel, results printed together.
 * If any REQUIRED service fails, the process exits so you know immediately
 * rather than getting cryptic errors later. OpenAI is warning-only by default
 * so local dev can still exercise runtime fallback behavior with a bad key.
 */

import cassandra from 'cassandra-driver';
import mysql from 'mysql2/promise';
import { Surreal } from 'surrealdb';
import { Kafka } from 'kafkajs';
import { connect as connectNats } from 'nats';
import * as realtimeFacade from '../facades/realtime';
import { logger, flushLogs } from '../observability/logger';
import { severity } from '../observability/severity';

const TIMEOUT_MS = 8_000;
const RETRY_ATTEMPTS = Number.parseInt(process.env.STARTUP_HEALTHCHECK_RETRIES || '30', 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.STARTUP_HEALTHCHECK_RETRY_DELAY_MS || '2000', 10);

// ── Individual checks ──────────────────────────────────────────────────────

async function checkScylla() {
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
  const db = new Surreal();

  const url = process.env.SURREALDB_URL || 'http://localhost:8000/rpc';
  const username = process.env.SURREALDB_USERNAME || 'root';
  const password = process.env.SURREALDB_PASSWORD || 'root';

  const options: any = {
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
  const brokers = (process.env.REDPANDA_BROKERS || 'localhost:19092').split(',');
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
  const servers = (process.env.NATS_SERVERS || 'nats://localhost:4222')
    .split(',')
    .map(server => server.trim())
    .filter(Boolean);

  const nc = await withTimeout(
    connectNats({ servers, name: 'live-translate-health-check' }),
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
  return withTimeout(realtimeFacade.checkRealtimeProvider(), 'Realtime provider check');
}

function envFlag(name: string) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
}

function checksForProvider() {
  const translationProvider = process.env.TRANSLATION_PROVIDER || 'openai';
  const sttProvider = process.env.STT_PROVIDER || 'openai';
  const ttsProvider = process.env.TTS_PROVIDER || 'none';
  const voiceTranslationProvider = process.env.VOICE_TRANSLATION_PROVIDER || 'none';
  const dbProvider = (process.env.DB_PROVIDER || 'scylla').trim().toLowerCase();
  const queueProvider = (process.env.QUEUE_PROVIDER || 'nats').trim().toLowerCase();
  const dbChecks: Record<string, any> = {
    scylla: { name: 'ScyllaDB', fn: checkScylla, required: true },
    tikv: { name: 'TiKV/TiDB', fn: checkTikv, required: true },
    surreal: { name: 'SurrealDB', fn: checkSurreal, required: true },
  };
  const queueChecks: Record<string, any> = {
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

// ── Runner ─────────────────────────────────────────────────────────────────

export async function runHealthChecks() {
  logger.info({ event: 'startup.healthcheck.started' }, 'Running startup health checks');

  const CHECKS = checksForProvider();
  const results = await Promise.allSettled(CHECKS.map(c => runCheckWithRetry(c)));

  let anyFailed = false;

  CHECKS.forEach((check, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      logger.info({ event: 'startup.healthcheck.ok', check: check.name, required: check.required }, 'Startup health check passed');
    } else {
      const sev = 'P1';
      logger[check.required ? 'fatal' : 'error']({
        event: 'startup.healthcheck.failed',
        severity: sev,
        check: check.name,
        required: check.required,
        errorMessage: formatError(result.reason),
        err: result.reason,
      }, 'Startup health check failed');
      if (check.required) anyFailed = true;
    }
  });

  if (anyFailed) {
    logger.fatal({ event: 'startup.healthcheck.required_failed', severity: severity.P1 }, 'One or more required services are not available');
    await flushLogs();
    process.exit(1);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function runCheckWithRetry(check: any) {
  const maxAttempts = Math.max(1, RETRY_ATTEMPTS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await check.fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) break;

      logger.warn({
        event: 'startup.healthcheck.retry',
        check: check.name,
        required: check.required,
        attempt,
        maxAttempts,
        retryDelayMs: RETRY_DELAY_MS,
        errorMessage: formatError(error),
      }, 'Startup health check failed, retrying');

      await delay(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ]);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatError(error: any) {
  if (!error) return 'Unknown error';
  if (error.message) return error.message;

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors
      .map((inner: any) => inner?.message || inner?.code || String(inner))
      .join('; ');
  }

  if (error.code) return error.code;
  return String(error);
}

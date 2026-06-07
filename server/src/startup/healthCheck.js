'use strict';

/**
 * Startup health checks
 *
 * Runs before the HTTP server starts listening.
 * Each check is independent — all run in parallel, results printed together.
 * If any REQUIRED service fails, the process exits so you know immediately
 * rather than getting cryptic errors later.
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

// ── Runner ─────────────────────────────────────────────────────────────────

function checksForProvider() {
  const provider = process.env.TRANSLATION_PROVIDER || 'openai';
  const requiresOpenAI = provider === 'openai';

  return [
    { name: 'ScyllaDB', fn: checkScylla, required: true },
    { name: 'Redpanda', fn: checkRedpanda, required: true },
    { name: 'Inngest', fn: checkInngest, required: true },
    ...(requiresOpenAI ? [{ name: 'OpenAI', fn: checkOpenAI, required: true }] : []),
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
      console.log(`  ${label} ${check.name.padEnd(12)} ${result.reason?.message ?? result.reason}`);
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

module.exports = { runHealthChecks };

/**
 * Health endpoints
 *
 * GET /health/live  — liveness probe (is the process alive?)
 *   Returns 200 immediately if the process is running.
 *   Kubernetes restarts the pod if this fails.
 *
 * GET /health/ready — readiness probe (are dependencies reachable?)
 *   Checks DB, queue, and Inngest in parallel.
 *   Kubernetes stops sending traffic if this fails.
 *   Returns 200 only when ALL required services respond.
 *
 * GET /health       — full status (for humans and UptimeRobot)
 *   Combined view: process info + each dependency status + latency.
 */

import { Router } from 'express';
import * as db from '../facades/db';
import * as queue from '../facades/queue';

const router = Router();

// ── /health/live ───────────────────────────────────────────────────────────
// Fast — no external calls. Just proves the process is running.

router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ── Dependency checks ──────────────────────────────────────────────────────

async function checkDb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await db.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function checkQueue(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await queue.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function checkInngest(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const url = `${process.env.INNGEST_BASE_URL || 'http://localhost:8288'}/`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ── /health/ready ──────────────────────────────────────────────────────────
// Kubernetes readiness probe — fast parallel check of all required services.

router.get('/ready', async (_req, res) => {
  const [database, messaging, inngest] = await Promise.all([
    checkDb(),
    checkQueue(),
    checkInngest(),
  ]);

  const allOk = database.ok && messaging.ok && inngest.ok;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'unavailable',
    checks: { database, messaging, inngest },
  });
});

// ── /health ────────────────────────────────────────────────────────────────
// Full human-readable status — for UptimeRobot, dashboards, manual checks.

router.get('/', async (_req, res) => {
  const [database, messaging, inngest] = await Promise.all([
    checkDb(),
    checkQueue(),
    checkInngest(),
  ]);

  const allOk = database.ok && messaging.ok && inngest.ok;
  const mem   = process.memoryUsage();

  res.status(allOk ? 200 : 503).json({
    status:  allOk ? 'ok' : 'degraded',
    uptime:  Math.floor(process.uptime()),
    version: process.env.npm_package_version || '0.0.0',
    env:     process.env.NODE_ENV || 'development',
    memory: {
      heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb:       Math.round(mem.rss       / 1024 / 1024),
    },
    checks: { database, messaging, inngest },
  });
});

export const healthRouter = router;

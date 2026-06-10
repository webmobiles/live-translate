'use strict';

type PendingLog = Record<string, unknown>;

function parseHeaders(value: string | undefined) {
  if (!value) return {};
  return value.split(',').reduce((headers, pair) => {
    const [rawKey, ...rawValue] = pair.split('=');
    const key = rawKey?.trim();
    const headerValue = rawValue.join('=').trim();
    if (key && headerValue) headers[key] = headerValue;
    return headers;
  }, {} as Record<string, string>);
}

function buildIngestionUrl() {
  if (process.env.OPENOBSERVE_LOGS_URL) return process.env.OPENOBSERVE_LOGS_URL;

  const baseUrl = process.env.OPENOBSERVE_URL;
  if (!baseUrl) return null;

  const org = process.env.OPENOBSERVE_ORG || 'default';
  const stream = process.env.OPENOBSERVE_LOG_STREAM || 'live_translate_server';
  return `${baseUrl.replace(/\/$/, '')}/api/${org}/${stream}/_json`;
}

function buildAuthHeaders() {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...parseHeaders(process.env.OPENOBSERVE_HEADERS),
  };

  const token = process.env.OPENOBSERVE_TOKEN;
  if (token) {
    headers.authorization = `Bearer ${token}`;
    return headers;
  }

  const user = process.env.OPENOBSERVE_USER;
  const password = process.env.OPENOBSERVE_PASSWORD;
  if (user && password) {
    headers.authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }

  return headers;
}

function createOpenObserveStream() {
  const url = buildIngestionUrl();
  const enabled = process.env.OPENOBSERVE_LOGS_ENABLED === 'true' && Boolean(url);

  if (!enabled || !url) return null;

  const headers = buildAuthHeaders();
  const batchSize = Number.parseInt(process.env.OPENOBSERVE_LOG_BATCH_SIZE || '25', 10);
  const flushIntervalMs = Number.parseInt(process.env.OPENOBSERVE_LOG_FLUSH_INTERVAL_MS || '2000', 10);
  let pending: PendingLog[] = [];
  let flushing = false;

  async function flush() {
    if (flushing || pending.length === 0) return;

    flushing = true;
    const batch = pending;
    pending = [];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        process.stderr.write(`[openobserve] log ingest failed: ${response.status} ${response.statusText}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[openobserve] log ingest failed: ${message}\n`);
    } finally {
      flushing = false;
    }
  }

  const interval = setInterval(flush, flushIntervalMs);
  interval.unref?.();

  process.once('beforeExit', () => {
    void flush();
  });

  return {
    write(line: string) {
      try {
        pending.push(JSON.parse(line));
      } catch {
        pending.push({
          level: 'info',
          time: Date.now(),
          service: 'live-translate-server',
          event: 'log.unparsed',
          msg: line.trim(),
        });
      }

      if (pending.length >= batchSize) {
        void flush();
      }
    },
  };
}

module.exports = { createOpenObserveStream };

export {};

'use strict';

const http = require('http');
const https = require('https');

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

function postJson(url: string, headers: Record<string, string>, payload: unknown) {
  return new Promise<void>((resolve, reject) => {
    const body = JSON.stringify(payload);
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;

    const req = client.request({
      method: 'POST',
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error(`${res.statusCode} ${res.statusMessage}: ${responseBody}`));
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function openObserveConfig() {
  const baseUrl = process.env.OPENOBSERVE_URL;
  const url = process.env.OPENOBSERVE_LOGS_URL || (baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/api/${process.env.OPENOBSERVE_ORG || 'default'}/${process.env.OPENOBSERVE_LOG_STREAM || 'live_translate_server'}/_json`
    : null);

  const headers: Record<string, string> = parseHeaders(process.env.OPENOBSERVE_HEADERS);
  const token = process.env.OPENOBSERVE_TOKEN;
  const user = process.env.OPENOBSERVE_USER;
  const password = process.env.OPENOBSERVE_PASSWORD;

  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (user && password) {
    headers.authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }

  return { url, headers };
}

function lokiConfig() {
  return {
    url: process.env.LOKI_URL || 'http://127.0.0.1:3100/loki/api/v1/push',
    headers: parseHeaders(process.env.LOKI_HEADERS),
  };
}

function toLokiPayload(batch: PendingLog[]) {
  const streams = new Map<string, Array<[string, string]>>();

  for (const log of batch) {
    const service = String(log.service || process.env.OTEL_SERVICE_NAME || 'live-translate-server');
    const env = String(log.env || process.env.NODE_ENV || 'development');
    const level = String(log.level || 'info');
    const event = String(log.event || 'app.log');
    const key = JSON.stringify({ service, env, level, event });
    const time = Date.parse(String(log.time || ''));
    const timestampNs = `${Number.isFinite(time) ? time : Date.now()}000000`;

    if (!streams.has(key)) streams.set(key, []);
    streams.get(key).push([timestampNs, JSON.stringify(log)]);
  }

  return {
    streams: Array.from(streams.entries()).map(([labels, values]) => ({
      stream: JSON.parse(labels),
      values,
    })),
  };
}

function createLogGatewayStream() {
  const sink = (process.env.LOG_SINK || '').trim().toLowerCase();
  const openObserveEnabled = process.env.OPENOBSERVE_LOGS_ENABLED === 'true';
  const activeSink = sink || (openObserveEnabled ? 'openobserve' : '');

  if (!activeSink || activeSink === 'stdout' || activeSink === 'none') return null;

  const config = activeSink === 'loki' ? lokiConfig() : openObserveConfig();
  if (!config.url) return null;

  const batchSize = Number.parseInt(process.env.LOG_GATEWAY_BATCH_SIZE || '25', 10);
  const flushIntervalMs = Number.parseInt(process.env.LOG_GATEWAY_FLUSH_INTERVAL_MS || '2000', 10);
  let pending: PendingLog[] = [];
  let flushing = false;

  async function flush() {
    if (flushing || pending.length === 0) return;

    flushing = true;
    const batch = pending;
    pending = [];

    try {
      const payload = activeSink === 'loki' ? toLokiPayload(batch) : batch;
      await postJson(config.url, config.headers, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[observability:${activeSink}] log ingest failed: ${message}\n`);
    } finally {
      flushing = false;
    }
  }

  const interval = setInterval(flush, flushIntervalMs);
  interval.unref?.();
  process.once('beforeExit', () => { void flush(); });

  return {
    write(line: string) {
      try {
        pending.push(JSON.parse(line));
      } catch {
        pending.push({
          level: 'info',
          time: new Date().toISOString(),
          service: process.env.OTEL_SERVICE_NAME || 'live-translate-server',
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

module.exports = { createLogGatewayStream };

export {};

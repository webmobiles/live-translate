'use strict';

/**
 * Slack Alert Gateway
 *
 * A pino-compatible stream that intercepts log lines with severity P1 or P2
 * and POSTs them directly to a Slack webhook with full context.
 *
 * Hooked into pino multistream in logger.ts — no business code needs to change.
 * Set SLACK_WEBHOOK_URL in .env to enable. If the var is missing, this is a no-op.
 */

const https = require('https');
const http  = require('http');

const SEVERITIES_TO_ALERT = new Set(['P1', 'P2']);

// Dedup: suppress identical alerts for this many ms to avoid Slack floods
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const recentAlerts = new Map<string, number>(); // key → timestamp last sent

const SEVERITY_EMOJI: Record<string, string> = {
  P1: '🔴',
  P2: '🟠',
};

const LEVEL_COLOR: Record<string, string> = {
  P1: '#FF0000',
  P2: '#FF6600',
};

function postJson(webhookUrl: string, payload: unknown): void {
  const body = JSON.stringify(payload);
  const target = new URL(webhookUrl);
  const client = target.protocol === 'https:' ? https : http;

  const req = client.request(
    {
      method: 'POST',
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    },
    (res: any) => {
      // Drain the response to free the socket
      res.resume();
      if (res.statusCode >= 400) {
        process.stderr.write(`[slack-gateway] webhook returned HTTP ${res.statusCode}\n`);
      }
    },
  );

  req.on('error', (err: Error) => {
    process.stderr.write(`[slack-gateway] failed to send alert: ${err.message}\n`);
  });

  req.write(body);
  req.end();
}

function buildSlackMessage(log: Record<string, unknown>): unknown {
  const severity     = String(log.severity    || 'P1');
  const levelLabel   = String(log.levelLabel  || '');
  const event        = String(log.event       || '');
  const msg          = String(log.msg         || '');
  const check        = log.check        ? String(log.check)        : null;
  const errorMessage = log.errorMessage ? String(log.errorMessage) : null;
  const service      = String(log.service || 'live-translate-server');
  const env          = String(log.env     || process.env.NODE_ENV || 'development');
  const time         = log.time ? new Date(String(log.time)).toLocaleString() : new Date().toLocaleString();

  const emoji = SEVERITY_EMOJI[severity] ?? '⚠️';
  const color = LEVEL_COLOR[severity]    ?? '#FF6600';

  const fields = [
    { title: 'Severity',  value: severity,    short: true },
    { title: 'Level',     value: levelLabel,  short: true },
    { title: 'Service',   value: service,     short: true },
    { title: 'Env',       value: env,         short: true },
    { title: 'Event',     value: event || '—', short: false },
  ];

  if (check)        fields.push({ title: 'Check',         value: check,        short: true });
  if (errorMessage) fields.push({ title: 'Error',         value: errorMessage, short: false });

  // Include any extra fields from the log (roomCode, msgId, etc.)
  const knownKeys = new Set(['severity','levelLabel','level','event','msg','check','errorMessage','service','env','time','pid','hostname']);
  for (const [key, val] of Object.entries(log)) {
    if (!knownKeys.has(key) && val !== undefined && val !== null && typeof val !== 'object') {
      fields.push({ title: key, value: String(val), short: true });
    }
  }

  return {
    attachments: [
      {
        color,
        fallback: `${emoji} [${severity}] ${msg} — ${event}`,
        pretext:  `${emoji} *${severity} Alert* — ${service}`,
        title:    msg,
        fields,
        footer:   `live-translate | ${time}`,
        mrkdwn_in: ['pretext', 'text'],
      },
    ],
  };
}

export function createSlackAlertStream() {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) return null;

  return {
    write(line: string) {
      let log: Record<string, unknown>;
      try {
        log = JSON.parse(line);
      } catch {
        return; // not JSON, ignore
      }

      const severity = String(log.severity || '');
      if (!SEVERITIES_TO_ALERT.has(severity)) return;

      // Dedup: one alert per unique (event + check) per DEDUP_WINDOW_MS
      const dedupKey = `${String(log.event || '')}::${String(log.check || '')}`;
      const now = Date.now();
      const lastSent = recentAlerts.get(dedupKey) ?? 0;
      if (now - lastSent < DEDUP_WINDOW_MS) return;
      recentAlerts.set(dedupKey, now);

      const payload = buildSlackMessage(log);
      postJson(webhookUrl, payload);
    },
  };
}

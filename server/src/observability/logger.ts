'use strict';

const pino = require('pino');
const pretty = require('pino-pretty');
const { createLogGatewayStream } = require('./logGateway');

const isProduction = process.env.NODE_ENV === 'production';
const prettyLogs = process.env.LOG_PRETTY !== 'false' && !isProduction;

const base = {
  service: process.env.OTEL_SERVICE_NAME || 'live-translate-server',
  env: process.env.NODE_ENV || 'development',
};

const redact = {
  paths: [
    'OPENAI_API_KEY',
    'OPENOBSERVE_PASSWORD',
    'OPENOBSERVE_TOKEN',
    'LOKI_TOKEN',
    '*.authorization',
    '*.password',
    '*.token',
    '*.apiKey',
    '*.api_key',
    '*.audioBase64',
    'audioBase64',
  ],
  censor: '[redacted]',
};

const streams = [
  {
    stream: prettyLogs
      ? pretty({
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
        })
      : process.stdout,
  },
];

const logGatewayStream = createLogGatewayStream();
if (logGatewayStream) {
  streams.push({ stream: logGatewayStream });
}

// Human-readable label for the numeric pino level.
// This is a technical field — it never touches the `severity` business field.
const LEVEL_LABEL: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base,
    redact,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string, number: number) {
        return {
          level: number,
          levelLabel: LEVEL_LABEL[number] ?? label.toUpperCase(),
          // `severity` is NOT set here — it is a separate business field (P1/P2/P3/P4)
          // set explicitly by the caller. These two fields are independent.
        };
      },
    },
  },
  pino.multistream(streams),
);

function child(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

async function flushLogs() {
  await logGatewayStream?.flush?.();
}

module.exports = { logger, child, flushLogs };

export {};

'use strict';

const pino = require('pino');
const pretty = require('pino-pretty');
const { createOpenObserveStream } = require('./openobserveStream');

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

const openObserveStream = createOpenObserveStream();
if (openObserveStream) {
  streams.push({ stream: openObserveStream });
}

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
  },
  pino.multistream(streams),
);

function child(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

module.exports = { logger, child };

export {};
